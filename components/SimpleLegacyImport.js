'use client';
import {useMemo,useState} from 'react';
import * as XLSX from 'xlsx';
import {supabase} from '../lib/supabase';
import {userError} from '../lib/userError';

const REQUIRED=['Tracking Reference','Customer / Payer Name','Document Name'];
const STAGES=[1,2,3,4,5,6];
const clean=v=>String(v??'').trim();
const branchKey=v=>clean(v).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(branch|office)\b/g,'').replace(/[^a-z0-9]+/g,'');
const number=v=>Number(String(v??'').replace(/[^0-9.-]/g,''))||0;
const date=v=>{if(!v)return null;if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);if(typeof v==='number'){const p=XLSX.SSF.parse_date_code(v);return p?`${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`:null}const d=new Date(v);return isNaN(d)?null:d.toISOString().slice(0,10)};
const status=v=>{const x=clean(v).toLowerCase();if(!x)return'Received';if(x.includes('ready'))return'Ready for Delivery';if(x.includes('deliver'))return'Delivered';if(x.includes('cancel'))return'Cancelled';if(x.includes('return'))return'Returned';if(x.includes('wait'))return'Waiting';if(x.includes('complete'))return'Completed';if(x.includes('process'))return'Under Process';return'Received'};
const stageStatus=v=>{const x=clean(v).toLowerCase();if(x.includes('complete')||x==='done')return'Completed';if(x.includes('process'))return'Processing';if(x.includes('cancel'))return'Cancelled';if(x.includes('not required')||x==='n/a')return'Not Required';return'Pending'};
const numberedFamilyRoot=value=>{const tracking=clean(value),match=tracking.match(/^(.+?)\/(\d+)$/);return match?clean(match[1]):''};

export default function SimpleLegacyImport({session,cases,branches,reload,notify}){
  const [file,setFile]=useState(null),[rows,setRows]=useState([]),[errors,setErrors]=useState([]),[policy,setPolicy]=useState('skip'),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[databaseExisting,setDatabaseExisting]=useState(new Set());
  const groups=useMemo(()=>{
    const exactRows=new Map();
    rows.forEach(row=>{const tracking=clean(row['Tracking Reference']);if(tracking&&!exactRows.has(tracking.toLowerCase()))exactRows.set(tracking.toLowerCase(),tracking)});
    const knownCases=new Set([...(cases||[]).map(c=>clean(c.tracking_reference).toLowerCase()),...databaseExisting]);
    const map=new Map();
    rows.forEach((row,index)=>{
      const sourceTracking=clean(row['Tracking Reference']);if(!sourceTracking)return;
      const familyRoot=numberedFamilyRoot(sourceTracking),familyKey=familyRoot.toLowerCase();
      const attachToRoot=Boolean(familyRoot&&(exactRows.has(familyKey)||knownCases.has(familyKey)));
      const tracking=attachToRoot?(exactRows.get(familyKey)||familyRoot):sourceTracking;
      const key=tracking.toLowerCase();
      const entry=map.get(key)||{tracking,rows:[],first:row,index,familyChildren:[]};
      entry.rows.push(row);
      if(attachToRoot)entry.familyChildren.push(sourceTracking);
      if(sourceTracking.toLowerCase()===key){entry.first=row;entry.index=index}
      map.set(key,entry);
    });
    return [...map.values()];
  },[rows,cases,databaseExisting]);
  const existing=new Set([...(cases||[]).map(c=>clean(c.tracking_reference).toLowerCase()),...databaseExisting]);
  const familyRows=groups.reduce((total,g)=>total+g.familyChildren.length,0);
  const existingFamilyChildren=[...new Set(groups.flatMap(g=>g.familyChildren).filter(tracking=>databaseExisting.has(tracking.toLowerCase())))];
  const summary={cases:groups.length,documents:rows.filter(r=>clean(r['Document Name'])).length,stages:rows.reduce((n,r)=>n+STAGES.filter(i=>clean(r[`Stage ${i} Name`])).length,0),existing:groups.filter(g=>existing.has(g.tracking.toLowerCase())).length,familyRows,existingFamilyChildren};
  function resolveBranch(name){const wanted=clean(name);if(!wanted)return null;return branches.find(b=>clean(b.name).toLowerCase()===wanted.toLowerCase())||branches.find(b=>branchKey(b.name)===branchKey(wanted))||null}
  async function lookupExisting(trackings){const found=new Set();for(let i=0;i<trackings.length;i+=200){const batch=trackings.slice(i,i+200);const {data,error}=await supabase.from('cases').select('tracking_reference').in('tracking_reference',batch);if(error)throw error;(data||[]).forEach(c=>found.add(clean(c.tracking_reference).toLowerCase()))}return found}
  async function choose(f){setFile(f||null);setRows([]);setErrors([]);setDatabaseExisting(new Set());if(!f)return;try{const wb=XLSX.read(await f.arrayBuffer(),{cellDates:true});const ws=wb.Sheets['Import Sample']||wb.Sheets[wb.SheetNames[0]];const data=XLSX.utils.sheet_to_json(ws,{defval:'',raw:true});const headers=XLSX.utils.sheet_to_json(ws,{header:1,range:0,blankrows:false})[0]||[];const missing=REQUIRED.filter(x=>!headers.includes(x));if(missing.length)throw new Error(`Missing required columns: ${missing.join(', ')}`);const issues=[];data.forEach((r,i)=>{if(!clean(r['Tracking Reference']))issues.push({row:i+2,tracking:'',error:'Tracking Reference is required'});if(!clean(r['Customer / Payer Name']))issues.push({row:i+2,tracking:clean(r['Tracking Reference']),error:'Customer / Payer Name is required'});if(!clean(r['Document Name']))issues.push({row:i+2,tracking:clean(r['Tracking Reference']),error:'Document Name is required'});const branchName=clean(r['Branch']);if(branchName&&!resolveBranch(branchName))issues.push({row:i+2,tracking:clean(r['Tracking Reference']),error:`Unknown branch “${branchName}”. Available: ${branches.map(b=>b.name).join(', ')||'none'}`})});const trackings=[...new Set(data.flatMap(r=>{const tracking=clean(r['Tracking Reference']),root=numberedFamilyRoot(tracking);return [tracking,root]}).filter(Boolean))];setDatabaseExisting(await lookupExisting(trackings));setRows(data);setErrors(issues)}catch(e){notify(userError(e));setFile(null)}}
  function downloadErrors(){const ws=XLSX.utils.json_to_sheet(errors);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Rejected Rows');XLSX.writeFile(wb,`import-errors-${new Date().toISOString().slice(0,10)}.xlsx`)}
  async function run(){
    if(!rows.length||errors.length)return notify(errors.length?'Fix the rejected rows before importing.':'Choose an Excel file first.');
    setBusy(true);
    let created=0,updated=0,skipped=0,rollbackCaseId=null,activeTracking='';
    try{
      for(let gi=0;gi<groups.length;gi++){
        const g=groups[gi],r=g.first;
        activeTracking=g.tracking;
        setProgress(`${gi+1} of ${groups.length} · ${g.tracking}`);
        const {data:found,error:findError}=await supabase.from('cases').select('id,tracking_reference').eq('tracking_reference',g.tracking).maybeSingle();
        if(findError)throw findError;
        const isExisting=Boolean(found);
        if(isExisting&&policy==='skip'){skipped++;continue}
        const branchName=clean(r['Branch']),branch=resolveBranch(branchName);
        if(branchName&&!branch)throw new Error(`Unknown branch “${branchName}” for tracking ${g.tracking}. Available branches: ${branches.map(b=>b.name).join(', ')||'none'}.`);
        const payload={tracking_reference:g.tracking,tracking_family:clean(r['Tracking Family'])||g.tracking,bill_no:clean(r['Bill No'])||null,customer_name:clean(r['Customer / Payer Name']),mobile:clean(r['Mobile'])||null,account_name:clean(r['Organization / Account'])||null,branch_id:branch?.id||null,intake_source:clean(r['Intake Source'])||'Branch',submission_date:date(r['Submission Date']),promise_date:date(r['Promise Date']),overall_status:status(r['Case Status']),current_milestone:clean(r['Current Milestone'])||'Submitted',current_milestone_date:date(r['Current Milestone Date']),notes:clean(r['Case Notes'])||null,total_amount:number(r['Total Amount']),advance_paid:number(r['Paid Amount']),balance_payment:number(r['Balance']),legacy_reference:clean(r['Old Software Reference'])||null,legacy_status_code:clean(r['Legacy Status Code'])||null,legacy_status_date:date(r['Legacy Status Date']),legacy_import_key:g.tracking,updated_by:session.user.id};
        let caseRow;
        if(isExisting){
          const {data,error}=await supabase.from('cases').update(payload).eq('id',found.id).select('id').single();
          if(error)throw error;
          caseRow=data;updated++;
          const {error:deleteError}=await supabase.from('documents').delete().eq('case_id',caseRow.id).eq('legacy_imported',true);
          if(deleteError)throw deleteError;
        }else{
          const {data,error}=await supabase.from('cases').insert({...payload,created_by:session.user.id}).select('id').single();
          if(error)throw error;
          caseRow=data;rollbackCaseId=data.id;created++;
        }
        for(let di=0;di<g.rows.length;di++){
          const dr=g.rows[di],sourceTracking=clean(dr['Tracking Reference'])||g.tracking;
          const {data:doc,error:de}=await supabase.from('documents').insert({case_id:caseRow.id,document_name:clean(dr['Document Name']),holder_name:clean(dr['Document Holder Name'])||clean(r['Customer / Payer Name']),source_tracking_reference:sourceTracking,occurrence_no:di+1,quantity:Math.max(1,number(dr['Quantity'])||1),document_status:stageStatus(dr['Document Current Milestone']),direct_to_delhi:Boolean(clean(dr['DD Status'])||clean(dr['DD Destination'])),direct_destination:clean(dr['DD Destination'])||null,current_milestone:clean(dr['Document Current Milestone'])||null,current_milestone_date:date(dr['Document Milestone Date']),legacy_row_id:clean(dr['Document Row ID'])||`${sourceTracking}-${di+1}`,legacy_status_code:clean(dr['Legacy Status Code'])||null,legacy_status_date:date(dr['Legacy Status Date']),legacy_imported:true,created_by:session.user.id}).select('id').single();
          if(de)throw de;
          const stageRows=STAGES.map(i=>({name:clean(dr[`Stage ${i} Name`]),state:stageStatus(dr[`Stage ${i} Status`]),when:date(dr[`Stage ${i} Date`]),order:i})).filter(x=>x.name);
          if(stageRows.length){
            const {error:se}=await supabase.from('document_stages').insert(stageRows.map(s=>({document_id:doc.id,stage_name:s.name,stage_order:s.order,status:s.state,milestone_date:s.when,is_manual_override:false,updated_by:session.user.id})));
            if(se)throw se;
          }
        }
        rollbackCaseId=null;
      }
      notify(`Import complete: ${created} created, ${updated} updated, ${skipped} skipped.${existingFamilyChildren.length?` ${existingFamilyChildren.length} old standalone slash-number case${existingFamilyChildren.length===1?' needs':'s need'} manual review and deletion after checking the root case.`:''}`);
      await reload();setRows([]);setFile(null);setDatabaseExisting(new Set());
    }catch(e){
      if(rollbackCaseId)await supabase.from('cases').delete().eq('id',rollbackCaseId);
      notify(userError(e,{type:'tracking',trackingReference:activeTracking}));
    }finally{setBusy(false);setProgress('')}
  }
  return <section className="simple-import-page"><div className="simple-import-hero"><div><span>SINGLE EXCEL IMPORT</span><h2>Move legacy data into this company</h2><p>Upload the supplied 54-column workbook. Root tracking references become cases; slash-number references such as /1 and /2 become documents inside the matching root case.</p></div><div className="simple-import-icon">XL</div></div><div className="simple-import-grid"><div className="simple-import-card"><h3>1. Choose workbook</h3><p>Use the “Import Sample” sheet, or place the same columns on the first sheet.</p><label className="simple-drop"><input type="file" accept=".xlsx,.xls" onChange={e=>choose(e.target.files?.[0])}/><b>{file?.name||'Choose Excel file'}</b><span>{file?'Click to replace the selected workbook':'XLSX or XLS · one row per document'}</span></label></div><div className="simple-import-card"><h3>2. Duplicate handling</h3><p>Tracking numbers already in this company can stay unchanged or be replaced from the workbook.</p><div className="import-policy-choice"><label className={policy==='skip'?'active':''}><input type="radio" checked={policy==='skip'} onChange={()=>setPolicy('skip')}/>Skip existing</label><label className={policy==='update'?'active danger':''}><input type="radio" checked={policy==='update'} onChange={()=>setPolicy('update')}/>Update and rebuild imported documents</label></div></div></div>{rows.length>0&&<><div className="simple-import-summary"><div><span>Cases</span><b>{summary.cases}</b></div><div><span>Documents</span><b>{summary.documents}</b></div><div><span>Stages</span><b>{summary.stages}</b></div><div><span>Family rows merged</span><b>{summary.familyRows}</b></div><div><span>Already exists</span><b>{summary.existing}</b></div><div className={errors.length?'error':'ok'}><span>Rejected rows</span><b>{errors.length}</b></div></div>{summary.familyRows>0&&<div className={`simple-family-note ${summary.existingFamilyChildren.length?'warning':''}`}><strong>{summary.familyRows} slash-number row{summary.familyRows===1?'':'s'} will be attached to the matching root case.</strong><span>{summary.existingFamilyChildren.length?`${summary.existingFamilyChildren.length} standalone slash-number case${summary.existingFamilyChildren.length===1?' already exists':'s already exist'} (${summary.existingFamilyChildren.slice(0,5).join(', ')}). Import does not delete existing cases automatically. After importing, confirm the documents under the root case, then delete the old standalone case.`:'The original slash reference is preserved on each document for searching and audit.'}</span></div>}</>}{errors.length>0&&<div className="simple-import-errors"><div><strong>Import needs correction</strong><span>{errors.slice(0,4).map(x=>`Row ${x.row}: ${x.error}`).join(' · ')}</span></div><button className="secondary" onClick={downloadErrors}>Export rejected rows</button></div>}<div className="simple-import-actions"><span>{busy?progress:rows.length?`${summary.cases} cases are ready for review and import.`:'No workbook selected.'}</span><button className="primary" disabled={busy||!rows.length||errors.length} onClick={run}>{busy?'Importing…':'Import Workbook'}</button></div></section>
}
