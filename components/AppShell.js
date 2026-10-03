'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {notifyAction} from '../lib/actionFeedback';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import ProductSettings from './ProductSettings';
import dynamic from 'next/dynamic';
import PwaExperience from './PwaExperience';
import CustomerPicker from './CustomerPicker';
import DocumentFees from './DocumentFees';
const BusinessWorkspace=dynamic(()=>import('./BusinessWorkspace'),{loading:()=> <div className="business-empty">Loading workspace…</div>});
import SimpleLegacyImport from './SimpleLegacyImport';
import {userError} from '../lib/userError';
import {printConfiguredDocument} from '../lib/documentPrint';
import {trackingLink,receiptBlob} from '../lib/trackingLinks';

const CASE_STATUSES=['Received','Under Process','Waiting','Completed','Ready for Delivery','Delivered','Returned','Cancelled'];
const STAGE_STATUSES=['Pending','Processing','Completed','Not Required','Cancelled'];
const DEFAULT_STAGES=['Notary','SDM','MEA India','Embassy of India','MOFA Qatar'];
const STAGE_LIBRARY=['Notary','SDM','Home Department','HRD','GAD','MEA India','Embassy of India','Qatar Embassy','Embassy / Consulate','MOFA Qatar','Chamber of Commerce','Ministry of Education','Ministry of Justice','Ministry of Interior','MOI','MOPH','Labour Ministry','University Verification','Apostille','Translation','DataFlow','Prometric','Verification','Other'];
const NEW_CASE_WORKFLOWS=[
  {label:'India Standard',stages:['MEA India','Embassy of India','MOFA Qatar']},
  {label:'MEA Only',stages:['MEA India']},
  {label:'Embassy + MOFA',stages:['Embassy of India','MOFA Qatar']},
  {label:'MOFA Only',stages:['MOFA Qatar']},
  {label:'Clear',stages:[]}
];
const ACCESS_ROLES=['admin','branch','staff'];
let activeCompanyName='Your Organization';
let activePrintContext={orgId:null,brand:{},currency:'QAR'};
let activePrintBrand={primary:'#3265DF',secondary:'#17879A',accent:'#15A37D'};
const configuredCompanyName=()=>activeCompanyName||'Your Organization';
const safePrintColor=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):fallback;
const printBrand=()=>({primary:safePrintColor(activePrintBrand.primary,'#3265DF'),secondary:safePrintColor(activePrintBrand.secondary,'#17879A'),accent:safePrintColor(activePrintBrand.accent,'#15A37D')});
function premiumPrintCss(page='A4 portrait'){
  const b=printBrand();return `@page{size:${page};margin:10mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}html,body{margin:0;padding:0;background:#edf2f8;color:#18253d;font-family:Arial,sans-serif}.print-page{width:100%;margin:0 auto;background:#fff;border-radius:5mm;overflow:hidden;box-shadow:0 4mm 14mm rgba(18,39,76,.12)}.print-hero{position:relative;overflow:hidden;padding:8mm 9mm 7mm;color:#fff;background:linear-gradient(125deg,${b.secondary},${b.primary} 68%,${b.accent})}.print-hero:after{content:"";position:absolute;right:-12mm;top:-18mm;width:52mm;height:52mm;border:9mm solid rgba(255,255,255,.08);border-radius:50%}.print-brand{font-size:7.5pt;font-weight:900;letter-spacing:.12em;text-transform:uppercase;opacity:.84}.print-hero h1{margin:2.5mm 0 1mm;font-size:21pt;line-height:1.08}.print-hero p{max-width:72%;margin:0;font-size:8.5pt;opacity:.82}.print-badge{position:absolute;right:9mm;bottom:7mm;z-index:1;padding:2mm 3.2mm;border:1px solid rgba(255,255,255,.3);border-radius:99mm;background:rgba(8,30,68,.2);font-size:7.5pt;font-weight:850}.print-body{padding:7mm 8mm 8mm}.print-meta{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #dce5f0;border-radius:3mm;overflow:hidden;background:#f8fafd}.print-meta>div{padding:3.5mm 4mm;border-right:1px solid #e1e7ef}.print-meta>div:last-child{border:0}.print-meta small,.print-kpis small{display:block;margin-bottom:1mm;color:#7c899d;font-size:6.5pt;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.print-meta strong{font-size:9pt}.print-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:2.5mm;margin:4mm 0}.print-kpis>div{padding:3.4mm 4mm;border:1px solid #dce5f0;border-radius:2.5mm;background:linear-gradient(145deg,#f9fbfe,#eef4fb)}.print-kpis strong{display:block;color:#183765;font-size:14pt}.print-table{width:100%;margin-top:4mm;border-collapse:separate;border-spacing:0;table-layout:auto;border:1px solid #dce4ef;border-radius:2.5mm;overflow:hidden;font-size:8pt}.print-table th,.print-table td{padding:2.5mm 2.3mm;text-align:left;vertical-align:top;word-break:break-word}.print-table th{background:#142f58;color:#fff;font-size:6.5pt;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.print-table td{border-bottom:1px solid #e7ecf3}.print-table tr:nth-child(even) td{background:#f6f9fd}.print-table tr:last-child td{border-bottom:0}.print-route{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:4mm;margin:5mm 0}.print-route>div{padding:4mm;border:1px solid #d9e3f0;border-radius:3mm;background:linear-gradient(145deg,#f9fbff,#edf4fb);text-align:center}.print-route small{display:block;color:#7b899d;font-size:6.5pt;font-weight:900;letter-spacing:.08em}.print-route strong{display:block;margin-top:1.3mm;color:#183867;font-size:12pt}.print-route>b{color:${b.primary};font-size:18pt}.print-note{margin-top:4mm;padding:3.5mm 4mm;border-left:1.2mm solid ${b.primary};border-radius:1.5mm;background:#f3f7fd;font-size:8pt;line-height:1.5}.print-signatures{display:grid;grid-template-columns:1fr 1fr;gap:18mm;margin-top:14mm}.print-signatures div{padding-top:2mm;border-top:1px solid #8491a5;color:#69768a;font-size:7pt}.print-footer{display:flex;justify-content:space-between;gap:10mm;margin-top:7mm;padding-top:3mm;border-top:1px solid #e2e8f0;color:#8793a5;font-size:6.5pt}.print-amount{margin:5mm 0;padding:4mm;border-radius:3mm;background:linear-gradient(135deg,#e9f8f3,#edf4ff);color:#173862;text-align:right}.print-amount small{display:block;color:#698097;font-size:7pt;font-weight:850;letter-spacing:.08em}.print-amount strong{display:block;margin-top:1mm;font-size:22pt}@media print{html,body{background:#fff}.print-page{box-shadow:none}}`;
}
const premiumPrintHeader=(title,subtitle='',badge='')=>`<header class="print-hero"><div class="print-brand">${escapeHtml(configuredCompanyName())}</div><h1>${escapeHtml(title)}</h1>${subtitle?`<p>${escapeHtml(subtitle)}</p>`:''}${badge?`<span class="print-badge">${escapeHtml(badge)}</span>`:''}</header>`;
const premiumPrintFooter=()=>`<footer class="print-footer"><span>${escapeHtml(configuredCompanyName())} · Document Operations</span><span>Generated ${escapeHtml(new Date().toLocaleString('en-GB'))}</span></footer>`;
const accessRole=p=>ACCESS_ROLES.includes(String(p?.role||'').toLowerCase())?String(p.role).toLowerCase():'staff';
const isAdminProfile=p=>accessRole(p)==='admin';
const isBranchProfile=p=>accessRole(p)==='branch';
const fmtMoney=n=>`QAR ${Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtDate=v=>v?new Date(v).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';
const slug=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-');
const safeFileName=value=>String(value||'document-export').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
function downloadBlob(content,type,fileName){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=fileName;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1200)}
function exportRowsToExcel(title,rows){const clean=rows.length?rows:[{'No data':'No records match the current filters'}];const ws=XLSX.utils.json_to_sheet(clean);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Export');XLSX.writeFile(wb,`${safeFileName(title)}-${new Date().toISOString().slice(0,10)}.xlsx`)}
function exportRowsToCsv(title,rows){const clean=rows.length?rows:[{'No data':'No records match the current filters'}];const keys=[...new Set(clean.flatMap(Object.keys))];const csv=[keys,...clean.map(r=>keys.map(k=>r[k]??''))].map(line=>line.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');downloadBlob('\ufeff'+csv,'text/csv;charset=utf-8',`${safeFileName(title)}-${new Date().toISOString().slice(0,10)}.csv`)}
function exportTableHtml(title,rows){const clean=rows.length?rows:[{'No data':'No records match the current filters'}];const keys=[...new Set(clean.flatMap(Object.keys))];return `<div class="print-page">${premiumPrintHeader(title,`${clean.length} record${clean.length===1?'':'s'} in the current filtered view`,'MANAGEMENT REPORT')}<main class="print-body"><section class="print-meta"><div><small>Report</small><strong>${escapeHtml(title)}</strong></div><div><small>Records</small><strong>${clean.length}</strong></div><div><small>Generated</small><strong>${escapeHtml(new Date().toLocaleDateString('en-GB'))}</strong></div><div><small>Format</small><strong>Operational detail</strong></div></section><table class="print-table"><thead><tr>${keys.map(k=>`<th>${escapeHtml(k)}</th>`).join('')}</tr></thead><tbody>${clean.map(r=>`<tr>${keys.map(k=>`<td>${escapeHtml(r[k]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table>${premiumPrintFooter()}</main></div>`}
function exportRowsToWord(title,rows){const body=`<!doctype html><html><head><meta charset="utf-8"><style>${premiumPrintCss('A4 landscape')}</style></head><body>${exportTableHtml(title,rows)}</body></html>`;downloadBlob('\ufeff'+body,'application/msword',`${safeFileName(title)}-${new Date().toISOString().slice(0,10)}.doc`)}
function exportRowsToPdf(title,rows,notify){const w=window.open('','_blank','width=1150,height=850');if(!w)return notify?.('Please allow pop-ups to export PDF.');w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${premiumPrintCss('A4 landscape')}</style></head><body>${exportTableHtml(title,rows)}<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);w.document.close()}
function caseExportRows(cases){return cases.map(c=>{const money=moneyParts(c);return{'Tracking No.':c.tracking_reference||'','Bill No.':c.bill_no||'','Customer':c.customer_name||'','Mobile':c.mobile||'','Branch':c.branches?.name||'','Status':c.overall_status||'','Milestone':c.current_milestone||'','Documents':c.documents?.length||0,'Total (QAR)':Number(c.total_amount||0),'Paid (QAR)':money.paid,'Balance (QAR)':money.balance,'Submitted':c.submission_date||''}})}
const normalizeSearch=s=>String(s||'').trim().toLowerCase().replace(/^#+\s*/,'');
function caseExactSearchMode(cases,q){
  const n=normalizeSearch(q);if(!n)return '';
  const refs=c=>[c.tracking_reference,c.tracking_family,...(c.documents||[]).map(d=>d.source_tracking_reference)].map(normalizeSearch).filter(Boolean);
  if(cases.some(c=>refs(c).includes(n)))return 'tracking';
  if(cases.some(c=>[c.bill_no,c.internal_invoice_no].map(normalizeSearch).filter(Boolean).includes(n)))return 'bill';
  if(cases.some(c=>normalizeSearch(c.mobile)===n))return 'mobile';
  return '';
}

const SEARCH_BY_OPTIONS=[['tracking','Tracking No.'],['name','Customer Name'],['mobile','Mobile'],['bill','Bill No.'],['all','All Fields']];
function SearchBySelect({value,onChange,className=''}){
  const [open,setOpen]=useState(false),root=useRef(null);
  const label=SEARCH_BY_OPTIONS.find(([v])=>v===value)?.[1]||'field';
  useEffect(()=>{if(!open)return;const outside=e=>{if(!root.current?.contains(e.target))setOpen(false)},escape=e=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('mousedown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('mousedown',outside);document.removeEventListener('keydown',escape)}},[open]);
  return <div ref={root} className={`search-by-menu ${open?'open':''} ${className}`}>
    <button type="button" className="search-by-trigger" onClick={()=>setOpen(x=>!x)} aria-haspopup="menu" aria-expanded={open} aria-label={`Search by ${label}`} title={`Search by: ${label}`}><Icon name="search" size={18}/><span className="search-by-caret"><Icon name="chevron-down" size={10}/></span></button>
    {open&&<div className="search-by-popover" role="menu" aria-label="Choose search field"><div className="search-by-popover-head"><span>SEARCH FIELD</span><small>Currently: {label}</small></div>{SEARCH_BY_OPTIONS.map(([v,l])=><button type="button" role="menuitemradio" aria-checked={value===v} className={value===v?'active':''} key={v} onClick={()=>{onChange(v);setOpen(false)}}><span className="search-by-option-icon"><Icon name="search" size={15}/></span><span><strong>{l}</strong><small>{v==='all'?'Search every case field':`Search by ${l.toLowerCase()}`}</small></span>{value===v&&<Icon name="check" size={16}/>}</button>)}</div>}
  </div>
}
function caseSearchValues(c,field='tracking',hay=''){
  const docs=c?.documents||[];
  if(field==='tracking')return [c?.tracking_reference,c?.tracking_family,...docs.map(d=>d.source_tracking_reference)];
  if(field==='mobile')return [c?.mobile,c?.account_mobile];
  if(field==='bill')return [c?.bill_no,c?.internal_invoice_no];
  if(field==='name')return [c?.customer_name,c?.account_name,...docs.map(d=>d.holder_name)];
  return [hay,c?.tracking_reference,c?.tracking_family,c?.bill_no,c?.internal_invoice_no,c?.customer_name,c?.mobile,c?.account_name,c?.account_contact,c?.account_mobile,c?.notes,c?.branches?.name,...docs.flatMap(d=>[d.document_name,d.holder_name,d.source_tracking_reference,d.current_milestone])];
}
function caseSearchScore(c,q,field='tracking',hay=''){
  const n=normalizeSearch(q);if(!n)return 0;
  let best=Number.POSITIVE_INFINITY;
  caseSearchValues(c,field,hay).map(normalizeSearch).filter(Boolean).forEach(v=>{
    if(v===n)best=Math.min(best,0);
    else if(v.startsWith(n))best=Math.min(best,10+Math.max(0,v.length-n.length));
    else{const at=v.indexOf(n);if(at>=0)best=Math.min(best,100+at+Math.max(0,v.length-n.length));}
  });
  return best;
}
function rankCaseSearchResults(rows,q,field='tracking',getCase=x=>x,getHay=()=>'',fallbackCompare=null){
  const n=normalizeSearch(q);if(!n)return fallbackCompare?[...rows].sort(fallbackCompare):rows;
  return rows.map((row,index)=>({row,index,c:getCase(row),hay:getHay(row)})).sort((a,b)=>{
    const score=caseSearchScore(a.c,q,field,a.hay)-caseSearchScore(b.c,q,field,b.hay);if(score)return score;
    const av=caseSearchValues(a.c,field,a.hay).map(normalizeSearch).filter(v=>v.includes(n)).sort((x,y)=>x.localeCompare(y,undefined,{numeric:true,sensitivity:'base'}))[0]||'';
    const bv=caseSearchValues(b.c,field,b.hay).map(normalizeSearch).filter(v=>v.includes(n)).sort((x,y)=>x.localeCompare(y,undefined,{numeric:true,sensitivity:'base'}))[0]||'';
    return av.localeCompare(bv,undefined,{numeric:true,sensitivity:'base'})||a.index-b.index;
  }).map(x=>x.row);
}
function caseMatchesFieldSearch(c,q,field='tracking',hay=''){
  return !normalizeSearch(q)||Number.isFinite(caseSearchScore(c,q,field,hay));
}
function caseMatchesSmartSearch(c,q,mode,hay=''){
  const n=normalizeSearch(q);if(!n)return true;
  if(mode==='tracking')return [c.tracking_reference,c.tracking_family,...(c.documents||[]).map(d=>d.source_tracking_reference)].map(normalizeSearch).includes(n);
  if(mode==='bill')return [c.bill_no,c.internal_invoice_no].map(normalizeSearch).includes(n);
  if(mode==='mobile')return normalizeSearch(c.mobile)===n;
  return String(hay||'').toLowerCase().includes(n);
}
const CASE_CACHE_KEY='kenza_cases_cache_v342';
const CASE_CACHE_DB='kenza-tracker-cache';
const CASE_CACHE_STORE='snapshots';
function openCaseCacheDB(){
  return new Promise((resolve,reject)=>{
    try{
      const req=indexedDB.open(CASE_CACHE_DB,1);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(CASE_CACHE_STORE))db.createObjectStore(CASE_CACHE_STORE)};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    }catch(e){reject(e)}
  });
}
async function clearCaseCache(cacheKey){
  try{localStorage.removeItem(cacheKey);localStorage.removeItem(CASE_CACHE_KEY)}catch{}
  try{const db=await openCaseCacheDB();await new Promise((resolve,reject)=>{const tx=db.transaction(CASE_CACHE_STORE,'readwrite'),store=tx.objectStore(CASE_CACHE_STORE);store.delete(cacheKey);store.delete(CASE_CACHE_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch{}
}

export default function AppShell({session,initialProfile}){
  const [view,setView]=useState('dashboard');
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const [profile,setProfile]=useState(initialProfile||null);
  const [currentOrganization,setCurrentOrganization]=useState(null);
  const [brandSettings,setBrandSettings]=useState(null);
  const [brandReady,setBrandReady]=useState(false);
  const [navGroups,setNavGroups]=useState({overview:true});
  const [planModules,setPlanModules]=useState(null);
  useEffect(()=>{let live=true;const orgId=profile?.organization_id||brandSettings?.organization_id;const loadPlan=async()=>{if(!orgId)return;const {data}=await supabase.from('platform_subscriptions').select('allowed_modules').eq('organization_id',orgId).maybeSingle();if(live)setPlanModules(data?.allowed_modules||null)};loadPlan();window.addEventListener('company-plan-changed',loadPlan);return()=>{live=false;window.removeEventListener('company-plan-changed',loadPlan)}},[profile?.organization_id,brandSettings?.organization_id]);
  const [branches,setBranches]=useState([]);
  const [cases,setCases]=useState([]);
  const [loading,setLoading]=useState(true);
  const messageRef=useRef('');
  const [casesLoadError,setCasesLoadError]=useState('');
  const caseCacheKey=`${CASE_CACHE_KEY}_${session.user.id}`;
  const setMessage=useCallback(value=>{
    const next=typeof value==='function'?value(messageRef.current):value;
    messageRef.current=next?userError(next):'';
    if(messageRef.current)notifyAction(messageRef.current);
  },[]);
  const [moduleExport,setModuleExport]=useState(null);
  const publishModuleExport=useCallback(next=>setModuleExport(prev=>{const signature=JSON.stringify(next);return prev?._signature===signature?prev:{...next,_signature:signature}}),[]);
  const [query,setQuery]=useState('');
  const [searchBy,setSearchBy]=useState('tracking');
  const [statusFilter,setStatusFilter]=useState('All');
  const [branchFilter,setBranchFilter]=useState('All');
  const [documentFilter,setDocumentFilter]=useState('All');
  const [quantityFilter,setQuantityFilter]=useState('All');
  const [mobileFilter,setMobileFilter]=useState('All');
  const [balanceFilter,setBalanceFilter]=useState('All');
  const [accountFilter,setAccountFilter]=useState('All');
  const [intakeFilter,setIntakeFilter]=useState('All');
  const [ddFilter,setDdFilter]=useState('All');
  const [expanded,setExpanded]=useState(new Set());
  const [selected,setSelected]=useState(new Set());
  const [quickCase,setQuickCase]=useState(null);
  const [favoriteCaseIds,setFavoriteCaseIds]=useState(new Set());
  const [recentCaseIds,setRecentCaseIds]=useState([]);
  const [showNew,setShowNew]=useState(false);
  const [duplicateReview,setDuplicateReview]=useState(null);
  const [createdShare,setCreatedShare]=useState(null);
  const [createdQr,setCreatedQr]=useState('');
  const [createdReceipt,setCreatedReceipt]=useState('');
  const [createdShareMessage,setCreatedShareMessage]=useState('');
  const [trackingSettingsOpen,setTrackingSettingsOpen]=useState(false);
  const trackingSettingsKey=`kenza_tracking_url_${session.user.id}`;
  const defaultTrackingBase=String(process.env.NEXT_PUBLIC_CUSTOMER_TRACKING_URL||'').trim();
  const [trackingBaseUrl,setTrackingBaseUrl]=useState(defaultTrackingBase);
  const [trackingBaseDraft,setTrackingBaseDraft]=useState(defaultTrackingBase);
  const [trackingSettingSynced,setTrackingSettingSynced]=useState(false);
  useEffect(()=>{let live=true;(async()=>{try{const {data}=await supabase.from('app_settings').select('setting_value').eq('setting_key','customer_tracking').maybeSingle();const globalValue=String(data?.setting_value?.base_url||'').trim();const localValue=localStorage.getItem(trackingSettingsKey)||'';const value=globalValue||localValue||defaultTrackingBase;if(live){setTrackingBaseUrl(value);setTrackingBaseDraft(value);setTrackingSettingSynced(Boolean(globalValue))}}catch{}})();return()=>{live=false}},[trackingSettingsKey]);
  useEffect(()=>{
    if(!brandSettings)return;
    activePrintContext={orgId:brandSettings.organization_id||currentOrganization?.id||profile?.organization_id,brand:brandSettings,currency:currentOrganization?.currency_code||'QAR'};
    activeCompanyName=brandSettings.company_name||currentOrganization?.name||'Your Organization';
    activePrintBrand={primary:brandSettings.primary_color||'#3265DF',secondary:brandSettings.secondary_color||'#17879A',accent:brandSettings.accent_color||'#15A37D'};
    const root=document.documentElement;
    root.style.setProperty('--brand-primary',brandSettings.primary_color||'#3265DF');
    root.style.setProperty('--brand-secondary',brandSettings.secondary_color||'#17879A');
    root.style.setProperty('--brand-accent',brandSettings.accent_color||'#15A37D');
    root.style.setProperty('--brand-surface',brandSettings.surface_color||'#F4F7FC');
    root.style.setProperty('--brand',brandSettings.primary_color||'#3265DF');
    root.style.setProperty('--brand2',brandSettings.secondary_color||'#17879A');
    document.title=brandSettings.product_name||'Document Tracker';
    if(brandSettings.favicon_url){let link=document.querySelector("link[rel='icon']");if(!link){link=document.createElement('link');link.rel='icon';document.head.appendChild(link)}link.href=brandSettings.favicon_url}
    const tracking=String(brandSettings.tracking_base_url||'').trim();if(tracking){setTrackingBaseUrl(tracking);setTrackingBaseDraft(tracking);setTrackingSettingSynced(true)}
  },[brandSettings]);
  const [showDoc,setShowDoc]=useState(null);
  const [saving,setSaving]=useState(false);

  const emptyCase={tracking_reference:'',bill_no:'',internal_invoice_no:'',customer_name:'',mobile:'',customer_id:null,customer_email:'',email_updates:false,whatsapp_opt_in:false,submission_date:'',promise_date:'',branch_id:'',overall_status:'Received',total_amount:'',advance_paid:'',notes:'',account_name:'',account_contact:'',account_mobile:'',intake_source:'Branch',direct_to_delhi:false,direct_destination:'',current_milestone:'Submitted',current_milestone_date:''};
  const [form,setForm]=useState(emptyCase);
  const freshNewCaseDoc=()=>({document_name:'',holder_name:'',holder_custom:false,quantity:1,direct_to_delhi:false,direct_destination:'',stages:['MEA India','Embassy of India','MOFA Qatar'],custom_stage:''});
  const [newCaseDocs,setNewCaseDocs]=useState([freshNewCaseDoc()]);
  const customerTrackingUrl=caseOrRef=>trackingLink({
    base:trackingBaseUrl||process.env.NEXT_PUBLIC_CUSTOMER_TRACKING_URL,
    origin:typeof window!=='undefined'?window.location.origin:'',
    reference:typeof caseOrRef==='object'?caseOrRef?.tracking_reference:caseOrRef,
    token:typeof caseOrRef==='object'?caseOrRef?.public_tracking_token:'',
    organization:currentOrganization?.slug
  });
  const whatsappNumber=value=>{
    let n=String(value||'').replace(/\D/g,'');
    if(!n)return '';
    if(n.startsWith('00'))n=n.slice(2);
    if(n.length===8)n=`974${n}`;
    return n;
  };
  const whatsappTrackingMessage=c=>{
    const link=customerTrackingUrl(c);
    const customer=String(c?.customer_name||'Customer').trim();
    const submitted=c?.submission_date?new Date(`${c.submission_date}T00:00:00`).toLocaleDateString('en-GB'):'—';
    const status=String(c?.overall_status||'Received').trim();
    const docs=(c?.documents||[]).map(d=>{
      const name=String(d?.document_name||'Document').trim();
      const qty=Number(d?.quantity||1);
      const holder=String(d?.holder_name||'').trim();
      const holderSuffix=holder && holder.toLowerCase()!==customer.toLowerCase()?` – Holder: ${holder}`:'';
      return `• ${name} × ${qty}${holderSuffix}`;
    });
    const company=brandSettings?.company_name||currentOrganization?.name||'Your Organization';
    return `${company} – Document Tracking

Dear ${customer},
Your document request has been registered successfully.

Tracking No: ${c?.tracking_reference||''}
Customer: ${customer}
Submission Date: ${submitted}

Documents:
${docs.length?docs.join('\n'):'• Document details registered'}

Current Status: ${status}

Track your documents:
${link}

You can use the above link anytime to check the latest status. No tracking number entry is required.

${company}`;
  };
  async function trackingReceiptDataUrl(c){
    const link=customerTrackingUrl(c),qr=await QRCode.toDataURL(link,{width:320,margin:1,errorCorrectionLevel:'M'});
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const x=canvas.getContext('2d');
    const round=(left,top,width,height,r,fill)=>{x.beginPath();x.roundRect(left,top,width,height,r);x.fillStyle=fill;x.fill()};
    const text=(value,left,top,size,color='#14213d',weight=500,align='left')=>{x.font=`${weight} ${size}px Arial`;x.fillStyle=color;x.textAlign=align;x.fillText(String(value||''),left,top)};
    x.fillStyle='#f3f7fc';x.fillRect(0,0,1080,1350);round(54,44,972,1262,34,'#ffffff');
    const grad=x.createLinearGradient(54,44,1026,310);grad.addColorStop(0,'#147e91');grad.addColorStop(1,'#3d5ff0');round(54,44,972,276,34,grad);x.fillStyle=grad;x.fillRect(54,180,972,140);
    const company=brandSettings?.company_name||currentOrganization?.name||'Your Organization',mark=(brandSettings?.short_name||company||'D').slice(0,1).toUpperCase();
    round(92,82,70,70,20,'rgba(255,255,255,.18)');text(mark,127,132,36,'#fff',800,'center');text(company.toUpperCase(),185,112,24,'#dceaff',700);text('DOCUMENT TRACKING RECEIPT',185,145,18,'#dceaff',500);
    text(`#${c?.tracking_reference||'—'}`,92,226,54,'#fff',800);text(c?.customer_name||'Customer',92,282,31,'#fff',700);
    const status=String(c?.overall_status||'Received');round(760,214,220,54,27,'#e6fff3');text(status,870,249,19,'#08744e',700,'center');
    const branch=c?.branches?.name||c?.physical_location||'—',submitted=c?.submission_date?new Date(`${String(c.submission_date).slice(0,10)}T00:00:00`).toLocaleDateString('en-GB'):'—';
    const info=[['MOBILE',c?.mobile||'—'],['BRANCH',branch],['SUBMITTED',submitted],['BILL',c?.bill_no||'—']];
    info.forEach((v,i)=>{const col=i%2,row=Math.floor(i/2),left=92+col*464,top=355+row*112;round(left,top,432,88,16,'#f6f8fc');text(v[0],left+20,top+29,14,'#8490a4',700);text(v[1],left+20,top+64,22,'#18243a',650)});
    text('DOCUMENTS',92,610,16,'#77849a',800);const docs=c?.documents||[];let y=650;(docs.length?docs:[{document_name:'Document details registered',quantity:1}]).slice(0,6).forEach((d,i)=>{round(92,y,650,70,13,i%2?'#fafbfd':'#f4f7fc');text(`${i+1}`,119,y+43,17,'#3a63ca',700,'center');text(d.document_name||'Document',150,y+31,20,'#18243a',700);text(`${d.holder_name&&d.holder_name!==c.customer_name?`${d.holder_name} · `:''}Qty ${d.quantity||1}`,150,y+55,14,'#7b8799',500);y+=78});
    if(docs.length>6)text(`+ ${docs.length-6} more document${docs.length-6===1?'':'s'}`,110,y+16,15,'#536580',600);
    round(772,610,208,208,18,'#fff');const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=qr});x.drawImage(image,788,626,176,176);text('SCAN TO TRACK',876,844,15,'#52627b',800,'center');
    round(92,1055,888,130,18,'#eef4ff');text('TRACK YOUR DOCUMENTS ONLINE',120,1094,15,'#55709c',800);text(link,120,1133,18,'#2457be',650);text('This link opens your case directly. No tracking number entry is required.',120,1166,14,'#65758d',500);
    text(`${company} · Secure customer tracking`,92,1255,15,'#8793a5',600);text(new Date().toLocaleString('en-GB'),980,1255,14,'#8793a5',500,'right');
    return canvas.toDataURL('image/png',.96);
  }
  async function shareDetailedTracking(c,{whatsapp=false}={}){
    const message=whatsappTrackingMessage(c);
    // Open during the click gesture; receipt generation must not block the popup.
    if(whatsapp)window.open(`https://wa.me/${whatsappNumber(c?.mobile)}?text=${encodeURIComponent(message)}`,'_blank','noopener,noreferrer');
    try{
      const company=brandSettings?.company_name||currentOrganization?.name||'Document';
      const dataUrl=await trackingReceiptDataUrl(c);
      const file=new File([receiptBlob(dataUrl)],`${safeFileName(company)}-tracking-${safeFileName(c.tracking_reference)}.png`,{type:'image/png'});
      if(!whatsapp&&navigator.share&&navigator.canShare?.({files:[file]})){
        try{await navigator.share({title:`${company} Tracking #${c.tracking_reference}`,text:message,files:[file]});return}
        catch(error){if(error.name==='AbortError')return;if(!['NotAllowedError','TypeError','SecurityError'].includes(error.name))throw error}
      }
      const a=document.createElement('a');a.href=dataUrl;a.download=file.name;a.click();
      if(whatsapp)setMessage('Receipt downloaded. Attach it to the prepared WhatsApp message.');
      else{try{await navigator.clipboard.writeText(message);setMessage('Receipt downloaded and tracking message copied.')}catch{setMessage('Receipt downloaded. Use Copy Link to share the tracking link.')}}
    }catch(err){setMessage('The tracking receipt could not be generated. Please use Copy Link and try again.');console.error('Tracking receipt generation failed',err?.name)}
  }
  useEffect(()=>{
    if(createdShare)setCreatedShareMessage(whatsappTrackingMessage(createdShare));
    else setCreatedShareMessage('');
  },[createdShare]);
  useEffect(()=>{
    let active=true;
    (async()=>{
      if(!createdShare?.tracking_reference){setCreatedQr('');setCreatedReceipt('');return}
      try{
        const data=await QRCode.toDataURL(customerTrackingUrl(createdShare),{width:520,margin:2,errorCorrectionLevel:'M'});
        const receipt=await trackingReceiptDataUrl(createdShare);
        if(active){setCreatedQr(data);setCreatedReceipt(receipt)}
      }catch{if(active){setCreatedQr('');setCreatedReceipt('')}}
    })();
    return()=>{active=false};
  },[createdShare?.tracking_reference,trackingBaseUrl]);
  function openTrackingWhatsApp(c){
    const number=whatsappNumber(c?.mobile);
    const message=createdShareMessage.trim()||whatsappTrackingMessage(c);
    const url=`https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    window.open(url,'_blank','noopener,noreferrer');
  }
  async function shareTrackingQr(c){return shareDetailedTracking(c)}
  const [documentCatalog,setDocumentCatalog]=useState([]);
  const [docForm,setDocForm]=useState({document_name:'',holder_name:'',quantity:1,direct_to_delhi:false,direct_destination:'',stages:['MEA India','Embassy of India','MOFA Qatar']});
  const [customStage,setCustomStage]=useState('');
  const [appointmentCase,setAppointmentCase]=useState(null);
  const [appointmentSeedIds,setAppointmentSeedIds]=useState([]);
  const [deliverySeedCase,setDeliverySeedCase]=useState(null);
  const [paymentSeedCase,setPaymentSeedCase]=useState(null);
  const [custodySeedCase,setCustodySeedCase]=useState(null);
  const [batchSeed,setBatchSeed]=useState([]);
  const [globalScan,setGlobalScan]=useState(false);
  const [mobileMenu,setMobileMenu]=useState(false);
  const [notificationOpen,setNotificationOpen]=useState(false);
  const [auditRows,setAuditRows]=useState([]);
  const [auditLoading,setAuditLoading]=useState(false);
  const [auditLastRead,setAuditLastRead]=useState('');
  const favoriteStorageKey=`kenza_favorite_cases_${session.user.id}`;
  const recentStorageKey=`kenza_recent_cases_${session.user.id}`;
  useEffect(()=>{
    let live=true;
    try{setFavoriteCaseIds(new Set(JSON.parse(localStorage.getItem(favoriteStorageKey)||'[]')))}catch{setFavoriteCaseIds(new Set())}
    supabase.from('user_favorite_cases').select('case_id').eq('user_id',session.user.id).then(({data,error})=>{if(!live||error)return;const next=new Set((data||[]).map(x=>x.case_id));setFavoriteCaseIds(next);try{localStorage.setItem(favoriteStorageKey,JSON.stringify([...next]))}catch{}});
    try{setRecentCaseIds(JSON.parse(localStorage.getItem(recentStorageKey)||'[]').slice(0,12))}catch{setRecentCaseIds([])}
    return()=>{live=false};
  },[favoriteStorageKey,recentStorageKey]);
  function toggleFavoriteCase(caseId){setFavoriteCaseIds(prev=>{const next=new Set(prev),removing=next.has(caseId);removing?next.delete(caseId):next.add(caseId);try{localStorage.setItem(favoriteStorageKey,JSON.stringify([...next]))}catch{};(removing?supabase.from('user_favorite_cases').delete().eq('user_id',session.user.id).eq('case_id',caseId):supabase.from('user_favorite_cases').upsert({user_id:session.user.id,case_id:caseId},{onConflict:'user_id,case_id'})).then(({error})=>{if(error&&!/does not exist|schema cache|Could not find/i.test(String(error.message||'')))setMessage(userError(error,{fallback:'Favorite sync could not be completed.'}))});return next})}
  function clearRecentCases(){setRecentCaseIds([]);try{localStorage.setItem(recentStorageKey,'[]')}catch{}setMessage('Recently viewed cases cleared.')}
  async function clearFavoriteCases(){
    if(!favoriteCaseIds.size)return;
    if(!confirm('Clear all favorite cases? The cases will not be deleted.'))return;
    const previous=new Set(favoriteCaseIds);
    setFavoriteCaseIds(new Set());
    try{localStorage.setItem(favoriteStorageKey,'[]')}catch{}
    const {error}=await supabase.from('user_favorite_cases').delete().eq('user_id',session.user.id);
    if(error&&!/does not exist|schema cache|Could not find/i.test(String(error.message||''))){setFavoriteCaseIds(previous);try{localStorage.setItem(favoriteStorageKey,JSON.stringify([...previous]))}catch{}setMessage(error);return}
    setMessage('Favorite cases cleared. No cases were deleted.');
  }
  function openCase(c){if(!c)return;setQuickCase(c);setRecentCaseIds(prev=>{const next=[c.id,...prev.filter(id=>id!==c.id)].slice(0,12);try{localStorage.setItem(recentStorageKey,JSON.stringify(next))}catch{}return next})}
  useEffect(()=>{try{setSidebarCollapsed(localStorage.getItem('kenza_sidebar_collapsed')==='1')}catch{}},[]);
  useEffect(()=>{const group=['dashboard','cases','documents'].includes(view)?'overview':['operations','deliveries','custody','appointments','batches','courier'].includes(view)?'operations':['crm','sales','services'].includes(view)?'customers':'finance';setNavGroups(x=>({...x,[group]:true}))},[view]);
  function toggleSidebar(){setSidebarCollapsed(v=>{const next=!v;try{localStorage.setItem('kenza_sidebar_collapsed',next?'1':'0')}catch{}return next})}

  const auditStorageKey=`kenza_audit_read_${session.user.id}`;
  const loadAudit=useCallback(async()=>{
    setAuditLoading(true);
    const {data,error}=await supabase.from('case_history').select('id,case_id,user_id,action,field_name,old_value,new_value,metadata,created_at,profiles!case_history_user_id_fkey(full_name,role)').order('created_at',{ascending:false}).limit(300);
    setAuditLoading(false);
    if(error){setMessage(userError(error));return}
    setAuditRows(data||[]);
  },[]);
  useEffect(()=>{
    try{setAuditLastRead(localStorage.getItem(auditStorageKey)||'')}catch{}
    loadAudit();
    const timer=setInterval(loadAudit,60000);
    return()=>clearInterval(timer);
  },[auditStorageKey,loadAudit]);
  const unreadActivity=auditRows.filter(r=>!auditLastRead||new Date(r.created_at)>new Date(auditLastRead)).length;
  function markActivityRead(){const now=new Date().toISOString();setAuditLastRead(now);try{localStorage.setItem(auditStorageKey,now)}catch{}}

  function openScannedAction(action,c){
    setGlobalScan(false);
    if(action==='case'){openCase(c);return}
    if(action==='delivery'){setDeliverySeedCase(c);setView('deliveries');return}
    if(action==='handover'){setCustodySeedCase(c);setView('custody');return}
    if(action==='payment'){setPaymentSeedCase(c);setView('payments')}
  }

  useEffect(()=>{
    let alive=true;
    void clearCaseCache(caseCacheKey);
    bootstrap().catch(()=>{setBrandReady(true);setLoading(false);setMessage('Your workspace could not be loaded. Please refresh to retry.')});
    return()=>{alive=false};
  },[]);
  async function bootstrap(hasCache=false){
    if(!hasCache)setLoading(true); setMessage('');
    const [{data:p,error:pe},{data:b,error:be}]=await Promise.all([
      supabase.from('profiles').select('id,full_name,role,branch_id,is_active,organization_id,is_platform_super_admin,staff_modules').eq('id',session.user.id).single(),
      supabase.from('branches').select('id,name,organization_id,is_active').eq('is_active',true).order('name')
    ]);
    if(pe||be)setMessage(userError(pe||be,{fallback:'Unable to load account settings.'}));
    if(!p?.is_active||pe){setCasesLoadError('Your account settings could not be loaded. Sign in again or retry.');setCases([]);setBrandReady(true);await clearCaseCache(caseCacheKey);setLoading(false);return}
    setProfile(p||null);
    setBranches(b||[]);
    if(p?.organization_id){
      const [{data:o},{data:s}]=await Promise.all([
        supabase.from('organizations').select('*').eq('id',p.organization_id).maybeSingle(),
        supabase.from('organization_settings').select('*').eq('organization_id',p.organization_id).maybeSingle()
      ]);
      setCurrentOrganization(o||null);setBrandSettings(s||null);
    }else if(p?.is_platform_super_admin){
      // A global platform owner is intentionally not assigned to a tenant.
      // Restore the last company selected in Platform Management so visual
      // branding remains stable after refresh without changing data tenancy.
      let previewOrganizationId='';
      try{previewOrganizationId=localStorage.getItem('platform_selected_organization')||''}catch{}
      if(!previewOrganizationId){
        const deploymentSlug=String(process.env.NEXT_PUBLIC_ORGANIZATION_SLUG||'').trim();
        if(deploymentSlug){const {data:o}=await supabase.from('organizations').select('id').eq('slug',deploymentSlug).maybeSingle();previewOrganizationId=o?.id||''}
      }
      if(!previewOrganizationId){const {data:o}=await supabase.from('organizations').select('id').eq('status','Active').order('created_at').limit(1).maybeSingle();previewOrganizationId=o?.id||''}
      if(previewOrganizationId){
        const [{data:o},{data:s}]=await Promise.all([
          supabase.from('organizations').select('*').eq('id',previewOrganizationId).maybeSingle(),
          supabase.from('organization_settings').select('*').eq('organization_id',previewOrganizationId).maybeSingle()
        ]);
        setCurrentOrganization(o||null);setBrandSettings(s||null);
      }
    }
    setBrandReady(true);
    if(p && isBranchProfile(p) && p.branch_id) setBranchFilter(p.branch_id);
    else setBranchFilter('All');
    await loadCases();
    await loadDocumentCatalog();
    setLoading(false);
  }

  async function loadDocumentCatalog(){
    const {data,error}=await supabase.from('document_catalog').select('id,name').eq('is_active',true).order('name');
    if(!error)setDocumentCatalog(data||[]);
  }
  async function rememberDocumentNames(names=[]){
    const clean=[...new Set(names.map(v=>String(v||'').trim()).filter(Boolean))];
    if(!clean.length)return;
    for(const name of clean){
      const exists=documentCatalog.some(x=>String(x.name||'').trim().toLowerCase()===name.toLowerCase());
      if(exists)continue;
      const {data,error}=await supabase.from('document_catalog').insert({name,created_by:session.user.id}).select('id,name').single();
      if(!error&&data)setDocumentCatalog(prev=>[...prev,data].sort((a,b)=>a.name.localeCompare(b.name)));
    }
  }

  async function loadCases(){
    setCasesLoadError('');
    // Stale-while-revalidate: cached data is shown immediately. The live refresh is
    // progressive so even a first-time browser sees the first page quickly instead
    // of waiting for all 10k+ nested workflows to arrive.
    const pageSize=300; let from=0; let all=[]; let first=true;
    while(true){
      const {data:{session:liveSession}}=await supabase.auth.getSession();
      let data,error;
      try{
        const response=await fetch(`/api/cases?offset=${from}&limit=${pageSize}`,{headers:{authorization:`Bearer ${liveSession?.access_token||''}`},cache:'no-store'});
        const result=await response.json();
        if(!response.ok)error={message:result.error,code:result.code,request_id:result.request_id};
        else data=result.cases;
      }catch{error={message:'The connection could not be completed.',code:'CONNECTION_FAILED'}}
      if(error){setCasesLoadError(`Cases could not be loaded. Your saved records remain in the database.${error.request_id?' Support reference: '+error.request_id:''}`);setMessage('Cases could not be loaded. Please retry.');return}
      const rows=(data||[]).map(normalizeCaseRow); all.push(...rows);
      if(first && rows.length){
        setCases(prev=>prev.length?prev:rows);
        setLoading(false);
        first=false;
      }
      if(rows.length<pageSize)break;
      from+=pageSize;
      // Yield to the browser between pages so navigation/search stays responsive.
      await new Promise(r=>setTimeout(r,0));
    }
    setCases(all);
    // Customer data remains in memory; authorization is rechecked on refresh.
    if(quickCase){const fresh=all.find(c=>c.id===quickCase.id);if(fresh)setQuickCase(fresh)}
  }
  function normalizeCaseRow(c){
    return {...c,documents:(c.documents||[]).map(d=>({...d,document_stages:[...(d.document_stages||[])].sort((a,b)=>a.stage_order-b.stage_order)})).sort((a,b)=>a.occurrence_no-b.occurrence_no)};
  }
  function replaceCaseLocal(nextCase){
    const normalized=normalizeCaseRow(nextCase);
    setCases(prev=>prev.map(x=>x.id===normalized.id?normalized:x));
    setQuickCase(prev=>prev?.id===normalized.id?normalized:prev);
  }
  function patchStageLocal(caseId,docId,stageId,patch){
    const mutate=c=>c.id!==caseId?c:{...c,documents:(c.documents||[]).map(d=>d.id!==docId?d:{...d,document_stages:(d.document_stages||[]).map(st=>st.id===stageId?{...st,...patch}:st).sort((a,b)=>a.stage_order-b.stage_order)})};
    setCases(prev=>prev.map(mutate));
    setQuickCase(prev=>prev?mutate(prev):prev);
  }
  function patchDocumentLocal(caseId,docId,patch){
    const mutate=c=>c.id!==caseId?c:{...c,documents:(c.documents||[]).map(d=>d.id===docId?{...d,...patch}:d)};
    setCases(prev=>prev.map(mutate));
    setQuickCase(prev=>prev?mutate(prev):prev);
  }
  function patchCaseStatusLocal(caseId,status){
    setCases(prev=>prev.map(c=>c.id===caseId?{...c,overall_status:status}:c));
    setQuickCase(prev=>prev?.id===caseId?{...prev,overall_status:status}:prev);
  }
  async function refreshCase(caseId){
    const {data,error}=await supabase.from('cases').select(`
      id,tracking_reference,public_tracking_token,tracking_family,bill_no,internal_invoice_no,customer_name,mobile,customer_id,customer_email,email_updates,whatsapp_opt_in,submission_date,promise_date,overall_status,total_amount,advance_paid,second_payment,discount_return,balance_payment,notes,assigned_to,physical_location,flags,created_at,updated_at,branch_id,account_name,account_contact,account_mobile,intake_source,direct_to_delhi,direct_destination,current_milestone,current_milestone_date,branches!cases_branch_id_fkey(name),
      documents!documents_case_id_fkey(id,document_name,holder_name,source_tracking_reference,occurrence_no,quantity,document_status,physical_location,direct_to_delhi,direct_destination,current_milestone,current_milestone_date,created_at,document_stages!document_stages_document_id_fkey(id,stage_name,stage_order,status,milestone_date,is_manual_override,updated_at))
    `).eq('id',caseId).single();
    if(!error&&data)replaceCaseLocal(data);
  }
  async function history(caseId,action,field,oldValue,newValue,metadata={}){
    await supabase.from('case_history').insert({case_id:caseId,user_id:session.user.id,action,field_name:field||null,old_value:oldValue==null?null:String(oldValue),new_value:newValue==null?null:String(newValue),metadata});
  }
  async function fetchCaseByTracking(tracking){
    const ref=String(tracking||'').trim();
    if(!ref)return null;
    const {data,error}=await supabase.from('cases').select(`
      id,tracking_reference,public_tracking_token,tracking_family,bill_no,internal_invoice_no,customer_name,mobile,customer_id,customer_email,email_updates,whatsapp_opt_in,submission_date,promise_date,overall_status,total_amount,advance_paid,second_payment,discount_return,balance_payment,notes,assigned_to,physical_location,flags,created_at,updated_at,branch_id,account_name,account_contact,account_mobile,intake_source,direct_to_delhi,direct_destination,current_milestone,current_milestone_date,branches!cases_branch_id_fkey(name),
      documents!documents_case_id_fkey(id,document_name,holder_name,source_tracking_reference,occurrence_no,quantity,document_status,physical_location,direct_to_delhi,direct_destination,current_milestone,current_milestone_date,created_at,document_stages!document_stages_document_id_fkey(id,stage_name,stage_order,status,milestone_date,is_manual_override,updated_at))
    `).eq('tracking_reference',ref).maybeSingle();
    if(error)return null;
    return data?normalizeCaseRow(data):null;
  }
  function openExistingDuplicate(c){
    if(!c)return;
    setDuplicateReview(null);
    setShowNew(false);
    setView('cases');
    setQuery(c.tracking_reference||'');
    setStatusFilter('All');setDocumentFilter('All');setQuantityFilter('All');setMobileFilter('All');setBalanceFilter('All');setAccountFilter('All');setIntakeFilter('All');setDdFilter('All');
    setBranchFilter(isBranch&&ownBranch?ownBranch:'All');
    setCases(prev=>prev.some(x=>x.id===c.id)?prev:[c,...prev]);
    setQuickCase(c);
  }

  const [documentPrices,setDocumentPrices]=useState([]);
  const caseCheckoutKey=useRef(null);
  useEffect(()=>{let live=true;setDocumentPrices([]);const org=profile?.is_platform_super_admin?brandSettings?.organization_id:profile?.organization_id;if(showNew&&org&&form.branch_id)supabase.from('document_prices').select('*').eq('organization_id',org).eq('branch_id',form.branch_id).then(({data})=>{if(live)setDocumentPrices(data||[])});return()=>{live=false}},[showNew,form.branch_id,profile?.organization_id,brandSettings?.organization_id]);
  useEffect(()=>{if(showNew)setForm(f=>({...f,total_amount:newCaseDocs.filter(d=>String(d.document_name||'').trim()).reduce((n,d)=>n+Number(d.quantity||1)*(Number(d.government_fee||0)+Number(d.service_fee||0)),0)}))},[newCaseDocs,showNew]);
  async function createCase(e){
    e.preventDefault(); setSaving(true); setMessage('');
    const docsToCreate=newCaseDocs.filter(d=>String(d.document_name||'').trim());
    if(!docsToCreate.length){setMessage('Add at least one document before creating the case.');setSaving(false);return}
    const incomplete=docsToCreate.find(d=>!(d.stages||[]).filter(Boolean).length);
    if(incomplete){setMessage(`Add at least one attestation stage for ${incomplete.document_name||'each document'}.`);setSaving(false);return}
    const total=Number(form.total_amount||0), advance=Number(form.advance_paid||0);
    const requestedTracking=String(form.tracking_reference||'').trim();
    const existingCase=await fetchCaseByTracking(requestedTracking);
    if(existingCase){
      setDuplicateReview(existingCase);
      setSaving(false);
      return;
    }
    // DD belongs to individual documents. The legacy case-level DD columns remain false/null.
    const payload={...form,tracking_reference:form.tracking_reference.trim(),tracking_family:trackingFamily(form.tracking_reference),account_name:form.account_name?.trim()||null,account_contact:form.account_contact?.trim()||null,account_mobile:form.account_mobile?.trim()||null,intake_source:form.intake_source||'Branch',direct_to_delhi:false,direct_destination:null,current_milestone:form.current_milestone?.trim()||'Submitted',current_milestone_date:form.current_milestone_date||null,bill_no:form.bill_no.trim()||null,internal_invoice_no:form.internal_invoice_no.trim()||null,customer_name:form.customer_name.trim(),mobile:form.mobile.trim()||null,submission_date:form.submission_date||null,promise_date:form.promise_date||null,branch_id:form.branch_id||null,total_amount:total,advance_paid:advance,balance_payment:Math.max(0,total-advance),notes:form.notes.trim()||null,created_by:session.user.id,updated_by:session.user.id};
    caseCheckoutKey.current ||= crypto.randomUUID();
    const {data:createdId,error}=await supabase.rpc('create_attestation_checkout',{request_key:caseCheckoutKey.current,input:{case:{...payload,organization_id:profile?.is_platform_super_admin?brandSettings.organization_id:profile.organization_id},documents:docsToCreate.map(d=>({...d,government_fee:Number(d.government_fee||0),service_fee:Number(d.service_fee||0),holder_name:d.holder_custom?d.holder_name:form.customer_name}))}});
    const data={id:createdId};
    if(error){
      const isDuplicate=error.code==='23505' || /duplicate key|tracking_reference_key/i.test(String(error.message||''));
      if(isDuplicate){
        const duplicate=await fetchCaseByTracking(payload.tracking_reference);
        if(duplicate){setDuplicateReview(duplicate);setSaving(false);return}
      }
      setMessage(userError(error));setSaving(false);return
    }
    try{
      await rememberDocumentNames(docsToCreate.map(d=>d.document_name));
      // Fetch the complete newly-created case and place it into the current list immediately.
      // This avoids a successful transaction appearing to be missing while the paged background reload runs.
      const {data:createdCase,error:createdCaseError}=await supabase.from('cases').select(`
        id,tracking_reference,public_tracking_token,tracking_family,bill_no,internal_invoice_no,customer_name,mobile,customer_id,customer_email,email_updates,whatsapp_opt_in,submission_date,promise_date,overall_status,total_amount,advance_paid,second_payment,discount_return,balance_payment,notes,assigned_to,physical_location,flags,created_at,updated_at,branch_id,account_name,account_contact,account_mobile,intake_source,direct_to_delhi,direct_destination,current_milestone,current_milestone_date,branches!cases_branch_id_fkey(name),
        documents!documents_case_id_fkey(id,document_name,holder_name,source_tracking_reference,occurrence_no,quantity,document_status,physical_location,direct_to_delhi,direct_destination,current_milestone,current_milestone_date,created_at,document_stages!document_stages_document_id_fkey(id,stage_name,stage_order,status,milestone_date,is_manual_override,updated_at))
      `).eq('id',data.id).single();
      if(!createdCaseError&&createdCase){
        const normalized=normalizeCaseRow(createdCase);
        setCases(prev=>[normalized,...prev.filter(c=>c.id!==normalized.id)]);
      }
      // Take the user straight to the created record and remove filters that could hide it.
      setView('cases');
      setQuery(payload.tracking_reference);
      setStatusFilter('All');
      setDocumentFilter('All');
      setQuantityFilter('All');
      setMobileFilter('All');
      setBalanceFilter('All');
      setAccountFilter('All');
      setIntakeFilter('All');
      setDdFilter('All');
      setBranchFilter(isBranch&&ownBranch?ownBranch:'All');
      const shareCase=(!createdCaseError&&createdCase)?normalizeCaseRow(createdCase):{...payload,id:data.id,mobile:payload.mobile,customer_name:payload.customer_name};
      setCreatedShare(shareCase);
      caseCheckoutKey.current=null;setShowNew(false);setForm(emptyCase);setNewCaseDocs([freshNewCaseDoc()]);setMessage(`Case ${payload.tracking_reference} created successfully.`);void loadCases();
    }catch(err){
      // Best-effort rollback so a failed document/stage insert does not leave a half-created manual transaction.
      // The RPC saves all records in one database transaction; no client rollback is needed.
      setMessage(userError(err,{fallback:'Case creation failed and was safely rolled back. Please try again.'}));
    }
    setSaving(false);
  }
  async function updateCaseStatus(c,next){
    if(next===c.overall_status)return;
    const {error}=await supabase.from('cases').update({overall_status:next,updated_by:session.user.id}).eq('id',c.id);
    if(error){setMessage(userError(error));return}
    patchCaseStatusLocal(c.id,next); await history(c.id,'Overall status changed','overall_status',c.overall_status,next); void refreshCase(c.id);
  }
  async function updateStage(c,d,s,next){
    if(next===s.status)return;
    const old=s.status;
    // Optimistic UI: reflect the stage immediately instead of waiting for network + full case reload.
    patchStageLocal(c.id,d.id,s.id,{status:next,is_manual_override:true});
    const localStages=(d.document_stages||[]).map(x=>x.id===s.id?{...x,status:next}:x);
    const relevant=localStages.filter(x=>x.status!=='Not Required');
    let docNext='Pending';
    if(relevant.length&&relevant.every(x=>x.status==='Completed'))docNext='Completed';
    else if(relevant.some(x=>x.status==='Processing'||x.status==='Completed'))docNext='Processing';
    else if(relevant.length&&relevant.every(x=>x.status==='Cancelled'))docNext='Cancelled';
    patchDocumentLocal(c.id,d.id,{document_status:docNext});
    if(!['Ready for Delivery','Delivered','Cancelled'].includes(c.overall_status)){
      const allDocs=(c.documents||[]).map(doc=>doc.id===d.id?{...doc,document_stages:localStages}:doc);
      const allStages=allDocs.flatMap(doc=>doc.document_stages||[]).map(x=>x.status).filter(Boolean).filter(x=>x!=='Not Required');
      let caseNext=c.overall_status;
      if(allStages.length&&allStages.every(x=>x==='Completed'))caseNext='Completed';
      else if(allStages.length&&allStages.every(x=>x==='Cancelled'))caseNext='Cancelled';
      else if(allStages.some(x=>x==='Processing'||x==='Completed'))caseNext='Under Process';
      else if(allStages.length&&allStages.every(x=>x==='Pending'))caseNext='Received';
      patchCaseStatusLocal(c.id,caseNext);
    }
    const stageDate=['Processing','Completed'].includes(next)?(s.milestone_date||new Date().toISOString().slice(0,10)):s.milestone_date||null;
    patchStageLocal(c.id,d.id,s.id,{milestone_date:stageDate});
    const {error}=await supabase.from('document_stages').update({status:next,milestone_date:stageDate,is_manual_override:true,updated_by:session.user.id}).eq('id',s.id);
    if(error){setMessage(userError(error));patchStageLocal(c.id,d.id,s.id,{status:old});await refreshCase(c.id);return}
    await history(c.id,'Stage status changed',s.stage_name,old,next,{document_id:d.id,document_name:d.document_name});
    await syncDocumentStatus(d.id);
    await syncCaseOverallStatus(c.id,c.overall_status);
    await refreshCase(c.id);
  }
  async function updateStageDate(c,d,s,date){
    const value=date||null;
    patchStageLocal(c.id,d.id,s.id,{milestone_date:value,is_manual_override:true});
    const {error}=await supabase.from('document_stages').update({milestone_date:value,is_manual_override:true,updated_by:session.user.id}).eq('id',s.id);
    if(error){setMessage(userError(error));await refreshCase(c.id);return}
    await history(c.id,'Stage date changed',`${s.stage_name} date`,s.milestone_date||null,value,{document_id:d.id,document_name:d.document_name});
    await refreshCase(c.id);
  }
  async function reorderStages(c,d,orderedStages){
    if(!orderedStages?.length)return;
    const before=(d.document_stages||[]).map(x=>x.id);
    const after=orderedStages.map(x=>x.id);
    if(before.join('|')===after.join('|'))return;
    const optimistic=orderedStages.map((st,i)=>({...st,stage_order:i+1}));
    const mutate=caseRow=>caseRow.id!==c.id?caseRow:{...caseRow,documents:(caseRow.documents||[]).map(doc=>doc.id===d.id?{...doc,document_stages:optimistic}:doc)};
    setCases(prev=>prev.map(mutate));
    setQuickCase(prev=>prev?mutate(prev):prev);
    const payload=optimistic.map(st=>({id:st.id,document_id:d.id,stage_name:st.stage_name,stage_order:st.stage_order,status:st.status,is_manual_override:st.is_manual_override,updated_by:session.user.id}));
    const {error}=await supabase.from('document_stages').upsert(payload,{onConflict:'id'});
    if(error){setMessage(userError(error));await refreshCase(c.id);return}
    await history(c.id,'Stage order changed','stage_order',before.join(','),after.join(','),{document_id:d.id,document_name:d.document_name});
    await refreshCase(c.id);
  }
  async function syncDocumentStatus(docId){
    const {data}=await supabase.from('document_stages').select('status').eq('document_id',docId);
    if(!data?.length)return;
    const active=data.filter(x=>x.status!=='Not Required');
    let next='Pending';
    if(active.length&&active.every(x=>x.status==='Completed'))next='Completed';
    else if(active.some(x=>x.status==='Processing'||x.status==='Completed'))next='Processing';
    else if(active.length&&active.every(x=>x.status==='Cancelled'))next='Cancelled';
    await supabase.from('documents').update({document_status:next}).eq('id',docId);
  }
  async function syncCaseOverallStatus(caseId,currentStatus){
    // Do not automatically downgrade fulfilment/terminal states.
    if(['Ready for Delivery','Delivered','Cancelled'].includes(currentStatus))return;
    const {data,error}=await supabase.from('documents').select('document_status,document_stages!document_stages_document_id_fkey(status)').eq('case_id',caseId);
    if(error||!data?.length)return;
    const stages=data.flatMap(d=>d.document_stages||[]).map(x=>x.status).filter(Boolean);
    if(!stages.length)return;
    const relevant=stages.filter(x=>x!=='Not Required');
    let next=currentStatus;
    if(relevant.length&&relevant.every(x=>x==='Completed'))next='Completed';
    else if(relevant.length&&relevant.every(x=>x==='Cancelled'))next='Cancelled';
    else if(relevant.some(x=>x==='Processing'||x==='Completed'))next='Under Process';
    else if(relevant.every(x=>x==='Pending'))next='Received';
    if(next!==currentStatus){
      const {error:ue}=await supabase.from('cases').update({overall_status:next,updated_by:session.user.id}).eq('id',caseId);
      if(!ue)await history(caseId,'Overall status auto-updated','overall_status',currentStatus,next,{source:'stage_change'});
    }
  }
  async function addDocument(e){
    e.preventDefault(); if(!showDoc)return; setSaving(true);setMessage('');
    const caseId=showDoc.id, name=docForm.document_name.trim();
    const existing=showDoc.documents?.filter(d=>d.document_name.toLowerCase()===name.toLowerCase())||[];
    const occurrence=Math.max(0,...existing.map(d=>d.occurrence_no||0))+1;
    const {data:doc,error}=await supabase.from('documents').insert({case_id:caseId,document_name:name,holder_name:docForm.holder_name.trim()||null,source_tracking_reference:showDoc.tracking_reference,direct_to_delhi:Boolean(docForm.direct_to_delhi),direct_destination:docForm.direct_to_delhi?(docForm.direct_destination.trim()||'Delhi'):null,occurrence_no:occurrence,quantity:Number(docForm.quantity||1),document_status:'Pending'}).select('id').single();
    if(error){setMessage(userError(error));setSaving(false);return}
    const stages=docForm.stages.filter(Boolean).map((stage_name,i)=>({document_id:doc.id,stage_name,stage_order:i+1,status:'Pending'}));
    if(stages.length){const {error:se}=await supabase.from('document_stages').insert(stages);if(se){setMessage(userError(se));setSaving(false);return}}
    await history(caseId,'Document added','document',null,name,{occurrence_no:occurrence,stages:docForm.stages});
    setShowDoc(null);setCustomStage('');setDocForm({document_name:'',holder_name:'',quantity:1,direct_to_delhi:false,direct_destination:'',stages:['MEA India','Embassy of India','MOFA Qatar']});await refreshCase(caseId);setSaving(false);
  }
  async function addStageToDocument(c,d){
    const stageName=window.prompt('Enter attestation stage name');
    if(!stageName||!stageName.trim())return;
    const name=stageName.trim();
    if((d.document_stages||[]).some(x=>x.stage_name.toLowerCase()===name.toLowerCase())){setMessage('This stage already exists on the document.');return}
    const order=Math.max(0,...(d.document_stages||[]).map(x=>Number(x.stage_order||0)))+1;
    const {data,error}=await supabase.from('document_stages').insert({document_id:d.id,stage_name:name,stage_order:order,status:'Pending',is_manual_override:true,updated_by:session.user.id}).select('id,document_id,stage_name,stage_order,status,is_manual_override,updated_at').single();
    if(error){setMessage(userError(error));return}
    await history(c.id,'Stage added','stage',null,name,{document_id:d.id,document_name:d.document_name});
    await refreshCase(c.id);
  }
  async function renameStage(c,d,st){
    const value=window.prompt('Rename stage',st.stage_name);
    if(value==null)return;
    const name=value.trim(); if(!name||name===st.stage_name)return;
    if((d.document_stages||[]).some(x=>x.id!==st.id&&x.stage_name.toLowerCase()===name.toLowerCase())){setMessage('Another stage with this name already exists.');return}
    const {error}=await supabase.from('document_stages').update({stage_name:name,is_manual_override:true,updated_by:session.user.id}).eq('id',st.id);
    if(error){setMessage(userError(error));return}
    await history(c.id,'Stage renamed','stage_name',st.stage_name,name,{document_id:d.id,document_name:d.document_name});
    await refreshCase(c.id);
  }
  async function deleteStage(c,d,st){
    if(!confirm(`Remove stage ${st.stage_name} from ${d.document_name}?`))return;
    const {error}=await supabase.from('document_stages').delete().eq('id',st.id);
    if(error){setMessage(userError(error));return}
    await history(c.id,'Stage removed','stage',st.stage_name,null,{document_id:d.id,document_name:d.document_name});
    await syncDocumentStatus(d.id); await syncCaseOverallStatus(c.id,c.overall_status); await refreshCase(c.id);
  }
  async function deleteDocument(c,d){
    if(!confirm(`Remove ${d.document_name} #${d.occurrence_no} from this case?`))return;
    const {error}=await supabase.from('documents').delete().eq('id',d.id);
    if(error){setMessage(userError(error));return}
    await history(c.id,'Document removed','document',d.document_name,null,{occurrence_no:d.occurrence_no});await refreshCase(c.id);
  }
  function toggleExpanded(id){setExpanded(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})}
  function toggleSelected(id){setSelected(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})}
  async function bulkStatus(next){
    if(!next||!selected.size)return;
    const ids=[...selected]; const {error}=await supabase.from('cases').update({overall_status:next,updated_by:session.user.id}).in('id',ids);
    if(error){setMessage(userError(error));return}
    await Promise.all(ids.map(id=>history(id,'Bulk overall status changed','overall_status',null,next,{bulk:true})));
    setSelected(new Set());await loadCases();
  }
  async function signOut(){await clearCaseCache(caseCacheKey);const {error}=await supabase.auth.signOut({scope:'local'});if(error)setMessage(userError(error))}
  async function saveTrackingSettings(e){
    e.preventDefault();const value=String(trackingBaseDraft||'').trim();
    if(!/^https?:\/\//i.test(value))return setMessage('Enter a complete URL beginning with https://');
    if(isAdminProfile(profile)){
      const {error}=await supabase.from('app_settings').upsert({setting_key:'customer_tracking',setting_value:{base_url:value},updated_by:session.user.id,updated_at:new Date().toISOString()},{onConflict:'setting_key'});
      if(error&&!/does not exist|schema cache|Could not find/i.test(String(error.message||'')))return setMessage(userError(error));
      if(!error)setTrackingSettingSynced(true);
    }
    setTrackingBaseUrl(value);try{localStorage.setItem(trackingSettingsKey,value)}catch{}
    setTrackingSettingsOpen(false);setMessage(isAdminProfile(profile)?'Global customer tracking URL saved.':'Customer tracking URL saved on this device.');
  }

  const role=accessRole(profile);
  const isAdmin=isAdminProfile(profile);
  const moduleEnabled=requestedKey=>{const key=requestedKey==='accounting'?'sales':requestedKey;return (!Array.isArray(planModules)||planModules.includes(key))&&(!Array.isArray(brandSettings?.enabled_modules)||brandSettings.enabled_modules.includes(key))&&(isAdmin||!Array.isArray(profile?.staff_modules)||profile.staff_modules.includes(key));};
  useEffect(()=>{if(!profile||view==='settings')return;if(!moduleEnabled(view)){const next=['dashboard','cases','documents','operations','deliveries','custody','appointments','batches','courier','payments','reports','crm','sales','services'].find(moduleEnabled);setView(next||'no-access')}},[profile,brandSettings,view]);
  const isBranch=isBranchProfile(profile);
  const ownBranch=profile?.branch_id||null;
  const homeCases=useMemo(()=>isBranch&&ownBranch?cases.filter(c=>c.branch_id===ownBranch):cases,[cases,isBranch,ownBranch]);
  const ownBranchName=branches.find(b=>b.id===ownBranch)?.name||'Your branch';
  function openNewCase(){caseCheckoutKey.current=null;
    if(!moduleEnabled('cases')&&!moduleEnabled('operations'))return setMessage('Your account cannot create cases. Ask your administrator for access.');
    const today=new Date().toISOString().slice(0,10);
    setForm({...emptyCase,submission_date:today,branch_id:!isAdmin&&!profile?.is_platform_super_admin?(profile?.branch_id||''):'',intake_source:'Branch',overall_status:'Received',current_milestone:'Submitted'});
    setNewCaseDocs([freshNewCaseDoc()]);
    setShowNew(true);
  }
  function patchNewDoc(idx,patch){setNewCaseDocs(v=>v.map((d,i)=>i===idx?{...d,...patch}:d))}
  function addNewDoc(copyFrom=null){setNewCaseDocs(v=>[...v,copyFrom?{...freshNewCaseDoc(),stages:[...(copyFrom.stages||[])],holder_name:'',holder_custom:false,direct_to_delhi:false,direct_destination:''}:freshNewCaseDoc()])}
  const documentCatalogNames=useMemo(()=>{const values=[...documentCatalog.map(x=>x.name),...cases.flatMap(c=>(c.documents||[]).map(d=>d.document_name))].map(v=>String(v||'').trim()).filter(Boolean);return [...new Map(values.map(v=>[v.toLowerCase(),v])).values()].sort((a,b)=>a.localeCompare(b))},[documentCatalog,cases]);
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();const matched=cases.filter(c=>{
    const docs=c.documents||[]; const qty=docs.reduce((n,d)=>n+Number(d.quantity||0),0); const balance=Number(c.balance_payment||0);
    const hay=[c.tracking_reference,c.tracking_family,c.bill_no,c.internal_invoice_no,c.customer_name,c.mobile,c.account_name,c.account_contact,c.account_mobile,c.intake_source,c.current_milestone,c.notes,c.branches?.name,...docs.flatMap(d=>[d.document_name,d.holder_name,d.source_tracking_reference,d.current_milestone])].filter(Boolean).join(' ').toLowerCase();
    return caseMatchesFieldSearch(c,q,searchBy,hay)
      &&(statusFilter==='All'||c.overall_status===statusFilter)
      &&(branchFilter==='All'||c.branch_id===branchFilter)
      &&(documentFilter==='All'||(documentFilter==='Has documents'?docs.length>0:docs.length===0))
      &&(quantityFilter==='All'||(quantityFilter==='Has quantity'?qty>0:qty<=0))
      &&(mobileFilter==='All'||(mobileFilter==='Has mobile'?Boolean(String(c.mobile||'').trim()):!String(c.mobile||'').trim()))
      &&(balanceFilter==='All'||(balanceFilter==='Balance due'?balance>0:balance<=0))
      &&(accountFilter==='All'||(accountFilter==='B2B / Organization'?Boolean(c.account_name):!c.account_name))
      &&(intakeFilter==='All'||c.intake_source===intakeFilter)
      &&(ddFilter==='All'||(ddFilter==='DD only'?Boolean(c.direct_to_delhi||(c.documents||[]).some(d=>d.direct_to_delhi)):!c.direct_to_delhi&&!(c.documents||[]).some(d=>d.direct_to_delhi)));
  });return rankCaseSearchResults(matched,q,searchBy)},[cases,query,searchBy,statusFilter,branchFilter,documentFilter,quantityFilter,mobileFilter,balanceFilter,accountFilter,intakeFilter,ddFilter]);
  const stats=useMemo(()=>({total:homeCases.length,received:homeCases.filter(c=>c.overall_status==='Received').length,under:homeCases.filter(c=>c.overall_status==='Under Process').length,waiting:homeCases.filter(c=>c.overall_status==='Waiting').length,ready:homeCases.filter(c=>c.overall_status==='Ready for Delivery').length,delivered:homeCases.filter(c=>c.overall_status==='Delivered').length,docs:homeCases.reduce((n,c)=>n+(c.documents?.length||0),0),pendingStages:homeCases.reduce((n,c)=>n+(c.documents||[]).flatMap(d=>d.document_stages||[]).filter(s=>s.status==='Pending'||s.status==='Processing').length,0)}),[homeCases]);
  const pageTitle={dashboard:'Dashboard',cases:'Cases',documents:'Documents & Stages',import:'Excel Import',appointments:'Appointments',batches:'Batch Reports',operations:'Operations',payments:'Payments',deliveries:'Deliveries',custody:'Custody',reports:'Reports',accounting:'Accounts',courier:'Courier Shipments',crm:'CRM',sales:'Sales',services:'Services',settings:profile?.is_platform_super_admin?'Platform Management':'Company Management'}[view]||(brandSettings?.product_name||'Document Tracker');
  const pageSubtitle={
    dashboard:isBranch?`Priority view for ${ownBranchName}. All cases remain searchable.`:'Live overview of attestation cases, workload and receivables.',
    cases:'Search, filter, create and edit every field.',
    documents:'Manage document workflows and attestation stages.',
    import:'Import and reconcile source data.',
    appointments:'Manage appointments, schedules and assignments.',
    batches:'Create and manage daily batch reports.',
    operations:'Live operational queues, case ownership and action controls.',
    payments:'Record collections, monitor balances and print receipts.',
    deliveries:'Ready-for-delivery queue, labels, QR and handover.',
    custody:'Track physical document location, custody movements and handovers.',
    courier:'Create courier batches, manifests, dispatch documents and confirm agent receipts.',
    reports:'Operational, financial and case reporting.',
    crm:'Customers, leads and follow-ups in one workspace.',sales:'Quotations, invoices and sales collections.',services:'Service jobs, approvals and renewals.',settings:'Manage branding, branches, staff, access and product configuration.'
  }[view]||'Live overview of attestation cases, workload and receivables.';

  if(!brandReady)return <main className="workspace-startup" role="status"><span className="pdf-spinner"/><p>Opening your workspace…</p><i/></main>;
  return <div className={`app-shell ${sidebarCollapsed?'sidebar-collapsed':''}`}>
    <aside className="sidebar">
      <div className={`brand ${brandSettings?.logo_url&&brandSettings?.sidebar_logo_visible!==false?'brand-logo-mode':''} ${brandSettings?.logo_url&&brandSettings?.sidebar_logo_visible===false?'brand-logo-hidden':''}`} style={{'--sidebar-logo-size':`${Number(brandSettings?.sidebar_logo_size||100)}%`,'--sidebar-logo-align':brandSettings?.sidebar_logo_alignment||'center','--sidebar-logo-background':brandSettings?.sidebar_logo_background||'#FFFFFF','--sidebar-logo-radius':`${Number(brandSettings?.sidebar_logo_radius??14)}px`,'--sidebar-logo-width':`${Number(brandSettings?.sidebar_logo_container_width||190)}px`,'--sidebar-logo-height':`${Number(brandSettings?.sidebar_logo_container_height||64)}px`}}>{brandSettings?.logo_url?(brandSettings?.sidebar_logo_visible!==false?<div className="sidebar-logo-container"><img className="sidebar-brand-logo" src={brandSettings.logo_url} alt={brandSettings?.company_name||'Company logo'}/></div>:null):<><div className="brand-mark small">{(brandSettings?.short_name||brandSettings?.company_name||'D').slice(0,1).toUpperCase()}</div><div><strong>{brandSettings?.product_name||'Workspace'}</strong><span>{brandSettings?.company_name||'Operations command center'}</span></div></>}<button className="sidebar-toggle" onClick={toggleSidebar} title={sidebarCollapsed?'Expand sidebar':'Collapse sidebar'} aria-label={sidebarCollapsed?'Expand sidebar':'Collapse sidebar'}><Icon name={sidebarCollapsed?'chevron-right':'chevron-left'} size={16}/></button></div>
      <div className="sidebar-live"><i></i><span>Workspace online</span><b>LIVE</b></div>
      <div className="nav-scroll">
      <div className="nav-section nav-accordion"><button className="nav-group-toggle" aria-expanded={sidebarCollapsed||Boolean(navGroups.overview)} onClick={()=>setNavGroups(x=>({...x,overview:!x.overview}))}><span>OVERVIEW</span><Icon name={navGroups.overview?'chevron-down':'chevron-right'} size={13}/></button><div className="nav-group-items" hidden={!sidebarCollapsed&&!navGroups.overview}>
        {moduleEnabled('dashboard')&&<Nav active={view==='dashboard'} onClick={()=>setView('dashboard')} icon="home">Dashboard</Nav>}
        {moduleEnabled('cases')&&<Nav active={view==='cases'} onClick={()=>setView('cases')} icon="file">Cases <b className="count-badge">{homeCases.length}</b></Nav>}
        {moduleEnabled('documents')&&<Nav active={view==='documents'} onClick={()=>setView('documents')} icon="layers">Documents & Stages</Nav>}
      </div></div>
      <div className="nav-section nav-accordion"><button className="nav-group-toggle" aria-expanded={sidebarCollapsed||Boolean(navGroups.operations)} onClick={()=>setNavGroups(x=>({...x,operations:!x.operations}))}><span>OPERATIONS</span><Icon name={navGroups.operations?'chevron-down':'chevron-right'} size={13}/></button><div className="nav-group-items" hidden={!sidebarCollapsed&&!navGroups.operations}>
        {moduleEnabled('operations')&&<Nav active={view==='operations'} onClick={()=>setView('operations')} icon="activity">Operations</Nav>}
        {moduleEnabled('deliveries')&&<Nav active={view==='deliveries'} onClick={()=>setView('deliveries')} icon="package">Deliveries</Nav>}
        {moduleEnabled('custody')&&<Nav active={view==='custody'} onClick={()=>setView('custody')} icon="handover">Custody</Nav>}
        {moduleEnabled('appointments')&&<Nav active={view==='appointments'} onClick={()=>setView('appointments')} icon="calendar">Appointments</Nav>}
        {moduleEnabled('batches')&&<Nav active={view==='batches'} onClick={()=>setView('batches')} icon="batch">Batch Reports</Nav>}
        {moduleEnabled('courier')&&<Nav active={view==='courier'} onClick={()=>setView('courier')} icon="truck">Courier Shipments</Nav>}
      </div></div>
      <div className="nav-section nav-accordion"><button className="nav-group-toggle" aria-expanded={sidebarCollapsed||Boolean(navGroups.customers)} onClick={()=>setNavGroups(x=>({...x,customers:!x.customers}))}><span>CUSTOMERS & SALES</span><Icon name={navGroups.customers?'chevron-down':'chevron-right'} size={13}/></button><div className="nav-group-items" hidden={!sidebarCollapsed&&!navGroups.customers}>
        {moduleEnabled('crm')&&<Nav active={view==='crm'} onClick={()=>setView('crm')} icon="user">CRM</Nav>}
        {moduleEnabled('sales')&&<Nav active={view==='sales'} onClick={()=>setView('sales')} icon="wallet">Sales</Nav>}
        {moduleEnabled('services')&&<Nav active={view==='services'} onClick={()=>setView('services')} icon="layers">Services</Nav>}
        </div></div><div className="nav-section nav-accordion"><button className="nav-group-toggle" aria-expanded={sidebarCollapsed||Boolean(navGroups.finance)} onClick={()=>setNavGroups(x=>({...x,finance:!x.finance}))}><span>FINANCE & REPORTS</span><Icon name={navGroups.finance?'chevron-down':'chevron-right'} size={13}/></button><div className="nav-group-items" hidden={!sidebarCollapsed&&!navGroups.finance}>{moduleEnabled('sales')&&<Nav active={view==='accounting'} onClick={()=>setView('accounting')} icon="wallet">Accounts</Nav>}
        {moduleEnabled('payments')&&<Nav active={view==='payments'} onClick={()=>setView('payments')} icon="wallet">Payments</Nav>}
        {moduleEnabled('reports')&&<Nav active={view==='reports'} onClick={()=>setView('reports')} icon="chart">Reports</Nav>}
        {isAdmin&&moduleEnabled('import')&&<Nav active={view==='import'} onClick={()=>setView('import')} icon="upload">Import Data</Nav>}
      </div></div>
      </div>
      <div className="sidebar-foot"><div className="avatar">{(profile?.full_name||session.user.email||'U')[0].toUpperCase()}</div><div className="user-mini"><strong>{profile?.full_name||session.user.email}</strong><span>{role==='branch'?`${ownBranchName} · Branch`:role==='admin'?'Administrator':'Staff'}</span></div><button className="sidebar-settings" onClick={()=>isAdmin?setView('settings'):setTrackingSettingsOpen(true)} title={isAdmin?'Company management':'Tracking settings'} aria-label={isAdmin?'Company management':'Tracking settings'}><Icon name="settings" size={17}/></button><button className="signout" onClick={signOut} title="Sign out" aria-label="Sign out"><Icon name="logout" size={17}/></button></div>
    </aside>

    <main className="content">
      <PwaExperience/>
      <header className={`topbar unified-app-topbar ${view==='cases'?'legacy-cases-topbar':''}`}><div><h1>{pageTitle}</h1><p className="muted">{pageSubtitle}</p></div><div className="top-actions"><span className={`access-chip ${role}`}>{role==='admin'?'ADMIN':role==='branch'?ownBranchName.toUpperCase():'STAFF'}</span><button className="notification-trigger" onClick={()=>setNotificationOpen(true)} aria-label={`Notifications${unreadActivity?`, ${unreadActivity} unread`:''}`} title="Notifications and activity"><Icon name="bell" size={17}/>{unreadActivity>0&&<b>{unreadActivity>99?'99+':unreadActivity}</b>}</button><ExportMenu title={moduleExport?.view===view?moduleExport.title:`${pageTitle} Export`} rows={moduleExport?.view===view?moduleExport.rows:caseExportRows(view==='cases'?filtered:homeCases)} notify={setMessage}/>{view!=='cases'&&<button className="secondary" onClick={loadCases}>↻ Refresh</button>}<button className="primary" onClick={openNewCase}>＋ New Case</button></div></header>


      {view==='no-access'&&<section className="settings-card"><h2>No modules assigned</h2><p>Ask your company administrator to enable the modules you need.</p></section>}
      {casesLoadError&&<section className="settings-card" role="alert"><h2>Unable to load cases</h2><p>{casesLoadError}</p><button className="primary" onClick={loadCases}>Retry</button></section>}
      {view==='dashboard'&&!casesLoadError&&<Dashboard companyName={brandSettings?.company_name||currentOrganization?.name||'Your Organization'} stats={stats} cases={homeCases} onOpen={openCase} onCases={()=>setView('cases')} onScan={()=>setGlobalScan(true)} onDeliveries={()=>setView('deliveries')} onPayments={()=>setView('payments')} onCustody={()=>setView('custody')} orgId={profile?.organization_id||currentOrganization?.id} onSales={()=>setView('sales')} onServices={()=>setView('services')} onCRM={()=>setView('crm')} branchName={isBranch?ownBranchName:null}/>}
      {view==='cases'&&<CasesView preferenceKey={`cases_view_${profile?.organization_id||'platform'}_${profile?.id||'user'}`} cases={filtered} allCases={cases} recentCaseIds={recentCaseIds} favoriteCaseIds={favoriteCaseIds} toggleFavorite={toggleFavoriteCase} clearRecent={clearRecentCases} clearFavorites={clearFavoriteCases} shareDetailed={shareDetailedTracking} loading={loading} query={query} setQuery={setQuery} searchBy={searchBy} setSearchBy={setSearchBy} statusFilter={statusFilter} setStatusFilter={setStatusFilter} branchFilter={branchFilter} setBranchFilter={setBranchFilter} documentFilter={documentFilter} setDocumentFilter={setDocumentFilter} quantityFilter={quantityFilter} setQuantityFilter={setQuantityFilter} mobileFilter={mobileFilter} setMobileFilter={setMobileFilter} balanceFilter={balanceFilter} setBalanceFilter={setBalanceFilter} accountFilter={accountFilter} setAccountFilter={setAccountFilter} intakeFilter={intakeFilter} setIntakeFilter={setIntakeFilter} ddFilter={ddFilter} setDdFilter={setDdFilter} branches={branches} expanded={expanded} toggleExpanded={toggleExpanded} selected={selected} toggleSelected={toggleSelected} updateCaseStatus={updateCaseStatus} updateStage={updateStage} updateStageDate={updateStageDate} reorderStages={reorderStages} quick={openCase} addDoc={setShowDoc} deleteDocument={deleteDocument} addStage={addStageToDocument} renameStage={renameStage} deleteStage={deleteStage} bulkStatus={bulkStatus} appointment={c=>{setAppointmentCase(c);setView('appointments')}} bulkAppointment={()=>{setAppointmentSeedIds([...selected]);setView('appointments')}} batchSelected={()=>{setBatchSeed([...selected]);setView('batches')}}/>}
      {view==='documents'&&<DocumentsView cases={cases} query={query} setQuery={setQuery} updateStage={updateStage} updateStageDate={updateStageDate} quick={setQuickCase} setModuleExport={publishModuleExport} onOpenCase={async c=>{const row=await fetchCaseByTracking(c.tracking_reference);if(row)setQuickCase(row)}}/>}
      {view==='import'&&<SimpleLegacyImport session={session} cases={cases} branches={branches} reload={loadCases} notify={setMessage}/>}
      {['crm','sales','services','accounting'].includes(view)&&<BusinessWorkspace key={view} initialTab={view==='accounting'?'accounting':undefined} view={view==='accounting'?'sales':view} profile={profile} organization={currentOrganization} branches={branches} brand={brandSettings} notify={setMessage} setModuleExport={publishModuleExport} onSettings={()=>{try{sessionStorage.setItem('workspace-settings-tab','print')}catch{}setView('settings')}} onOpenCase={async c=>{const row=await fetchCaseByTracking(c.tracking_reference);if(row)setQuickCase(row)}}/>}
      {view==='settings'&&isAdmin&&<ProductSettings session={session} profile={profile} currentOrganization={currentOrganization} onBrandChange={settings=>{setBrandSettings(settings);if(profile?.is_platform_super_admin&&settings?.organization_id)supabase.from('organizations').select('*').eq('id',settings.organization_id).maybeSingle().then(({data})=>{if(data)setCurrentOrganization(data)})}} notify={setMessage}/>}
      {view==='appointments'&&<AppointmentsView session={session} cases={cases} notify={setMessage} seedCase={appointmentCase} seedIds={appointmentSeedIds} clearSeed={()=>{setAppointmentCase(null);setAppointmentSeedIds([])}} setModuleExport={publishModuleExport} onOpenCase={async c=>{const row=await fetchCaseByTracking(c.tracking_reference);if(row)setQuickCase(row)}}/>}
      {view==='batches'&&<BatchReportsView session={session} cases={cases} notify={setMessage} seedIds={batchSeed} clearSeed={()=>setBatchSeed([])} setModuleExport={publishModuleExport} onOpenCase={async c=>{const row=await fetchCaseByTracking(c.tracking_reference);if(row)setQuickCase(row)}}/>}
      {view==='operations'&&<OperationsView companyName={brandSettings?.company_name||currentOrganization?.name||'Your Organization'}
        session={session}
        profile={profile}
        cases={cases}
        notify={setMessage}
        onOpen={openCase}
        onAppointment={c=>{setAppointmentCase(c);setView('appointments')}}
        onBatch={ids=>{setBatchSeed(ids);setView('batches')}}
        onPayment={c=>{setPaymentSeedCase(c);setView('payments')}}
        onCustody={c=>{setCustodySeedCase(c);setView('custody')}}
        onDeliver={c=>{setDeliverySeedCase(c);setView('deliveries')}}
        onRefresh={loadCases}
        setModuleExport={publishModuleExport}
      />}
      {view==='courier'&&<CourierShipmentsView session={session} cases={cases} notify={setMessage} reload={loadCases} setModuleExport={publishModuleExport} onOpenCase={async c=>{const row=await fetchCaseByTracking(c.tracking_reference);if(row)setQuickCase(row)}}/>}
      {view==='payments'&&<PaymentsView companyName={brandSettings?.company_name||currentOrganization?.name||'Your Organization'} session={session} cases={cases} notify={setMessage} seedCase={paymentSeedCase} clearSeed={()=>setPaymentSeedCase(null)} setModuleExport={publishModuleExport} onOpenCase={async c=>{const row=await fetchCaseByTracking(c.tracking_reference);if(row)setQuickCase(row)}}/>}
      {view==='custody'&&<CustodyView session={session} profile={profile} branches={branches} cases={cases} notify={setMessage} seedCase={custodySeedCase} clearSeed={()=>setCustodySeedCase(null)} onOpen={openCase} onRefresh={loadCases} setModuleExport={publishModuleExport} onOpenCase={async c=>{const row=await fetchCaseByTracking(c.tracking_reference);if(row)setQuickCase(row)}}/>}
      {view==='deliveries'&&<DeliveriesView session={session} cases={cases} notify={setMessage} reload={loadCases} seedCase={deliverySeedCase} clearSeed={()=>setDeliverySeedCase(null)} onQrAction={openScannedAction} setModuleExport={publishModuleExport} onOpenCase={async c=>{const row=await fetchCaseByTracking(c.tracking_reference);if(row)setQuickCase(row)}}/>}
      {view==='reports'&&<ReportsView cases={cases} notify={setMessage} setModuleExport={publishModuleExport} onOpenCase={async c=>{const row=await fetchCaseByTracking(c.tracking_reference);if(row)setQuickCase(row)}}/>}
    </main>

    {notificationOpen&&<NotificationCenter userId={session.user.id} rows={auditRows} cases={cases} loading={auditLoading} lastRead={auditLastRead} isAdmin={isAdmin} onClose={()=>setNotificationOpen(false)} onRefresh={loadAudit} onMarkAllRead={markActivityRead} onOpenCase={c=>{setNotificationOpen(false);openCase(c)}}/>}

    <nav className="mobile-command-nav" aria-label="Quick navigation">
      {moduleEnabled('dashboard')&&<button className={view==='dashboard'?'active':''} onClick={()=>setView('dashboard')}><Icon name="home" size={18}/><span>Home</span></button>}
      {moduleEnabled('cases')&&<button className={view==='cases'?'active':''} onClick={()=>setView('cases')}><Icon name="file" size={18}/><span>Cases</span></button>}
      <button className="scan-command" onClick={()=>setGlobalScan(true)}><span className="scan-orb"><Icon name="scan" size={24}/></span><b>Scan</b></button>
      {moduleEnabled('operations')&&<button className={view==='operations'?'active':''} onClick={()=>setView('operations')}><Icon name="activity" size={18}/><span>Operations</span></button>}
      <button className={mobileMenu?'active':''} onClick={()=>setMobileMenu(true)}><Icon name="filter" size={18}/><span>More</span></button>
    </nav>

    {mobileMenu&&<div className="mobile-menu-sheet" onClick={()=>setMobileMenu(false)}><section role="dialog" aria-modal="true" aria-label="All modules" onClick={e=>e.stopPropagation()}><header><h2>Your workspace</h2><button className="business-close" aria-label="Close menu" onClick={()=>setMobileMenu(false)}><Icon name="close"/></button></header><div className="mobile-menu-grid">{[['dashboard','Home','home'],['cases','Cases','file'],['crm','CRM','user'],['sales','Sales','wallet'],['accounting','Accounts','wallet'],['services','Services','layers'],['documents','Documents','layers'],['operations','Operations','activity'],['deliveries','Deliveries','package'],['custody','Custody','handover'],['appointments','Appointments','calendar'],['batches','Batches','batch'],['courier','Courier','truck'],['payments','Payments','wallet'],['reports','Reports','chart'],...(isAdmin?[['import','Import','upload'],['settings','Settings','settings']]:[])].filter(([key])=>key==='settings'||moduleEnabled(key)).map(([key,label,icon])=><button key={key} onClick={()=>{setView(key);setMobileMenu(false)}}><Icon name={icon} size={24}/><span>{label}</span></button>)}</div></section></div>}
    {loading&&cases.length===0&&<div className="app-loading-stage"><div className="loading-brand"><div>{(brandSettings?.short_name||brandSettings?.company_name||'D').slice(0,1).toUpperCase()}</div><strong>{brandSettings?.product_name||'Workspace'}</strong><span>Preparing your operations workspace</span><i/></div></div>}
    {globalScan&&<DeliveryQrScanner cases={cases} onClose={()=>setGlobalScan(false)} onAction={openScannedAction} notify={setMessage} title="Scan Case QR"/>}

    {showNew&&<Modal className="new-case-modal invoice-case-modal" onClose={()=>!saving&&setShowNew(false)} title="New Attestation Case" subtitle="Create the complete transaction like an invoice — customer, documents, attestation and payment in one workspace."><form onSubmit={createCase} className="invoice-case-workspace">
      <datalist id="document-catalog-list">{documentCatalogNames.map(name=><option key={name} value={name}/>)}</datalist>

      <div className="invoice-customer-link"><Field label="Link an existing customer (optional)"><CustomerPicker organizationId={profile?.organization_id||brandSettings?.organization_id} value={form.customer_id} onSelect={customer=>setForm(f=>({...f,customer_id:customer.id,customer_name:customer.name,mobile:customer.mobile||'',customer_email:customer.email||'',email_updates:customer.email_updates,whatsapp_opt_in:customer.whatsapp_opt_in,...(profile?.role==='branch'?{}:{branch_id:customer.branch_id||f.branch_id})}))}/></Field></div>
      <section className="invoice-customer-bar">
        <Field label="Tracking Reference"><input autoFocus required value={form.tracking_reference} onChange={e=>setForm({...form,tracking_reference:e.target.value})} placeholder="Tracking ID"/></Field>
        <Field label="Customer Name"><input required value={form.customer_name} onChange={e=>setForm({...form,customer_name:e.target.value})} placeholder="Customer / payer name"/></Field>
        <Field label="Mobile"><input value={form.mobile} onChange={e=>setForm({...form,mobile:e.target.value})} placeholder="Mobile number"/></Field>
        <Field label="Customer Email"><input type="email" value={form.customer_email||''} onChange={e=>setForm({...form,customer_email:e.target.value})} placeholder="Optional email address"/></Field>
        <label className="business-check"><input type="checkbox" checked={form.email_updates||false} onChange={e=>setForm({...form,email_updates:e.target.checked})}/> Email updates agreed</label>
        <label className="business-check"><input type="checkbox" checked={form.whatsapp_opt_in||false} onChange={e=>setForm({...form,whatsapp_opt_in:e.target.checked})}/> WhatsApp updates agreed</label>
        <Field label="Bill No."><input value={form.bill_no} onChange={e=>setForm({...form,bill_no:e.target.value})} placeholder="e.g. S/A/5802"/></Field>
        <Field label="Branch"><select required disabled={!isAdmin&&!profile?.is_platform_super_admin} value={form.branch_id} onChange={e=>setForm({...form,branch_id:e.target.value})}><option value="">Select branch</option>{branches.filter(b=>isAdmin||profile?.is_platform_super_admin||b.id===profile?.branch_id).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Submission Date"><input type="date" value={form.submission_date} onChange={e=>setForm({...form,submission_date:e.target.value})}/></Field>
      </section>

      <div className="invoice-case-body">
        <section className="invoice-document-panel">
          <div className="invoice-section-head"><div><strong>Documents</strong><span>{documentCatalogNames.length} saved document names · start typing to search</span></div><button type="button" className="primary small-action" onClick={()=>addNewDoc()}>＋ Add Document</button></div>
          <div className="invoice-doc-table-head"><span>Document</span><span>Holder</span><span>Qty</span><span>DD</span><span>Attestation</span><span></span></div>
          <div className="invoice-doc-lines">{newCaseDocs.map((d,idx)=><div className="invoice-doc-line" key={idx}>
            <div className="invoice-doc-main">
              <input className="invoice-doc-name" list="document-catalog-list" required value={d.document_name} onChange={e=>patchNewDoc(idx,{document_name:e.target.value})} placeholder="Search or type document name"/>
              <div className="invoice-holder-cell">
                {!d.holder_custom?<><span className="holder-default" title={form.customer_name||'Customer name'}>{form.customer_name||'Customer name'}</span><button type="button" className="holder-name-icon" title="Use a different document holder" aria-label="Add different document holder" onClick={()=>patchNewDoc(idx,{holder_custom:true,holder_name:''})}><Icon name="plus" size={14}/><span>👤</span></button></>:<div className="holder-custom-wrap"><input autoFocus value={d.holder_name} onChange={e=>patchNewDoc(idx,{holder_name:e.target.value})} placeholder="Different holder name"/><button type="button" className="holder-name-icon active" title="Use customer name" onClick={()=>patchNewDoc(idx,{holder_custom:false,holder_name:''})}>↩</button></div>}
              </div>
              <input className="invoice-qty" type="number" min="1" value={d.quantity} onChange={e=>patchNewDoc(idx,{quantity:e.target.value})}/>
              <label className={`invoice-dd ${d.direct_to_delhi?'active':''}`} title="Customer sent this document directly to Delhi"><input type="checkbox" checked={d.direct_to_delhi} onChange={e=>patchNewDoc(idx,{direct_to_delhi:e.target.checked,direct_destination:e.target.checked?(d.direct_destination||'Delhi'):''})}/><span>DD</span></label>
              <div className="invoice-workflow-cell"><div className="workflow-presets invoice-presets">{NEW_CASE_WORKFLOWS.filter(p=>p.label!=='Clear').map(p=><button type="button" key={p.label} className={(d.stages||[]).join('|')===p.stages.join('|')?'active':''} onClick={()=>patchNewDoc(idx,{stages:[...p.stages]})}>{p.label}</button>)}</div><details className="invoice-stage-more"><summary>{(d.stages||[]).length} stage{(d.stages||[]).length===1?'':'s'} selected</summary><div className="invoice-stage-pop"><div className="stage-checks stage-library compact-stage-library">{STAGE_LIBRARY.map(stage=><label key={stage} className="check"><input type="checkbox" checked={(d.stages||[]).includes(stage)} onChange={e=>patchNewDoc(idx,{stages:e.target.checked?[...(d.stages||[]),stage]:(d.stages||[]).filter(s=>s!==stage)})}/><span>{stage}</span></label>)}</div><div className="custom-stage-row"><input value={d.custom_stage||''} onChange={e=>patchNewDoc(idx,{custom_stage:e.target.value})} placeholder="Custom stage…"/><button type="button" className="secondary" onClick={()=>{const val=String(d.custom_stage||'').trim();if(!val)return;patchNewDoc(idx,{custom_stage:'',stages:(d.stages||[]).some(s=>s.toLowerCase()===val.toLowerCase())?d.stages:[...(d.stages||[]),val]})}}>＋ Add</button></div></div></details></div>
              <button type="button" className="icon-btn danger-soft" disabled={newCaseDocs.length===1} onClick={()=>setNewCaseDocs(v=>v.filter((_,i)=>i!==idx))} title="Remove document"><Icon name="trash" size={15}/></button>
            </div>
            <DocumentFees document={d} prices={documentPrices} onChange={patch=>patchNewDoc(idx,patch)}/><div className="invoice-doc-subline"><span>{d.holder_custom?(d.holder_name||'Additional holder name required'):`Holder: ${form.customer_name||'Customer name'}`}</span><span>{(d.stages||[]).join(' → ')||'No attestation stages selected'}</span>{d.direct_to_delhi&&<span className="dd-note">DD · Direct to Delhi</span>}<button type="button" className="text-action" onClick={()=>addNewDoc(d)}>Duplicate workflow</button></div>
          </div>)}</div>
        </section>

        <aside className="invoice-summary-panel">
          <div className="invoice-summary-title"><strong>Transaction Summary</strong><span>Complete payment before creating the case.</span></div>
          <div className="invoice-summary-stats"><div><span>Documents</span><strong>{newCaseDocs.filter(d=>String(d.document_name||'').trim()).length}</strong></div><div><span>Total Qty</span><strong>{newCaseDocs.reduce((n,d)=>n+Number(d.quantity||0),0)}</strong></div></div>
          <Field label="Total Amount"><input type="number" step="0.01" min="0" value={form.total_amount} readOnly placeholder="0.00"/></Field>
          <Field label="Paid Now"><input type="number" step="0.01" min="0" value={form.advance_paid} onChange={e=>setForm({...form,advance_paid:e.target.value})} placeholder="0.00"/></Field>
          <div className="invoice-balance"><span>Balance</span><strong>{fmtMoney(Math.max(0,Number(form.total_amount||0)-Number(form.advance_paid||0)))}</strong></div>
          <details className="invoice-extra-details"><summary>More case details</summary><div className="invoice-extra-grid">
            <Field label="Customer email"><input type="email" value={form.customer_email||''} onChange={e=>setForm({...form,customer_email:e.target.value})}/></Field>
            <label className="wide check-line"><input type="checkbox" checked={Boolean(form.email_updates)} onChange={e=>setForm({...form,email_updates:e.target.checked})}/><span>Customer agrees to email updates</span></label>
            <label className="wide check-line"><input type="checkbox" checked={Boolean(form.whatsapp_opt_in)} onChange={e=>setForm({...form,whatsapp_opt_in:e.target.checked})}/><span>Customer opted in to WhatsApp updates</span></label>
            <Field label="Organization / B2B"><input value={form.account_name} onChange={e=>setForm({...form,account_name:e.target.value})} placeholder="Optional"/></Field>
            <Field label="Promise Date"><input type="date" value={form.promise_date} onChange={e=>setForm({...form,promise_date:e.target.value})}/></Field>
            <Field label="Intake Source"><select value={form.intake_source} onChange={e=>setForm({...form,intake_source:e.target.value})}><option>Branch</option><option>Collection</option><option>External Office</option></select></Field>
            <Field label="Internal Invoice #"><input value={form.internal_invoice_no} onChange={e=>setForm({...form,internal_invoice_no:e.target.value})}/></Field>
          </div></details>
          <details className="invoice-extra-details"><summary>Notes</summary><textarea rows="3" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Optional case notes…"/></details>
          <div className="invoice-summary-actions"><button type="button" className="secondary" disabled={saving} onClick={()=>setShowNew(false)}>Cancel</button><button className="primary create-case-btn" disabled={saving}>{saving?'Creating…':'Create Complete Case'}</button></div>
        </aside>
      </div>
    </form></Modal>}

    {trackingSettingsOpen&&<Modal className="tracking-settings-modal" onClose={()=>setTrackingSettingsOpen(false)} title="Customer Tracking Settings" subtitle="Set the public website page used in every QR code and WhatsApp tracking receipt."><form onSubmit={saveTrackingSettings}><Field label="Customer tracking page"><input required readOnly={!isAdmin} type="url" value={trackingBaseDraft} onChange={e=>setTrackingBaseDraft(e.target.value)} placeholder="https://tracker.example.com/public-track"/></Field><div className="tracking-settings-preview"><small>EXAMPLE CUSTOMER LINK</small><code>{trackingLink({base:trackingBaseDraft,origin:typeof window!=='undefined'?window.location.origin:'',reference:'112200',organization:currentOrganization?.slug})}</code></div><p>{isAdmin?'This company setting is shared with its users and devices.':'Only an administrator can change the company tracking URL.'} WordPress links use a clean tracking reference. The connector uses the company saved in its settings.</p><div className="settings-sync-state"><i className={trackingSettingSynced?'online':'local'}/>{trackingSettingSynced?'Synced from Supabase':'Using local/default setting until the security migration is applied'}</div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setTrackingSettingsOpen(false)}>Close</button>{isAdmin&&<button className="primary">Save Tracking URL</button>}</div></form></Modal>}

    {createdShare&&<Modal className="tracking-share-modal" onClose={()=>setCreatedShare(null)} title="Case Created Successfully" subtitle={`Tracking #${createdShare.tracking_reference} · Send the customer their direct tracking access.`}>
      <div className="tracking-share-success"><div className="tracking-share-check">✓</div><div><strong>{createdShare.customer_name||'Customer'}</strong><span>The case is saved. The link and QR open this tracking directly—no tracking number needs to be typed.</span></div></div>
      <div className="tracking-share-layout">
        <div className="tracking-receipt-preview">{createdReceipt?<img src={createdReceipt} alt={`Tracking receipt for ${createdShare.tracking_reference}`}/>:<div className="tracking-share-qr-loading">Creating tracking receipt…</div>}<strong>Customer tracking receipt</strong><span>Share as an image with the direct tracking link and QR.</span></div>
        <div className="tracking-share-details">
          <div className="tracking-share-link"><small>DIRECT TRACKING LINK</small><code>{customerTrackingUrl(createdShare)}</code><button type="button" className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(customerTrackingUrl(createdShare));setMessage('Tracking link copied.')}catch{setMessage('Unable to copy link.')}}}>Copy Link</button></div>
          <div className="tracking-share-mobile"><small>WHATSAPP TO</small><strong>{createdShare.mobile||'No mobile number entered'}</strong></div>
          <div className="tracking-message-editor">
            <div className="tracking-message-editor-head"><div><small>MESSAGE PREVIEW</small><span>Edit anything below before sending.</span></div><button type="button" className="secondary tiny" onClick={()=>setCreatedShareMessage(whatsappTrackingMessage(createdShare))}>Reset Message</button></div>
            <textarea value={createdShareMessage} onChange={e=>setCreatedShareMessage(e.target.value)} rows={13} spellCheck="true" aria-label="Editable WhatsApp message preview"/>
          </div>
          <div className="tracking-share-actions">
            <button type="button" className="whatsapp-share-btn" disabled={!createdShare.mobile||!createdShareMessage.trim()} onClick={()=>shareDetailedTracking(createdShare,{whatsapp:true})}>Share Receipt via WhatsApp</button>
            <button type="button" className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(createdShareMessage);setMessage('WhatsApp message copied.')}catch{setMessage('Unable to copy message.')}}}>Copy Message</button>
            <button type="button" className="secondary" disabled={!createdReceipt} onClick={()=>shareTrackingQr(createdShare)}>Share / Download Receipt</button>
          </div>
          {!createdShare.mobile&&<p className="tracking-share-hint">Add a customer mobile number to the case to open WhatsApp directly. You can still copy the link or share the QR.</p>}
        </div>
      </div>
      <div className="modal-actions tracking-share-footer"><button type="button" className="secondary" onClick={()=>setCreatedShare(null)}>Done</button><button type="button" className="primary" onClick={()=>{setCreatedShare(null);setQuickCase(createdShare)}}>Open Case</button></div>
    </Modal>}

    {quickCase&&<QuickView c={quickCase} branches={branches} session={session} favorite={favoriteCaseIds.has(quickCase.id)} onToggleFavorite={()=>toggleFavoriteCase(quickCase.id)} onDetailedShare={(options)=>shareDetailedTracking(quickCase,options)} onClose={()=>setQuickCase(null)} refreshCase={refreshCase} notify={setMessage} updateStatus={updateCaseStatus} updateStage={updateStage} updateStageDate={updateStageDate} reorderStages={reorderStages} onAddDoc={()=>setShowDoc(quickCase)} deleteDocument={deleteDocument} addStage={addStageToDocument} renameStage={renameStage} deleteStage={deleteStage} onAppointment={()=>{setAppointmentCase(quickCase);setQuickCase(null);setView('appointments')}} onDeliver={()=>{setDeliverySeedCase(quickCase);setQuickCase(null);setView('deliveries')}} onCustody={()=>{setCustodySeedCase(quickCase);setQuickCase(null);setView('custody')}} onPayment={()=>{setPaymentSeedCase(quickCase);setQuickCase(null);setView('payments')}} onDeleted={(caseId)=>{setCases(prev=>prev.filter(x=>x.id!==caseId));setSelected(prev=>{const next=new Set(prev);next.delete(caseId);return next;});setQuickCase(null)}}/>}
    {duplicateReview&&<Modal className="duplicate-review-modal" onClose={()=>setDuplicateReview(null)} title="Tracking Number Already Exists" subtitle={`Tracking #${duplicateReview.tracking_reference} is already registered. Review the existing case before continuing.`}>
      <div className="duplicate-review-alert"><strong>Duplicate tracking prevented</strong><span>No new case was created. Your current New Case entries are still preserved.</span></div>
      <div className="duplicate-review-grid">
        <div><small>TRACKING</small><strong>#{duplicateReview.tracking_reference}</strong></div>
        <div><small>CUSTOMER</small><strong>{duplicateReview.customer_name||'—'}</strong></div>
        <div><small>MOBILE</small><strong>{duplicateReview.mobile||'—'}</strong></div>
        <div><small>BILL NO.</small><strong>{duplicateReview.bill_no||'—'}</strong></div>
        <div><small>BRANCH</small><strong>{duplicateReview.branches?.name||'—'}</strong></div>
        <div><small>SUBMITTED</small><strong>{duplicateReview.submission_date?new Date(`${duplicateReview.submission_date}T00:00:00`).toLocaleDateString('en-GB'):'—'}</strong></div>
        <div><small>STATUS</small><StatusPill status={duplicateReview.overall_status}/></div>
        <div><small>BALANCE</small><strong>{fmtMoney(moneyParts(duplicateReview).balance)}</strong></div>
      </div>
      <div className="duplicate-review-docs"><div className="duplicate-review-docs-head"><strong>Existing Documents</strong><span>{duplicateReview.documents?.length||0} document(s)</span></div>{(duplicateReview.documents||[]).length?(duplicateReview.documents||[]).map(d=><div className="duplicate-review-doc-row" key={d.id}><div><strong>{d.document_name}</strong><span>{d.holder_name||duplicateReview.customer_name||'—'}</span></div><b>× {d.quantity||1}</b></div>):<div className="muted">No document details available.</div>}</div>
      <div className="modal-actions duplicate-review-actions"><button type="button" className="secondary" onClick={()=>setDuplicateReview(null)}>Change Tracking Number</button><button type="button" className="primary" onClick={()=>openExistingDuplicate(duplicateReview)}>Open Existing Case</button></div>
    </Modal>}
    {showDoc&&<Modal onClose={()=>setShowDoc(null)} title="Add Document" subtitle={`${showDoc.tracking_reference} · ${showDoc.customer_name}`}><form onSubmit={addDocument} className="form-grid">
      <Field label="Document Name" wide><input required value={docForm.document_name} onChange={e=>setDocForm({...docForm,document_name:e.target.value})} placeholder="e.g. Degree Certificate"/></Field>
      <Field label="Document Holder"><input value={docForm.holder_name} onChange={e=>setDocForm({...docForm,holder_name:e.target.value})} placeholder="Name on this certificate"/></Field>
      <label className="check-line"><input type="checkbox" checked={docForm.direct_to_delhi} onChange={e=>setDocForm({...docForm,direct_to_delhi:e.target.checked})}/><span>DD / Direct to Delhi</span></label>
      {docForm.direct_to_delhi&&<Field label="Direct Destination"><input value={docForm.direct_destination} onChange={e=>setDocForm({...docForm,direct_destination:e.target.value})} placeholder="Delhi"/></Field>}
      <Field label="Quantity"><input type="number" min="1" value={docForm.quantity} onChange={e=>setDocForm({...docForm,quantity:e.target.value})}/></Field>
      <div className="wide stage-builder"><div className="builder-head"><strong>Attestation Stages</strong><span>Choose from the stage library or add any custom stage.</span></div><div className="stage-checks stage-library">{STAGE_LIBRARY.map(s=><label key={s} className="check"><input type="checkbox" checked={docForm.stages.includes(s)} onChange={e=>setDocForm({...docForm,stages:e.target.checked?[...docForm.stages,s]:docForm.stages.filter(x=>x!==s)})}/><span>{s}</span></label>)}</div><div className="custom-stage-row"><input value={customStage} onChange={e=>setCustomStage(e.target.value)} placeholder="Custom stage name…"/><button type="button" className="secondary" onClick={()=>{const v=customStage.trim();if(!v)return;setDocForm(f=>({...f,stages:f.stages.some(x=>x.toLowerCase()===v.toLowerCase())?f.stages:[...f.stages,v]}));setCustomStage('')}}>＋ Add custom stage</button></div>{docForm.stages.length>0&&<div className="selected-stage-chips">{docForm.stages.map((s,i)=><span key={`${s}-${i}`}>{i+1}. {s}<button type="button" onClick={()=>setDocForm(f=>({...f,stages:f.stages.filter((_,ix)=>ix!==i)}))}>×</button></span>)}</div>}</div>
      <div className="modal-actions wide"><button type="button" className="secondary" onClick={()=>setShowDoc(null)}>Cancel</button><button className="primary" disabled={saving}>{saving?'Saving…':'Add Document'}</button></div>
    </form></Modal>}
  </div>
}

function messageTone(message){const value=String(message||'').toLowerCase();if(/error|unable|failed|could not|invalid|required|blocked|denied/.test(value))return 'error';if(/saved|updated|created|completed|success|copied|recorded|deleted|moved|added|delivered|assigned|imported/.test(value))return 'success';return 'info'}
function AppToast({message,onClose}){const tone=messageTone(message);return <div className={`app-toast ${tone}`} role="status" aria-live="polite"><div className="app-toast-symbol"><Icon name={tone==='success'?'check':tone==='error'?'alert':'info'} size={18}/></div><div className="app-toast-copy"><strong>{tone==='success'?'Changes saved':tone==='error'?'Action needs attention':'Workspace update'}</strong><span>{message}</span></div><button onClick={onClose} aria-label="Dismiss message"><Icon name="close" size={16}/></button><i className="app-toast-timer"/></div>}
function ExportMenu({title,rows,notify}){const [open,setOpen]=useState(false);const run=(type)=>{setOpen(false);if(type==='excel')exportRowsToExcel(title,rows);if(type==='csv')exportRowsToCsv(title,rows);if(type==='word')exportRowsToWord(title,rows);if(type==='pdf')exportRowsToPdf(title,rows,notify);if(type!=='pdf')notify?.(`${title} exported as ${type==='excel'?'Excel':type.toUpperCase()}.`)};return <div className="export-menu"><button className="secondary export-trigger" onClick={()=>setOpen(v=>!v)}><Icon name="download" size={15}/> Export <Icon name="chevron-down" size={13}/></button>{open&&<><button className="export-menu-scrim" aria-label="Close export menu" onClick={()=>setOpen(false)}/><div className="export-menu-popover"><span>EXPORT CURRENT VIEW</span><button onClick={()=>run('pdf')}><i className="pdf">PDF</i><div><strong>PDF report</strong><small>Print-ready document</small></div></button><button onClick={()=>run('excel')}><i className="xls">XLS</i><div><strong>Excel workbook</strong><small>Editable spreadsheet</small></div></button><button onClick={()=>run('word')}><i className="doc">DOC</i><div><strong>Word document</strong><small>Editable report table</small></div></button><button onClick={()=>run('csv')}><i className="csv">CSV</i><div><strong>CSV data</strong><small>Universal data export</small></div></button><em>{rows.length.toLocaleString()} records</em></div></>}</div>}
function auditCategory(row){const source=String(row.metadata?.source||'').toLowerCase(),text=`${row.action||''} ${row.field_name||''}`.toLowerCase();if(source.includes('payment')||text.includes('payment'))return 'payments';if(source.includes('custody')||text.includes('custody')||text.includes('handover'))return 'custody';if(source.includes('delivery')||text.includes('deliver'))return 'deliveries';if(source.includes('appointment')||text.includes('appointment'))return 'appointments';if(source.includes('courier')||text.includes('courier'))return 'courier';if(text.includes('delete')||text.includes('cancel'))return 'warning';return 'cases'}
function auditTime(value){const ms=Date.now()-new Date(value).getTime(),mins=Math.floor(ms/60000);if(mins<1)return'Just now';if(mins<60)return`${mins}m ago`;const hours=Math.floor(mins/60);if(hours<24)return`${hours}h ago`;const days=Math.floor(hours/24);if(days<7)return`${days}d ago`;return fmtDate(value)}
function notificationTransferId(row){
  const visible=`${row.new_value||''} ${row.old_value||''} ${row.action||''}`.match(/TRF-[A-Z0-9-]+/i)?.[0];
  if(visible)return visible;
  return String(row.metadata?.transfer_id||row.metadata?.transfer_no||'');
}
function notificationTransferLabel(row){return `${row.new_value||''} ${row.old_value||''} ${row.action||''}`.match(/TRF-[A-Z0-9-]+/i)?.[0]||''}
function notificationActionLabel(row){return String(row.action||'Case updated').replace(/\s*[·:-]\s*[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}.*$/i,'').trim()}
function notificationGroupKey(row){
  const category=auditCategory(row),transferId=notificationTransferId(row);
  if(category==='custody'&&transferId){
    const state=/receiv|confirm/i.test(`${row.action||''} ${row.field_name||''}`)?'received':'dispatched';
    return `custody|${transferId}|${state}`;
  }
  return `${row.case_id||'system'}|${category}|${String(row.action||'update').toLowerCase()}`;
}
function NotificationCenter({userId,rows,cases,loading,lastRead,isAdmin,onClose,onRefresh,onMarkAllRead,onOpenCase}){
  const [tab,setTab]=useState('notifications'),[category,setCategory]=useState('all'),[query,setQuery]=useState(''),[actor,setActor]=useState('all'),[date,setDate]=useState('');
  const [expanded,setExpanded]=useState(''),[revealed,setRevealed]=useState(''),[archived,setArchived]=useState([]),[dismissed,setDismissed]=useState([]);
  const swipeStart=useRef(null),suppressClick=useRef(false);
  useEffect(()=>{setRevealed('');setExpanded('')},[tab]);
  const archiveKey=`kenza_notification_archive_${userId||'user'}`,dismissKey=`kenza_notification_dismissed_${userId||'user'}`;
  useEffect(()=>{try{setArchived(JSON.parse(localStorage.getItem(archiveKey)||'[]'));setDismissed(JSON.parse(localStorage.getItem(dismissKey)||'[]'))}catch{}},[archiveKey,dismissKey]);
  const persist=(key,value,setter)=>{setter(value);try{localStorage.setItem(key,JSON.stringify(value.slice(-250)))}catch{}};
  const archiveGroup=key=>{persist(archiveKey,[...new Set([...archived,key])],setArchived);setRevealed('')};
  const restoreGroup=key=>{persist(archiveKey,archived.filter(x=>x!==key),setArchived);setRevealed('')};
  const dismissGroup=key=>{persist(dismissKey,[...new Set([...dismissed,key])],setDismissed);setRevealed('')};
  const caseMap=useMemo(()=>new Map(cases.map(c=>[c.id,c])),[cases]);
  const actors=useMemo(()=>[...new Set(rows.map(r=>r.profiles?.full_name).filter(Boolean))].sort(),[rows]);
  const filtered=useMemo(()=>rows.filter(r=>{const c=caseMap.get(r.case_id),cat=auditCategory(r),name=r.profiles?.full_name||'System';if(category!=='all'&&cat!==category)return false;if(actor!=='all'&&name!==actor)return false;if(date&&String(r.created_at||'').slice(0,10)!==date)return false;const hay=[r.action,r.field_name,r.old_value,r.new_value,name,c?.tracking_reference,c?.customer_name].join(' ').toLowerCase();return !query||hay.includes(query.toLowerCase())}),[rows,caseMap,category,actor,date,query]);
  const groupedNotifications=useMemo(()=>{const groups=new Map();for(const row of filtered){const key=notificationGroupKey(row),found=groups.get(key);if(found){found.items.push(row);found.groupCount=found.items.length}else groups.set(key,{...row,groupKey:key,items:[row],groupCount:1})}return [...groups.values()].filter(g=>!dismissed.includes(g.groupKey)).slice(0,80)},[filtered,dismissed]);
  const liveGroups=groupedNotifications.filter(g=>!archived.includes(g.groupKey)),archivedGroups=groupedNotifications.filter(g=>archived.includes(g.groupKey));
  const shown=tab==='notifications'?liveGroups:tab==='archived'?archivedGroups:filtered;
  const unread=rows.filter(r=>!lastRead||new Date(r.created_at)>new Date(lastRead)).length;
  const exportRows=filtered.map(r=>{const c=caseMap.get(r.case_id);return{'Date & Time':r.created_at||'','Tracking No.':c?.tracking_reference||'','Customer':c?.customer_name||'','User':r.profiles?.full_name||'System','Category':auditCategory(r),'Action':r.action||'','Field':r.field_name||'','Old Value':r.old_value||'','New Value':r.new_value||''}});
  const iconFor=cat=>cat==='payments'?'wallet':cat==='deliveries'?'package':cat==='custody'?'handover':cat==='appointments'?'calendar':cat==='courier'?'truck':cat==='warning'?'alert':'file';
  const openRow=row=>{const c=caseMap.get(row.case_id);if(c)onOpenCase(c)};
  const renderGroup=g=>{const cat=auditCategory(g),isUnread=!lastRead||new Date(g.created_at)>new Date(lastRead),isOpen=expanded===g.groupKey,isRevealed=revealed===g.groupKey,caseCount=new Set(g.items.map(i=>i.case_id).filter(Boolean)).size,transferLabel=notificationTransferLabel(g),actionLabel=notificationActionLabel(g);return <div className={`notification-group-shell ${isRevealed?'actions-open':''}`} key={g.groupKey} ><div className="notification-swipe-header" onPointerDown={e=>{suppressClick.current=false;swipeStart.current={x:e.clientX,y:e.clientY}}} onPointerCancel={()=>{swipeStart.current=null}} onPointerUp={e=>{if(swipeStart.current&&Math.abs(e.clientY-swipeStart.current.y)<30){const distance=e.clientX-swipeStart.current.x;if(Math.abs(distance)>35)suppressClick.current=true;if(distance<-35)setRevealed(g.groupKey);if(distance>35)setRevealed('')}swipeStart.current=null}}><div className="notification-slide-actions">{tab==='archived'?<button title="Restore notification" aria-label="Restore notification" onClick={()=>restoreGroup(g.groupKey)}><Icon name="restore" size={18}/></button>:<button title="Archive notification" aria-label="Archive notification" onClick={()=>archiveGroup(g.groupKey)}><Icon name="archive" size={18}/></button>}<button className="delete" title="Delete from view" aria-label="Delete from view" onClick={()=>dismissGroup(g.groupKey)}><Icon name="trash" size={18}/></button></div><button className={`notification-item notification-group-primary ${cat} ${isUnread?'unread':''}`} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return}g.groupCount>1?setExpanded(isOpen?'':g.groupKey):openRow(g)}}><i className="notification-type"><Icon name={iconFor(cat)} size={16}/></i><div className="notification-copy"><div><strong>{transferLabel?`${actionLabel} · ${transferLabel}`:actionLabel}{g.groupCount>1&&<b className="notification-group-count">{g.groupCount}</b>}</strong><time>{auditTime(g.created_at)}</time></div><span>{g.groupCount>1?`${caseCount} case${caseCount===1?'':'s'} · Tap to view every update`:(caseMap.get(g.case_id)?`#${caseMap.get(g.case_id).tracking_reference} · ${caseMap.get(g.case_id).customer_name||'Customer'}`:'System activity')}</span>{g.groupCount===1&&(g.old_value||g.new_value)&&<small>{g.old_value&&<del>{g.old_value}</del>}{g.old_value&&g.new_value&&<b>→</b>}{g.new_value&&<ins>{g.new_value}</ins>}</small>}</div>{g.groupCount>1?<Icon name={isOpen?'chevron-up':'chevron-down'} size={15}/>:isUnread&&<em/>}</button><button className="notification-more" aria-expanded={isRevealed} onClick={()=>setRevealed(isRevealed?'':g.groupKey)} aria-label={isRevealed?'Close notification actions':'Show notification actions'} title={isRevealed?'Close actions':'Slide for actions'}><Icon name={isRevealed?'chevron-right':'chevron-left'} size={16}/></button></div>{isOpen&&<div className="notification-group-children">{g.items.map(item=>{const c=caseMap.get(item.case_id);return <button key={item.id} onClick={()=>openRow(item)} disabled={!c}><i/><div><strong>{c?`#${c.tracking_reference} · ${c.customer_name||'Customer'}`:'System activity'}</strong><span>{notificationActionLabel(item)}{item.metadata?.document_name?` · ${item.metadata.document_name}`:''}</span>{(item.old_value||item.new_value)&&<small>{item.old_value||'—'} → {item.new_value||'—'}</small>}</div><time>{auditTime(item.created_at)}</time></button>})}</div>}</div>};
  return <div className="notification-backdrop" onMouseDown={onClose}><aside className="notification-center" onMouseDown={e=>e.stopPropagation()}><header className="notification-head"><div><span>WORKSPACE ACTIVITY</span><h2>Notifications & Audit</h2><p>{unread?`${unread} unread update${unread===1?'':'s'}`:'You are all caught up'}</p></div><button onClick={onClose} aria-label="Close"><Icon name="close" size={18}/></button></header><div className="notification-tabs"><button className={tab==='notifications'?'active':''} onClick={()=>setTab('notifications')}><Icon name="bell" size={15}/> Notifications {unread>0&&<b>{unread}</b>}</button><button className={tab==='activity'?'active':''} onClick={()=>setTab('activity')}><Icon name="clock" size={15}/> Activity Log</button><button className={tab==='archived'?'active':''} onClick={()=>setTab('archived')}><Icon name="archive" size={15}/> Archived {archivedGroups.length>0&&<b>{archivedGroups.length}</b>}</button></div><div className="notification-actions"><button onClick={onMarkAllRead} disabled={!unread}><Icon name="check" size={14}/> Mark all read</button><button onClick={onRefresh} disabled={loading}>↻ Refresh</button>{tab==='activity'&&<ExportMenu title="Activity Audit" rows={exportRows}/>}</div>{tab==='activity'&&<div className="audit-filters"><div><Icon name="search" size={14}/><input placeholder="Search action, case, customer or value…" value={query} onChange={e=>setQuery(e.target.value)}/></div><select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All modules</option><option value="cases">Cases</option><option value="payments">Payments</option><option value="deliveries">Deliveries</option><option value="custody">Custody</option><option value="appointments">Appointments</option><option value="courier">Courier</option><option value="warning">Deleted / cancelled</option></select>{isAdmin&&<select value={actor} onChange={e=>setActor(e.target.value)}><option value="all">All users</option>{actors.map(x=><option key={x}>{x}</option>)}</select>}<input type="date" value={date} onChange={e=>setDate(e.target.value)}/>{(query||category!=='all'||actor!=='all'||date)&&<button onClick={()=>{setQuery('');setCategory('all');setActor('all');setDate('')}}>Clear</button>}</div>}<div className="notification-list">{loading&&!rows.length?<div className="notification-empty"><span className="notification-spinner"/><strong>Loading activity…</strong></div>:shown.length?(tab==='activity'?shown.map(r=>{const c=caseMap.get(r.case_id),cat=auditCategory(r),isUnread=!lastRead||new Date(r.created_at)>new Date(lastRead);return <button className={`notification-item ${cat} ${isUnread?'unread':''}`} key={r.id} onClick={()=>c&&onOpenCase(c)} disabled={!c}><i className="notification-type"><Icon name={iconFor(cat)} size={16}/></i><div className="notification-copy"><div><strong>{r.action||'Case updated'}</strong><time>{auditTime(r.created_at)}</time></div><span>{c?`#${c.tracking_reference} · ${c.customer_name||'Customer'}`:'System activity'}{r.profiles?.full_name?` · ${r.profiles.full_name}`:''}</span>{(r.old_value||r.new_value)&&<small>{r.old_value&&<del>{r.old_value}</del>}{r.old_value&&r.new_value&&<b>→</b>}{r.new_value&&<ins>{r.new_value}</ins>}</small>}</div>{isUnread&&<em/>}</button>}):shown.map(renderGroup)):<div className="notification-empty"><Icon name="check" size={24}/><strong>{tab==='archived'?'No archived notifications':'No activity found'}</strong><span>{tab==='archived'?'Swipe a notification and choose Archive to keep it here.':'Try changing the filters or refresh the activity feed.'}</span></div>}</div>{tab==='activity'&&<footer className="audit-footer"><span>Showing {shown.length.toLocaleString()} of {rows.length.toLocaleString()} loaded records</span><small>{isAdmin?'Administrator audit view':'Your permitted activity view'}</small></footer>}</aside></div>
}
function Nav({active,disabled,icon,children,onClick}){const label=String(Array.isArray(children)?children[0]:children||'').trim();return <button className={`nav ${active?'active':''} ${disabled?'disabled':''}`} disabled={disabled} onClick={onClick} title={label} aria-label={label} data-label={label}><i className="nav-icon"><Icon name={icon} size={17}/></i><span>{children}</span>{active&&<em className="nav-active-dot"/>}</button>}
function Field({label,wide,children}){return <label className={wide?'wide':''}><span>{label}</span>{children}</label>}
function Modal({title,subtitle,onClose,children,className=''}){return <div className="modal-backdrop" onMouseDown={onClose}><div className={`modal ${className}`} onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><h2>{title}</h2><p className="muted">{subtitle}</p></div><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={18}/></button></div>{children}</div></div>}
function StatusPill({status}){return <span className={`status-pill ${slug(status)}`}><i></i>{status}</span>}
function moneyParts(c){const paid=Number(c.advance_paid||0)+Number(c.second_payment||0)-Number(c.discount_return||0);const balance=Number(c.balance_payment??Math.max(0,Number(c.total_amount||0)-paid));return{paid,balance}}

function Dashboard({companyName='Your Organization',stats,cases,onOpen,onCases,onScan,onDeliveries,onPayments,onCustody,orgId,onSales,onServices,onCRM,branchName=null}){
  const [business,setBusiness]=useState(null);useEffect(()=>{let live=true;if(orgId)supabase.rpc('business_dashboard',{target_org:orgId}).then(r=>{if(live&&!r.error)setBusiness(r.data)});return()=>{live=false}},[orgId]);
  const recent=cases.slice(0,6),ready=cases.filter(c=>c.overall_status==='Ready for Delivery').slice(0,5);
  const today=new Date().toISOString().slice(0,10),todayCases=cases.filter(c=>String(c.submission_date||'').slice(0,10)===today).length;
  const due=cases.filter(c=>Number(c.balance_payment||0)>0),dueTotal=due.reduce((n,c)=>n+Number(c.balance_payment||0),0);
  return <div className="saas-dashboard">
    <section className="dashboard-command-hero"><div className="dashboard-glow one"></div><div className="dashboard-glow two"></div><div className="dashboard-command-copy"><span>{branchName?`${branchName.toUpperCase()} · LIVE OPERATIONS`:`${companyName.toUpperCase()} · LIVE`}</span><h2>Your business, at a glance.</h2><p>{stats.under+stats.waiting+stats.ready} active cases need attention across processing, customer delivery and custody.</p><div><button className="dashboard-primary" onClick={onCases}>Open Operations</button><button className="dashboard-scan" onClick={onScan}><Icon name="scan" size={18}/> Scan Case QR</button></div></div><div className="dashboard-hero-metric"><small>ACTIVE WORKLOAD</small><strong>{(stats.under+stats.waiting+stats.ready).toLocaleString()}</strong><span><i></i> Live database connected</span></div></section>
    <section className="today-strip"><div className="today-title"><span>TODAY</span><strong>{new Date().toLocaleDateString('en-GB',{weekday:'long',day:'2-digit',month:'short'})}</strong></div><div><small>NEW CASES</small><strong>{todayCases}</strong><span>Received today</span></div><div><small>READY</small><strong>{stats.ready}</strong><span>Customer delivery</span></div><div><small>PAYMENTS DUE</small><strong>{due.length}</strong><span>{fmtMoney(dueTotal)}</span></div><div><small>OPEN STAGES</small><strong>{stats.pendingStages}</strong><span>Pending or processing</span></div></section>
    <section className="dashboard-business-strip">{[['Today’s invoices',business?.invoices],['Today’s sales',business?.sales],['Receivables',business?.receivables],['Open service jobs',business?.jobs]].map(([label,value])=><button key={label} onClick={label.includes('jobs')?onServices:onSales}><small>{label}</small><strong>{value===undefined?'—':Number(value).toLocaleString(undefined,{maximumFractionDigits:2})}</strong></button>)}</section><section className="dashboard-business-links"><button className="secondary" onClick={onSales}>Sales & invoices</button><button className="secondary" onClick={onServices}>Service tracking</button><button className="secondary" onClick={onCRM}>Customers & CRM</button></section><section className="dashboard-quick-actions"><button onClick={onScan}><i><Icon name="scan" size={19}/></i><span><strong>Scan QR</strong><small>Open operational actions</small></span></button><button onClick={onDeliveries}><i><Icon name="package" size={19}/></i><span><strong>Customer Delivery</strong><small>Give documents to customer</small></span></button><button onClick={onCustody}><i><Icon name="handover" size={19}/></i><span><strong>Internal Handover</strong><small>Transfer document custody</small></span></button><button onClick={onPayments}><i><Icon name="wallet" size={19}/></i><span><strong>Record Payment</strong><small>Open receivables workspace</small></span></button></section>
    <section className="stats-grid six premium-stats"><Stat label="Total Cases" value={stats.total} icon="▣"/><Stat label="Received" value={stats.received} icon="↓"/><Stat label="Under Process" value={stats.under} icon="↻"/><Stat label="Waiting" value={stats.waiting} icon="◷"/><Stat label="Ready to Deliver" value={stats.ready} icon="◇"/><Stat label="Open Stages" value={stats.pendingStages} icon="✓"/></section>
    <section className="dashboard-grid premium-dashboard-grid"><div className="panel premium-panel"><PanelHead title="Recent Cases" subtitle={branchName?`Latest ${branchName} activity`:"Latest operational activity"} action={<button className="link-btn" onClick={onCases}>View all</button>}/><div className="recent-list premium-recent">{recent.length?recent.map(c=><button className="recent-row" key={c.id} onClick={()=>onOpen(c)}><div className="ref-box">{String(c.tracking_reference).slice(-4)}</div><div className="recent-main"><strong>{c.customer_name}</strong><span>#{c.tracking_reference} · {c.documents?.length||0} documents · {c.branches?.name||'No branch'}</span></div><StatusPill status={c.overall_status}/><span className="chev">›</span></button>):<Empty text="No cases yet"/>}</div></div>
    <div className="panel premium-panel"><PanelHead title="Ready for Customer Delivery" subtitle="Documents prepared for customer handover" action={<button className="link-btn" onClick={onDeliveries}>Open queue</button>}/><div className="ready-list premium-ready-list">{ready.length?ready.map(c=>{const m=moneyParts(c);return <button className="ready-row" key={c.id} onClick={()=>onOpen(c)}><div><strong>#{c.tracking_reference}</strong><span>{c.customer_name}</span></div><div className="ready-meta"><small>{c.documents?.length||0} docs</small><b className={m.balance>0?'balance-due':''}>{m.balance>0?fmtMoney(m.balance):'Paid'}</b></div></button>}):<Empty text="Nothing waiting for delivery"/>}</div></div></section>
  </div>
}
function Stat({label,value,icon}){return <div className="stat"><div className="stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>}
function PanelHead({title,subtitle,action}){return <div className="panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div>{action}</div>}
function Empty({text}){return <div className="empty"><div>⌁</div><strong>{text}</strong></div>}

function CasesView({preferenceKey,cases,allCases=[],recentCaseIds=[],favoriteCaseIds=new Set(),toggleFavorite,clearRecent,clearFavorites,shareDetailed,loading,query,setQuery,searchBy,setSearchBy,statusFilter,setStatusFilter,branchFilter,setBranchFilter,documentFilter,setDocumentFilter,quantityFilter,setQuantityFilter,mobileFilter,setMobileFilter,balanceFilter,setBalanceFilter,accountFilter,setAccountFilter,intakeFilter,setIntakeFilter,ddFilter,setDdFilter,branches,expanded,toggleExpanded,selected,toggleSelected,updateCaseStatus,updateStage,updateStageDate,reorderStages,quick,addDoc,deleteDocument,addStage,renameStage,deleteStage,bulkStatus,appointment,bulkAppointment,batchSelected}){
  const [visible,setVisible]=useState(200);
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [bulkNext,setBulkNext]=useState('');
  const [favoritesOnly,setFavoritesOnly]=useState(false);
  const [viewMode,setViewMode]=useState('cards');
  useEffect(()=>{try{const saved=localStorage.getItem(preferenceKey)||localStorage.getItem('kenza_cases_view');if(saved==='table'||saved==='cards')setViewMode(saved)}catch{}},[preferenceKey]);
  const changeViewMode=mode=>{setViewMode(mode);try{localStorage.setItem(preferenceKey,mode);localStorage.setItem('kenza_cases_view',mode)}catch{}};
  useEffect(()=>setVisible(200),[query,searchBy,statusFilter,branchFilter,documentFilter,quantityFilter,mobileFilter,balanceFilter,accountFilter,intakeFilter,ddFilter]);
  const displayCases=useMemo(()=>favoritesOnly?cases.filter(c=>favoriteCaseIds.has(c.id)):cases,[cases,favoritesOnly,favoriteCaseIds]);
  const shown=useMemo(()=>displayCases.slice(0,visible),[displayCases,visible]);
  const pinned=useMemo(()=>allCases.filter(c=>favoriteCaseIds.has(c.id)).slice(0,8),[allCases,favoriteCaseIds]);
  const recent=useMemo(()=>recentCaseIds.map(id=>allCases.find(c=>c.id===id)).filter(Boolean).slice(0,8),[allCases,recentCaseIds]);
  const resultKey=`${searchBy}|${query}|${shown.map(c=>c.id).join('|')}`;
  const selectVisible=()=>shown.forEach(c=>{if(!selected.has(c.id))toggleSelected(c.id)});
  const clearSelected=()=>[...selected].forEach(id=>toggleSelected(id));
  return <>
    <section className="legacy-cases-toolbar">
      <SearchBySelect value={searchBy} onChange={setSearchBy}/><div className="legacy-search"><input placeholder={searchBy==='tracking'?'Enter full or partial tracking number…':searchBy==='mobile'?'Enter full or partial mobile number…':searchBy==='bill'?'Enter full or partial bill number…':searchBy==='name'?'Enter customer name…':'Search all fields…'} value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <button className="legacy-toolbar-btn" onClick={selectVisible}>Select visible</button>
      <button className="legacy-toolbar-btn" onClick={clearSelected} disabled={!selected.size}>Clear</button>
      <button className={`legacy-toolbar-btn toolbar-icon-btn ${filtersOpen?'active':''}`} onClick={()=>setFiltersOpen(v=>!v)} title="Advanced filters" aria-label="Advanced filters"><Icon name="filter" size={17}/></button>
      <button className={`legacy-toolbar-btn toolbar-icon-btn favorites-filter ${favoritesOnly?'active':''}`} onClick={()=>setFavoritesOnly(v=>!v)} title={favoritesOnly?'Show all cases':'Favorites only'} aria-label={favoritesOnly?'Show all cases':'Favorites only'}><Icon name="bookmark" size={17}/></button>
    </section>
    {filtersOpen&&<section className="legacy-filter-row advanced-grid">
      <label><span>Status</span><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>All</option>{CASE_STATUSES.map(s=><option key={s}>{s}</option>)}</select></label>
      <label><span>Branch</span><select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="All">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label><span>Documents</span><select value={documentFilter} onChange={e=>setDocumentFilter(e.target.value)}><option>All</option><option>Has documents</option><option>No documents</option></select></label>
      <label><span>Quantity</span><select value={quantityFilter} onChange={e=>setQuantityFilter(e.target.value)}><option>All</option><option>Has quantity</option><option>No quantity</option></select></label>
      <label><span>Mobile</span><select value={mobileFilter} onChange={e=>setMobileFilter(e.target.value)}><option>All</option><option>Has mobile</option><option>No mobile</option></select></label>
      <label><span>Payment</span><select value={balanceFilter} onChange={e=>setBalanceFilter(e.target.value)}><option>All</option><option>Balance due</option><option>Paid / zero balance</option></select></label>
      <label><span>Account</span><select value={accountFilter} onChange={e=>setAccountFilter(e.target.value)}><option>All</option><option>B2B / Organization</option><option>Individual</option></select></label>
      <label><span>Intake</span><select value={intakeFilter} onChange={e=>setIntakeFilter(e.target.value)}><option>All</option><option>Branch</option><option>Collection</option><option>External Office</option></select></label>
      <label><span>Delhi Direct</span><select value={ddFilter} onChange={e=>setDdFilter(e.target.value)}><option>All</option><option>DD only</option><option>Non-DD</option></select></label>
      <button className="legacy-toolbar-btn filter-reset" onClick={()=>{setStatusFilter('All');setBranchFilter('All');setDocumentFilter('All');setQuantityFilter('All');setMobileFilter('All');setBalanceFilter('All');setAccountFilter('All');setIntakeFilter('All');setDdFilter('All')}}>Reset filters</button>
    </section>}
    {!query&&!favoritesOnly&&(pinned.length>0||recent.length>0)&&<section className="case-access-shelves">{pinned.length>0&&<div><header><span><Icon name="bookmark" size={14}/> Favorites</span><div className="case-shelf-meta"><small>{pinned.length} saved</small><button type="button" className="case-shelf-clear" onClick={clearFavorites}>Clear</button></div></header><div className="case-shelf-items">{pinned.map(c=><button key={c.id} onClick={()=>quick(c)}><strong>#{c.tracking_reference}</strong><span>{c.customer_name}</span><StatusPill status={c.overall_status}/></button>)}</div></div>}{recent.length>0&&<div><header><span><Icon name="clock" size={14}/> Recently viewed</span><div className="case-shelf-meta"><small>Your latest cases</small><button type="button" className="case-shelf-clear" onClick={clearRecent}>Clear</button></div></header><div className="case-shelf-items">{recent.map(c=><button key={c.id} onClick={()=>quick(c)}><strong>#{c.tracking_reference}</strong><span>{c.customer_name}</span><StatusPill status={c.overall_status}/></button>)}</div></div>}</section>}
    <div className="legacy-count-row"><span><strong>{displayCases.length.toLocaleString()}</strong> {favoritesOnly?'favorite':'matching'} cases</span><div className="cases-view-tools"><span>{viewMode==='cards'?'Card workspace':'Compact table'}</span><div className="cases-view-toggle" role="group" aria-label="Cases view"><button type="button" className={viewMode==='cards'?'active':''} onClick={()=>changeViewMode('cards')} title="Card view" aria-label="Card view"><Icon name="grid" size={16}/></button><button type="button" className={viewMode==='table'?'active':''} onClick={()=>changeViewMode('table')} title="Table view" aria-label="Table view"><Icon name="list" size={17}/></button></div></div></div>
    {selected.size>0&&<div className="bulkbar legacy-bulk"><strong>{selected.size} selected</strong><button className="secondary" onClick={batchSelected}>＋ Create Batch</button><button className="secondary" onClick={bulkAppointment}>Assign appointment</button><span>Bulk overall status</span><select value={bulkNext} onChange={e=>setBulkNext(e.target.value)}><option value="">Choose status…</option>{CASE_STATUSES.map(s=><option key={s}>{s}</option>)}</select><button className="primary" disabled={!bulkNext} onClick={async()=>{await bulkStatus(bulkNext);setBulkNext('')}}>Update status</button></div>}
    {loading?<Empty text="Loading cases…"/>:shown.length===0?<Empty text={favoritesOnly?'No favorite cases yet':'No matching cases'}/>:<>{viewMode==='table'?<div className="cases-table-shell" key={`table-${resultKey}`}><table className="cases-table"><thead><tr><th className="case-table-check"><span className="sr-only">Select</span></th><th>Tracking / Bill</th><th>Customer</th><th>Mobile</th><th>Branch</th><th>Documents</th><th>Balance</th><th>Status</th><th className="case-table-actions-head">Actions</th></tr></thead><tbody>{shown.map(c=>{const money=moneyParts(c);const docs=c.documents||[];return <tr key={c.id} className={selected.has(c.id)?'selected':''}><td className="case-table-check"><input type="checkbox" checked={selected.has(c.id)} onChange={()=>toggleSelected(c.id)} aria-label={`Select case ${c.tracking_reference}`}/></td><td><button type="button" className="case-table-track" onClick={()=>quick(c)}>#{c.tracking_reference}</button><small>{c.bill_no||'No bill number'}</small></td><td><strong>{c.customer_name||'Unnamed customer'}</strong><small>{c.intake_type||'Branch intake'}</small></td><td><a className="case-table-mobile" href={c.mobile?`tel:${String(c.mobile).replace(/\s/g,'')}`:undefined}>{c.mobile||'—'}</a></td><td><strong>{c.branches?.name||'—'}</strong></td><td><strong>{docs.length}</strong><small>{docs.reduce((n,d)=>n+Number(d.quantity||1),0)} item(s)</small></td><td><strong className={money.balance>0?'due':''}>{fmtMoney(money.balance)}</strong></td><td><StatusPill status={c.overall_status}/></td><td><div className="case-table-actions"><button type="button" onClick={()=>quick(c)} title="Quick view"><Icon name="eye" size={15}/></button><button type="button" onClick={()=>appointment(c)} title="Appointment"><Icon name="calendar" size={15}/></button><button type="button" className={favoriteCaseIds.has(c.id)?'active':''} onClick={()=>toggleFavorite?.(c.id)} title={favoriteCaseIds.has(c.id)?'Remove favorite':'Add favorite'}><Icon name="bookmark" size={15}/></button></div></td></tr>})}</tbody></table></div>:<div className="legacy-case-grid" key={resultKey}>{shown.map(c=><CaseCard key={c.id} c={c} favorite={favoriteCaseIds.has(c.id)} toggleFavorite={()=>toggleFavorite?.(c.id)} shareDetailed={shareDetailed} open={expanded.has(c.id)} toggle={()=>toggleExpanded(c.id)} checked={selected.has(c.id)} select={()=>toggleSelected(c.id)} selectionMode={selected.size>0} updateCaseStatus={updateCaseStatus} updateStage={updateStage} updateStageDate={updateStageDate} reorderStages={reorderStages} quick={quick} addDoc={addDoc} deleteDocument={deleteDocument} addStage={addStage} renameStage={renameStage} deleteStage={deleteStage} appointment={appointment}/>)}</div>}{visible<displayCases.length&&<div className="show-more-wrap"><button className="secondary" onClick={()=>setVisible(v=>v+200)}>Show 200 more</button><span>{(displayCases.length-visible).toLocaleString()} remaining</span></div>}</>}
  </>
}
function Icon({name,size=16,className=''}){
  const common={width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.9,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':'true',className};
  if(name==='calendar')return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h3M8 17h5"/></svg>;
  if(name==='eye')return <svg {...common}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.6"/></svg>;
  if(name==='grid')return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
  if(name==='list')return <svg {...common}><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>;
  if(name==='phone')return <svg {...common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.28-1.28a2 2 0 0 1 2.11-.45c.9.33 1.84.56 2.8.69A2 2 0 0 1 22 16.92Z"/></svg>;
  if(name==='user')return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>;
  if(name==='chevron-down')return <svg {...common}><path d="m7 9.5 5 5 5-5"/></svg>;
  if(name==='chevron-up')return <svg {...common}><path d="m7 14.5 5-5 5 5"/></svg>;
  if(name==='chevron-left')return <svg {...common}><path d="m15 18-6-6 6-6"/></svg>;
  if(name==='chevron-right')return <svg {...common}><path d="m9 18 6-6-6-6"/></svg>;
  if(name==='file')return <svg {...common}><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></svg>;
  if(name==='trash')return <svg {...common}><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></svg>;
  if(name==='plus')return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
  if(name==='close')return <svg {...common}><path d="m6 6 12 12M18 6 6 18"/></svg>;
  if(name==='search')return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
  if(name==='home')return <svg {...common}><path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/></svg>;
  if(name==='scan')return <svg {...common}><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M7 12h10"/></svg>;
  if(name==='activity')return <svg {...common}><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>;
  if(name==='package')return <svg {...common}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg>;
  if(name==='handover')return <svg {...common}><path d="M4 8h10M11 5l3 3-3 3M20 16H10M13 13l-3 3 3 3"/></svg>;
  if(name==='wallet')return <svg {...common}><path d="M4 6h15a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h13"/><path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z"/></svg>;
  if(name==='print')return <svg {...common}><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg>;
  if(name==='edit')return <svg {...common}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>;
  if(name==='grip')return <svg {...common}><circle cx="8" cy="7" r="1"/><circle cx="16" cy="7" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="17" r="1"/><circle cx="16" cy="17" r="1"/></svg>;
  if(name==='layers')return <svg {...common}><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>;
  if(name==='batch')return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>;
  if(name==='truck')return <svg {...common}><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>;
  if(name==='chart')return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>;
  if(name==='globe')return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>;
  if(name==='upload')return <svg {...common}><path d="M12 16V3M7 8l5-5 5 5"/><path d="M4 14v6h16v-6"/></svg>;
  if(name==='logout')return <svg {...common}><path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10"/></svg>;
  if(name==='check')return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  if(name==='alert')return <svg {...common}><path d="M12 3 2.8 20h18.4zM12 9v4M12 17h.01"/></svg>;
  if(name==='info')return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>;
  if(name==='download')return <svg {...common}><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg>;
  if(name==='archive')return <svg {...common}><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M2 5l2-3h16l2 3M9 10h6"/></svg>;
  if(name==='restore')return <svg {...common}><path d="M4 7v5h5M5.5 12a7 7 0 1 0 2-5M4 7l3-3"/></svg>;
  if(name==='bell')return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>;
  if(name==='filter')return <svg {...common}><path d="M4 5h16M7 12h10M10 19h4"/></svg>;
  if(name==='clock')return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
  if(name==='settings')return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>;
  if(name==='bookmark')return <svg {...common}><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1Z"/></svg>;
  if(name==='star')return <svg {...common}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/></svg>;
  if(name==='share')return <svg {...common}><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/></svg>;
  return null;
}
function CaseCard({c,favorite=false,toggleFavorite,shareDetailed,open,toggle,checked,select,selectionMode,updateCaseStatus,updateStage,updateStageDate,reorderStages,quick,addDoc,deleteDocument,addStage,renameStage,deleteStage,appointment}){
  const m=moneyParts(c), docs=c.documents||[];
  const activeStages=docs.flatMap(d=>d.document_stages||[]).filter(s=>s.status==='Pending'||s.status==='Processing').length;
  const contact=String(c.mobile||'').replace(/\D/g,'');
  const call=e=>{e.stopPropagation();if(contact)window.location.href=`tel:${contact}`};
  const whatsapp=e=>{e.stopPropagation();if(contact)shareDetailed?.(c,{whatsapp:true})};
  const share=e=>{e.stopPropagation();shareDetailed?.(c)};
  const cardClick=e=>{
    if(!selectionMode)return;
    if(e.target.closest('button,input,select,a,textarea,label'))return;
    select();
  };
  return <article className={`legacy-case-card ${open?'open':''} ${checked?'selected':''} ${selectionMode?'selection-mode':''}`} onClick={cardClick}>
    <div className="legacy-card-top">
      <div className="legacy-track-wrap">
        <input className="legacy-check" type="checkbox" checked={checked} onChange={select} onClick={e=>e.stopPropagation()}/>
        <div className="legacy-trackline"><strong>#{c.tracking_reference}</strong><span>{c.bill_no||'—'}</span></div>
      </div>
      <StatusPill status={c.overall_status}/>
      <button className={`case-pin ${favorite?'active':''}`} onClick={e=>{e.stopPropagation();toggleFavorite?.()}} title={favorite?'Remove from favorites':'Add to favorites'} aria-label={favorite?'Remove from favorites':'Add to favorites'}><Icon name="bookmark" size={15}/></button>
    </div>
    <div className="legacy-name-band" title={c.customer_name}>
      <strong>{c.customer_name||'Unnamed customer'}</strong>
      <span className="legacy-name-mobile" title={c.mobile||'No mobile number'}><Icon name="phone" size={15}/>{c.mobile||'—'}</span>
    </div>
    <div className="legacy-card-summary">
      <div><strong>{docs.length} doc{docs.length===1?'':'s'}</strong></div>
      <div className={m.balance>0?'due':''}><strong>{m.balance>0?`QAR ${Number(m.balance).toLocaleString('en-US',{maximumFractionDigits:2})}`:'QAR 0'}</strong></div>
      <div><strong>{activeStages} active</strong></div>
    </div>
    <div className="legacy-card-actions">
      <button className="legacy-action-btn" onClick={e=>{e.stopPropagation();appointment(c)}}><Icon name="calendar" size={15}/> Appointment</button>
      <button className="legacy-action-btn" onClick={e=>{e.stopPropagation();quick(c)}}><Icon name="eye" size={15}/> Quick view</button>
      <div className="case-contact-shortcuts"><button onClick={call} disabled={!contact} title="Call customer"><Icon name="phone" size={13}/></button><button onClick={whatsapp} disabled={!contact} title="WhatsApp customer"><b>W</b></button><button onClick={share} title="Share case"><Icon name="share" size={13}/></button></div>
      <button className="legacy-chevron" onClick={e=>{e.stopPropagation();toggle()}} aria-label={open?'Collapse document workflow':'Expand document workflow'} aria-expanded={open} title={open?'Collapse workflow':'Expand workflow'}><Icon name={open?'chevron-up':'chevron-down'} size={17}/></button>
    </div>
    {open&&<div className="workflow legacy-workflow" onClick={e=>e.stopPropagation()}><div className="workflow-head"><div><strong>Document workflow</strong><span>{docs.length} document instance{docs.length===1?'':'s'}</span></div><button className="small-primary" onClick={()=>addDoc(c)}><Icon name="plus" size={13}/> Add Document</button></div>{docs.length===0?<Empty text="No documents added yet"/>:<div className="doc-list">{docs.map(d=><DocRow key={d.id} c={c} d={d} updateStage={updateStage} updateStageDate={updateStageDate} reorderStages={reorderStages} addStage={addStage} renameStage={renameStage} deleteStage={deleteStage} compact onDelete={()=>deleteDocument(c,d)}/>)}</div>}</div>}
  </article>
}
function DocRow({c,d,updateStage,updateStageDate,reorderStages,addStage,renameStage,deleteStage,onDelete,compact=false}){
  return <div className={`doc-row ${compact?'compact-editor':''}`}>
    <div className="doc-title"><div className="doc-icon"><Icon name="file" size={15}/></div><div><strong>{d.document_name}{(d.occurrence_no||1)>1?` #${d.occurrence_no}`:''}</strong><span>{d.holder_name?`${d.holder_name} · `:''}Qty {d.quantity||1} · {d.document_status}{d.direct_to_delhi?' · DD':''}</span>{d.physical_location&&<span className="doc-current-location"><Icon name="home" size={11}/> Current: {d.physical_location}</span>}</div><button className="trash" onClick={onDelete} aria-label="Remove document" title="Remove document"><Icon name="trash" size={15}/></button></div>
    <StageEditor c={c} d={d} updateStage={updateStage} updateStageDate={updateStageDate} reorderStages={reorderStages} addStage={addStage} renameStage={renameStage} deleteStage={deleteStage} compact={compact}/>
  </div>
}
function StageEditor({c,d,updateStage,updateStageDate,reorderStages,addStage,renameStage,deleteStage,compact=false}){
  const stages=d.document_stages||[];
  const [dragId,setDragId]=useState(null);
  const [openStageId,setOpenStageId]=useState(null);
  const dropAt=(targetId)=>{
    if(!dragId||dragId===targetId)return setDragId(null);
    const from=stages.findIndex(x=>x.id===dragId),to=stages.findIndex(x=>x.id===targetId);
    if(from<0||to<0)return setDragId(null);
    const next=[...stages]; const [moved]=next.splice(from,1); next.splice(to,0,moved);
    setDragId(null); reorderStages?.(c,d,next);
  };
  if(!stages.length)return <button type="button" className="stage-add-inline" onClick={()=>addStage?.(c,d)}>＋ Add stage</button>;

  if(compact){
    return <div className="stage-editor stage-editor-compact quick-stage-strip">
      {stages.map((st,i)=>{
        const open=openStageId===st.id;
        return <div className={`quick-stage-item ${slug(st.status)} ${open?'open':''}`} key={st.id}>
          <div className="quick-stage-summary">
            <div className={`quick-stage-index ${slug(st.status)}`}>{st.status==='Completed'?'✓':i+1}</div>
            <div className="quick-stage-copy">
              <strong title={st.stage_name}>{st.stage_name}</strong>
              <span>{st.status}{st.milestone_date?` · ${fmtDate(st.milestone_date)}`:''}</span>
            </div>
            <button type="button" className="quick-stage-edit" title="Update status and date" aria-label={`Update ${st.stage_name}`} onClick={()=>setOpenStageId(open?null:st.id)}>✎</button>
          </div>
          {open&&<div className="quick-stage-editor">
            <label><span>Status</span><select value={st.status} onChange={e=>updateStage(c,d,st,e.target.value)}>{STAGE_STATUSES.map(x=><option key={x}>{x}</option>)}</select></label>
            <label><span>Date</span><input type="date" value={String(st.milestone_date||'').slice(0,10)} onChange={e=>updateStageDate?.(c,d,st,e.target.value)}/></label>
            <div className="quick-stage-mini-actions"><button type="button" className="secondary tiny" onClick={()=>renameStage?.(c,d,st)}>Rename</button><button type="button" className="danger tiny" onClick={()=>deleteStage?.(c,d,st)}>Delete</button></div>
          </div>}
        </div>
      })}
      <button type="button" className="quick-stage-add" onClick={()=>addStage?.(c,d)}>＋ Stage</button>
    </div>
  }

  return <div className="stage-editor">
    {stages.map((st,i)=><div className={`stage-card ${slug(st.status)} ${dragId===st.id?'dragging':''}`} key={st.id} draggable
      onDragStart={e=>{setDragId(st.id);e.dataTransfer.effectAllowed='move'}}
      onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();dropAt(st.id)}} onDragEnd={()=>setDragId(null)}>
      <button className="stage-drag" type="button" aria-label={`Drag ${st.stage_name} to reorder`} title="Drag to reorder"><Icon name="grip" size={14}/></button>
      <div className={`stage-dot ${slug(st.status)}`}>{st.status==='Completed'?'✓':i+1}</div>
      <div className="stage-card-main"><div className="stage-name-row"><strong>{st.stage_name}</strong><span className="stage-crud"><button type="button" title="Rename stage" onClick={()=>renameStage?.(c,d,st)}>✎</button><button type="button" title="Delete stage" onClick={()=>deleteStage?.(c,d,st)}>×</button></span></div><select value={st.status} onChange={e=>updateStage(c,d,st,e.target.value)}>{STAGE_STATUSES.map(x=><option key={x}>{x}</option>)}</select><input className="stage-date-input" type="date" value={String(st.milestone_date||'').slice(0,10)} onChange={e=>updateStageDate?.(c,d,st,e.target.value)} title="Stage date"/></div>
    </div>)}
    <button type="button" className="stage-add-inline" onClick={()=>addStage?.(c,d)}>＋ Stage</button>
  </div>
}

function DocumentsView({cases,query,setQuery,updateStage,updateStageDate,quick,setModuleExport}){
  const [searchBy,setSearchBy]=useState('tracking');
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(60);
  const [docStatus,setDocStatus]=useState('');
  const [stageStatus,setStageStatus]=useState('');
  const [sort,setSort]=useState('tracking');

  const indexedDocs=useMemo(()=>{
    const out=[];
    for(const c of cases){
      for(const d of (c.documents||[])){
        const stages=d.document_stages||[];
        out.push({
          c,d,stages,
          search:[d.document_name,c.tracking_reference,c.customer_name,c.mobile,c.bill_no,...stages.map(x=>x.stage_name),...stages.map(x=>x.status)].join(' ').toLowerCase()
        });
      }
    }
    return out;
  },[cases]);

  const normalized=String(query||'').trim().toLowerCase();

  const filteredDocs=useMemo(()=>{
    let rows=indexedDocs.filter(x=>{
      if(!caseMatchesFieldSearch(x.c,normalized,searchBy,x.search))return false;
      if(docStatus&&x.d.document_status!==docStatus)return false;
      if(stageStatus&&!x.stages.some(st=>st.status===stageStatus))return false;
      return true;
    });
    if(normalized)return rankCaseSearchResults(rows,normalized,searchBy,x=>x.c,x=>x.search);
    rows=[...rows].sort((a,b)=>{
      if(sort==='document')return String(a.d.document_name||'').localeCompare(String(b.d.document_name||''));
      if(sort==='customer')return String(a.c.customer_name||'').localeCompare(String(b.c.customer_name||''));
      return String(a.c.tracking_reference||'').localeCompare(String(b.c.tracking_reference||''),undefined,{numeric:true});
    });
    return rows;
  },[indexedDocs,normalized,docStatus,stageStatus,sort,searchBy]);

  const totalPages=Math.max(1,Math.ceil(filteredDocs.length/pageSize));
  const safePage=Math.min(page,totalPages);
  const visible=useMemo(()=>filteredDocs.slice((safePage-1)*pageSize,safePage*pageSize),[filteredDocs,safePage,pageSize]);
  useEffect(()=>setModuleExport?.({view:'documents',title:'Documents and Stages',rows:filteredDocs.map(({c,d,stages})=>({'Tracking No.':c.tracking_reference||'','Customer':c.customer_name||'','Document':d.document_name||'','Holder':d.holder_name||c.customer_name||'','Quantity':Number(d.quantity||1),'Document Status':d.document_status||'','Current Milestone':d.current_milestone||'','Total Stages':stages.length,'Pending':stages.filter(s=>s.status==='Pending').length,'Processing':stages.filter(s=>s.status==='Processing').length,'Completed':stages.filter(s=>s.status==='Completed').length,'Stage Details':stages.map(s=>`${s.stage_name}: ${s.status}`).join('; ')}))}),[filteredDocs,setModuleExport]);
  useEffect(()=>setPage(1),[normalized,docStatus,stageStatus,sort,pageSize]);
  useEffect(()=>{if(page>totalPages)setPage(totalPages)},[page,totalPages]);

  const pendingCount=useMemo(()=>indexedDocs.filter(x=>x.stages.some(s=>['Pending','Processing'].includes(s.status))).length,[indexedDocs]);
  const completedCount=useMemo(()=>indexedDocs.filter(x=>x.stages.length&&x.stages.every(s=>['Completed','Not Required','Cancelled'].includes(s.status))).length,[indexedDocs]);

  function Pagination(){
    if(filteredDocs.length<=pageSize)return null;
    return <div className="docs-pagination"><span>{((safePage-1)*pageSize+1).toLocaleString()}–{Math.min(safePage*pageSize,filteredDocs.length).toLocaleString()} of {filteredDocs.length.toLocaleString()}</span><div><button className="secondary" disabled={safePage<=1} onClick={()=>setPage(1)}>First</button><button className="secondary" disabled={safePage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹</button><b>{safePage} / {totalPages}</b><button className="secondary" disabled={safePage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>›</button><button className="secondary" disabled={safePage>=totalPages} onClick={()=>setPage(totalPages)}>Last</button><select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}><option value="60">60 / page</option><option value="120">120 / page</option><option value="240">240 / page</option></select></div></div>
  }

  return <section className="documents-manager-fast">
    <div className="docs-fast-kpis"><div><span>DOCUMENTS</span><strong>{indexedDocs.length.toLocaleString()}</strong><small>All document instances</small></div><div><span>ACTIVE WORKFLOW</span><strong>{pendingCount.toLocaleString()}</strong><small>Pending / processing stages</small></div><div><span>WORKFLOW COMPLETE</span><strong>{completedCount.toLocaleString()}</strong><small>All stages closed</small></div><div><span>MATCHING</span><strong>{filteredDocs.length.toLocaleString()}</strong><small>After search and filters</small></div></div>
    <div className="docs-fast-panel">
      <div className="docs-fast-toolbar"><SearchBySelect value={searchBy} onChange={setSearchBy}/><div className="searchbox"><span><Icon name="search" size={15}/></span><input placeholder="Search all documents, tracking, customer or stage…" value={query} onChange={e=>setQuery(e.target.value)}/></div><select value={docStatus} onChange={e=>setDocStatus(e.target.value)}><option value="">All document statuses</option>{STAGE_STATUSES.map(x=><option key={x}>{x}</option>)}</select><select value={stageStatus} onChange={e=>setStageStatus(e.target.value)}><option value="">Any stage status</option>{STAGE_STATUSES.map(x=><option key={x}>{x}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="tracking">Sort: Tracking</option><option value="document">Sort: Document</option><option value="customer">Sort: Customer</option></select><button className="secondary" onClick={()=>{setQuery('');setDocStatus('');setStageStatus('');setSort('tracking')}}>Clear</button></div>
      <Pagination/>
      <div className="docs-fast-list">{visible.length?visible.map(({c,d,stages})=><article className="docs-fast-card" key={d.id}><button className="docs-fast-identity" onClick={()=>quick(c)}><div><strong>{d.document_name}{d.occurrence_no>1?` #${d.occurrence_no}`:''}</strong><span>#{d.source_tracking_reference||c.tracking_reference} · {d.holder_name||c.customer_name}{c.account_name?` · ${c.account_name}`:''}</span></div><StatusPill status={d.document_status}/></button><div className="docs-fast-stage-grid">{stages.length?stages.map(st=><label key={st.id} className="docs-fast-stage"><span>{st.stage_name}</span><select className={slug(st.status)} value={st.status} onChange={e=>updateStage(c,d,st,e.target.value)}>{STAGE_STATUSES.map(x=><option key={x}>{x}</option>)}</select><input className="docs-stage-date" type="date" value={String(st.milestone_date||'').slice(0,10)} onChange={e=>updateStageDate?.(c,d,st,e.target.value)}/></label>):<span className="docs-no-stages">No stages</span>}</div></article>):<Empty text="No documents match the current search and filters"/>}</div>
      <Pagination/>
    </div>
  </section>
}

const GOOGLE_DOC_NAMES={EDU:'Degree Certificate',ML:'Mark List',MRG:'Marriage Certificate',PCC:'Police Clearance Certificate',BRT:'Birth Certificate',BIRTH:'Birth Certificate',BRTH:'Birth Certificate',BT:'Birth Certificate',TC:'Transfer Certificate',EXP:'Experience Certificate',POA:'Power of Attorney',SSLC:'SSLC Certificate','10TH':'10th Certificate','PLUS TWO':'Plus Two Certificate',PLUSTWO:'Plus Two Certificate','+2':'Plus Two Certificate',PROGRESS:'Progress Card','PROGRESS CARD':'Progress Card',MEDICAL:'Medical Certificate',SALARY:'Salary Certificate',SLRY:'Salary Certificate',DEATH:'Death Certificate',CL:'Certificate / Letter',TRN:'Translation'};
function googleDocTokens(raw,totalQty){
  let text=cleanText(raw).toUpperCase().replace(/\s*\+\s*2\b/g,' PLUS TWO ');
  if(!text||text==='-')return [];
  let parts=text.split(/[,;/]+/).map(x=>x.trim()).filter(Boolean);
  if(parts.length===1&&/^(EDU|ML|MRG|PCC|BRT|BIRTH|TC|EXP|POA|SSLC)\s+(EDU|ML|MRG|PCC|BRT|BIRTH|TC|EXP|POA|SSLC)$/.test(parts[0]))parts=parts[0].split(/\s+/);
  const cleaned=parts.map(x=>x.replace(/\s*\((?:DD|\d+)\)\s*/g,'').replace(/[- ]DD$/,'').trim()).filter(x=>x&&x!=='-');
  const qty=Math.max(0,Math.round(num(totalQty)));
  while(qty>cleaned.length&&cleaned.length)cleaned.push(cleaned[cleaned.length-1]);
  return cleaned.slice(0,qty||cleaned.length).map((code,i)=>{const original=parts[Math.min(i,parts.length-1)]||code;const directToDelhi=/\bDD\b|CUSTOMER TO DELHI/i.test(`${original} ${raw||''}`);return {code,name:GOOGLE_DOC_NAMES[code]||code.replace(/\b\w/g,m=>m.toUpperCase()),directToDelhi};});
}
function googleRowIsDD(g){return /\bDD\b|CUSTOMER TO DELHI/i.test([g?.['Current Status'],g?.['DOCUMENTS (Short code, Seperated by comma)'],g?.['SERVICE (Codes eg: Complete Means MEA, SDM, Embassy of India, MOFA Qatar)'],g?.['NOTES']].join(' '))}
function googleDDQuantity(g){const toks=googleDocTokens(g?.['DOCUMENTS (Short code, Seperated by comma)'],g?.['Total Documents Quantity']);const marked=toks.filter(t=>t.directToDelhi).length;return marked|| (googleRowIsDD(g)?Math.max(1,Math.round(num(g?.['Total Documents Quantity']))||toks.length||1):0)}
function googleServiceStages(raw){
  const s=cleanText(raw).toUpperCase().replace(/\s+/g,' ').trim(); if(!s||s==='-')return [];
  if(/COMPLETE/.test(s))return ['SDM','MEA India','Embassy of India','MOFA Qatar'];
  const out=[];
  if(/NOTO?RY|NOTARY/.test(s))out.push('Notary');
  if(/\bSDM\b/.test(s))out.push('SDM');
  if(/\bMEA\b/.test(s))out.push('MEA India');
  if(/QATAR EMBASS|EMBES/.test(s))out.push('Qatar Embassy');
  if(/INDIA.*EMBASS|EMBASSY OF INDIA/.test(s))out.push('Embassy of India');
  if(/CHAMBER/.test(s))out.push('Chamber');
  if(/MOE|MINISTRY OF EDU/.test(s))out.push('Ministry of Education');
  if(/MOI/.test(s))out.push('MOI');
  if(/MOPH/.test(s))out.push('MOPH');
  if(/LABOUR|LBR/.test(s))out.push('Labour');
  if(/MOFA/.test(s))out.push('MOFA Qatar');
  return [...new Set(out)];
}
function googleStageStatus(current){const s=cleanText(current).toUpperCase();return /\b(RDL|DLD|DELIVERED|READY FOR DELIVERY)\b/.test(s)?'Completed':'Pending'}
function trackingFamily(v){const t=cleanTracking(v);return t.split('/')[0]||t}
function looksLikePhone(v){const s=cleanText(v);const digits=s.replace(/\D/g,'');return digits.length>=7&&digits.length<=15}
function accountFromGoogle(g){const m=cleanText(g?.['MOB NO']);return m&&!looksLikePhone(m)&&/[A-Za-z]/.test(m)?m:null}
function extractStatusDate(raw){
  const s=cleanText(raw); if(!s)return null;
  const m=s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/); if(!m)return null;
  const y=m[3].length===2?2000+Number(m[3]):Number(m[3]); return isoDate(`${m[1]}/${m[2]}/${y}`);
}
function normalizeOperationalStatus(raw){
  const original=cleanText(raw),u=original.toUpperCase().replace(/[_]+/g,' ').replace(/\s+/g,' ').trim();
  const code=(u.match(/^[A-Z]+(?:-[A-Z]+)?/)||[])[0]||u;
  let milestone=original||'Submitted',overall='Under Process';
  if(!u||u==='-'||u==='SUBMITTED'){milestone='Submitted';overall='Received'}
  else if(/^DLD(?=\d|[\s.\/-]|$)|DELIVERED/.test(u)){milestone='Delivered';overall='Delivered'}
  else if(/^RDL(?=\d|[\s.\/-]|$)|READY FOR DELIVERY/.test(u)){milestone='Ready for Delivery';overall='Ready for Delivery'}
  else if(/\bR-?RTN\b|READY TO RETURN/.test(u)){milestone='Ready to Return';overall='Waiting'}
  else if(/^RTN\b|\bRETURNED\b/.test(u)){milestone='Returned';overall='Returned'}
  else if(/CANCEL/.test(u)){milestone='Cancelled';overall='Cancelled'}
  else if(/RETUNED|RETUR?NED/.test(u)){milestone='Returned';overall='Returned'}
  else if(/^R\s*-?\s*(?:NOT|NOTARY|NOTRY|NOTORY)\b/.test(u)){milestone='Ready for Notary';overall='Under Process'}
  else if(/^R-CHAMBER\b/.test(u)){milestone='Ready for Chamber';overall='Under Process'}
  else if(/^R-(?:LBR|LABOUR)\b/.test(u)){milestone='Ready for Labour';overall='Under Process'}
  else if(/^R-KSA\b/.test(u)){milestone='Ready for Saudi Embassy';overall='Under Process'}
  else if(/^R\s*-?\s*QATAR EMBASSY\b/.test(u)){milestone='Ready for Qatar Embassy';overall='Under Process'}
  else if(/^R-KUWAIT\b/.test(u)){milestone='Ready for Kuwait Embassy';overall='Under Process'}
  else if(/^R-VFS\b/.test(u)){milestone='Ready for VFS';overall='Under Process'}
  else if(/^R-MOEHE\b/.test(u)){milestone='Ready for MOEHE';overall='Under Process'}
  else if(/^R-MEA\b/.test(u)){milestone='Ready for Courier';overall='Under Process'}
  else if(/^DD\b|CUSTOMER TO DELHI/.test(u)){milestone='Customer to Delhi';overall='Under Process'}
  else if(/^MEA\b/.test(u)){milestone='On Courier to Delhi';overall='Under Process'}
  else if(/^RC\b/.test(u)){milestone='Received / Processing in Delhi';overall='Under Process'}
  else if(/^OC\b/.test(u)){milestone='On Courier from Delhi to Doha';overall='Under Process'}
  else if(/^RSY\b/.test(u)){milestone='Ready for Embassy Submission';overall='Under Process'}
  else if(/^DCE\b/.test(u)){milestone='Delivered to Customer for Embassy';overall='Waiting'}
  else if(/^RSK\b/.test(u)){milestone='Returned After Embassy';overall='Under Process'}
  else if(/^R-MOFA\b/.test(u)){milestone='Ready for MOFA';overall='Under Process'}
  else if(/^ISY\b/.test(u)){milestone='Submitted in Embassy';overall='Under Process'}
  else if(/^CID\b/.test(u)){milestone='Submitted in CID';overall='Under Process'}
  else if(/^R\s*-?\s*UAE\b/.test(u)){milestone='Ready for UAE Embassy Submission';overall='Under Process'}
  else if(/^UAE\b/.test(u)){milestone='Submitted in UAE Embassy';overall='Under Process'}
  else if(/^R-MOE\b/.test(u)){milestone='Ready for MOE';overall='Under Process'}
  else if(/^MOE\b/.test(u)){milestone='Submitted in MOE';overall='Under Process'}
  else if(/^R-LEADS\b/.test(u)){milestone='Ready to Send for UK';overall='Under Process'}
  else if(/^LEADS\b/.test(u)){milestone='UK Processing';overall='Under Process'}
  else if(/^MOI\b/.test(u)){milestone='MOI Processing';overall='Under Process'}
  else if(/^LBR\b/.test(u)){milestone='Labour Processing';overall='Under Process'}
  else if(/^CHA\b/.test(u)){milestone='Chamber Processing';overall='Under Process'}
  else if(/^KSA\b/.test(u)){milestone='Saudi Embassy Processing';overall='Under Process'}
  else if(/^QTR\b/.test(u)){milestone='Qatar Embassy Processing';overall='Under Process'}
  return {original,code,milestone,overall,date:extractStatusDate(original),recognized:milestone!==original||['Submitted','Delivered','Cancelled'].includes(milestone)};
}
function importCutoffDefault(){return '2026-01-01'}
function billBranchFallback(bill,branches){const b=cleanBill(bill).toUpperCase();if(/^S\/A\//.test(b))return branchFor('Safari Branch',branches);if(/^A\/A\//.test(b))return branchFor('Al Khor Branch',branches);if(/^H\/A\//.test(b))return branchFor('Corporate Office',branches);return null}


const IMPORT_TYPES={
  master:{label:'Legacy Master',hint:'Legacy.xlsx',required:['Bill No','Customer','Reference']},
  billwise:{label:'Billwise Out',hint:'Billwise Out.xlsx',required:['Bill','Service']},
  statuswise:{label:'Status Wise',hint:'Status Wise.xlsx',required:['Bill','Service','Attestation','Status']},
  google:{label:'Google Sheet Export',hint:'Optional · Status export',required:['TRACKING','NAME']}
};
const cleanText=v=>String(v??'').trim();
const keyText=v=>cleanText(v).toLowerCase().replace(/\s+/g,' ');
const cleanBill=v=>cleanText(v).replace(/^#/,'').trim();
const cleanTracking=v=>{const x=cleanText(v);return x.endsWith('.0')?x.slice(0,-2):x};
const num=v=>{if(v==null||v==='')return 0;const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)?n:0};
function isoDate(v){
  if(v==null||v==='')return null;
  const sane=(y,m,d)=>{
    y=Number(y);m=Number(m);d=Number(d);
    if(!Number.isInteger(y)||y<1900||y>2100||!Number.isInteger(m)||m<1||m>12||!Number.isInteger(d)||d<1||d>31)return null;
    const dt=new Date(Date.UTC(y,m-1,d));
    if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)return null;
    return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  };
  if(v instanceof Date&&!isNaN(v))return sane(v.getFullYear(),v.getMonth()+1,v.getDate());
  if(typeof v==='number'){
    const d=XLSX.SSF.parse_date_code(v);
    return d?sane(d.y,d.m,d.d):null;
  }
  const t=cleanText(v);
  let m=t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if(m)return sane(m[3],m[2],m[1]);
  m=t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if(m)return sane(m[1],m[2],m[3]);
  m=t.match(/^(\d{1,2})[ -]([A-Za-z]{3,9})[ -,](\d{4})$/);
  if(m){
    const months={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
    const mm=months[m[2].toLowerCase()];
    return mm?sane(m[3],mm,m[1]):null;
  }
  return null;
}
function normalizeStage(v){
  const k=keyText(v).replace(/\./g,'');
  if(k==='mea'||k.includes('mea india')||k.includes('ministry of external'))return 'MEA India';
  if(k.includes('qatar mofa')||k==='mofa'||k.includes('mofa qatar'))return 'MOFA Qatar';
  if(k.includes('embassy'))return 'Embassy of India';
  if(k==='sdm'||k.includes('sub divisional'))return 'SDM';
  if(k.includes('notary'))return 'Notary';
  return cleanText(v)||'Other';
}
function normalizeStageStatus(v){
  const k=keyText(v);
  if(k.includes('complete')||k==='done')return 'Completed';
  if(k.includes('process'))return 'Processing';
  if(k.includes('not required')||k==='n/a'||k==='na')return 'Not Required';
  if(k.includes('cancel'))return 'Cancelled';
  return 'Pending';
}
function detectRows(matrix,type){
  const req=IMPORT_TYPES[type].required.map(x=>keyText(x));
  let hi=-1;
  for(let i=0;i<Math.min(matrix.length,15);i++){
    const row=(matrix[i]||[]).map(x=>keyText(x));
    if(req.every(x=>row.includes(x))){hi=i;break}
  }
  if(hi<0)throw new Error(`${IMPORT_TYPES[type].label}: expected columns not found (${IMPORT_TYPES[type].required.join(', ')})`);
  const headers=(matrix[hi]||[]).map(x=>cleanText(x));
  return matrix.slice(hi+1).filter(r=>(r||[]).some(v=>cleanText(v)!=='')).map(r=>Object.fromEntries(headers.map((h,j)=>[h,r[j]??''])));
}
async function parseExcelFile(file,type){
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:'array',cellDates:true});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});
  return detectRows(matrix,type);
}

async function extractPdfText(file){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  if(!pdfjs.GlobalWorkerOptions.workerSrc){
    pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
  }
  const data=new Uint8Array(await file.arrayBuffer());
  const pdf=await pdfjs.getDocument({data}).promise;
  const pages=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent();
    const groups=new Map();
    for(const it of tc.items||[]){
      if(!it?.str)continue;
      const y=Math.round(Number(it.transform?.[5]||0)/2)*2;
      if(!groups.has(y))groups.set(y,[]);
      groups.get(y).push({x:Number(it.transform?.[4]||0),str:String(it.str)});
    }
    const lines=[...groups.entries()].sort((a,b)=>b[0]-a[0]).map(([,items])=>items.sort((a,b)=>a.x-b.x).map(x=>x.str).join(' ').replace(/\s+/g,' ').trim()).filter(Boolean);
    pages.push(lines.join('\n'));
  }
  return pages.join('\n');
}
function pdfCleanValue(v){return String(v||'').replace(/\s+/g,' ').replace(/^[\s:–—-]+|[\s:–—-]+$/g,'').trim()}
function pdfFind(text,patterns){
  for(const pattern of patterns){
    const m=text.match(pattern);
    if(m?.[1])return pdfCleanValue(m[1]);
  }
  return '';
}
function parsePdfMoney(v){
  const n=Number(String(v||'').replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:0;
}
function parseInvoicePdf(file,text){
  const flat=String(text||'').replace(/\r/g,'\n');
  const compact=flat.replace(/[ \t]+/g,' ');
  const filenameInvoice=(file.name.match(/(?:^|[^\d])(\d{2,})(?:[^\d]|$)/)||[])[1]||'';

  // In the legacy billing PDF, the printed "TRACKING NO" is the software Bill No.
  // It is intentionally NOT used as the customer Tracking Reference.
  const printedBill=pdfFind(compact,[
    /TRACKING\s*(?:NO|NUMBER|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/._-]{1,30})/i,
    /BILL\s*(?:NO|NUMBER|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/._-]{1,30})/i,
    /INVOICE\s*(?:NO|NUMBER|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/._-]{1,30})/i
  ]);
  const customer=pdfFind(compact,[
    /CUSTOMER\s*NAME\s*[:\-]?\s*([^\n]{2,80})/i,
    /CUSTOMER\s*[:\-]?\s*([^\n]{2,80})/i,
    /NAME\s*[:\-]?\s*([^\n]{2,80})/i
  ]);
  const mobile=pdfFind(compact,[
    /(?:MOBILE|MOB|PHONE|TEL(?:EPHONE)?)\s*(?:NO|NUMBER)?\s*[:\-]?\s*(\+?\d[\d\s-]{6,17}\d)/i
  ]).replace(/[^\d+]/g,'');
  const invoiceDate=pdfFind(compact,[
    /(?:INVOICE\s*)?DATE\s*[:\-]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i
  ]);
  const total=parsePdfMoney(pdfFind(compact,[
    /GRAND\s*TOTAL\s*(?:QAR|QR)?\s*[:\-]?\s*([0-9,]+(?:\.\d{1,2})?)/i,
    /NET\s*TOTAL\s*(?:QAR|QR)?\s*[:\-]?\s*([0-9,]+(?:\.\d{1,2})?)/i,
    /TOTAL\s*(?:QAR|QR)?\s*[:\-]?\s*([0-9,]+(?:\.\d{1,2})?)/i
  ]));
  const paid=parsePdfMoney(pdfFind(compact,[
    /(?:PAID|ADVANCE(?:\s*PAID)?)\s*(?:QAR|QR)?\s*[:\-]?\s*([0-9,]+(?:\.\d{1,2})?)/i
  ]));
  const balance=parsePdfMoney(pdfFind(compact,[
    /BALANCE(?:\s*PAYMENT)?\s*(?:QAR|QR)?\s*[:\-]?\s*([0-9,]+(?:\.\d{1,2})?)/i
  ]));
  return {fileName:file.name,filenameInvoice,printedBill,customer,mobile,invoiceDate,total,paid,balance,text:flat};
}
function branchFor(raw,branches){
  const k=keyText(raw); if(!k)return null;
  const direct=branches.find(b=>keyText(b.name)===k); if(direct)return direct.id;
  if(k.includes('collection')||k.includes('pickup'))return branches.find(b=>keyText(b.name).includes('safari'))?.id||null;
  if(k.includes('safari'))return branches.find(b=>keyText(b.name).includes('safari'))?.id||null;
  if(k.includes('khor'))return branches.find(b=>keyText(b.name).includes('khor'))?.id||null;
  if(k.includes('corporate')||k.includes('head office')||k.includes('headoffice')||k.includes('main'))return branches.find(b=>keyText(b.name).includes('corporate'))?.id||null;
  return null;
}
function chunk(arr,n=80){const out=[];for(let i=0;i<arr.length;i+=n)out.push(arr.slice(i,i+n));return out}


const IMPORT_DRAFT_KEY='kenza_import_draft_v32';
const IMPORT_JOB_KEY='kenza_import_job_v32';
function importDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('kenza-tracker-imports',1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('state'))db.createObjectStore('state')};
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
async function idbSet(key,value){const db=await importDb();return new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,key);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
async function idbGet(key){const db=await importDb();return new Promise((resolve,reject)=>{const tx=db.transaction('state','readonly');const r=tx.objectStore('state').get(key);r.onsuccess=()=>{db.close();resolve(r.result||null)};r.onerror=()=>{db.close();reject(r.error)}})}
async function idbDel(key){const db=await importDb();return new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').delete(key);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}





function getLabelSize(){
  try{
    const v=JSON.parse(localStorage.getItem('kenza_label_size_v1')||'{}');
    return {width:Math.min(75,Math.max(50,Number(v.width)||75)),height:Math.min(35,Math.max(20,Number(v.height)||35))};
  }catch{return {width:75,height:35}}
}
function saveLabelSize(size){
  const next={width:Math.min(75,Math.max(50,Number(size.width)||75)),height:Math.min(35,Math.max(20,Number(size.height)||35))};
  localStorage.setItem('kenza_label_size_v1',JSON.stringify(next));
  return next;
}
function labelRemarks(c){
  const qty=(c.documents||[]).reduce((n,d)=>n+Math.max(1,Number(d.quantity||1)),0);
  const bal=Math.max(0,Number(c.balance_payment||0));
  return `${qty} ${qty===1?'doc':'docs'} · ${bal>0?`BAL QAR ${Number(bal).toLocaleString('en-US',{maximumFractionDigits:2})}`:'PAID'}`;
}
function labelToken(c){return `DOCOPS-CASE:${c.id}`}
async function labelQr(c,width=220){return QRCode.toDataURL(labelToken(c),{margin:0,width,errorCorrectionLevel:'M'})}

async function buildSingleLabelHtml(c){
  return buildLabelHtml([c]);
}
async function printSingleLabel(c){
  return printCaseLabels([c]);
}
async function buildLabelHtml(cases){
  cases=(cases||[]).filter(Boolean);
  const labelSize=getLabelSize();
  const slotMap=[
    {r:1,c:1},{r:1,c:2},{r:2,c:1},{r:2,c:2},{r:1,c:3,rs:2,rot:1},
    {r:3,c:1},{r:3,c:2},{r:4,c:1},{r:4,c:2},{r:3,c:3,rs:2,rot:1},
    {r:5,c:1},{r:5,c:2},{r:6,c:1},{r:6,c:2},{r:5,c:3,rs:2,rot:1},
    {r:7,c:1},{r:7,c:2}
  ];
  const pages=[];
  for(let p=0;p<cases.length;p+=17)pages.push(cases.slice(p,p+17));
  let body='';
  for(let p=0;p<pages.length;p++){
    const chunk=pages[p];
    let slots='';
    for(let i=0;i<chunk.length;i++){
      const c=chunk[i],sl=slotMap[i],qr=await labelQr(c,220);
      const rotated=!!sl.rot;
      slots+=`<div class="slot ${rotated?'portrait':''}" style="grid-row:${sl.r}${sl.rs?` / span ${sl.rs}`:''};grid-column:${sl.c}">
        <div class="sticker">
          <div class="sticker-inner">
            <div class="label-copy">
              <div class="mini-brand">${escapeHtml(configuredCompanyName().toUpperCase())}</div>
              <div class="label-row"><span>Track No.</span><b>#${escapeHtml(c.tracking_reference)}</b></div>
              <div class="label-row"><span>Name</span><b>${escapeHtml(c.customer_name||'—')}</b></div>
              <div class="label-row"><span>Mobile</span><b>${escapeHtml(c.mobile||'—')}</b></div>
              <div class="label-row remarks"><span>Remarks</span><b>${escapeHtml(labelRemarks(c))}</b></div>
            </div>
            <div class="label-qr"><img src="${qr}"><small>SCAN</small></div>
          </div>
        </div>
      </div>`;
    }
    body+=`<section class="sheet">${slots}</section>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Delivery Labels</title><style>
    @page{size:A4 portrait;margin:7mm}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,sans-serif}
    .sheet{width:196mm;height:283mm;display:grid;grid-template-columns:75mm 75mm 35mm;grid-template-rows:repeat(7,35mm);column-gap:3mm;row-gap:2mm;page-break-after:always;break-after:page}
    .sheet:last-child{page-break-after:auto;break-after:auto}
    .slot{width:75mm;height:35mm;display:flex;align-items:center;justify-content:flex-start}
    .slot.portrait{width:35mm;height:72mm;overflow:hidden;display:block}
    .sticker{width:${labelSize.width}mm;height:${labelSize.height}mm;border:.3mm solid #9ca3af;border-radius:1.5mm;overflow:hidden;background:#fff}
    .slot.portrait .sticker{transform-origin:top left;transform:translateX(35mm) rotate(90deg)}
    .sticker-inner{height:100%;display:grid;grid-template-columns:minmax(0,1fr) 24mm;gap:2mm;padding:2.2mm}
    .label-copy{min-width:0;display:grid;grid-template-rows:auto repeat(4,1fr)}
    .mini-brand{font-size:7pt;font-weight:800;color:#71823a;letter-spacing:.04em;border-bottom:.25mm solid #d1d5db;padding-bottom:.7mm;margin-bottom:.5mm}
    .label-row{display:grid;grid-template-columns:17mm minmax(0,1fr);align-items:center;min-width:0;font-size:7.4pt;border-bottom:.2mm solid #e5e7eb}
    .label-row:last-child{border-bottom:0}
    .label-row span{color:#6b7280}
    .label-row b{font-size:8pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .label-row.remarks b{font-size:6.6pt}
    .label-qr{display:flex;flex-direction:column;align-items:center;justify-content:center;border-left:.25mm solid #e5e7eb;padding-left:1.5mm}
    .label-qr img{width:18mm;height:18mm;display:block}
    .label-qr small{font-size:5.5pt;font-weight:700;margin-top:.5mm;letter-spacing:.08em}
    @media screen{body{background:#e5e7eb}.sheet{margin:8mm auto;background:#fff;box-shadow:0 3mm 10mm rgba(0,0,0,.12)}}
    @media print{body{background:#fff}.sheet{margin:0;box-shadow:none}}
  </style></head><body>${body}<script>window.onload=()=>setTimeout(()=>window.print(),450)<\/script></body></html>`;
}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
async function printCaseLabels(cases){
  cases=(cases||[]).filter(Boolean);
  if(!cases.length)return;
  const w=window.open('','_blank','width=1100,height=900');
  if(!w)return notifyAction('Popup blocked. Allow popups to print.','error');
  w.document.write('<p style="font-family:Arial;padding:20px">Preparing labels…</p>');
  const html=await buildLabelHtml(cases);
  w.document.open();w.document.write(html);w.document.close();
}

function CaseCartPicker({cases,selectedIds,onChange,title='Cases',placeholder='Search tracking number, customer, mobile or bill…'}){
  const [query,setQuery]=useState('');
  const normalized=query.trim(),selected=new Set(selectedIds||[]);
  const results=normalized?rankCaseSearchResults(cases.filter(c=>caseMatchesFieldSearch(c,normalized,'all',[c.tracking_reference,c.customer_name,c.mobile,c.bill_no,c.internal_invoice_no].join(' '))),normalized,'all').filter(c=>!selected.has(c.id)).slice(0,8):[];
  const add=id=>{if(!selected.has(id))onChange([...(selectedIds||[]),id]);setQuery('')};
  const remove=id=>onChange((selectedIds||[]).filter(x=>x!==id));
  return <div className="case-cart-picker wide">
    <div className="case-cart-head"><div><strong>{title}</strong><span>Search and add cases to the selection</span></div><b>{selected.size} selected</b></div>
    <div className="case-cart-search"><Icon name="search" size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={placeholder}/>{query&&<button type="button" onClick={()=>setQuery('')} aria-label="Clear search"><Icon name="close" size={14}/></button>}</div>
    {normalized&&<div className="case-cart-results">{results.length?results.map(c=><div key={c.id}><div><strong>#{c.tracking_reference}</strong><span>{c.customer_name||'Unnamed customer'}</span><small>{c.mobile||'No mobile'} · {c.branches?.name||'No branch'}{c.bill_no?` · ${c.bill_no}`:''}</small></div><button type="button" onClick={()=>add(c.id)}><Icon name="plus" size={14}/> Add</button></div>):<p>No matching unselected cases found.</p>}</div>}
    <div className="case-cart-basket">{(selectedIds||[]).map(id=>{const c=cases.find(x=>x.id===id);return c?<div key={id}><span><strong>#{c.tracking_reference}</strong><small>{c.customer_name||'Unnamed customer'} · {c.mobile||'No mobile'}</small></span><button type="button" onClick={()=>remove(id)} aria-label={`Remove ${c.tracking_reference}`}><Icon name="close" size={14}/></button></div>:null})}{!selected.size&&<div className="case-cart-empty"><Icon name="batch" size={20}/><span>No cases added yet</span></div>}</div>
  </div>
}

function AppointmentsView({session,cases,notify,seedCase,seedIds=[],clearSeed,setModuleExport}){
  const empty={id:'',case_id:'',document_id:'',stage_id:'',appointment_date:'',appointment_time:'',authority:'',location:'',assigned_to:'',status:'Scheduled',notes:''};
  const [rows,setRows]=useState([]),[form,setForm]=useState(empty),[open,setOpen]=useState(false),[bulkOpen,setBulkOpen]=useState(false),[bulkRefs,setBulkRefs]=useState([]),[busy,setBusy]=useState(false),[q,setQ]=useState(''),[searchBy,setSearchBy]=useState('tracking'),[from,setFrom]=useState(''),[to,setTo]=useState(''),[statusFilter,setStatusFilter]=useState(''),[selected,setSelected]=useState(new Set()),[bulkEdit,setBulkEdit]=useState(false),[bulkForm,setBulkForm]=useState({appointment_date:'',appointment_time:'',status:'',assigned_to:''});
  async function load(){const {data,error}=await supabase.from('appointments').select('*').order('appointment_date',{ascending:true}).order('appointment_time',{ascending:true});if(error){notify(userError(error));return}setRows(data||[])}
  useEffect(()=>{load()},[]);
  useEffect(()=>{if(seedCase){setForm({...empty,case_id:seedCase.id});setOpen(true);clearSeed?.()}else if(seedIds?.length){setBulkRefs(seedIds);setBulkOpen(true);clearSeed?.()}},[seedCase,seedIds?.join('|')]);
  const c=cases.find(x=>x.id===form.case_id),docs=c?.documents||[],doc=docs.find(x=>x.id===form.document_id),stages=doc?.document_stages||[];
  const today=new Date().toISOString().slice(0,10), future=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const stats={today:rows.filter(a=>a.appointment_date===today&&a.status!=='Cancelled').length,upcoming:rows.filter(a=>a.appointment_date>=today&&a.appointment_date<=future&&!['Completed','Cancelled'].includes(a.status)).length,overdue:rows.filter(a=>a.appointment_date<today&&!['Completed','Cancelled'].includes(a.status)).length,completed:rows.filter(a=>a.status==='Completed').length};
  const visible=rankCaseSearchResults(rows.filter(r=>{const cc=cases.find(x=>x.id===r.case_id);const hay=[cc?.tracking_reference,cc?.mobile,cc?.customer_name,cc?.bill_no,r.authority,r.assigned_to,r.notes,r.location].join(' ').toLowerCase();return(!cc||caseMatchesFieldSearch(cc,q,searchBy,hay))&&(!from||r.appointment_date>=from)&&(!to||r.appointment_date<=to)&&(!statusFilter||r.status===statusFilter)}),q,searchBy,r=>cases.find(x=>x.id===r.case_id),r=>[r.authority,r.assigned_to,r.notes,r.location].join(' '));
  const groups=visible.reduce((a,r)=>{(a[r.appointment_date||'No date']??=[]).push(r);return a},{});
  useEffect(()=>setModuleExport?.({view:'appointments',title:'Appointments Export',rows:visible.map(r=>{const cc=cases.find(x=>x.id===r.case_id);return{'Date':r.appointment_date||'','Time':r.appointment_time||'','Tracking No.':cc?.tracking_reference||'','Customer':cc?.customer_name||'','Mobile':cc?.mobile||'','Authority':r.authority||'','Location':r.location||'','Assigned To':r.assigned_to||'','Status':r.status||'','Notes':r.notes||''}})}),[visible,cases,setModuleExport]);
  async function save(e){e.preventDefault();setBusy(true);const payload={case_id:form.case_id,document_id:form.document_id||null,stage_id:form.stage_id||null,appointment_date:form.appointment_date,appointment_time:form.appointment_time||null,authority:form.authority||null,location:form.location||null,assigned_to:form.assigned_to||null,status:form.status,notes:form.notes||null,updated_by:session.user.id};let error;if(form.id)({error}=await supabase.from('appointments').update(payload).eq('id',form.id));else({error}=await supabase.from('appointments').insert({...payload,created_by:session.user.id}));setBusy(false);if(error)return notify(userError(error));setOpen(false);setForm(empty);notify(form.id?'Appointment updated.':'Appointment created.');load()}
  async function del(id){if(!confirm('Delete this appointment?'))return;const {error}=await supabase.from('appointments').delete().eq('id',id);if(error)return notify(userError(error));setSelected(p=>{const n=new Set(p);n.delete(id);return n});load()}
  async function setStatus(id,status){setRows(x=>x.map(r=>r.id===id?{...r,status}:r));const {error}=await supabase.from('appointments').update({status,updated_by:session.user.id,updated_at:new Date().toISOString()}).eq('id',id);if(error){notify(userError(error));load()}}
  async function bulkCreate(e){e.preventDefault();if(!bulkRefs.length)return;setBusy(true);const rowsToInsert=bulkRefs.map(id=>({case_id:id,appointment_date:bulkForm.appointment_date,appointment_time:bulkForm.appointment_time||null,authority:bulkForm.authority||null,location:bulkForm.location||null,assigned_to:bulkForm.assigned_to||null,status:'Scheduled',notes:bulkForm.notes||null,created_by:session.user.id,updated_by:session.user.id}));const {error}=await supabase.from('appointments').insert(rowsToInsert);setBusy(false);if(error)return notify(userError(error));setBulkOpen(false);setBulkRefs([]);notify(`${rowsToInsert.length} appointments created.`);load()}
  async function applyBulk(){if(!selected.size)return;const patch={updated_by:session.user.id,updated_at:new Date().toISOString()};if(bulkForm.appointment_date)patch.appointment_date=bulkForm.appointment_date;if(bulkForm.appointment_time)patch.appointment_time=bulkForm.appointment_time;if(bulkForm.status)patch.status=bulkForm.status;if(bulkForm.assigned_to)patch.assigned_to=bulkForm.assigned_to;const {error}=await supabase.from('appointments').update(patch).in('id',[...selected]);if(error)return notify(userError(error));notify(`${selected.size} appointment(s) updated.`);setSelected(new Set());setBulkEdit(false);load()}
  return <section className="appt-manager"><div className="module-titlebar"><div><h1>Appointment Manager</h1><p>Manage appointments by case, document and attestation stage with date, time, authority, assignee and status.</p></div><div><button className="secondary" onClick={()=>{setBulkRefs([]);setBulkOpen(true)}}>+ Bulk Add</button><button className="primary" onClick={()=>{setForm(empty);setOpen(true)}}>+ New Appointment</button></div></div><div className="appt-stats legacy4"><div><span>TODAY</span><strong>{stats.today}</strong><small>Scheduled today</small></div><div><span>UPCOMING</span><strong>{stats.upcoming}</strong><small>Next 30 days</small></div><div><span>OVERDUE</span><strong>{stats.overdue}</strong><small>Not completed</small></div><div><span>COMPLETED</span><strong>{stats.completed}</strong><small>Appointments done</small></div></div><div className="panel appt-panel"><div className="appt-filterbar"><SearchBySelect value={searchBy} onChange={setSearchBy}/><input className="search" placeholder="Search tracking, mobile, customer, authority, assignee, notes..." value={q} onChange={e=>setQ(e.target.value)}/><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/><input type="date" value={to} onChange={e=>setTo(e.target.value)}/><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All statuses</option>{['Scheduled','Confirmed','Completed','Cancelled','Missed'].map(x=><option key={x}>{x}</option>)}</select><button className="secondary" onClick={()=>{setQ('');setFrom('');setTo('');setStatusFilter('')}}>Clear</button><button className="secondary" onClick={()=>setSelected(new Set(visible.map(x=>x.id)))}>Select visible</button><button className="secondary" onClick={()=>setSelected(new Set())}>Clear selection</button></div><div className="appt-bulkrow"><button className="primary" onClick={()=>setBulkEdit(true)}>Bulk reschedule / status</button><span>{selected.size} selected</span></div><div className="appt-list">{Object.entries(groups).map(([date,items])=><div className="appt-date-group" key={date}><div className="appt-date-title">{fmtDate(date)}</div><div className="appt-grid">{items.map(r=>{const cc=cases.find(x=>x.id===r.case_id);const overdue=r.appointment_date<today&&!['Completed','Cancelled'].includes(r.status);return <article className={`appt-card ${overdue?'overdue':r.appointment_date===today?'today':'upcoming'}`} key={r.id}><div className="appt-card-head"><div><input type="checkbox" checked={selected.has(r.id)} onChange={()=>setSelected(p=>{const n=new Set(p);n.has(r.id)?n.delete(r.id):n.add(r.id);return n})}/><h3>{r.authority||'Appointment'}</h3><span>#{cc?.tracking_reference||'—'} · {cc?.customer_name||''}</span></div><StatusPill status={r.status}/></div><div className="appt-meta"><span>Time: <b>{r.appointment_time||'—'}</b></span><span>Assigned: <b>{r.assigned_to||'—'}</b></span><span>Location: <b>{r.location||'—'}</b></span><span>{r.stage_id?'Stage linked':r.document_id?'Document linked':'Whole case'}</span></div>{r.notes&&<p>{r.notes}</p>}<div className="appt-actions"><button className="primary tiny" onClick={()=>{setForm({...empty,...r});setOpen(true)}}>Edit</button><button className="secondary tiny" onClick={()=>setStatus(r.id,'Completed')}>Complete</button><button className="danger tiny" onClick={()=>del(r.id)}>Delete</button></div></article>})}</div></div>)}{!visible.length&&<div className="empty">No appointments match the current filters.</div>}</div></div>
  {open&&<Modal title={form.id?'Edit Appointment':'New Appointment'} subtitle="Link the booking to a case, document or exact stage." onClose={()=>{setOpen(false);setForm(empty)}}><form className="form-grid" onSubmit={save}><Field label="Case" wide><select required value={form.case_id} onChange={e=>setForm({...form,case_id:e.target.value,document_id:'',stage_id:''})}><option value="">Select case</option>{cases.map(x=><option key={x.id} value={x.id}>{x.tracking_reference} · {x.customer_name}</option>)}</select></Field><Field label="Date"><input required type="date" value={form.appointment_date} onChange={e=>setForm({...form,appointment_date:e.target.value})}/></Field><Field label="Time"><input type="time" value={form.appointment_time||''} onChange={e=>setForm({...form,appointment_time:e.target.value})}/></Field><Field label="Authority"><input value={form.authority||''} onChange={e=>setForm({...form,authority:e.target.value})}/></Field><Field label="Location"><input value={form.location||''} onChange={e=>setForm({...form,location:e.target.value})}/></Field><Field label="Assigned To"><input value={form.assigned_to||''} onChange={e=>setForm({...form,assigned_to:e.target.value})}/></Field><Field label="Status"><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{['Scheduled','Confirmed','Completed','Cancelled','Missed'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Document"><select value={form.document_id||''} onChange={e=>setForm({...form,document_id:e.target.value,stage_id:''})}><option value="">Whole case</option>{docs.map(d=><option key={d.id} value={d.id}>{d.document_name}</option>)}</select></Field><Field label="Stage"><select value={form.stage_id||''} onChange={e=>setForm({...form,stage_id:e.target.value})}><option value="">No exact stage</option>{stages.map(st=><option key={st.id} value={st.id}>{st.stage_name}</option>)}</select></Field><Field label="Notes" wide><textarea rows="3" value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></Field><div className="modal-actions wide"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary" disabled={busy}>{busy?'Saving…':'Save Appointment'}</button></div></form></Modal>}
  {bulkOpen&&<Modal className="bulk-appointment-modal" title="Bulk Add Appointments" subtitle="Search cases, add them to the selection, then create one appointment schedule." onClose={()=>setBulkOpen(false)}><form className="form-grid bulk-appointment-form" onSubmit={bulkCreate}><CaseCartPicker cases={cases} selectedIds={bulkRefs} onChange={setBulkRefs} title="Appointment cases"/><Field label="Date"><input required type="date" value={bulkForm.appointment_date||''} onChange={e=>setBulkForm({...bulkForm,appointment_date:e.target.value})}/></Field><Field label="Time"><input type="time" value={bulkForm.appointment_time||''} onChange={e=>setBulkForm({...bulkForm,appointment_time:e.target.value})}/></Field><Field label="Authority"><input value={bulkForm.authority||''} onChange={e=>setBulkForm({...bulkForm,authority:e.target.value})}/></Field><Field label="Location"><input value={bulkForm.location||''} onChange={e=>setBulkForm({...bulkForm,location:e.target.value})}/></Field><Field label="Assigned To"><input value={bulkForm.assigned_to||''} onChange={e=>setBulkForm({...bulkForm,assigned_to:e.target.value})}/></Field><Field label="Notes" wide><textarea rows="3" value={bulkForm.notes||''} onChange={e=>setBulkForm({...bulkForm,notes:e.target.value})}/></Field><div className="modal-actions wide"><button type="button" className="secondary" onClick={()=>setBulkOpen(false)}>Cancel</button><button className="primary" disabled={busy||!bulkRefs.length}>{busy?'Creating…':`Create ${bulkRefs.length||''} Appointment${bulkRefs.length===1?'':'s'}`}</button></div></form></Modal>}
  {bulkEdit&&<Modal title="Bulk reschedule / status" subtitle={`${selected.size} selected appointment(s)`} onClose={()=>setBulkEdit(false)}><div className="form-grid"><Field label="New date"><input type="date" value={bulkForm.appointment_date||''} onChange={e=>setBulkForm({...bulkForm,appointment_date:e.target.value})}/></Field><Field label="New time"><input type="time" value={bulkForm.appointment_time||''} onChange={e=>setBulkForm({...bulkForm,appointment_time:e.target.value})}/></Field><Field label="New status"><select value={bulkForm.status||''} onChange={e=>setBulkForm({...bulkForm,status:e.target.value})}><option value="">Do not change</option>{['Scheduled','Confirmed','Completed','Cancelled','Missed'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Assigned To"><input value={bulkForm.assigned_to||''} onChange={e=>setBulkForm({...bulkForm,assigned_to:e.target.value})}/></Field><div className="modal-actions wide"><button className="secondary" onClick={()=>setBulkEdit(false)}>Cancel</button><button className="primary" onClick={applyBulk}>Apply to selected</button></div></div></Modal>}
  </section>
}


function batchReportPrintHtml(batch,items){
  const rows=items||[];
  const brand=printBrand();
  const totalQty=rows.reduce((n,i)=>n+Number(i.quantity||0),0);
  const totalAmt=rows.reduce((n,i)=>n+Number(i.amount||0),0);
  const date=batch?.batch_date?new Date(batch.batch_date+'T00:00:00').toLocaleDateString('en-GB').replaceAll('/','.'):'';
  const title=batch?.report_name||`${batch?.batch_type||'Batch'} ${batch?.batch_date||''}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
  @page{size:A4 portrait;margin:10mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  html,body{margin:0;padding:0;background:#eef3fa;color:#17233b;font-family:Arial,sans-serif}.page{width:100%;max-width:190mm;min-height:277mm;margin:0 auto;background:#fff;border-radius:5mm;overflow:hidden;box-shadow:0 4mm 14mm rgba(18,39,76,.12)}
  .hero{position:relative;padding:9mm 10mm 8mm;color:#fff;background:linear-gradient(125deg,${brand.secondary} 0%,${brand.primary} 70%,${brand.accent} 100%)}.hero:after{content:"";position:absolute;right:-14mm;top:-18mm;width:54mm;height:54mm;border:9mm solid rgba(255,255,255,.08);border-radius:50%}.brand{font-size:8.5pt;font-weight:900;letter-spacing:.12em;text-transform:uppercase;opacity:.86}.hero h1{margin:3mm 0 1mm;font-size:22pt;line-height:1.08}.hero p{margin:0;font-size:9pt;opacity:.84}.type{position:absolute;right:10mm;bottom:8mm;padding:2.2mm 3.4mm;border:1px solid rgba(255,255,255,.28);border-radius:99mm;background:rgba(8,30,68,.18);font-size:8pt;font-weight:800}
  .title-bar{display:flex;align-items:center;justify-content:space-between;gap:6mm;padding:4mm 10mm;color:#16345f;background:linear-gradient(90deg,#eaf2ff,#f2fbf8);border-bottom:.3mm solid #d9e4f2}.title-bar small,.title-bar strong{display:block}.title-bar small{font-size:6.5pt;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:${brand.primary}}.title-bar strong{margin-top:1mm;font-size:12pt}.title-bar span{padding:2mm 3mm;border-radius:99mm;color:#fff;background:${brand.primary};font-size:7pt;font-weight:850}
  .meta{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:.3mm solid #dfe6f1}.meta div{padding:4mm 5mm;border-right:.3mm solid #e5eaf2}.meta div:last-child{border:0}.meta small,.summary small{display:block;margin-bottom:1.2mm;color:#7c899f;font-size:6.8pt;font-weight:900;letter-spacing:.09em;text-transform:uppercase}.meta strong{font-size:9.5pt}
  .content{padding:7mm 8mm 8mm}table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:8.6pt;border:.3mm solid #dce4ef;border-radius:3mm;overflow:hidden}th,td{padding:2.8mm 2.5mm;vertical-align:middle;overflow:hidden;text-overflow:ellipsis}thead th{color:#fff;background:#132d55;font-size:6.8pt;font-weight:900;letter-spacing:.07em;text-align:left;text-transform:uppercase}tbody td{border-bottom:.25mm solid #e7ecf3}tbody tr:nth-child(even) td{background:#f6f9fd}tbody tr:last-child td{border-bottom:0}.track{color:#245ec5;font-weight:900}.num{text-align:center}.amount{text-align:right;font-weight:800}.cols th:nth-child(1){width:14%}.cols th:nth-child(2){width:31%}.cols th:nth-child(3){width:8%}.cols th:nth-child(4){width:13%}.cols th:nth-child(5){width:19%}.cols th:nth-child(6){width:15%}
  .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin-top:5mm}.summary div{padding:3.5mm 4mm;border:1px solid #dae4f1;border-radius:2.5mm;background:linear-gradient(145deg,#f8fbff,#eef4fb)}.summary strong{display:block;color:#163662;font-size:14pt}.summary div:last-child{background:linear-gradient(135deg,#e8f8f3,#edf6ff)}
  .notes{margin-top:4mm;padding:3.5mm 4mm;border-left:1.2mm solid ${brand.primary};border-radius:1.5mm;background:#f3f7fd;font-size:8.5pt;line-height:1.5}.sign{display:grid;grid-template-columns:1fr 1fr;gap:18mm;margin-top:15mm}.sign div{padding-top:2mm;border-top:.3mm solid #8e9bb0;color:#65738a;font-size:7pt}.footer{display:flex;justify-content:space-between;margin-top:7mm;padding-top:3mm;border-top:.3mm solid #e3e8f0;color:#8995a7;font-size:6.8pt}
  @media print{html,body{background:#fff}.page{max-width:none;min-height:0;box-shadow:none}}
  </style></head><body><div class="page"><header class="hero"><div class="brand">${escapeHtml(configuredCompanyName())}</div><h1>Batch Operations Report</h1><p>Verified operational record</p><span class="type">${escapeHtml(batch?.batch_type||'Operational batch')}</span></header><section class="title-bar"><div><small>REPORT TITLE</small><strong>${escapeHtml(title)}</strong></div><span>${rows.length} RECORD${rows.length===1?'':'S'}</span></section><section class="meta"><div><small>Report date</small><strong>${escapeHtml(date||'—')}</strong></div><div><small>Session</small><strong>${escapeHtml(batch?.session_name||'—')}</strong></div><div><small>Assigned to</small><strong>${escapeHtml(batch?.assigned_to||'—')}</strong></div><div><small>Records</small><strong>${rows.length}</strong></div></section><main class="content"><table><thead><tr class="cols"><th>Tracking</th><th>Customer / Name</th><th>Qty</th><th>Amount</th><th>Card / Reference</th><th>Remarks</th></tr></thead><tbody>${rows.map(i=>`<tr><td class="track">#${escapeHtml(i.manual_tracking||'—')}</td><td>${escapeHtml(i.manual_name||'—')}</td><td class="num">${Number(i.quantity||0)}</td><td class="amount">${Number(i.amount||0).toFixed(2)}</td><td>${escapeHtml(i.card_reference||'—')}</td><td>${escapeHtml(i.remarks||'—')}</td></tr>`).join('')||'<tr><td colspan="6" class="num">No batch items</td></tr>'}</tbody></table><section class="summary"><div><small>Total records</small><strong>${rows.length}</strong></div><div><small>Total quantity</small><strong>${totalQty}</strong></div><div><small>Total amount</small><strong>QAR ${totalAmt.toFixed(2)}</strong></div></section>${batch?.notes?`<div class="notes"><b>Notes</b><br>${escapeHtml(batch.notes)}</div>`:''}<section class="sign"><div>Prepared by / Date</div><div>Verified by / Date</div></section><footer class="footer"><span>${escapeHtml(configuredCompanyName())} · Operations</span><span>Generated ${escapeHtml(new Date().toLocaleString('en-GB'))}</span></footer></main></div>
  <script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`;
}
function printBatchReport(batch,items){
  const w=window.open('','_blank','width=1100,height=900');
  if(!w)return notifyAction('Please allow pop-ups to print the batch report.','error');
  w.document.open();w.document.write(batchReportPrintHtml(batch,items));w.document.close();
}
function BatchReportsView({session,cases,notify,seedIds,clearSeed,setModuleExport}){
  const empty={id:'',report_name:'',batch_type:'',batch_date:new Date().toISOString().slice(0,10),session_name:'',assigned_to:'',default_price:'',card_reference:'',case_status:'',stage_actions:[],notes:'',refs:[],refs_text:''};
  const [rows,setRows]=useState([]),[q,setQ]=useState(''),[searchBy,setSearchBy]=useState('tracking'),[type,setType]=useState(''),[edit,setEdit]=useState(null),[view,setView]=useState(null),[draftItems,setDraftItems]=useState([]),[busy,setBusy]=useState(false);

  async function load(){
    const {data,error}=await supabase.from('batch_reports').select('*,batch_report_items!batch_report_items_batch_id_fkey(*)').order('batch_date',{ascending:false});
    if(error)return notify(userError(error));
    setRows(data||[]);
  }
  useEffect(()=>{load()},[]);
  useEffect(()=>{if(seedIds?.length){setEdit({...empty,refs:seedIds,refs_text:refsText(seedIds)});clearSeed?.()}},[seedIds?.join('|')]);

    const filtered=rows.filter(b=>{
    const linkedCases=(b.batch_report_items||[]).map(i=>cases.find(x=>x.id===i.case_id)).filter(Boolean);
    const hay=[b.report_name,b.batch_type,b.batch_date,b.session_name,b.assigned_to,...(b.batch_report_items||[]).flatMap(i=>{
      const c=cases.find(x=>x.id===i.case_id);
      return[c?.tracking_reference,c?.customer_name,i.manual_tracking,i.manual_name,i.card_reference,i.remarks]
    })].join(' ').toLowerCase();
    const searchPass=!q||(searchBy==='all'?hay.includes(q.toLowerCase()):linkedCases.some(c=>caseMatchesFieldSearch(c,q,searchBy,hay))||(searchBy==='tracking'&&(b.batch_report_items||[]).some(i=>normalizeSearch(i.manual_tracking)===normalizeSearch(q))));
    return searchPass&&(!type||b.batch_type===type)
  });
  useEffect(()=>setModuleExport?.({view:'batches',title:'Batch Reports Export',rows:filtered.flatMap(b=>(b.batch_report_items||[]).map(i=>{const c=cases.find(x=>x.id===i.case_id);return{'Batch':b.report_name||'','Batch Type':b.batch_type||'','Batch Date':b.batch_date||'','Session':b.session_name||'','Assigned To':b.assigned_to||'','Tracking No.':i.manual_tracking||c?.tracking_reference||'','Customer':i.manual_name||c?.customer_name||'','Quantity':Number(i.quantity||0),'Amount (QAR)':Number(i.amount||0),'Card Reference':i.card_reference||b.card_reference||'','Remarks':i.remarks||''}}))}),[filtered,cases,setModuleExport]);

  function refsText(ids){return(ids||[]).map(id=>cases.find(c=>c.id===id)?.tracking_reference).filter(Boolean).join('\n')}
  function resolveRefs(text){
    const tokens=String(text||'').split(/[\n,]+/).map(x=>x.trim().replace(/^#/,'')).filter(Boolean);
    const ids=[],unmatched=[];
    for(const token of tokens){
      const found=cases.find(c=>normalizeSearch(c.tracking_reference)===normalizeSearch(token));
      if(found&&!ids.includes(found.id))ids.push(found.id);else if(!found)unmatched.push(token);
    }
    return{ids,unmatched};
  }

  async function saveSetup(e){
    e.preventDefault();setBusy(true);
    const targetRefs=[...new Set(edit.refs||[])].filter(id=>cases.some(c=>c.id===id));
    if(!targetRefs.length){setBusy(false);return notify('Add at least one case to create this batch report.')}
    const payload={report_name:edit.report_name,batch_type:edit.batch_type,batch_date:edit.batch_date,session_name:edit.session_name||null,assigned_to:edit.assigned_to||null,default_price:Number(edit.default_price||0),card_reference:edit.card_reference||null,case_status:edit.case_status||null,stage_actions:edit.stage_actions||[],notes:edit.notes||null,updated_by:session.user.id,updated_at:new Date().toISOString()};
    let batchId=edit.id,error;
    if(edit.id)({error}=await supabase.from('batch_reports').update(payload).eq('id',edit.id));
    else{
      const r=await supabase.from('batch_reports').insert({...payload,created_by:session.user.id}).select('id').single();
      error=r.error;batchId=r.data?.id;
    }
    if(error){setBusy(false);return notify(userError(error))}
    if(targetRefs.length){
      await supabase.from('batch_report_items').delete().eq('batch_id',batchId);
      const ins=targetRefs.map((id,i)=>{
        const c=cases.find(x=>x.id===id);
        const qty=(c?.documents||[]).reduce((n,d)=>n+Math.max(1,Number(d.quantity||1)),0)||1;
        return{batch_id:batchId,case_id:id,sort_order:i+1,quantity:qty,amount:qty*Number(edit.default_price||0),card_reference:edit.card_reference||null,remarks:c?.branches?.name||'',manual_tracking:c?.tracking_reference||'',manual_name:c?.customer_name||'',notes:null}
      });
      const ri=await supabase.from('batch_report_items').insert(ins);
      if(ri.error){setBusy(false);return notify(userError(ri.error))}
      if(edit.case_status)await supabase.from('cases').update({overall_status:edit.case_status,updated_by:session.user.id}).in('id',targetRefs);
      for(const a of edit.stage_actions||[]){
        if(!a.stage_name||!a.status)continue;
        const stageIds=targetRefs.flatMap(id=>cases.find(c=>c.id===id)?.documents||[]).flatMap(d=>d.document_stages||[]).filter(st=>st.stage_name===a.stage_name).map(st=>st.id);
        if(stageIds.length)await supabase.from('document_stages').update({status:a.status,is_manual_override:true,updated_by:session.user.id}).in('id',stageIds);
      }
    }
    setBusy(false);setEdit(null);notify(edit.id?'Batch updated.':'Batch created.');load();
  }

  function openPrint(b){
    const its=[...(b.batch_report_items||[])].sort((a,z)=>a.sort_order-z.sort_order).map(i=>{
      const c=cases.find(x=>x.id===i.case_id);
      return{...i,manual_tracking:i.manual_tracking||c?.tracking_reference||'',manual_name:i.manual_name||c?.customer_name||'',card_reference:i.card_reference||b.card_reference||'',remarks:i.remarks||c?.branches?.name||''}
    });
    setDraftItems(its);setView(b);
  }

  async function saveRows(){
    const payload=draftItems.map((i,idx)=>({id:i.id,batch_id:view.id,case_id:i.case_id,document_id:i.document_id||null,stage_id:i.stage_id||null,sort_order:idx+1,quantity:Number(i.quantity||0),amount:Number(i.amount||0),card_reference:i.card_reference||null,remarks:i.remarks||null,manual_tracking:i.manual_tracking||null,manual_name:i.manual_name||null,notes:i.notes||null}));
    const {error}=await supabase.from('batch_report_items').upsert(payload,{onConflict:'id'});
    if(error)return notify(userError(error));
    notify('Batch rows saved.');load();
  }

  function patchItem(idx,patch){setDraftItems(x=>x.map((it,i)=>i===idx?{...it,...patch}:it))}
  function qtyChange(idx,v){const qty=Number(v||0);patchItem(idx,{quantity:qty,amount:qty*Number(view.default_price||0)})}
  async function delBatch(id){if(!confirm('Delete this batch report?'))return;const {error}=await supabase.from('batch_reports').delete().eq('id',id);if(error)return notify(userError(error));load()}

  const totalQty=draftItems.reduce((n,i)=>n+Number(i.quantity||0),0);
  const totalAmt=draftItems.reduce((n,i)=>n+Number(i.amount||0),0);

  return <section className="batch-manager parity-batch">
    <div className="module-titlebar">
      <div><h1>Batch Reports</h1><p>Create daily handover / MOFA / embassy lists from multiple tracking references, edit the rows, then print a clean report.</p></div>
      <button className="primary" onClick={()=>setEdit({...empty})}>+ New Batch</button>
    </div>

    <div className="panel batch-panel">
      <div className="batch-filterbar">
        <SearchBySelect value={searchBy} onChange={setSearchBy}/><input className="search" placeholder={searchBy==='tracking'?'Enter full or partial tracking number…':searchBy==='mobile'?'Enter full or partial mobile number…':searchBy==='bill'?'Enter full or partial bill number…':searchBy==='name'?'Enter customer name…':'Search batch details…'} value={q} onChange={e=>setQ(e.target.value)}/>
        <select value={type} onChange={e=>setType(e.target.value)}><option value="">All report types</option>{['MOFA','Embassy','MEA','SDM','Delivery','Custom'].map(x=><option key={x}>{x}</option>)}</select>
      </div>

      <div className="batch-grid parity-grid">
        {filtered.map(b=>{
          const its=b.batch_report_items||[],qty=its.reduce((n,i)=>n+Number(i.quantity||0),0),amt=its.reduce((n,i)=>n+Number(i.amount||0),0);
          return <article className="batch-card parity-card" key={b.id}>
            <div className="batch-card-head">
              <div className="batch-card-title"><h3>{b.report_name||`${b.batch_type} ${b.batch_date}`}</h3><span className="muted">{b.batch_type} · {b.batch_date}{b.session_name?` · ${b.session_name}`:''}</span></div>
              <span className="batch-count">{its.length} rows</span>
            </div>
            <div className="batch-metrics">
              <div className="batch-metric"><small>ASSIGNED TO</small><strong>{b.assigned_to||'—'}</strong></div>
              <div className="batch-metric"><small>TOTAL QTY</small><strong>{qty}</strong></div>
              <div className="batch-metric"><small>TOTAL AMOUNT</small><strong>{fmtMoney(amt).replace('.00','')}</strong></div>
              <div className="batch-metric"><small>UPDATED</small><strong>{new Date(b.updated_at||b.created_at).toLocaleDateString()}</strong></div>
            </div>
            <div className="batch-card-extra">
              {b.case_status&&<span className="batch-mini">Overall · {b.case_status}</span>}
              {(b.stage_actions||[]).length>0&&<span className="batch-mini">{b.stage_actions.length} stage action{b.stage_actions.length===1?'':'s'}</span>}
            </div>
            <div className="batch-actions">
              <button className="primary tiny" onClick={()=>openPrint(b)}>Open / Print</button>
              <button className="secondary tiny" onClick={()=>{const refs=its.map(i=>i.case_id);setEdit({...empty,...b,refs,refs_text:refsText(refs)})}}>Edit setup</button>
              <button className="danger tiny" onClick={()=>delBatch(b.id)}>Delete</button>
            </div>
          </article>
        })}
        {!filtered.length&&<div className="empty">No batch reports yet.</div>}
      </div>
    </div>

    {edit&&<div className="modal-backdrop" onMouseDown={()=>setEdit(null)}>
      <div className="batch-setup-modal" onMouseDown={e=>e.stopPropagation()}>
        <div className="batch-setup-head">
          <div><h2>{edit.id?'Edit Batch Report':'New Batch Report'}</h2><p>Search cases and build the batch selection before saving.</p></div>
          <button className="batch-modal-close" onClick={()=>setEdit(null)} aria-label="Close"><Icon name="close" size={17}/></button>
        </div>
        <form className="batch-setup-form" onSubmit={saveSetup}>
          <Field label="Report name / title" wide><input required value={edit.report_name||''} onChange={e=>setEdit({...edit,report_name:e.target.value})}/></Field>
          <Field label="Report Type"><select required value={edit.batch_type} onChange={e=>setEdit({...edit,batch_type:e.target.value})}><option value="">Select report type</option>{['MOFA','Embassy','MEA','SDM','Delivery','Custom'].map(x=><option key={x}>{x}</option>)}</select></Field>
          <Field label="Date"><input type="date" value={edit.batch_date} onChange={e=>setEdit({...edit,batch_date:e.target.value})}/></Field>
          <Field label="Session"><input value={edit.session_name||''} onChange={e=>setEdit({...edit,session_name:e.target.value})}/></Field>
          <Field label="Assigned To"><input value={edit.assigned_to||''} onChange={e=>setEdit({...edit,assigned_to:e.target.value})}/></Field>
          <Field label="Default Price (per Qty)"><input type="number" step=".01" value={edit.default_price} onChange={e=>setEdit({...edit,default_price:e.target.value})}/></Field>
          <Field label="Default Card / Payment"><input value={edit.card_reference||''} onChange={e=>setEdit({...edit,card_reference:e.target.value})}/></Field>
          <Field label="Overall case status"><select value={edit.case_status||''} onChange={e=>setEdit({...edit,case_status:e.target.value})}><option value="">Do not change overall status</option>{CASE_STATUSES.map(x=><option key={x}>{x}</option>)}</select></Field>
          <CaseCartPicker cases={cases} selectedIds={edit.refs||[]} onChange={refs=>setEdit({...edit,refs,refs_text:refsText(refs)})} title="Batch cases"/>

          <div className="wide batch-stage-actions">
            <div className="section-head"><div><strong>Document / stage status updates</strong><p>Update existing attestation stages across all selected references.</p></div><button type="button" className="secondary tiny" onClick={()=>setEdit({...edit,stage_actions:[...(edit.stage_actions||[]),{stage_name:'MOFA Qatar',status:'Completed'}]})}>+ Add stage update</button></div>
            {(edit.stage_actions||[]).map((a,i)=><div className="batch-stage-row" key={i}>
              <input value={a.stage_name} onChange={e=>setEdit({...edit,stage_actions:edit.stage_actions.map((x,j)=>j===i?{...x,stage_name:e.target.value}:x)})}/>
              <select value={a.status} onChange={e=>setEdit({...edit,stage_actions:edit.stage_actions.map((x,j)=>j===i?{...x,status:e.target.value}:x)})}>{STAGE_STATUSES.map(x=><option key={x}>{x}</option>)}</select>
              <button type="button" className="danger tiny" onClick={()=>setEdit({...edit,stage_actions:edit.stage_actions.filter((_,j)=>j!==i)})}>Remove</button>
            </div>)}
          </div>

          <Field label="Batch Notes" wide><textarea rows="3" value={edit.notes||''} onChange={e=>setEdit({...edit,notes:e.target.value})}/></Field>
          <div className="batch-setup-actions wide"><button type="button" className="secondary" onClick={()=>setEdit(null)}>Cancel</button><button className="primary" disabled={busy}>{busy?'Saving…':edit.id?'Save Batch':'Create Batch'}</button></div>
        </form>
      </div>
    </div>}

    {view&&<div className="modal-backdrop batch-print-backdrop" onMouseDown={()=>setView(null)}>
      <div className="batch-print-modal parity-print-modal" onMouseDown={e=>e.stopPropagation()}>
        <div className="batch-print-head">
          <div><h2>{view.report_name||'Batch Report'}</h2><p>Rows are editable before printing.</p></div>
          <div className="batch-print-actions"><button className="secondary" onClick={saveRows}>Save changes</button><button className="primary" onClick={()=>printBatchReport(view,draftItems)}>Print / Save PDF</button><button className="secondary" onClick={()=>setView(null)}>Close</button></div>
        </div>
        <div className="batch-paper-wrap">
          <div className="batch-paper" id="batchPrintArea">
            <div className="batch-preview-hero"><div><small>{configuredCompanyName()}</small><h3>Batch Operations Report</h3><p>Verified operational record</p></div><span>{view.batch_type||'Operational batch'}</span></div>
            <div className="batch-preview-title"><div><small>REPORT TITLE</small><strong>{view.report_name||`${view.batch_type} ${view.batch_date}`}</strong></div><b>{draftItems.length} RECORD{draftItems.length===1?'':'S'}</b></div>
            <div className="batch-preview-meta"><div><small>Report date</small><strong>{new Date(view.batch_date+'T00:00:00').toLocaleDateString('en-GB')}</strong></div><div><small>Session</small><strong>{view.session_name||'—'}</strong></div><div><small>Assigned to</small><strong>{view.assigned_to||'—'}</strong></div><div><small>Records</small><strong>{draftItems.length}</strong></div></div>
            <table className="batch-print-table parity-print-table">
              <thead>
                <tr className="report-columns"><th>TRACKING</th><th>CUSTOMER / NAME</th><th>QTY</th><th>AMOUNT</th><th>CARD / REFERENCE</th><th>REMARKS</th></tr>
              </thead>
              <tbody>{draftItems.map((i,idx)=><tr key={i.id}>
                <td contentEditable suppressContentEditableWarning onBlur={e=>patchItem(idx,{manual_tracking:e.currentTarget.textContent})}>{i.manual_tracking}</td>
                <td contentEditable suppressContentEditableWarning onBlur={e=>patchItem(idx,{manual_name:e.currentTarget.textContent})}>{i.manual_name}</td>
                <td><input type="number" value={i.quantity} onChange={e=>qtyChange(idx,e.target.value)}/></td>
                <td><input type="number" step=".01" value={i.amount} onChange={e=>patchItem(idx,{amount:Number(e.target.value||0)})}/></td>
                <td contentEditable suppressContentEditableWarning onBlur={e=>patchItem(idx,{card_reference:e.currentTarget.textContent})}>{i.card_reference}</td>
                <td contentEditable suppressContentEditableWarning onBlur={e=>patchItem(idx,{remarks:e.currentTarget.textContent})}>{i.remarks}</td>
              </tr>)}</tbody>
            </table>
            <div className="batch-preview-summary"><div><small>TOTAL RECORDS</small><strong>{draftItems.length}</strong></div><div><small>TOTAL QUANTITY</small><strong>{totalQty}</strong></div><div><small>TOTAL AMOUNT</small><strong>QAR {totalAmt.toFixed(2)}</strong></div></div>
            {view.notes&&<div className="batch-paper-notes"><b>Notes:</b> {view.notes}</div>}
            <div className="batch-preview-signatures"><div>Prepared by / Date</div><div>Verified by / Date</div></div>
            <div className="batch-preview-footer"><span>{configuredCompanyName()} · Operations</span><span>Editable preview</span></div>
          </div>
        </div>
      </div>
    </div>}
  </section>
}

function ImportView({session,cases,branches,reload,notify}){
  const [cutoffDate,setCutoffDate]=useState(importCutoffDefault());
  const [files,setFiles]=useState({master:null,billwise:null,statuswise:null,google:null});
  const [pdfFiles,setPdfFiles]=useState([]);
  const [pdfRows,setPdfRows]=useState([]);
  const [pdfBusy,setPdfBusy]=useState(false);
  const [pdfImporting,setPdfImporting]=useState(false);
  const [pdfLog,setPdfLog]=useState([]);

  const [parsed,setParsed]=useState({master:[],billwise:[],statuswise:[],google:[]});
  const [busy,setBusy]=useState(false);
  const [review,setReview]=useState(null);
  const [log,setLog]=useState([]);
  const [savedDraft,setSavedDraft]=useState(null);
  const pauseRef=useRef(false);
  const [progress,setProgress]=useState({open:false,status:'idle',percent:0,title:'',detail:'',current:0,total:0,phase:'',summary:null});
  const setImportProgress=(patch)=>setProgress(prev=>({...prev,...patch}));

  useEffect(()=>{(async()=>{
    try{
      const draft=await idbGet(IMPORT_DRAFT_KEY); const job=await idbGet(IMPORT_JOB_KEY);
      if(draft?.parsed&&draft?.review){setSavedDraft({draft,job}); if(job?.status==='review') setProgress({open:true,status:'review',percent:92,title:'Review before finalizing',detail:'All case, document and stage writes are complete. Review the summary, then finalize document workflow statuses.',current:0,total:0,phase:'Review',summary:job.summary||null});}
    }catch{}
  })()},[]);

  function setFile(type,file){setFiles(f=>({...f,[type]:file||null}));setParsed(p=>({...p,[type]:[]}));setReview(null);setLog([])}
  async function analyze(){
    if(!files.master&&!files.google){notify('Upload Legacy Master or Google Sheet first.');return}
    setBusy(true);setLog([]);
    try{
      const next={master:[],billwise:[],statuswise:[],google:[]};
      for(const type of Object.keys(next))if(files[type])next[type]=await parseExcelFile(files[type],type);
      const cutoff=cutoffDate||'1900-01-01';
      next.master=next.master.filter(r=>{const d=isoDate(r['Date']);return Boolean(d&&d>=cutoff)});
      next.google=next.google.filter(r=>{const d=isoDate(r['SUBMISSION DATE']);return Boolean(d&&d>=cutoff)});
      const recentBills=new Set(next.master.map(r=>cleanBill(r['Bill No'])).filter(Boolean));
      next.billwise=next.billwise.filter(r=>recentBills.has(cleanBill(r['Bill'])));
      next.statuswise=next.statuswise.filter(r=>recentBills.has(cleanBill(r['Bill'])));
      setParsed(next);
      const googleByTrack=new Map(next.google.map(r=>[cleanTracking(r['TRACKING']),r]).filter(([k])=>k));
      const masterTracks=new Set(); const candidates=[];
      next.master.forEach(r=>{const tr=cleanTracking(r['Reference']);if(!tr)return;masterTracks.add(tr);const g=googleByTrack.get(tr);candidates.push({tracking:tr,bill:cleanBill(r['Bill No']),customer:cleanText(r['Customer']),mobile:cleanText(g?.['MOB NO']),source:'Legacy Master'});});
      const googleTracksSet=new Set(next.google.map(g=>cleanTracking(g['TRACKING'])).filter(Boolean));
      const familyChildRows=[];
      next.google.forEach(g=>{const tr=cleanTracking(g['TRACKING']);if(!tr||masterTracks.has(tr))return;const family=trackingFamily(tr);const isChild=family!==tr&&(masterTracks.has(family)||googleTracksSet.has(family));if(isChild){familyChildRows.push({tracking:tr,family,customer:cleanText(g['NAME'])});return}candidates.push({tracking:tr,bill:'',customer:cleanText(g['NAME']),mobile:cleanText(g['MOB NO']),source:'Google Sheet'});});
      const existingTrack=new Set(cases.map(c=>cleanTracking(c.tracking_reference))); const existingBill=new Set(cases.map(c=>cleanBill(c.bill_no)).filter(Boolean));
      const knownBills=new Set([...next.master.map(r=>cleanBill(r['Bill No'])),...cases.map(c=>cleanBill(c.bill_no))].filter(Boolean));
      const docGroups=new Map();next.billwise.forEach(r=>{const b=cleanBill(r['Bill']),n=cleanText(r['Service']);if(!b||!n)return;const k=`${b}|${keyText(n)}`;docGroups.set(k,(docGroups.get(k)||0)+1)});
      const unmatchedBills=[...new Set([...next.billwise,...next.statuswise].map(r=>cleanBill(r['Bill'])).filter(b=>b&&!knownBills.has(b)))];
      const unknownStatus=[...new Set(next.google.map(g=>normalizeOperationalStatus(g['Current Status'])).filter(x=>x.original&&!x.recognized).map(x=>x.original))];
      const duplicateTracking=[...candidates.reduce((m,x)=>(m.set(x.tracking,(m.get(x.tracking)||0)+1),m),new Map())].filter(([,n])=>n>1).map(([tracking,count])=>({tracking,count,rows:candidates.filter(x=>x.tracking===tracking)})); const branchCounts={}; next.master.forEach(r=>{const b=billBranchFallback(r['Bill No'],branches)?.name||'Unresolved';branchCounts[b]=(branchCounts[b]||0)+1}); const duplicateSet=new Set(duplicateTracking.map(x=>x.tracking)); const softwareCandidates=candidates.filter(x=>x.source==='Legacy Master'); const googleOnlyCandidates=candidates.filter(x=>x.source==='Google Sheet'); const importableCandidates=candidates.filter(x=>!duplicateSet.has(x.tracking)); const billwiseDD=next.billwise.filter(r=>/^yes$/i.test(cleanText(r['DD']))||cleanText(r['DD Status'])).length; const googleDD=next.google.reduce((n,g)=>n+googleDDQuantity(g),0); const ddRows=Math.max(billwiseDD,googleDD); const collectionRows=next.google.filter(g=>/COLLECTION|PICKUP/i.test(cleanText(g['Submitted Branch']))).length; const nextReview={cutoffDate,unknownStatus,candidates,softwareCases:softwareCandidates.length,softwareImportable:softwareCandidates.filter(x=>!duplicateSet.has(x.tracking)).length,googleOnlyCases:googleOnlyCandidates.length,googleOnlySample:googleOnlyCandidates.slice(0,30),familyChildRows:familyChildRows.length,familyChildSample:familyChildRows.slice(0,30),blockedDuplicateRows:candidates.filter(x=>duplicateSet.has(x.tracking)).length,create:importableCandidates.filter(x=>!existingTrack.has(x.tracking)&&!(x.bill&&existingBill.has(x.bill))).length,update:importableCandidates.filter(x=>existingTrack.has(x.tracking)||(x.bill&&existingBill.has(x.bill))).length,documents:next.billwise.length,documentGroups:docGroups.size,stages:next.statuswise.length,unmatchedBills,duplicateTracking,branchCounts,ddRows,billwiseDD,googleDD,collectionRows};
      setReview(nextReview);
      const draft={parsed:next,review:nextReview,savedAt:new Date().toISOString(),fileNames:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,v?.name||null]))};
      await idbSet(IMPORT_DRAFT_KEY,draft); await idbDel(IMPORT_JOB_KEY); setSavedDraft({draft,job:null});
    }catch(e){notify(userError(e))}finally{setBusy(false)}
  }

  async function pauseGate(jobPatch={}){
    if(!pauseRef.current)return;
    await idbSet(IMPORT_JOB_KEY,{...(await idbGet(IMPORT_JOB_KEY)||{}),...jobPatch,status:'paused',updatedAt:new Date().toISOString()});
    setImportProgress({status:'paused',title:'Import paused',detail:'Your progress is saved. You can resume now or even after reopening this browser.',phase:'Paused'});
    while(pauseRef.current)await sleep(250);
    setImportProgress({status:'running',title:'Resuming import',detail:'Continuing from the latest saved checkpoint…'});
  }

  async function saveJob(patch){
    const prev=await idbGet(IMPORT_JOB_KEY)||{}; const next={...prev,...patch,updatedAt:new Date().toISOString()}; await idbSet(IMPORT_JOB_KEY,next); return next;
  }

  async function runImport(useSaved=false){
    let sourceParsed=parsed,sourceReview=review;
    if(useSaved){const d=await idbGet(IMPORT_DRAFT_KEY);if(!d){notify('No saved import draft found.');return}sourceParsed=d.parsed;sourceReview=d.review;setParsed(sourceParsed);setReview(sourceReview)}
    if(!sourceReview)return;
    setBusy(true);setLog([]);pauseRef.current=false;
    const logs=[];const addLog=x=>{logs.push(x);setLog([...logs])};
    setProgress({open:true,status:'running',percent:4,title:'Preparing import',detail:'Loading your saved review plan and checking the live database…',current:0,total:0,phase:'Cases',summary:null});
    try{
      await saveJob({status:'running',phase:'cases',percent:4,summary:null});
      const googleByTrack=new Map(sourceParsed.google.map(r=>[cleanTracking(r['TRACKING']),r]).filter(([k])=>k));
      const masterByTrack=new Map(sourceParsed.master.map(r=>[cleanTracking(r['Reference']),r]).filter(([k])=>k));
      const masterTrackCounts=sourceParsed.master.reduce((m,r)=>{const t=cleanTracking(r['Reference']);if(t)m.set(t,(m.get(t)||0)+1);return m},new Map());const blockedDuplicateTracks=new Set([...masterTrackCounts].filter(([,n])=>n>1).map(([t])=>t));
      const allGoogleTracks=new Set(googleByTrack.keys());
      const attachedChildTracks=new Set([...allGoogleTracks].filter(t=>{const f=trackingFamily(t);return f!==t&&(masterByTrack.has(f)||allGoogleTracks.has(f))}));
      const candidateTracks=[...new Set([...masterByTrack.keys(),...[...googleByTrack.keys()].filter(t=>!attachedChildTracks.has(t))])].filter(t=>!blockedDuplicateTracks.has(t));
      const masterBills=[...new Set(sourceParsed.master.map(r=>cleanBill(r['Bill No'])).filter(Boolean))];
      let existing=[];
      for(const part of chunk(candidateTracks,400)){const {data,error}=await supabase.from('cases').select('*').in('tracking_reference',part);if(error)throw error;existing.push(...(data||[]))}
      for(const part of chunk(masterBills,400)){const {data,error}=await supabase.from('cases').select('*').in('bill_no',part);if(error)throw error;existing.push(...(data||[]))}
      const byTrack=new Map(existing.map(c=>[cleanTracking(c.tracking_reference),c]));const byBill=new Map(existing.map(c=>[cleanBill(c.bill_no),c]).filter(([k])=>k));
      const caseRows=[]; let created=0,updated=0;
      for(const tr of candidateTracks){
        const m=masterByTrack.get(tr),g=googleByTrack.get(tr),bill=cleanBill(m?.['Bill No']);const found=byTrack.get(tr)||(bill?byBill.get(bill):null);
        const masterPaid=num(m?.['Paid']||m?.['Advance']),masterTotal=num(m?.['Grand Total']||m?.['Total']),sourceNotes=cleanText(g?.['NOTES']);
        const total=masterTotal||num(found?.total_amount),advance=masterPaid||num(found?.advance_paid),second=num(m?.['Second Payment']||found?.second_payment),discount=num(m?.['Discount']||found?.discount_return),balance=num(m?.['Balance']||found?.balance_payment);
        const op=normalizeOperationalStatus(g?.['Current Status']); const submittedBranch=cleanText(g?.['Submitted Branch']); const acct=accountFromGoogle(g); const intake=/COLLECTION|PICKUP/i.test(submittedBranch)?'Collection':'Branch'; const dd=/\bDD\b|CUSTOMER TO DELHI/i.test([g?.['Current Status'],g?.['DOCUMENTS (Short code, Seperated by comma)'],g?.['SERVICE (Codes eg: Complete Means MEA, SDM, Embassy of India, MOFA Qatar)'],sourceNotes].join(' '));
        caseRows.push({
          tracking_reference:tr,tracking_family:trackingFamily(tr),bill_no:bill||found?.bill_no||null,internal_invoice_no:cleanText(m?.['#'])||found?.internal_invoice_no||null,
          customer_name:cleanText(g?.['NAME']||m?.['Customer']||found?.customer_name)||'Unknown Customer',mobile:looksLikePhone(g?.['MOB NO'])?cleanText(g?.['MOB NO']):(found?.mobile||null),account_name:acct||found?.account_name||null,
          submission_date:isoDate(g?.['SUBMISSION DATE']||m?.['Date'])||found?.submission_date||null,promise_date:isoDate(m?.['Promise Date'])||found?.promise_date||null,
          courier_date:isoDate(m?.['Courier Date'])||found?.courier_date||null,embassy_date:isoDate(m?.['Embassy Date'])||found?.embassy_date||null,
          branch_id:branchFor(submittedBranch,branches)||billBranchFallback(bill,branches)||found?.branch_id||null,overall_status:g?op.overall:(found?.overall_status||'Received'),current_milestone:g?op.milestone:(found?.current_milestone||'Submitted'),current_milestone_date:g?op.date:(found?.current_milestone_date||null),intake_source:intake,direct_to_delhi:dd||Boolean(found?.direct_to_delhi),direct_destination:(dd?'Delhi':found?.direct_destination)||null,total_amount:total,advance_paid:advance,second_payment:second,discount_return:discount,balance_payment:balance,
          notes:sourceNotes||found?.notes||null,reference_source:g&&m?'Legacy + Google Sheet':m?'Legacy Excel':'Google Sheet',created_by:found?.created_by||session.user.id,updated_by:session.user.id
        });
        found?updated++:created++;
      }
      const caseBatches=chunk(caseRows,250);let doneCases=0;let returnedCases=[];
      for(let i=0;i<caseBatches.length;i++){
        await pauseGate({phase:'cases',batch:i});
        const {data,error}=await supabase.from('cases').upsert(caseBatches[i],{onConflict:'tracking_reference'}).select('id,tracking_reference,bill_no');if(error)throw error;returnedCases.push(...(data||[]));doneCases+=caseBatches[i].length;
        const pct=8+Math.round((doneCases/Math.max(1,caseRows.length))*27);setImportProgress({percent:pct,title:'Syncing cases',detail:`${doneCases.toLocaleString()} of ${caseRows.length.toLocaleString()} cases synced`,current:doneCases,total:caseRows.length,phase:'Cases'});await saveJob({status:'running',phase:'cases',batch:i+1,percent:pct});
      }
      addLog(`Cases: ${created} new, ${updated} matched/updated`);
      const billToCase=new Map(returnedCases.map(c=>[cleanBill(c.bill_no),c.id]).filter(([k])=>k));
      const allBills=[...new Set([...sourceParsed.billwise,...sourceParsed.statuswise].map(r=>cleanBill(r['Bill'])).filter(Boolean))];
      const missingBills=allBills.filter(b=>!billToCase.has(b));
      for(const part of chunk(missingBills,400)){const {data,error}=await supabase.from('cases').select('id,bill_no').in('bill_no',part);if(error)throw error;(data||[]).forEach(c=>billToCase.set(cleanBill(c.bill_no),c.id))}

      const trackToCase=new Map(returnedCases.map(c=>[cleanTracking(c.tracking_reference),c.id]));
      // Slash-style Google references (e.g. 55465/1) are document-holder rows under the root tracking family,
      // not standalone cases. Preserve their exact source reference while attaching their documents to the root case.
      for(const child of attachedChildTracks){const root=trackingFamily(child),rootId=trackToCase.get(root);if(rootId)trackToCase.set(child,rootId)}
      const caseIds=[...new Set([...billToCase.values(),...trackToCase.values()])];let existingDocs=[];
      for(const part of chunk(caseIds,400)){const {data,error}=await supabase.from('documents').select('id,case_id,document_name,occurrence_no,quantity,document_status,source_service').in('case_id',part);if(error)throw error;existingDocs.push(...(data||[]))}
      const docMap=new Map(existingDocs.map(d=>[`${d.case_id}|${keyText(d.document_name)}|${d.occurrence_no||1}`,d]));const billSvcCount=new Map();const desiredDocs=[];
      const billwiseCaseIds=new Set();
      for(const r of sourceParsed.billwise){const bill=cleanBill(r['Bill']),name=cleanText(r['Service']),caseId=billToCase.get(bill);if(!caseId||!name)continue;billwiseCaseIds.add(caseId);const base=`${bill}|${keyText(name)}`,occ=(billSvcCount.get(base)||0)+1;billSvcCount.set(base,occ);const dk=`${caseId}|${keyText(name)}|${occ}`;if(!docMap.has(dk)){const caseGoogle=sourceParsed.google.filter(g=>trackToCase.get(cleanTracking(g['TRACKING']))===caseId);const matchingGoogle=caseGoogle.find(g=>{const toks=googleDocTokens(g['DOCUMENTS (Short code, Seperated by comma)'],g['Total Documents Quantity']);return toks.some(t=>keyText(t.name)===keyText(name)||keyText(t.code)===keyText(name))})|| (caseGoogle.length===1?caseGoogle[0]:null);const isDD=matchingGoogle?googleRowIsDD(matchingGoogle):false;desiredDocs.push({case_id:caseId,document_name:name,holder_name:cleanText(matchingGoogle?.['NAME'])||null,source_tracking_reference:cleanTracking(matchingGoogle?.['TRACKING'])||null,occurrence_no:occ,quantity:1,document_status:'Pending',source_service:name,direct_to_delhi:isDD,direct_destination:isDD?'Delhi':null})}}
      // Status Wise can contain document/service rows even when Billwise Out does not.
      // Reconstruct missing document instances from its service rows before using Google fallback.
      const richWorkflowCaseIds=new Set(billwiseCaseIds); const swMaxCounts=new Map(); const swCounter=new Map();
      for(const r of sourceParsed.statuswise){const bill=cleanBill(r['Bill']),name=cleanText(r['Service']),stage=normalizeStage(r['Attestation']),caseId=billToCase.get(bill);if(!caseId||!name||!stage)continue;richWorkflowCaseIds.add(caseId);const k=`${bill}|${keyText(name)}|${keyText(stage)}`;const n=(swCounter.get(k)||0)+1;swCounter.set(k,n);const base=`${bill}|${keyText(name)}`;swMaxCounts.set(base,Math.max(swMaxCounts.get(base)||0,n));}
      const desiredDocKeys=new Set(desiredDocs.map(x=>`${x.case_id}|${keyText(x.document_name)}|${x.occurrence_no||1}`));
      for(const [base,maxOcc] of swMaxCounts){const cut=base.indexOf('|'),bill=base.slice(0,cut),nameKey=base.slice(cut+1),caseId=billToCase.get(bill);if(!caseId)continue;const sample=sourceParsed.statuswise.find(r=>cleanBill(r['Bill'])===bill&&keyText(r['Service'])===nameKey);const name=cleanText(sample?.['Service']);for(let occ=1;occ<=maxOcc;occ++){const dk=`${caseId}|${nameKey}|${occ}`;if(docMap.has(dk)||desiredDocKeys.has(dk))continue;desiredDocs.push({case_id:caseId,document_name:name,occurrence_no:occ,quantity:1,document_status:'Pending',source_service:name});desiredDocKeys.add(dk);}}
      // Historical Google Sheet fallback: when a case has no Billwise document source,
      // use its DOCUMENTS + Total Documents Quantity fields so old cases are not empty.
      const googleDocMeta=new Map(); let googleFallbackCount=0; const googleNameCounts=new Map();
      for(const g of sourceParsed.google){const tr=cleanTracking(g['TRACKING']),caseId=trackToCase.get(tr);if(!caseId||richWorkflowCaseIds.has(caseId))continue;const tokens=googleDocTokens(g['DOCUMENTS (Short code, Seperated by comma)'],g['Total Documents Quantity']);if(!tokens.length)continue;for(const tok of tokens){const base=`${caseId}|${keyText(tok.name)}`;const occ=(googleNameCounts.get(base)||0)+1;googleNameCounts.set(base,occ);const dk=`${base}|${occ}`;if(docMap.has(dk)||desiredDocKeys.has(dk))continue;const op=normalizeOperationalStatus(g['Current Status']);const isDD=tok.directToDelhi||googleRowIsDD(g);desiredDocs.push({case_id:caseId,document_name:tok.name,holder_name:cleanText(g['NAME'])||null,source_tracking_reference:tr,occurrence_no:occ,quantity:1,document_status:'Pending',source_service:`Google:${tok.code}`,direct_to_delhi:isDD,direct_destination:isDD?'Delhi':null,current_milestone:op.milestone,current_milestone_date:op.date});desiredDocKeys.add(dk);googleDocMeta.set(dk,{service:g['SERVICE (Codes eg: Complete Means MEA, SDM, Embassy of India, MOFA Qatar)'],current:g['Current Status']});googleFallbackCount++;}}
      let insertedDocs=[];const docBatches=chunk(desiredDocs,300),docTotal=desiredDocs.length;let docDone=0;
      setImportProgress({percent:38,title:'Syncing documents',detail:`Preparing ${sourceParsed.billwise.length.toLocaleString()} document rows…`,current:0,total:Math.max(docTotal,1),phase:'Documents'});
      for(let i=0;i<docBatches.length;i++){
        await pauseGate({phase:'documents',batch:i});const {data,error}=await supabase.from('documents').insert(docBatches[i]).select('id,case_id,document_name,occurrence_no,quantity,document_status,source_service');if(error)throw error;insertedDocs.push(...(data||[]));docDone+=docBatches[i].length;const pct=38+Math.round((docDone/Math.max(1,docTotal))*18);setImportProgress({percent:pct,title:'Syncing documents',detail:`${docDone.toLocaleString()} new document records created`,current:docDone,total:docTotal,phase:'Documents'});await saveJob({status:'running',phase:'documents',batch:i+1,percent:pct});
      }
      existingDocs=[...existingDocs,...insertedDocs];existingDocs.forEach(d=>docMap.set(`${d.case_id}|${keyText(d.document_name)}|${d.occurrence_no||1}`,d));addLog(`Documents: ${insertedDocs.length} created (${googleFallbackCount} from Google historical rows), ${Math.max(0,sourceParsed.billwise.length-(insertedDocs.length-googleFallbackCount))} Billwise rows matched`);
      const sourceDocKey=new Map();const reverseBill=new Map([...billToCase.entries()].map(([b,id])=>[id,b]));for(const d of existingDocs){const bill=reverseBill.get(d.case_id);if(bill)sourceDocKey.set(`${bill}|${keyText(d.document_name)}|${d.occurrence_no||1}`,d)}
      const docIds=[...new Set(existingDocs.map(d=>d.id))];let existingStages=[];
      for(const part of chunk(docIds,400)){const {data,error}=await supabase.from('document_stages').select('id,document_id,stage_name,status,is_manual_override,stage_order').in('document_id',part);if(error)throw error;existingStages.push(...(data||[]))}
      const stageMap=new Map(existingStages.map(s=>[`${s.document_id}|${keyText(s.stage_name)}`,s]));const stageOccurrence=new Map(),stageRows=[];let manualPreserved=0,stagesCreated=0,stagesUpdated=0;const orderMap=new Map([['Notary',1],['SDM',2],['MEA India',3],['Embassy of India',4],['MOFA Qatar',5]]);
      for(const r of sourceParsed.statuswise){const bill=cleanBill(r['Bill']),name=cleanText(r['Service']),stageName=normalizeStage(r['Attestation']);if(!bill||!name||!stageName)continue;const skey=`${bill}|${keyText(name)}|${keyText(stageName)}`;const occ=(stageOccurrence.get(skey)||0)+1;stageOccurrence.set(skey,occ);const d=sourceDocKey.get(`${bill}|${keyText(name)}|${occ}`);if(!d)continue;const mk=`${d.id}|${keyText(stageName)}`,ex=stageMap.get(mk);if(ex?.is_manual_override){manualPreserved++;continue}stageRows.push({document_id:d.id,stage_name:stageName,stage_order:orderMap.get(stageName)||99,status:normalizeStageStatus(r['Status']),is_manual_override:false,updated_by:session.user.id});ex?stagesUpdated++:stagesCreated++;}
      // Add inferred stages for Google-only historical documents. The Google header defines COMPLETE as SDM + MEA + Embassy of India + MOFA Qatar.
      for(const d of existingDocs){const meta=googleDocMeta.get(`${d.case_id}|${keyText(d.document_name)}|${d.occurrence_no||1}`);if(!meta)continue;const names=googleServiceStages(meta.service);const stStatus=googleStageStatus(meta.current);names.forEach((stageName,i)=>{const mk=`${d.id}|${keyText(stageName)}`,ex=stageMap.get(mk);if(ex?.is_manual_override){manualPreserved++;return}stageRows.push({document_id:d.id,stage_name:stageName,stage_order:i+1,status:stStatus,is_manual_override:false,updated_by:session.user.id});ex?stagesUpdated++:stagesCreated++;});}
      const stageBatches=chunk(stageRows,350);let stageDone=0;
      setImportProgress({percent:59,title:'Syncing attestation stages',detail:`Preparing ${stageRows.length.toLocaleString()} source-controlled stage updates…`,current:0,total:stageRows.length,phase:'Stages'});
      for(let i=0;i<stageBatches.length;i++){
        await pauseGate({phase:'stages',batch:i});const {error}=await supabase.from('document_stages').upsert(stageBatches[i],{onConflict:'document_id,stage_name'});if(error)throw error;stageDone+=stageBatches[i].length;const pct=59+Math.round((stageDone/Math.max(1,stageRows.length))*29);setImportProgress({percent:pct,title:'Syncing attestation stages',detail:`${stageDone.toLocaleString()} of ${stageRows.length.toLocaleString()} stage rows synced`,current:stageDone,total:stageRows.length,phase:'Stages'});await saveJob({status:'running',phase:'stages',batch:i+1,percent:pct});
      }
      addLog(`Stages: ${stagesCreated} created, ${stagesUpdated} source-updated, ${manualPreserved} manual overrides preserved`);
      const summary={created,updated,docsCreated:insertedDocs.length,googleDocsCreated:googleFallbackCount,stagesCreated,stagesUpdated,manualPreserved,unmatchedBills:sourceReview.unmatchedBills.length,docIds};
      await saveJob({status:'review',phase:'review',percent:92,summary});
      setImportProgress({status:'review',percent:92,title:'Review before finalizing',detail:'The source data is synced. Review the results below before the app recalculates document workflow statuses.',current:0,total:0,phase:'Review',summary});
      setSavedDraft({draft:await idbGet(IMPORT_DRAFT_KEY),job:await idbGet(IMPORT_JOB_KEY)});
    }catch(e){const safe=userError(e);addLog(`ERROR: ${safe}`);await saveJob({status:'error',error:safe});setImportProgress({status:'error',title:'Import stopped',detail:safe,phase:'Error'});notify(safe);}
    finally{setBusy(false)}
  }

  async function repairWorkflows(){
    setBusy(true); setLog([]); pauseRef.current=false;
    const logs=[]; const addLog=x=>{logs.push(x);setLog([...logs])};
    setProgress({open:true,status:'running',percent:5,title:'Checking workflow sources',detail:'Reading Billwise Out and Status Wise, then matching them to existing cases by Bill No…',current:0,total:0,phase:'Match',summary:null});
    try{
      const draft=await idbGet(IMPORT_DRAFT_KEY);
      let bw=parsed.billwise?.length?parsed.billwise:(draft?.parsed?.billwise||[]);
      let sw=parsed.statuswise?.length?parsed.statuswise:(draft?.parsed?.statuswise||[]);
      let gg=parsed.google?.length?parsed.google:(draft?.parsed?.google||[]);
      if(files.billwise)bw=await parseExcelFile(files.billwise,'billwise');
      if(files.statuswise)sw=await parseExcelFile(files.statuswise,'statuswise');
      if(files.google)gg=await parseExcelFile(files.google,'google');
      if(!bw.length)throw new Error('Billwise Out is required to create document instances. Upload Billwise Out.xlsx first.');

      const allBills=[...new Set([...bw,...sw].map(r=>cleanBill(r['Bill'])).filter(Boolean))];
      const billToCase=new Map();
      let matchedBills=0;
      for(let i=0;i<allBills.length;i+=300){
        const part=allBills.slice(i,i+300);
        const {data,error}=await supabase.from('cases').select('id,bill_no,tracking_reference').in('bill_no',part);
        if(error)throw error;
        (data||[]).forEach(c=>billToCase.set(cleanBill(c.bill_no),c));
        matchedBills=billToCase.size;
        setImportProgress({percent:10+Math.round((Math.min(i+300,allBills.length)/Math.max(1,allBills.length))*15),title:'Matching Bill Numbers',detail:`${matchedBills.toLocaleString()} of ${allBills.length.toLocaleString()} source bills matched to cases`,current:matchedBills,total:allBills.length,phase:'Match'});
      }
      const unmatchedBills=allBills.filter(b=>!billToCase.has(b));
      addLog(`Bill matching: ${matchedBills} matched, ${unmatchedBills.length} unmatched`);
      const googleTracks=[...new Set(gg.map(r=>cleanTracking(r['TRACKING'])).filter(Boolean))]; const trackToCase=new Map();
      for(const part of chunk(googleTracks,350)){const {data,error}=await supabase.from('cases').select('id,tracking_reference,bill_no').in('tracking_reference',part);if(error)throw error;(data||[]).forEach(c=>trackToCase.set(cleanTracking(c.tracking_reference),c));}
      if(gg.length)addLog(`Google matching: ${trackToCase.size} tracking references matched to existing cases`);

      const caseIds=[...new Set([...billToCase.values()].map(c=>c.id).concat([...trackToCase.values()].map(c=>c.id)))];
      let existingDocs=[];
      for(const part of chunk(caseIds,350)){
        const {data,error}=await supabase.from('documents').select('id,case_id,document_name,occurrence_no,quantity,document_status,source_service').in('case_id',part);
        if(error)throw error; existingDocs.push(...(data||[]));
      }
      const docMap=new Map(existingDocs.map(d=>[`${d.case_id}|${keyText(d.document_name)}|${d.occurrence_no||1}`,d]));
      const billSvcCount=new Map(),desiredDocs=[]; let skippedDocRows=0; const billwiseCaseIds=new Set();
      for(const r of bw){
        const bill=cleanBill(r['Bill']),name=cleanText(r['Service']),c=billToCase.get(bill);
        if(!c||!name){skippedDocRows++;continue}
        billwiseCaseIds.add(c.id);const base=`${bill}|${keyText(name)}`,occ=(billSvcCount.get(base)||0)+1;billSvcCount.set(base,occ);
        const dk=`${c.id}|${keyText(name)}|${occ}`;
        if(!docMap.has(dk))desiredDocs.push({case_id:c.id,document_name:name,occurrence_no:occ,quantity:1,document_status:'Pending',source_service:name});
      }
      const richWorkflowCaseIds=new Set(billwiseCaseIds); const swMaxCounts=new Map(),swCounter=new Map();
      for(const r of sw){const bill=cleanBill(r['Bill']),name=cleanText(r['Service']),stage=normalizeStage(r['Attestation']),c=billToCase.get(bill);if(!c||!name||!stage)continue;richWorkflowCaseIds.add(c.id);const k=`${bill}|${keyText(name)}|${keyText(stage)}`;const n=(swCounter.get(k)||0)+1;swCounter.set(k,n);const base=`${bill}|${keyText(name)}`;swMaxCounts.set(base,Math.max(swMaxCounts.get(base)||0,n));}
      const desiredDocKeys=new Set(desiredDocs.map(x=>`${x.case_id}|${keyText(x.document_name)}|${x.occurrence_no||1}`));
      for(const [base,maxOcc] of swMaxCounts){const cut=base.indexOf('|'),bill=base.slice(0,cut),nameKey=base.slice(cut+1),c=billToCase.get(bill);if(!c)continue;const sample=sw.find(r=>cleanBill(r['Bill'])===bill&&keyText(r['Service'])===nameKey);const name=cleanText(sample?.['Service']);for(let occ=1;occ<=maxOcc;occ++){const dk=`${c.id}|${nameKey}|${occ}`;if(docMap.has(dk)||desiredDocKeys.has(dk))continue;desiredDocs.push({case_id:c.id,document_name:name,occurrence_no:occ,quantity:1,document_status:'Pending',source_service:name});desiredDocKeys.add(dk);}}
      const googleDocMeta=new Map(); let googleFallbackCount=0; const googleNameCounts=new Map();
      for(const g of gg){const tr=cleanTracking(g['TRACKING']),c=trackToCase.get(tr);if(!c||richWorkflowCaseIds.has(c.id))continue;const tokens=googleDocTokens(g['DOCUMENTS (Short code, Seperated by comma)'],g['Total Documents Quantity']);if(!tokens.length)continue;for(const tok of tokens){const base=`${c.id}|${keyText(tok.name)}`;const occ=(googleNameCounts.get(base)||0)+1;googleNameCounts.set(base,occ);const dk=`${base}|${occ}`;if(docMap.has(dk)||desiredDocKeys.has(dk))continue;const op=normalizeOperationalStatus(g['Current Status']);const isDD=tok.directToDelhi||googleRowIsDD(g);desiredDocs.push({case_id:c.id,document_name:tok.name,holder_name:cleanText(g['NAME'])||null,source_tracking_reference:tr,occurrence_no:occ,quantity:1,document_status:'Pending',source_service:`Google:${tok.code}`,direct_to_delhi:isDD,direct_destination:isDD?'Delhi':null,current_milestone:op.milestone,current_milestone_date:op.date});desiredDocKeys.add(dk);googleDocMeta.set(dk,{service:g['SERVICE (Codes eg: Complete Means MEA, SDM, Embassy of India, MOFA Qatar)'],current:g['Current Status']});googleFallbackCount++;}}
      let insertedDocs=[]; let docDone=0;
      setImportProgress({percent:28,title:'Repairing document instances',detail:`${desiredDocs.length.toLocaleString()} missing document records will be created. Existing documents are preserved.`,current:0,total:desiredDocs.length,phase:'Documents'});
      for(const part of chunk(desiredDocs,250)){
        await pauseGate({phase:'repair-documents'});
        const {data,error}=await supabase.from('documents').insert(part).select('id,case_id,document_name,occurrence_no,quantity,document_status,source_service');
        if(error)throw error; insertedDocs.push(...(data||[]));docDone+=part.length;
        setImportProgress({percent:28+Math.round((docDone/Math.max(1,desiredDocs.length))*22),title:'Repairing document instances',detail:`${docDone.toLocaleString()} of ${desiredDocs.length.toLocaleString()} missing documents created`,current:docDone,total:desiredDocs.length,phase:'Documents'});
      }
      existingDocs=[...existingDocs,...insertedDocs];
      const caseToBill=new Map([...billToCase.entries()].map(([bill,c])=>[c.id,bill]));
      const sourceDocKey=new Map();
      for(const d of existingDocs){const bill=caseToBill.get(d.case_id);if(bill)sourceDocKey.set(`${bill}|${keyText(d.document_name)}|${d.occurrence_no||1}`,d)}
      addLog(`Documents: ${insertedDocs.length} created (${googleFallbackCount} from Google historical rows), ${Math.max(0,bw.length-(insertedDocs.length-googleFallbackCount)-skippedDocRows)} Billwise rows already existed, ${skippedDocRows} Billwise rows could not be matched`);

      const docIds=[...new Set(existingDocs.map(d=>d.id))]; let existingStages=[];
      for(const part of chunk(docIds,350)){
        const {data,error}=await supabase.from('document_stages').select('id,document_id,stage_name,status,is_manual_override,stage_order').in('document_id',part);
        if(error)throw error;existingStages.push(...(data||[]));
      }
      const stageMap=new Map(existingStages.map(s=>[`${s.document_id}|${keyText(s.stage_name)}`,s]));
      const stageOccurrence=new Map(),stageRows=[];let manualPreserved=0,skippedStageRows=0,stageCreated=0,stageUpdated=0;
      const orderMap=new Map([['Notary',1],['SDM',2],['MEA India',3],['Embassy of India',4],['MOFA Qatar',5]]);
      for(const r of sw){
        const bill=cleanBill(r['Bill']),name=cleanText(r['Service']),stageName=normalizeStage(r['Attestation']);
        if(!bill||!name||!stageName){skippedStageRows++;continue}
        const skey=`${bill}|${keyText(name)}|${keyText(stageName)}`,occ=(stageOccurrence.get(skey)||0)+1;stageOccurrence.set(skey,occ);
        const d=sourceDocKey.get(`${bill}|${keyText(name)}|${occ}`);
        if(!d){skippedStageRows++;continue}
        const mk=`${d.id}|${keyText(stageName)}`,ex=stageMap.get(mk);
        if(ex?.is_manual_override){manualPreserved++;continue}
        stageRows.push({document_id:d.id,stage_name:stageName,stage_order:orderMap.get(stageName)||99,status:normalizeStageStatus(r['Status']),is_manual_override:false,updated_by:session.user.id});
        ex?stageUpdated++:stageCreated++;
      }
      for(const d of existingDocs){const meta=googleDocMeta.get(`${d.case_id}|${keyText(d.document_name)}|${d.occurrence_no||1}`);if(!meta)continue;const names=googleServiceStages(meta.service),stStatus=googleStageStatus(meta.current);names.forEach((stageName,i)=>{const mk=`${d.id}|${keyText(stageName)}`,ex=stageMap.get(mk);if(ex?.is_manual_override){manualPreserved++;return}stageRows.push({document_id:d.id,stage_name:stageName,stage_order:i+1,status:stStatus,is_manual_override:false,updated_by:session.user.id});ex?stageUpdated++:stageCreated++;});}
      let stageDone=0;
      setImportProgress({percent:54,title:'Repairing attestation stages',detail:`${stageRows.length.toLocaleString()} stage records are ready to sync.`,current:0,total:stageRows.length,phase:'Stages'});
      for(const part of chunk(stageRows,300)){
        await pauseGate({phase:'repair-stages'});
        const {error}=await supabase.from('document_stages').upsert(part,{onConflict:'document_id,stage_name'});
        if(error)throw error;stageDone+=part.length;
        setImportProgress({percent:54+Math.round((stageDone/Math.max(1,stageRows.length))*27),title:'Repairing attestation stages',detail:`${stageDone.toLocaleString()} of ${stageRows.length.toLocaleString()} stages synced`,current:stageDone,total:stageRows.length,phase:'Stages'});
      }
      addLog(`Stages: ${stageCreated} created, ${stageUpdated} updated, ${manualPreserved} manual overrides protected, ${skippedStageRows} rows unmatched`);

      // Recalculate only affected document statuses after workflow repair.
      const affectedIds=[...new Set([...insertedDocs.map(d=>d.id),...stageRows.map(s=>s.document_id)])];
      let allStages=[];
      for(const part of chunk(affectedIds,350)){const {data,error}=await supabase.from('document_stages').select('document_id,status').in('document_id',part);if(error)throw error;allStages.push(...(data||[]))}
      const grouped={};allStages.forEach(s=>(grouped[s.document_id]??=[]).push(s.status));
      let affectedDocs=[];
      for(const part of chunk(affectedIds,350)){const {data,error}=await supabase.from('documents').select('id,case_id,document_name,occurrence_no,quantity,document_status,source_service').in('id',part);if(error)throw error;affectedDocs.push(...(data||[]))}
      const statusRows=affectedDocs.map(d=>{const statuses=grouped[d.id]||[],active=statuses.filter(x=>x!=='Not Required');let ds='Pending';if(active.length&&active.every(x=>x==='Completed'))ds='Completed';else if(active.some(x=>x==='Processing'||x==='Completed'))ds='Processing';else if(active.length&&active.every(x=>x==='Cancelled'))ds='Cancelled';return {...d,document_status:ds}});
      let finalDone=0;for(const part of chunk(statusRows,300)){const {error}=await supabase.from('documents').upsert(part,{onConflict:'id'});if(error)throw error;finalDone+=part.length;setImportProgress({percent:82+Math.round((finalDone/Math.max(1,statusRows.length))*15),title:'Finalizing repaired workflows',detail:`${finalDone.toLocaleString()} of ${statusRows.length.toLocaleString()} document statuses recalculated`,current:finalDone,total:statusRows.length,phase:'Finalize'});}
      await reload();
      const summary={docsCreated:insertedDocs.length,googleDocsCreated:googleFallbackCount,stagesCreated:stageCreated,stagesUpdated:stageUpdated,manualPreserved,unmatchedBills:unmatchedBills.length,skippedDocRows,skippedStageRows};
      setProgress({open:true,status:'success',percent:100,title:'Documents & stages synced',detail:`${insertedDocs.length.toLocaleString()} documents created and ${(stageCreated+stageUpdated).toLocaleString()} stage records synced.`,phase:'Complete',summary});
      notify('Document and stage repair completed.');
    }catch(e){const safe=userError(e);addLog(`ERROR: ${safe}`);setImportProgress({status:'error',title:'Workflow repair stopped',detail:safe,phase:'Error'});notify(safe);}
    finally{setBusy(false)}
  }

  async function finalizeImport(){
    const job=await idbGet(IMPORT_JOB_KEY);if(!job?.summary?.docIds){notify('Saved import review was not found.');return}
    setBusy(true);setImportProgress({open:true,status:'running',percent:93,title:'Finalizing workflows',detail:'Recalculating document statuses from the latest stage results…',phase:'Finalize',summary:job.summary});
    try{
      const docIds=job.summary.docIds;let allStages=[];for(const part of chunk(docIds,400)){const {data,error}=await supabase.from('document_stages').select('document_id,status').in('document_id',part);if(error)throw error;allStages.push(...(data||[]))}
      const grouped={};allStages.forEach(s=>(grouped[s.document_id]??=[]).push(s.status));let allDocs=[];for(const part of chunk(docIds,400)){const {data,error}=await supabase.from('documents').select('id,case_id,document_name,occurrence_no,quantity,document_status,source_service').in('id',part);if(error)throw error;allDocs.push(...(data||[]))}
      const rows=allDocs.map(d=>{const statuses=grouped[d.id]||[];const active=statuses.filter(x=>x!=='Not Required');let ds='Pending';if(active.length&&active.every(x=>x==='Completed'))ds='Completed';else if(active.some(x=>x==='Processing'||x==='Completed'))ds='Processing';else if(active.length&&active.every(x=>x==='Cancelled'))ds='Cancelled';return {...d,document_status:ds}});
      const parts=chunk(rows,350);let done=0;for(let i=0;i<parts.length;i++){const {error}=await supabase.from('documents').upsert(parts[i],{onConflict:'id'});if(error)throw error;done+=parts[i].length;setImportProgress({percent:93+Math.round((done/Math.max(1,rows.length))*5),title:'Finalizing workflows',detail:`${done.toLocaleString()} of ${rows.length.toLocaleString()} document statuses finalized`,current:done,total:rows.length,phase:'Finalize'});}
      setImportProgress({percent:99,title:'Refreshing workspace',detail:'Loading the latest live data…',phase:'Finalize'});await reload();
      await idbDel(IMPORT_JOB_KEY);await idbDel(IMPORT_DRAFT_KEY);setSavedDraft(null);setProgress({open:true,status:'success',percent:100,title:'Import completed',detail:`${job.summary.created} case${job.summary.created===1?'':'s'} created, ${job.summary.updated} updated, ${job.summary.docsCreated} new document${job.summary.docsCreated===1?'':'s'}.`,phase:'Complete',summary:job.summary});notify('Import finalized successfully.');
    }catch(e){const safe=userError(e);setImportProgress({status:'error',title:'Finalize failed',detail:safe,phase:'Error'});notify(safe)}finally{setBusy(false)}
  }


  function clearPdfImport(){
    setPdfFiles([]);setPdfRows([]);setPdfLog([]);
  }
  function patchPdfRow(i,patch){setPdfRows(rows=>rows.map((r,j)=>j===i?{...r,...patch}:r))}
  function togglePdfRow(i){setPdfRows(rows=>rows.map((r,j)=>j===i?{...r,selected:!r.selected}:r))}
  function selectAllPdf(value=true){setPdfRows(rows=>rows.map(r=>({...r,selected:value})))}

  async function analyzePdfs(){
    if(!pdfFiles.length){notify('Choose one or more invoice PDFs first.');return}
    setPdfBusy(true);setPdfLog([]);
    try{
      const byInternal=new Map(cases.map(c=>[cleanText(c.internal_invoice_no),c]).filter(([k])=>k));
      const byBill=new Map(cases.map(c=>[cleanBill(c.bill_no),c]).filter(([k])=>k));
      const byTrack=new Map(cases.map(c=>[cleanTracking(c.tracking_reference),c]).filter(([k])=>k));
      const out=[];
      for(let i=0;i<pdfFiles.length;i++){
        const file=pdfFiles[i];
        setPdfLog(l=>[...l,`Reading ${i+1}/${pdfFiles.length}: ${file.name}`]);
        try{
          const raw=await extractPdfText(file);
          const parsedPdf=parseInvoicePdf(file,raw);
          const match=(parsedPdf.filenameInvoice&&byInternal.get(cleanText(parsedPdf.filenameInvoice)))||(parsedPdf.printedBill&&byBill.get(cleanBill(parsedPdf.printedBill)))||null;
          out.push({
            ...parsedPdf,
            matchedCaseId:match?.id||null,
            matchType:match?(parsedPdf.filenameInvoice&&cleanText(match.internal_invoice_no)===cleanText(parsedPdf.filenameInvoice)?'Invoice #':'Bill No.'):'',
            actualReference:match?.tracking_reference||'',
            customer:parsedPdf.customer||match?.customer_name||'',
            mobile:parsedPdf.mobile||match?.mobile||'',
            selected:true,
            validation:match?'Matched existing case':'Reference required'
          });
        }catch(e){
          out.push({fileName:file.name,filenameInvoice:'',printedBill:'',actualReference:'',customer:'',mobile:'',invoiceDate:'',total:0,paid:0,balance:0,text:'',matchedCaseId:null,matchType:'',selected:false,validation:userError(e,{fallback:'Could not parse this PDF.'})});
        }
      }
      setPdfRows(out);
      setPdfLog(l=>[...l,`PDF review ready: ${out.length} file${out.length===1?'':'s'}.`]);
    }catch(e){notify(userError(e))}finally{setPdfBusy(false)}
  }

  async function importPdfInvoices(){
    const chosen=pdfRows.filter(r=>r.selected);
    if(!chosen.length){notify('Select at least one PDF row to import.');return}
    const missing=chosen.filter(r=>!cleanTracking(r.actualReference));
    if(missing.length){notify(`${missing.length} selected PDF row${missing.length===1?' is':'s are'} missing the real Tracking Reference.`);return}
    const duplicateRefs=chosen.map(r=>cleanTracking(r.actualReference)).filter((x,i,a)=>a.indexOf(x)!==i);
    if(duplicateRefs.length){notify(`Duplicate Tracking Reference in PDF review: ${[...new Set(duplicateRefs)].join(', ')}`);return}

    setPdfImporting(true);setPdfLog([]);
    try{
      const existingById=new Map(cases.map(c=>[c.id,c]));
      const existingByTrack=new Map(cases.map(c=>[cleanTracking(c.tracking_reference),c]));
      let created=0,updated=0;
      for(let i=0;i<chosen.length;i++){
        const r=chosen[i],tr=cleanTracking(r.actualReference);
        const existing=(r.matchedCaseId&&existingById.get(r.matchedCaseId))||existingByTrack.get(tr)||null;
        setPdfLog(l=>[...l,`${i+1}/${chosen.length} · #${tr} · ${r.fileName}`]);

        if(existing){
          const patch={updated_by:session.user.id};
          if(!cleanText(existing.internal_invoice_no)&&r.filenameInvoice)patch.internal_invoice_no=r.filenameInvoice;
          if(!cleanText(existing.bill_no)&&r.printedBill)patch.bill_no=r.printedBill;
          if(!cleanText(existing.mobile)&&r.mobile)patch.mobile=r.mobile;
          if((!cleanText(existing.customer_name)||keyText(existing.customer_name)==='unknown customer')&&r.customer)patch.customer_name=r.customer;
          const {error}=await supabase.from('cases').update(patch).eq('id',existing.id);
          if(error)throw error;
          updated++;
        }else{
          const total=Number(r.total||0),paid=Number(r.paid||0);
          const balance=Number(r.balance||0)>0?Number(r.balance):Math.max(0,total-paid);
          const payload={
            tracking_reference:tr,
            bill_no:cleanBill(r.printedBill)||null,
            internal_invoice_no:cleanText(r.filenameInvoice)||null,
            customer_name:cleanText(r.customer)||'Unknown Customer',
            mobile:cleanText(r.mobile)||null,
            submission_date:isoDate(r.invoiceDate),
            overall_status:'Received',
            total_amount:total,
            advance_paid:paid,
            second_payment:0,
            discount_return:0,
            balance_payment:balance,
            notes:`Imported from PDF invoice: ${r.fileName}`,
            reference_source:'PDF Invoice',
            created_by:session.user.id,
            updated_by:session.user.id
          };
          const {error}=await supabase.from('cases').insert(payload);
          if(error)throw error;
          created++;
        }
      }
      await reload();
      setPdfLog(l=>[...l,`Completed · ${created} created · ${updated} updated.`]);
      notify(`PDF import completed: ${created} created, ${updated} updated.`);
    }catch(e){
      setPdfLog(l=>[...l,`ERROR: ${userError(e)}`]);
      notify(userError(e));
    }finally{setPdfImporting(false)}
  }

  async function discardSaved(){if(!confirm('Discard the saved import draft and recovery checkpoint?'))return;await idbDel(IMPORT_DRAFT_KEY);await idbDel(IMPORT_JOB_KEY);setSavedDraft(null);setProgress(p=>({...p,open:false}));}

  return <div className="import-page">
    <section className="import-hero"><div><span>FAST · RECOVERABLE · REVIEWED</span><h2>Import billing exports without babysitting the browser</h2><p>Analysis is saved automatically in this browser. Imports run in bulk batches, can be paused, and stop for a final review before workflow statuses are finalized.</p></div><div className="import-shield">✓<small>Auto-save<br/>Recovery</small></div></section>
    {savedDraft&&<section className="resume-banner"><div><b>Saved import available</b><span>{savedDraft.job?.status==='review'?'Waiting for final review':savedDraft.job?.status==='paused'?'Paused safely':'Draft saved'} · {savedDraft.draft?.savedAt?new Date(savedDraft.draft.savedAt).toLocaleString('en-GB'):''}</span></div><div>{savedDraft.job?.status==='review'?<button className="primary" onClick={finalizeImport}>Open Final Review</button>:<button className="primary" onClick={()=>runImport(true)}>Resume Saved Import</button>}<button className="secondary" onClick={discardSaved}>Discard</button></div></section>}
    <section className="import-source-bar">
      <div><strong>Import sources</strong><span>Excel remains the primary workflow import. PDF invoices are an additional case / customer recovery source.</span></div>
      <button className="secondary" onClick={()=>{setFiles({master:null,billwise:null,statuswise:null,google:null});setParsed({master:[],billwise:[],statuswise:[],google:[]});setReview(null);clearPdfImport()}}>Clear selected files</button>
    </section>
    <section className="pdf-import-panel">
      <div className="pdf-import-head">
        <div><span className="pdf-kicker">PDF INVOICE IMPORT</span><h3>Recover cases from billing invoice PDFs</h3><p>The invoice filename is matched to legacy internal invoice <b>#</b>. The printed <b>TRACKING NO</b> in the billing PDF is treated as the software Bill No. — never as the customer Tracking Reference.</p></div>
        <div className="pdf-import-actions"><label className="secondary pdf-file-button">Choose PDFs<input type="file" accept=".pdf,application/pdf" multiple onChange={e=>{setPdfFiles([...e.target.files]);setPdfRows([]);setPdfLog([])}}/></label><button className="primary" disabled={pdfBusy||!pdfFiles.length} onClick={analyzePdfs}>{pdfBusy?'Reading PDFs…':'Analyze PDFs'}</button></div>
      </div>
      <div className="pdf-file-summary"><span><b>{pdfFiles.length}</b> PDF{pdfFiles.length===1?'':'s'} selected</span>{pdfFiles.length>0&&<small>{pdfFiles.slice(0,4).map(f=>f.name).join(' · ')}{pdfFiles.length>4?` · +${pdfFiles.length-4} more`:''}</small>}</div>

      {pdfRows.length>0&&<div className="pdf-review">
        <div className="pdf-review-toolbar"><div><strong>PDF mapping review</strong><span>{pdfRows.filter(r=>r.matchedCaseId).length} matched automatically · {pdfRows.filter(r=>!r.matchedCaseId).length} need manual Reference</span></div><div><button className="secondary" onClick={()=>selectAllPdf(true)}>Select all</button><button className="secondary" onClick={()=>selectAllPdf(false)}>Clear</button></div></div>
        <div className="pdf-review-scroll"><table className="pdf-review-table"><thead><tr><th></th><th>PDF / Invoice #</th><th>Printed Bill No.</th><th>Actual Tracking Reference</th><th>Customer</th><th>Mobile</th><th>Match</th></tr></thead><tbody>
          {pdfRows.map((r,i)=><tr key={`${r.fileName}-${i}`} className={!r.selected?'muted-row':''}>
            <td><input type="checkbox" checked={r.selected} onChange={()=>togglePdfRow(i)}/></td>
            <td><strong>{r.fileName}</strong><small>{r.filenameInvoice?`Invoice # ${r.filenameInvoice}`:'No invoice # detected'}</small></td>
            <td><input value={r.printedBill||''} onChange={e=>patchPdfRow(i,{printedBill:e.target.value})} placeholder="Software Bill No."/></td>
            <td><input className={!cleanTracking(r.actualReference)?'needs-value':''} value={r.actualReference||''} onChange={e=>patchPdfRow(i,{actualReference:e.target.value,validation:e.target.value?'Manual Reference':'Reference required'})} placeholder="Required customer Reference"/></td>
            <td><input value={r.customer||''} onChange={e=>patchPdfRow(i,{customer:e.target.value})}/></td>
            <td><input value={r.mobile||''} onChange={e=>patchPdfRow(i,{mobile:e.target.value})}/></td>
            <td><span className={`pdf-match ${r.matchedCaseId?'matched':cleanTracking(r.actualReference)?'manual':'needs'}`}>{r.matchedCaseId?`Matched · ${r.matchType}`:cleanTracking(r.actualReference)?'Manual Reference':'Reference required'}</span></td>
          </tr>)}
        </tbody></table></div>
        <div className="pdf-review-note"><strong>Safe PDF behavior</strong><span>For existing cases, PDF import only fills missing invoice/bill/mobile/customer fields. It does not replace overall status, documents, stages, or existing financial workflow data. New cases require you to confirm the real customer Tracking Reference.</span></div>
        <div className="pdf-review-footer"><span>{pdfRows.filter(r=>r.selected).length} selected</span><button className="primary" disabled={pdfImporting||pdfRows.some(r=>r.selected&&!cleanTracking(r.actualReference))} onClick={importPdfInvoices}>{pdfImporting?'Importing PDFs…':'Import Selected PDFs'}</button></div>
      </div>}
      {pdfLog.length>0&&<div className="pdf-import-log">{pdfLog.slice(-8).map((x,i)=><div key={i} className={x.startsWith('ERROR')?'error':''}>{x}</div>)}</div>}
    </section>
    <section className="import-policy-bar"><div><strong>Clean 2026 import window</strong><span>Default cutoff is 01/01/2026. legacy software controls Bill No., Reference and finance; Google controls operational status/date and historical corrections.</span></div><input type="date" value={cutoffDate} onChange={e=>{setCutoffDate(e.target.value);setReview(null)}}/></section>
    <section className="excel-import-title"><div><strong>Excel workflow import</strong><span>Cases → documents → attestation stages</span></div></section><section className="import-grid">{Object.entries(IMPORT_TYPES).map(([type,meta])=><label className={`import-card ${files[type]?'loaded':''}`} key={type}><input type="file" accept=".xlsx,.xls,.csv" onChange={e=>setFile(type,e.target.files?.[0]||null)}/><div className="upload-icon">⇧</div><strong>{meta.label}</strong><span>{files[type]?.name||meta.hint}</span><small>{files[type]?'Ready to analyze':'Click to choose file'}</small></label>)}</section>
    <section className="panel import-control"><PanelHead title="Import review" subtitle="Analyze first. Nothing is written to Supabase until you approve this review." action={<div className="import-head-actions"><button className="secondary" disabled={busy||(!files.billwise&&!savedDraft?.draft?.parsed?.billwise?.length)} onClick={repairWorkflows}>Repair Documents & Stages</button><button className="primary" disabled={busy||(!files.master&&!files.google)} onClick={analyze}>{busy?'Working…':'Analyze Files'}</button></div>}/>
      {!review?<div className="import-empty"><b>1</b><div><strong>Select your exports above</strong><span>Legacy Master is recommended. Billwise and Status Wise add document workflows. If cases are already imported, upload Billwise Out + Status Wise and use Repair Documents & Stages.</span></div></div>:<div className="review-wrap"><div className="review-kpis"><div><span>Cases to create</span><strong>{review.create}</strong></div><div><span>Cases to update</span><strong>{review.update}</strong></div><div><span>Software cases</span><strong>{review.softwareCases||0}</strong><small>{review.softwareImportable||0} importable</small></div><div className={review.googleOnlyCases?'warn':''}><span>Google-only cases</span><strong>{review.googleOnlyCases||0}</strong></div><div><span>Family child rows</span><strong>{review.familyChildRows||0}</strong></div><div><span>Document rows</span><strong>{review.documents}</strong></div><div><span>Stage rows</span><strong>{review.stages}</strong></div><div className={review.unmatchedBills.length?'warn':''}><span>Unmatched bills</span><strong>{review.unmatchedBills.length}</strong></div><div><span>DD document rows</span><strong>{review.ddRows||0}</strong></div><div><span>Collection rows</span><strong>{review.collectionRows||0}</strong></div><div className={review.duplicateTracking?.length?'warn':''}><span>Duplicate tracking</span><strong>{review.duplicateTracking?.length||0}</strong></div></div>
        <div className="review-note"><strong>Safe matching</strong><p>Tracking comes from <b>Legacy Reference</b> / Google <b>TRACKING</b>. Bill No. links the service and stage exports. Google Current Status/date drives the operational milestone and overall fulfilment status. Software finance remains authoritative. Manual stage overrides remain protected.</p></div>
        {review.candidates?.length>0&&<div className="review-sample"><strong>Sample records</strong><div>{review.candidates.slice(0,6).map((x,i)=><span key={i}><b>{x.tracking}</b>{x.customer||'Unknown customer'}<small>{x.bill||'No Bill No.'}</small></span>)}</div></div>}
        {review.familyChildRows>0&&<div className="import-info-box"><strong>Tracking-family child rows ({review.familyChildRows})</strong><p>Slash references are attached to their root tracking family as document-holder rows. Their exact source tracking reference is preserved on the document.</p><div>{(review.familyChildSample||[]).slice(0,20).map(x=><code key={x.tracking}>{x.tracking} → {x.family} · {x.customer||'No name'}</code>)}</div></div>}{review.googleOnlyCases>0&&<div className="import-warning-box"><strong>True Google-only tracking records ({review.googleOnlyCases})</strong><p>These have no legacy billing row and no root tracking family in the source. They remain separate for review.</p><div>{(review.googleOnlySample||[]).slice(0,20).map(x=><code key={x.tracking}>{x.tracking} · {x.customer||'No name'}</code>)}</div></div>}{review.duplicateTracking?.length>0&&<div className="import-warning-box"><strong>Duplicate tracking references ({review.duplicateTracking.length})</strong><p>These conflicting references are blocked from automatic import. Resolve them separately after the clean import.</p><div>{review.duplicateTracking.slice(0,20).map(x=><code key={x.tracking}>{x.tracking} × {x.count}</code>)}</div></div>}{review.unknownStatus?.length>0&&<div className="import-warning-box"><strong>Unrecognized Google status values ({review.unknownStatus.length})</strong><p>They are not guessed. The original source value is kept for review before the production reset.</p><div>{review.unknownStatus.slice(0,20).map(x=><code key={x}>{x}</code>)}</div></div>}
        {review.unmatchedBills.length>0&&<div className="unmatched"><strong>Needs attention</strong><span>{review.unmatchedBills.slice(0,18).join(', ')}{review.unmatchedBills.length>18?' …':''}</span></div>}
        <div className="import-actions"><button className="secondary" onClick={analyze} disabled={busy}>Re-analyze</button><button className="primary" onClick={()=>runImport(false)} disabled={busy}>Approve Review & Start Import</button></div></div>}
    </section>
    {log.length>0&&<section className="panel import-log"><PanelHead title="Import log" subtitle="Results from this import run"/><div>{log.map((x,i)=><p key={i} className={x.startsWith('ERROR')?'error-line':''}>{x}</p>)}</div></section>}
    {progress.open&&<div className="import-progress-backdrop"><div className="import-progress-modal v32" role="dialog" aria-modal="true"><div className="progress-top"><div><span className="progress-eyebrow">DATA IMPORT</span><h3>{progress.title}</h3><p>{progress.detail}</p></div><div className={`progress-badge ${progress.status}`}>{progress.status==='success'?'Done':progress.status==='review'?'Review':progress.status==='paused'?'Paused':progress.status==='error'?'Stopped':`${Math.round(progress.percent)}%`}</div></div>
      <div className="progress-track"><div className="progress-fill" style={{width:`${Math.max(0,Math.min(100,progress.percent))}%`}}></div></div>
      <div className="progress-meta"><span>{progress.phase||'Import'}</span><b>{progress.total>0?`${progress.current.toLocaleString()} / ${progress.total.toLocaleString()}`:`${Math.round(progress.percent)}%`}</b></div>
      <div className="progress-steps v32"><span className={progress.percent>=8?'done':''}>Cases</span><span className={progress.percent>=38?'done':''}>Documents</span><span className={progress.percent>=59?'done':''}>Stages</span><span className={progress.status==='review'||progress.percent>=92?'done current':''}>Review</span><span className={progress.percent>=93?'done':''}>Finalize</span></div>
      {progress.summary&&<div className="final-review-grid"><div><span>Created</span><b>{progress.summary.created}</b></div><div><span>Updated</span><b>{progress.summary.updated}</b></div><div><span>New docs</span><b>{progress.summary.docsCreated}</b></div><div><span>Manual stages protected</span><b>{progress.summary.manualPreserved}</b></div><div className={progress.summary.unmatchedBills?'warn':''}><span>Unmatched bills</span><b>{progress.summary.unmatchedBills}</b></div></div>}
      <div className="progress-actions">{progress.status==='running'&&<button className="secondary" onClick={()=>{pauseRef.current=true}}>Pause safely</button>}{progress.status==='paused'&&<button className="primary" onClick={()=>{pauseRef.current=false}}>Resume</button>}{progress.status==='review'&&<><button className="secondary" onClick={()=>setImportProgress({open:false})}>Review later</button><button className="primary" onClick={finalizeImport}>Finalize Import</button></>}{progress.status==='success'&&<button className="primary" onClick={()=>setImportProgress({open:false})}>Done</button>}{progress.status==='error'&&<button className="secondary" onClick={()=>setImportProgress({open:false})}>Close</button>}</div>
      <small className="autosave-note">Progress checkpoints are saved automatically in this browser. If this tab closes, reopen Import Data and use Resume Saved Import.</small>
    </div></div>}
  </div>
}

function OperationsView({companyName='Your Organization',session,profile,cases,notify,onOpen,onAppointment,onBatch,onPayment,onCustody,onDeliver,onRefresh,setModuleExport}){
  const [mode,setMode]=useState('attention');
  const [q,setQ]=useState('');
  const [searchBy,setSearchBy]=useState('tracking');
  const [selected,setSelected]=useState(new Set());
  const [appointments,setAppointments]=useState([]);
  const [staff,setStaff]=useState([]);
  const [bulkStatus,setBulkStatus]=useState('');
  const [bulkStaff,setBulkStaff]=useState('');
  const [flagCase,setFlagCase]=useState(null);
  const [flagDraft,setFlagDraft]=useState([]);
  const [showStaff,setShowStaff]=useState(false);
  const [saving,setSaving]=useState(false);
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [filters,setFilters]=useState({status:'',branch:'',staff:'',location:'',balance:'',flag:'',age:'',appointment:'',stage:''});
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(30);
  const [waCase,setWaCase]=useState(null);
  const [waTemplate,setWaTemplate]=useState('status');
  const [waMessage,setWaMessage]=useState('');

  const FLAGS=['Missing Document','Customer Follow-up','Payment Issue','Authority Hold','Appointment Needed','Urgent','Data Exception'];
  const today=new Date().toISOString().slice(0,10);

  useEffect(()=>{
    Promise.all([
      supabase.from('appointments').select('id,case_id,appointment_date,appointment_time,authority,status,assigned_to').eq('appointment_date',today),
      supabase.from('profiles').select('id,full_name,role,is_active').eq('is_active',true).order('full_name')
    ]).then(([a,s])=>{
      if(!a.error)setAppointments(a.data||[]);
      if(!s.error)setStaff(s.data||[]);
    });
  },[]);

  const appointmentByCase=useMemo(()=>{
    const map=new Map();
    for(const a of appointments){
      if(!['Completed','Cancelled','Missed'].includes(a.status)&&!map.has(a.case_id))map.set(a.case_id,a);
    }
    return map;
  },[appointments]);

  const prepared=useMemo(()=>{
    const now=Date.now();
    return cases.map(c=>{
      const docs=c.documents||[];
      const stages=docs.flatMap(d=>d.document_stages||[]);
      const stageNames=stages.map(s=>String(s.stage_name||'').toLowerCase());
      const age=c.updated_at?Math.max(0,Math.floor((now-new Date(c.updated_at).getTime())/86400000)):999;
      const balance=Number(c.balance_payment||0);
      const flags=c.flags||[];
      const exception=!docs.length||docs.some(d=>!(d.document_stages||[]).length)||flags.length>0;
      const hasAppt=appointmentByCase.has(c.id);
      const activeStages=stages.filter(s=>['Pending','Processing'].includes(s.status)).length;
      const mea=stages.some(s=>String(s.stage_name||'').toLowerCase().includes('mea')&&!['Completed','Not Required','Cancelled'].includes(s.status));
      const mofa=stages.some(s=>String(s.stage_name||'').toLowerCase().includes('mofa')&&!['Completed','Not Required','Cancelled'].includes(s.status));
      const attention=['Waiting','Received'].includes(c.overall_status)||balance>0||age>3||exception;
      const searchText=[
        c.tracking_reference,c.customer_name,c.mobile,c.bill_no,c.branches?.name,c.assigned_to,c.physical_location,
        ...flags,...docs.map(d=>d.document_name),...stages.map(s=>s.stage_name)
      ].join(' ').toLowerCase();
      return {c,age,balance,flags,exception,hasAppt,activeStages,mea,mofa,attention,stageNames,searchText};
    });
  },[cases,appointmentByCase]);

  const modes=[
    ['attention','Needs Attention'],
    ['mea','MEA Pending'],
    ['mofa','MOFA Pending'],
    ['appointments','Appointments Today'],
    ['delivery','Ready for Delivery'],
    ['payment','Payment Pending'],
    ['stale','No Update > 3 Days'],
    ['exceptions','Exceptions']
  ];

  const counts=useMemo(()=>{
    const x={attention:0,mea:0,mofa:0,appointments:0,delivery:0,payment:0,stale:0,exceptions:0};
    for(const r of prepared){
      if(r.attention)x.attention++;
      if(r.mea)x.mea++;
      if(r.mofa)x.mofa++;
      if(r.hasAppt)x.appointments++;
      if(r.c.overall_status==='Ready for Delivery')x.delivery++;
      if(r.balance>0)x.payment++;
      if(r.age>3&&!['Delivered','Cancelled'].includes(r.c.overall_status))x.stale++;
      if(r.exception)x.exceptions++;
    }
    return x;
  },[prepared]);

  const branches=useMemo(()=>[...new Set(cases.map(c=>c.branches?.name).filter(Boolean))].sort(),[cases]);
  const locations=useMemo(()=>[...new Set(cases.map(c=>c.physical_location).filter(Boolean))].sort(),[cases]);

  function inQueue(r){
    if(mode==='mea')return r.mea;
    if(mode==='mofa')return r.mofa;
    if(mode==='appointments')return r.hasAppt;
    if(mode==='delivery')return r.c.overall_status==='Ready for Delivery';
    if(mode==='payment')return r.balance>0;
    if(mode==='stale')return r.age>3&&!['Delivered','Cancelled'].includes(r.c.overall_status);
    if(mode==='exceptions')return r.exception;
    return r.attention;
  }

  function passesFilters(r){
    const c=r.c;
    if(filters.status&&c.overall_status!==filters.status)return false;
    if(filters.branch&&(c.branches?.name||'')!==filters.branch)return false;
    if(filters.staff&&(c.assigned_to||'')!==filters.staff)return false;
    if(filters.location&&(c.physical_location||'')!==filters.location)return false;
    if(filters.balance==='due'&&r.balance<=0)return false;
    if(filters.balance==='paid'&&r.balance>0)return false;
    if(filters.flag==='flagged'&&!r.flags.length)return false;
    if(filters.flag==='clear'&&r.flags.length)return false;
    if(filters.age==='0'&&r.age!==0)return false;
    if(filters.age==='1-3'&&(r.age<1||r.age>3))return false;
    if(filters.age==='4-7'&&(r.age<4||r.age>7))return false;
    if(filters.age==='8+'&&r.age<8)return false;
    if(filters.appointment==='today'&&!r.hasAppt)return false;
    if(filters.appointment==='none'&&r.hasAppt)return false;
    if(filters.stage&&!r.stageNames.some(name=>name.includes(filters.stage.toLowerCase())))return false;
    return true;
  }

  const normalizedQ=q.trim().toLowerCase();
  const filteredPrepared=useMemo(()=>{
    return rankCaseSearchResults(prepared.filter(r=>inQueue(r)&&passesFilters(r)&&caseMatchesFieldSearch(r.c,normalizedQ,searchBy,r.searchText)),normalizedQ,searchBy,r=>r.c,r=>r.searchText);
  },[prepared,mode,filters,normalizedQ,searchBy]);

  const totalPages=Math.max(1,Math.ceil(filteredPrepared.length/pageSize));
  const safePage=Math.min(page,totalPages);
  const pageRows=useMemo(()=>{
    const from=(safePage-1)*pageSize;
    return filteredPrepared.slice(from,from+pageSize);
  },[filteredPrepared,safePage,pageSize]);
  useEffect(()=>setModuleExport?.({view:'operations',title:`Operations · ${modes.find(x=>x[0]===mode)?.[1]||'Queue'}`,rows:filteredPrepared.map(r=>({'Tracking No.':r.c.tracking_reference||'','Customer':r.c.customer_name||'','Mobile':r.c.mobile||'','Branch':r.c.branches?.name||'','Status':r.c.overall_status||'','Assigned To':r.c.assigned_to||'','Physical Location':r.c.physical_location||'','Age (Days)':r.age,'Documents':r.c.documents?.length||0,'Active Stages':r.activeStages?.length||0,'Balance (QAR)':r.balance,'Flags':r.flags?.join(', ')||''}))}),[filteredPrepared,mode,setModuleExport]);

  useEffect(()=>setPage(1),[mode,normalizedQ,filters,pageSize]);
  useEffect(()=>{if(page>totalPages)setPage(totalPages)},[totalPages,page]);

  const activeFilterCount=Object.values(filters).filter(Boolean).length;
  const roleText=`${profile?.full_name||session.user.email||'Staff'}${profile?.role?` · ${profile.role}`:''}`;

  function toggle(id){setSelected(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n})}
  function selectVisible(){setSelected(p=>new Set([...p,...pageRows.map(r=>r.c.id)]))}
  function selectAllMatches(){setSelected(new Set(filteredPrepared.map(r=>r.c.id)))}
  function clearSelection(){setSelected(new Set())}
  function clearFilters(){setFilters({status:'',branch:'',staff:'',location:'',balance:'',flag:'',age:'',appointment:'',stage:''})}

  async function writeHistory(ids,action,field,newValue){
    const payload=(Array.isArray(ids)?ids:[ids]).map(id=>({case_id:id,user_id:session.user.id,action,field_name:field,new_value:newValue,metadata:{source:'operations'}}));
    await supabase.from('case_history').insert(payload);
  }

  async function applyBulkStatus(){
    if(!selected.size)return notify('Select cases first.');
    if(!bulkStatus)return notify('Choose an overall status.');
    setSaving(true);
    const ids=[...selected];
    const {error}=await supabase.from('cases').update({overall_status:bulkStatus,updated_by:session.user.id}).in('id',ids);
    if(error){setSaving(false);return notify(userError(error))}
    await writeHistory(ids,'Operations bulk status changed','overall_status',bulkStatus);
    notify(`${ids.length} case(s) changed to ${bulkStatus}.`);
    setBulkStatus('');clearSelection();setSaving(false);await onRefresh?.();
  }

  async function applyBulkStaff(){
    if(!selected.size)return notify('Select cases first.');
    if(!bulkStaff)return notify('Choose a staff member.');
    setSaving(true);
    const ids=[...selected];
    const {error}=await supabase.from('cases').update({assigned_to:bulkStaff,updated_by:session.user.id}).in('id',ids);
    if(error){setSaving(false);return notify(userError(error))}
    await writeHistory(ids,'Operations staff assignment','assigned_to',bulkStaff);
    notify(`${ids.length} case(s) assigned to ${bulkStaff}.`);
    setBulkStaff('');clearSelection();setSaving(false);await onRefresh?.();
  }

  async function setCaseStatus(c,status){
    setSaving(true);
    const {error}=await supabase.from('cases').update({overall_status:status,updated_by:session.user.id}).eq('id',c.id);
    if(error){setSaving(false);return notify(userError(error))}
    await writeHistory(c.id,'Operations quick status','overall_status',status);
    notify(`#${c.tracking_reference} changed to ${status}.`);
    setSaving(false);await onRefresh?.();
  }

  async function assignCase(c,staffName){
    setSaving(true);
    const {error}=await supabase.from('cases').update({assigned_to:staffName||null,updated_by:session.user.id}).eq('id',c.id);
    if(error){setSaving(false);return notify(userError(error))}
    await writeHistory(c.id,'Operations staff assignment','assigned_to',staffName||'Unassigned');
    notify(`#${c.tracking_reference} assignment updated.`);
    setSaving(false);await onRefresh?.();
  }

  async function completeQueueStage(c){
    const needle=mode==='mea'?'mea':mode==='mofa'?'mofa':null;
    if(!needle)return;
    const ids=(c.documents||[]).flatMap(d=>(d.document_stages||[])).filter(s=>String(s.stage_name||'').toLowerCase().includes(needle)&&!['Completed','Not Required','Cancelled'].includes(s.status)).map(s=>s.id);
    if(!ids.length)return notify(`No pending ${needle.toUpperCase()} stages found.`);
    if(!confirm(`Mark ${ids.length} ${needle.toUpperCase()} stage(s) completed for #${c.tracking_reference}?`))return;
    setSaving(true);
    const {error}=await supabase.from('document_stages').update({status:'Completed',is_manual_override:true,updated_by:session.user.id}).in('id',ids);
    if(error){setSaving(false);return notify(userError(error))}
    await writeHistory(c.id,`Operations ${needle.toUpperCase()} completed`,'document_stages','Completed');
    notify(`${needle.toUpperCase()} stages completed.`);
    setSaving(false);await onRefresh?.();
  }

  function openFlags(c){setFlagCase(c);setFlagDraft([...(c.flags||[])])}
  async function saveFlags(){
    setSaving(true);
    const {error}=await supabase.from('cases').update({flags:flagDraft,updated_by:session.user.id}).eq('id',flagCase.id);
    if(error){setSaving(false);return notify(userError(error))}
    await writeHistory(flagCase.id,'Exception flags updated','flags',flagDraft.join(', '));
    notify('Flags updated.');setFlagCase(null);setSaving(false);await onRefresh?.();
  }

  function normalizeWhatsAppNumber(mobile){
    const digits=String(mobile||'').replace(/\D/g,'');
    if(!digits)return '';
    return digits.length===8?`974${digits}`:digits;
  }

  function whatsappTemplate(c,key){
    const balance=Math.max(0,Number(c.balance_payment||0));
    const appt=appointmentByCase.get(c.id);
    const firstName=String(c.customer_name||'Customer').trim().split(/\s+/)[0];
    if(key==='ready')return `Dear ${firstName}, your documents under tracking #${c.tracking_reference} are ready for delivery/collection from ${companyName}.${balance>0?` Outstanding balance: QAR ${balance.toFixed(2)}.`:''}`;
    if(key==='payment')return `Dear ${firstName}, this is a payment reminder from ${companyName} for tracking #${c.tracking_reference}. Outstanding balance: QAR ${balance.toFixed(2)}. Please contact us if you need any clarification.`;
    if(key==='appointment')return `Dear ${firstName}, reminder from ${companyName} for tracking #${c.tracking_reference}.${appt?` Appointment: ${appt.appointment_date}${appt.appointment_time?` at ${appt.appointment_time.slice(0,5)}`:''}${appt.authority?` · ${appt.authority}`:''}.`:' Please contact us regarding your appointment.'}`;
    if(key==='followup')return `Dear ${firstName}, ${companyName} is following up regarding tracking #${c.tracking_reference}. Please contact us when convenient so we can proceed with your case.`;
    if(key==='tracking')return `${companyName}\nTracking No: #${c.tracking_reference}\nCurrent Status: ${c.overall_status}${c.bill_no?`\nBill: ${c.bill_no}`:''}`;
    return `Dear ${firstName}, update from ${companyName} for tracking #${c.tracking_reference}: current status is ${c.overall_status}.${balance>0?` Balance: QAR ${balance.toFixed(2)}.`:''}`;
  }

  function openWhatsApp(c){
    setWaCase(c);setWaTemplate('status');setWaMessage(whatsappTemplate(c,'status'));
  }
  function chooseWaTemplate(key){
    setWaTemplate(key);
    if(waCase)setWaMessage(whatsappTemplate(waCase,key));
  }
  function sendWhatsApp(){
    if(!waCase?.mobile)return notify('No mobile number is available for this case.');
    const number=normalizeWhatsAppNumber(waCase.mobile);
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(waMessage)}`,'_blank','noopener,noreferrer');
  }
  async function copyWa(){
    try{await navigator.clipboard.writeText(waMessage);notify('WhatsApp message copied.')}catch{notify('Could not copy the message.')}
  }
  async function copyTracking(){
    try{await navigator.clipboard.writeText(String(waCase?.tracking_reference||''));notify('Tracking number copied.')}catch{notify('Could not copy the tracking number.')}
  }

  function Pagination(){
    if(filteredPrepared.length<=pageSize)return null;
    const from=(safePage-1)*pageSize+1,to=Math.min(safePage*pageSize,filteredPrepared.length);
    return <div className="ops-pagination">
      <div><strong>{from.toLocaleString()}–{to.toLocaleString()}</strong><span>of {filteredPrepared.length.toLocaleString()}</span></div>
      <div className="ops-page-controls">
        <button className="secondary" disabled={safePage<=1} onClick={()=>setPage(1)}>First</button>
        <button className="secondary" disabled={safePage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹</button>
        <span>Page <b>{safePage}</b> of {totalPages}</span>
        <button className="secondary" disabled={safePage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>›</button>
        <button className="secondary" disabled={safePage>=totalPages} onClick={()=>setPage(totalPages)}>Last</button>
        <select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}><option value="30">30 / page</option><option value="60">60 / page</option><option value="90">90 / page</option></select>
      </div>
    </div>
  }

  return <section className="operations-manager operations-advanced operations-fast">
    <div className="ops-utility-row">
      <span className="role-badge">{roleText}</span>
      <button className="secondary" onClick={()=>setShowStaff(true)}>Staff / Roles</button>
    </div>

    <div className="ops-kpis polished-ops-kpis advanced-ops-kpis compact-ops-kpis">
      {modes.slice(0,4).map(([m,l])=><button className={`ops-kpi ${mode===m?'active':''}`} key={m} onClick={()=>{setMode(m);clearSelection()}}>
        <span>{l}</span><b>{counts[m]}</b><small>Open queue</small>
      </button>)}
    </div>

    <div className="ops-queue-tabs">
      {modes.map(([m,l])=><button key={m} className={mode===m?'active':''} onClick={()=>{setMode(m);clearSelection()}}><span>{l}</span><b>{counts[m]}</b></button>)}
    </div>

    <div className="ops-toolbar advanced-ops-toolbar">
      <SearchBySelect value={searchBy} onChange={setSearchBy}/><div className="ops-searchbox"><Icon name="search" size={15}/><input placeholder={searchBy==='tracking'?'Enter full or partial tracking number…':searchBy==='mobile'?'Enter full or partial mobile number…':searchBy==='bill'?'Enter full or partial bill number…':searchBy==='name'?'Enter customer name…':'Search all fields…'} value={q} onChange={e=>setQ(e.target.value)}/></div>
      <button className={`secondary toolbar-icon-btn ${activeFilterCount?'filter-active':''}`} onClick={()=>setFiltersOpen(true)} title={activeFilterCount?`Advanced filters (${activeFilterCount} active)`:'Advanced filters'} aria-label={activeFilterCount?`Advanced filters, ${activeFilterCount} active`:'Advanced filters'}><Icon name="filter" size={17}/>{activeFilterCount>0&&<b className="toolbar-count-dot">{activeFilterCount}</b>}</button>
      <button className="secondary" onClick={selectVisible}>Select page</button>
      <button className="secondary" disabled={!filteredPrepared.length} onClick={selectAllMatches}>Select all matches</button>
      <button className="secondary" disabled={!selected.size} onClick={clearSelection}>Clear</button>
    </div>

    <div className={`ops-bulkbar ${selected.size?'show':''}`}>
      <div className="ops-selection-count"><strong>{selected.size}</strong><span>selected</span></div>
      <div className="ops-bulk-control"><select value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)}><option value="">Choose status…</option>{CASE_STATUSES.map(x=><option key={x}>{x}</option>)}</select><button className="secondary" disabled={!bulkStatus||saving} onClick={applyBulkStatus}>Update status</button></div>
      <div className="ops-bulk-control"><select value={bulkStaff} onChange={e=>setBulkStaff(e.target.value)}><option value="">Assign staff…</option>{staff.map(s=><option key={s.id} value={s.full_name||s.role}>{s.full_name||s.role}{s.role?` · ${s.role}`:''}</option>)}</select><button className="secondary" disabled={!bulkStaff||saving} onClick={applyBulkStaff}>Assign</button></div>
      <button className="primary" disabled={!selected.size} onClick={()=>onBatch([...selected])}>Create Batch</button>
    </div>

    <div className="ops-result-row">
      <strong>{filteredPrepared.length.toLocaleString()}</strong><span>matching cases</span>
      {activeFilterCount>0&&<button onClick={clearFilters}>Clear filters</button>}
      {normalizedQ&&<span className="ops-search-scope">Search runs across all matches, then pagination is applied.</span>}
    </div>

    <Pagination/>

    <div className="ops-card-grid">
      {pageRows.length?pageRows.map(r=>{
        const c=r.c,m=moneyParts(c),appt=appointmentByCase.get(c.id),flags=r.flags;
        return <article className={`ops-grid-card ${selected.has(c.id)?'selected':''}`} key={c.id}>
          <div className="ops-grid-head">
            <input type="checkbox" checked={selected.has(c.id)} onChange={()=>toggle(c.id)}/>
            <div className="ops-grid-identity">
              <div className="ops-grid-trackline"><div><strong>#{c.tracking_reference}</strong><small>{c.bill_no||'—'}</small></div><StatusPill status={c.overall_status}/></div>
              <h3>{c.customer_name||'Unnamed customer'}</h3>
            </div>
          </div>

          <div className="ops-grid-summary">
            <div><span>Documents</span><strong>{c.documents?.length||0}</strong></div>
            <div><span>Active</span><strong>{r.activeStages}</strong></div>
            <div><span>Balance</span><strong className={m.balance>0?'due':'paid'}>{fmtMoney(m.balance).replace('.00','')}</strong></div>
          </div>

          <div className="ops-grid-info">
            <div><Icon name="phone" size={14}/><section><small>Mobile</small><strong>{c.mobile||'—'}</strong></section></div>
            <div><Icon name="map" size={14}/><section><small>Branch</small><strong>{c.branches?.name||'—'}</strong></section></div>
            <div><Icon name="calendar" size={14}/><section><small>Updated</small><strong>{r.age===0?'Today':`${r.age}d ago`}</strong></section></div>
            <div><Icon name="user" size={14}/><section><small>Assigned</small><strong>{c.assigned_to||'Unassigned'}</strong></section></div>
          </div>

          {appt&&<div className="ops-grid-appt"><Icon name="calendar" size={13}/><span>Today {appt.appointment_time?.slice(0,5)||''}{appt.authority?` · ${appt.authority}`:''}</span></div>}
          {flags.length>0&&<div className="ops-grid-flags">{flags.slice(0,3).map(f=><span key={f}>{f}</span>)}{flags.length>3&&<span>+{flags.length-3}</span>}</div>}

          <div className="ops-grid-controls">
            <select value={c.overall_status} onChange={e=>setCaseStatus(c,e.target.value)} disabled={saving}>{CASE_STATUSES.map(x=><option key={x}>{x}</option>)}</select>
            <select value={c.assigned_to||''} onChange={e=>assignCase(c,e.target.value)} disabled={saving}><option value="">Unassigned</option>{staff.map(s=><option key={s.id} value={s.full_name||s.role}>{s.full_name||s.role}</option>)}</select>
          </div>

          <div className="ops-grid-actions">
            <button className="secondary tiny" onClick={()=>onOpen(c)}><Icon name="eye" size={14}/> Quick View</button>
            {mode==='mea'||mode==='mofa'?<button className="secondary tiny action-accent" onClick={()=>completeQueueStage(c)}>Complete {mode.toUpperCase()}</button>:null}
            <button className="secondary tiny" onClick={()=>onAppointment(c)}><Icon name="calendar" size={14}/> Appointment</button>
            {Number(c.balance_payment||0)>0&&<button className="secondary tiny" onClick={()=>onPayment(c)}>Payment</button>}
            <button className="secondary tiny" onClick={()=>onCustody(c)}>Handover</button>
            {c.overall_status==='Ready for Delivery'&&<button className="primary tiny" onClick={()=>onDeliver(c)}>Deliver</button>}
            <button className="secondary tiny" onClick={()=>openFlags(c)}>Flags{flags.length?` ${flags.length}`:''}</button>
            <button className={`secondary tiny ops-whatsapp ${!c.mobile?'disabled':''}`} disabled={!c.mobile} onClick={()=>openWhatsApp(c)}>WhatsApp ▾</button>
          </div>
        </article>
      }):<div className="empty-soft">Nothing matches this Operations queue.</div>}
    </div>

    <Pagination/>

    {filtersOpen&&<Modal className="ops-filter-modal" title="Advanced Operations Filters" subtitle="Filter this queue without changing case data." onClose={()=>setFiltersOpen(false)}>
      <div className="ops-filter-grid">
        <Field label="Overall Status"><select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="">All statuses</option>{CASE_STATUSES.map(x=><option key={x}>{x}</option>)}</select></Field>
        <Field label="Branch"><select value={filters.branch} onChange={e=>setFilters({...filters,branch:e.target.value})}><option value="">All branches</option>{branches.map(x=><option key={x}>{x}</option>)}</select></Field>
        <Field label="Assigned Staff"><select value={filters.staff} onChange={e=>setFilters({...filters,staff:e.target.value})}><option value="">All staff</option>{staff.map(s=><option key={s.id} value={s.full_name||s.role}>{s.full_name||s.role}</option>)}</select></Field>
        <Field label="Physical Location"><select value={filters.location} onChange={e=>setFilters({...filters,location:e.target.value})}><option value="">All locations</option>{locations.map(x=><option key={x}>{x}</option>)}</select></Field>
        <Field label="Payment"><select value={filters.balance} onChange={e=>setFilters({...filters,balance:e.target.value})}><option value="">Any payment state</option><option value="due">Balance due</option><option value="paid">Paid / no balance</option></select></Field>
        <Field label="Flags"><select value={filters.flag} onChange={e=>setFilters({...filters,flag:e.target.value})}><option value="">Any flag state</option><option value="flagged">Has flags</option><option value="clear">No flags</option></select></Field>
        <Field label="Last Updated"><select value={filters.age} onChange={e=>setFilters({...filters,age:e.target.value})}><option value="">Any age</option><option value="0">Today</option><option value="1-3">1–3 days</option><option value="4-7">4–7 days</option><option value="8+">8+ days</option></select></Field>
        <Field label="Appointment"><select value={filters.appointment} onChange={e=>setFilters({...filters,appointment:e.target.value})}><option value="">Any appointment state</option><option value="today">Appointment today</option><option value="none">No appointment today</option></select></Field>
        <Field label="Stage contains" wide><input value={filters.stage} onChange={e=>setFilters({...filters,stage:e.target.value})} placeholder="e.g. MOFA, MEA, Embassy"/></Field>
      </div>
      <div className="modal-actions"><button className="secondary" onClick={clearFilters}>Clear All</button><button className="primary" onClick={()=>setFiltersOpen(false)}>Apply Filters</button></div>
    </Modal>}

    {flagCase&&<Modal title={`Flags · #${flagCase.tracking_reference}`} subtitle={flagCase.customer_name||'Case'} onClose={()=>setFlagCase(null)}>
      <div className="ops-flag-editor">{FLAGS.map(f=><label key={f}><input type="checkbox" checked={flagDraft.includes(f)} onChange={e=>setFlagDraft(p=>e.target.checked?[...p,f]:p.filter(x=>x!==f))}/><span>{f}</span></label>)}</div>
      <div className="modal-actions"><button className="secondary" onClick={()=>setFlagCase(null)}>Cancel</button><button className="primary" disabled={saving} onClick={saveFlags}>Save Flags</button></div>
    </Modal>}

    {showStaff&&<Modal className="ops-staff-modal" title="Staff & Roles" subtitle="Active staff available for Operations assignment." onClose={()=>setShowStaff(false)}>
      <div className="ops-staff-summary"><div><Icon name="user" size={18}/><span><strong>{staff.length}</strong><small>Active staff</small></span></div><p>These users can be selected when assigning Operations cases.</p></div>
      <div className="ops-staff-list">{staff.length?staff.map(s=>{const assigned=cases.filter(c=>normalizeSearch(c.assigned_to)===normalizeSearch(s.full_name||s.role)).length;return <div className="ops-staff-row" key={s.id}><div className="avatar">{String(s.full_name||s.role||'?').slice(0,1).toUpperCase()}</div><div className="ops-staff-identity"><strong>{s.full_name||'Unnamed staff'}</strong><span>{s.role||'Staff'}</span></div><div className="ops-staff-meta"><b>{assigned}</b><small>assigned</small></div><i>Active</i></div>}):<div className="empty-soft">No active staff profiles found.</div>}</div>
    </Modal>}

    {waCase&&<Modal title={`WhatsApp · #${waCase.tracking_reference}`} subtitle={`${waCase.customer_name||'Customer'} · ${waCase.mobile||'No mobile'}`} onClose={()=>setWaCase(null)}>
      <div className="ops-wa-templates">
        {[['status','Status Update'],['ready','Ready for Delivery'],['payment','Payment Reminder'],['appointment','Appointment Reminder'],['followup','Customer Follow-up'],['tracking','Tracking Details']].map(([k,l])=><button key={k} className={waTemplate===k?'active':''} onClick={()=>chooseWaTemplate(k)}>{l}</button>)}
      </div>
      <Field label="Message" wide><textarea className="ops-wa-message" rows="7" value={waMessage} onChange={e=>{setWaTemplate('custom');setWaMessage(e.target.value)}}/></Field>
      <div className="ops-wa-tools">
        <button className="secondary" onClick={copyTracking}>Copy Tracking</button>
        <button className="secondary" onClick={copyWa}>Copy Message</button>
        <button className="primary" disabled={!waCase.mobile||!waMessage.trim()} onClick={sendWhatsApp}>Open WhatsApp</button>
      </div>
    </Modal>}
  </section>
}
function PaymentsView({companyName='Your Organization',session,cases,notify,seedCase,clearSeed,setModuleExport}){
  const emptyForm={id:'',case_id:'',amount:'',payment_method:'Cash',payment_reference:'',notes:''};
  const [rows,setRows]=useState([]);
  const [q,setQ]=useState('');
  const [searchBy,setSearchBy]=useState('tracking');
  const [open,setOpen]=useState(false);
  const [form,setForm]=useState(emptyForm);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [tab,setTab]=useState('transactions');
  const [method,setMethod]=useState('');
  const [dateFilter,setDateFilter]=useState('all');
  const [balanceFilter,setBalanceFilter]=useState('due');
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(30);
  const [receipt,setReceipt]=useState(null);

  useEffect(()=>{
    if(seedCase){
      setForm({...emptyForm,case_id:seedCase.id,amount:String(Math.max(0,Number(seedCase.balance_payment||0))||'')});
      setOpen(true);clearSeed?.();
    }
  },[seedCase?.id]);

  async function load(){
    setLoading(true);
    const {data,error}=await supabase.from('payments').select('*').order('received_at',{ascending:false}).limit(2000);
    if(error)notify(userError(error));else setRows(data||[]);
    setLoading(false);
  }
  useEffect(()=>{load()},[]);

  const caseMap=useMemo(()=>new Map(cases.map(c=>[c.id,c])),[cases]);
  const searchText=useMemo(()=>new Map(cases.map(c=>[c.id,[c.tracking_reference,c.customer_name,c.mobile,c.bill_no,c.branches?.name].join(' ').toLowerCase()])),[cases]);

  const today=new Date().toISOString().slice(0,10);
  const startOfWeek=useMemo(()=>{const d=new Date();const day=d.getDay();d.setDate(d.getDate()-((day+6)%7));d.setHours(0,0,0,0);return d},[]);
  const startOfMonth=useMemo(()=>{const d=new Date();d.setDate(1);d.setHours(0,0,0,0);return d},[]);

  const todayRows=useMemo(()=>rows.filter(r=>String(r.received_at||'').slice(0,10)===today),[rows,today]);
  const collectedToday=todayRows.reduce((s,r)=>s+Number(r.amount||0),0);
  const collectedMonth=rows.filter(r=>new Date(r.received_at)>=startOfMonth).reduce((s,r)=>s+Number(r.amount||0),0);
  const outstanding=cases.reduce((s,c)=>s+Math.max(0,Number(c.balance_payment||0)),0);
  const dueCases=cases.filter(c=>Number(c.balance_payment||0)>0);

  function datePass(r){
    if(dateFilter==='all')return true;
    const d=new Date(r.received_at);
    if(dateFilter==='today')return String(r.received_at||'').slice(0,10)===today;
    if(dateFilter==='week')return d>=startOfWeek;
    if(dateFilter==='month')return d>=startOfMonth;
    return true;
  }

  const normalizedQ=q.trim().toLowerCase();
    const filteredRows=useMemo(()=>rows.filter(r=>{
    if(method&&r.payment_method!==method)return false;
    if(!datePass(r))return false;
    if(normalizedQ){
      const c=caseMap.get(r.case_id);const hay=`${searchText.get(r.case_id)||''} ${r.payment_reference||''} ${r.payment_method||''} ${r.notes||''}`.toLowerCase();
      if(c&&!caseMatchesFieldSearch(c,normalizedQ,searchBy,hay))return false;
      if(!c&&!hay.includes(normalizedQ))return false;
    }
    return true;
  }),[rows,method,dateFilter,normalizedQ,searchText,caseMap,searchBy]);

  const receivableRows=useMemo(()=>cases.filter(c=>{
    const bal=Number(c.balance_payment||0);
    if(balanceFilter==='due'&&bal<=0)return false;
    if(balanceFilter==='paid'&&bal>0)return false;
    if(!caseMatchesFieldSearch(c,normalizedQ,searchBy,searchText.get(c.id)||''))return false;
    return true;
  }).sort((a,b)=>Number(b.balance_payment||0)-Number(a.balance_payment||0)),[cases,balanceFilter,normalizedQ,searchText,searchBy]);

  const activeRows=tab==='transactions'?filteredRows:receivableRows;
  useEffect(()=>setModuleExport?.({view:'payments',title:tab==='transactions'?'Payment Transactions':'Outstanding Receivables',rows:tab==='transactions'?filteredRows.map(r=>{const c=caseMap.get(r.case_id);return{'Received At':r.received_at||'','Receipt No.':r.receipt_no||'','Tracking No.':c?.tracking_reference||'','Customer':c?.customer_name||'','Amount (QAR)':Number(r.amount||0),'Method':r.payment_method||'','Reference':r.payment_reference||'','Notes':r.notes||''}}):receivableRows.map(c=>{const m=moneyParts(c);return{'Tracking No.':c.tracking_reference||'','Customer':c.customer_name||'','Mobile':c.mobile||'','Branch':c.branches?.name||'','Status':c.overall_status||'','Total (QAR)':Number(c.total_amount||0),'Paid (QAR)':m.paid,'Balance (QAR)':m.balance}})}),[tab,filteredRows,receivableRows,caseMap,setModuleExport]);
  const totalPages=Math.max(1,Math.ceil(activeRows.length/pageSize));
  const safePage=Math.min(page,totalPages);
  const visibleRows=activeRows.slice((safePage-1)*pageSize,safePage*pageSize);
  useEffect(()=>setPage(1),[tab,normalizedQ,method,dateFilter,balanceFilter,pageSize]);
  useEffect(()=>{if(page>totalPages)setPage(totalPages)},[page,totalPages]);

  function selectedCase(){return caseMap.get(form.case_id)}
  function paymentSummary(c){return c?moneyParts(c):{total:0,paid:0,balance:0}}

  function openNew(c=null){
    setForm({...emptyForm,case_id:c?.id||'',amount:c?String(Math.max(0,Number(c.balance_payment||0))||''):''});
    setOpen(true);
  }
  function openEdit(r){
    setForm({id:r.id,case_id:r.case_id,amount:String(r.amount||''),payment_method:r.payment_method||'Cash',payment_reference:r.payment_reference||'',notes:r.notes||''});
    setOpen(true);
  }

  async function updateCaseFinance(caseId,delta){
    const c=caseMap.get(caseId);
    if(!c)return;
    const second=Math.max(0,Number(c.second_payment||0)+delta);
    const balance=Math.max(0,Number(c.total_amount||0)-Number(c.advance_paid||0)-second+Number(c.discount_return||0));
    const {error}=await supabase.from('cases').update({second_payment:second,balance_payment:balance,updated_by:session.user.id}).eq('id',caseId);
    if(error)throw error;
  }

  async function writeHistory(caseId,action,value){
    await supabase.from('case_history').insert({case_id:caseId,user_id:session.user.id,action,field_name:'payment',new_value:value,metadata:{source:'payments'}});
  }

  async function save(e){
    e.preventDefault();
    const amount=Number(form.amount||0);
    if(!form.case_id)return notify('Select a case.');
    if(!(amount>0))return notify('Enter a payment amount greater than zero.');
    setSaving(true);

    if(form.id){
      const old=rows.find(r=>r.id===form.id);
      const {error}=await supabase.from('payments').update({amount,payment_method:form.payment_method,payment_reference:form.payment_reference||null,notes:form.notes||null}).eq('id',form.id);
      if(error){setSaving(false);return notify(userError(error))}
      if(old){
        try{await updateCaseFinance(form.case_id,amount-Number(old.amount||0))}catch(err){setSaving(false);return notify(userError(err))}
      }
      await writeHistory(form.case_id,'Payment edited',`${form.payment_method} · ${fmtMoney(amount)}`);
      notify('Payment updated.');
    }else{
      const {data,error}=await supabase.from('payments').insert({case_id:form.case_id,amount,payment_method:form.payment_method,payment_reference:form.payment_reference||null,notes:form.notes||null,received_by:session.user.id}).select('*').single();
      if(error){setSaving(false);return notify(userError(error))}
      try{await updateCaseFinance(form.case_id,amount)}catch(err){setSaving(false);return notify(userError(err))}
      await writeHistory(form.case_id,'Payment recorded',`${form.payment_method} · ${fmtMoney(amount)}`);
      setReceipt({...data,case:caseMap.get(form.case_id)});
      notify('Payment recorded.');
    }
    setOpen(false);setForm(emptyForm);setSaving(false);await load();
  }

  async function deletePayment(r){
    const c=caseMap.get(r.case_id);
    if(!confirm(`Delete payment ${fmtMoney(r.amount)}${c?` for #${c.tracking_reference}`:''}?`))return;
    setSaving(true);
    const {error}=await supabase.from('payments').delete().eq('id',r.id);
    if(error){setSaving(false);return notify(userError(error))}
    try{await updateCaseFinance(r.case_id,-Number(r.amount||0))}catch(err){setSaving(false);return notify(userError(err))}
    await writeHistory(r.case_id,'Payment deleted',`${r.payment_method||'Payment'} · ${fmtMoney(r.amount)}`);
    notify('Payment deleted and case balance recalculated.');
    setSaving(false);await load();
  }

  function printReceipt(r){const c=r.case||caseMap.get(r.case_id);return printConfiguredDocument({orgId:c?.organization_id||activePrintContext.orgId,brand:activePrintContext.brand,currency:activePrintContext.currency,kind:'receipt',record:{...r,document_no:r.payment_reference||c?.bill_no||'',customer_name:c?.customer_name,customer_mobile:c?.mobile,customer_email:c?.customer_email,tracking_reference:c?.tracking_reference,method:r.payment_method,balance:c?.balance_payment},notify})}

  function Pagination(){
    if(activeRows.length<=pageSize)return null;
    return <div className="payments-pagination">
      <span>{((safePage-1)*pageSize+1).toLocaleString()}–{Math.min(safePage*pageSize,activeRows.length).toLocaleString()} of {activeRows.length.toLocaleString()}</span>
      <div><button className="secondary" disabled={safePage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹</button><b>{safePage} / {totalPages}</b><button className="secondary" disabled={safePage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>›</button><select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}><option value="30">30 / page</option><option value="60">60 / page</option><option value="90">90 / page</option></select></div>
    </div>
  }

  const current=selectedCase(),summary=paymentSummary(current);

  return <section className="payments-manager">
    <div className="module-titlebar payments-titlebar">
      <div><h1>Payments</h1><p>Record collections, monitor outstanding balances and print receipts.</p></div>
      <button className="primary" onClick={()=>openNew()}>+ Record Payment</button>
    </div>

    <div className="payments-kpis">
      <div><span>COLLECTED TODAY</span><strong>{fmtMoney(collectedToday).replace('.00','')}</strong><small>{todayRows.length} transaction{todayRows.length===1?'':'s'}</small></div>
      <div><span>THIS MONTH</span><strong>{fmtMoney(collectedMonth).replace('.00','')}</strong><small>Recorded payments</small></div>
      <div><span>OUTSTANDING</span><strong className="due">{fmtMoney(outstanding).replace('.00','')}</strong><small>{dueCases.length.toLocaleString()} cases with balance</small></div>
      <div><span>TRANSACTIONS</span><strong>{rows.length.toLocaleString()}</strong><small>Loaded history</small></div>
    </div>

    <div className="payments-panel">
      <div className="payments-tabs">
        <button className={tab==='transactions'?'active':''} onClick={()=>setTab('transactions')}>Transactions <b>{filteredRows.length}</b></button>
        <button className={tab==='receivables'?'active':''} onClick={()=>setTab('receivables')}>Receivables <b>{receivableRows.length}</b></button>
      </div>

      <div className="payments-toolbar">
        <SearchBySelect value={searchBy} onChange={setSearchBy}/><div className="payments-search"><Icon name="search" size={15}/><input placeholder={tab==='transactions'?'Search tracking, customer, reference, method…':'Search tracking, customer, mobile…'} value={q} onChange={e=>setQ(e.target.value)}/></div>
        {tab==='transactions'?<>
          <select value={method} onChange={e=>setMethod(e.target.value)}><option value="">All methods</option><option>Cash</option><option>Card</option><option>Bank Transfer</option><option>Online</option></select>
          <select value={dateFilter} onChange={e=>setDateFilter(e.target.value)}><option value="all">All dates</option><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option></select>
        </>:<select value={balanceFilter} onChange={e=>setBalanceFilter(e.target.value)}><option value="due">Balance due</option><option value="">All cases</option><option value="paid">Paid / no balance</option></select>}
        <button className="secondary" onClick={()=>{setQ('');setMethod('');setDateFilter('all');setBalanceFilter('due')}}>Clear</button>
      </div>

      <Pagination/>

      {loading?<div className="payments-empty">Loading payments…</div>:tab==='transactions'?<div className="payment-card-grid">
        {visibleRows.map(r=>{const c=caseMap.get(r.case_id);return <article className="payment-tx-card" key={r.id}>
          <div className="payment-tx-head"><div><strong>#{c?.tracking_reference||'—'}</strong><small>{r.received_at?new Date(r.received_at).toLocaleString('en-GB'):'—'}</small></div><span className="payment-method-pill">{r.payment_method||'Payment'}</span></div>
          <h3>{c?.customer_name||'Unknown case'}</h3>
          <div className="payment-tx-amount">{fmtMoney(r.amount)}</div>
          <div className="payment-tx-info"><div><small>MOBILE</small><strong>{c?.mobile||'—'}</strong></div><div><small>REFERENCE</small><strong>{r.payment_reference||'—'}</strong></div><div><small>BRANCH</small><strong>{c?.branches?.name||'—'}</strong></div><div><small>NOTE</small><strong>{r.notes||'—'}</strong></div></div>
          <div className="payment-tx-actions"><button className="secondary tiny" onClick={()=>setReceipt({...r,case:c})}>Receipt</button><button className="secondary tiny" onClick={()=>openEdit(r)}>Edit</button><button className="danger tiny" disabled={saving} onClick={()=>deletePayment(r)}>Delete</button></div>
        </article>})}
        {!visibleRows.length&&<div className="payments-empty">No payment transactions match the current filters.</div>}
      </div>:<div className="receivable-card-grid">
        {visibleRows.map(c=>{const m=moneyParts(c);return <article className="receivable-card" key={c.id}>
          <div className="receivable-head"><div><strong>#{c.tracking_reference}</strong><small>{c.bill_no||'—'}</small></div><StatusPill status={c.overall_status}/></div>
          <h3>{c.customer_name||'Unnamed customer'}</h3>
          <div className="receivable-money"><div><span>TOTAL</span><strong>{fmtMoney(c.total_amount).replace('.00','')}</strong></div><div><span>PAID</span><strong>{fmtMoney(m.paid).replace('.00','')}</strong></div><div><span>BALANCE</span><strong className={m.balance>0?'due':'paid'}>{fmtMoney(m.balance).replace('.00','')}</strong></div></div>
          <div className="receivable-meta"><span>{c.mobile||'No mobile'}</span><span>{c.branches?.name||'No branch'}</span></div>
          <div className="receivable-actions"><button className="secondary tiny" onClick={()=>openNew(c)}>Record Payment</button></div>
        </article>})}
        {!visibleRows.length&&<div className="payments-empty">No receivables match the current filters.</div>}
      </div>}

      <Pagination/>
    </div>

    {open&&<Modal title={form.id?'Edit Payment':'Record Payment'} subtitle={form.id?'Adjust this transaction and recalculate the case balance.':'Add a payment transaction to a case.'} onClose={()=>{setOpen(false);setForm(emptyForm)}}>
      <form className="payment-form" onSubmit={save}>
        <Field label="Case" wide><select required disabled={!!form.id} value={form.case_id} onChange={e=>setForm({...form,case_id:e.target.value,amount:String(Math.max(0,Number(caseMap.get(e.target.value)?.balance_payment||0))||'')})}><option value="">Select case</option>{cases.map(c=><option key={c.id} value={c.id}>{c.tracking_reference} · {c.customer_name}</option>)}</select></Field>
        {current&&<div className="payment-case-summary wide"><div><small>TRACKING</small><strong>#{current.tracking_reference}</strong></div><div><small>TOTAL</small><strong>{fmtMoney(current.total_amount)}</strong></div><div><small>PAID</small><strong>{fmtMoney(summary.paid)}</strong></div><div><small>BALANCE</small><strong className={summary.balance>0?'due':'paid'}>{fmtMoney(summary.balance)}</strong></div></div>}
        <Field label="Amount"><input required type="number" step="0.01" min="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></Field>
        <Field label="Method"><select value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})}><option>Cash</option><option>Card</option><option>Bank Transfer</option><option>Online</option></select></Field>
        <Field label="Reference"><input value={form.payment_reference} onChange={e=>setForm({...form,payment_reference:e.target.value})} placeholder="Card / transfer / receipt reference"/></Field>

        <div className="payment-quick-amounts wide"><span>Quick amount</span>{[50,100,150,200,300,500].map(x=><button type="button" key={x} onClick={()=>setForm({...form,amount:String(x)})}>QAR {x}</button>)}{current&&Number(current.balance_payment||0)>0&&<button type="button" className="balance" onClick={()=>setForm({...form,amount:String(Number(current.balance_payment||0))})}>Full Balance</button>}</div>
        <div className="modal-actions wide"><button type="button" className="secondary" onClick={()=>{setOpen(false);setForm(emptyForm)}}>Cancel</button><button className="primary" disabled={saving}>{saving?'Saving…':form.id?'Save Changes':'Save Payment'}</button></div>
      </form>
    </Modal>}

    {receipt&&<Modal className="payment-receipt-modal" title="Payment Receipt" subtitle={`A verified collection record for tracking #${receipt.case?.tracking_reference||caseMap.get(receipt.case_id)?.tracking_reference||'—'}`} onClose={()=>setReceipt(null)}>
      <div className="receipt-preview premium-receipt-preview">
        <div className="receipt-preview-head"><div><small>PAYMENT CONFIRMATION</small><strong>{companyName}</strong><span>Receipt · #{receipt.case?.tracking_reference||caseMap.get(receipt.case_id)?.tracking_reference||'—'}</span></div><b>{new Date(receipt.received_at||Date.now()).toLocaleDateString('en-GB')}</b></div>
        <div className="receipt-big"><small>AMOUNT RECEIVED</small>{fmtMoney(receipt.amount)}</div>
        <div className="receipt-customer"><span>Customer</span><strong>{receipt.case?.customer_name||caseMap.get(receipt.case_id)?.customer_name||'—'}</strong><small>{receipt.case?.mobile||caseMap.get(receipt.case_id)?.mobile||'No mobile recorded'}</small></div>
        <div className="receipt-facts"><div><span>Payment method</span><strong>{receipt.payment_method||'—'}</strong></div><div><span>Reference</span><strong>{receipt.payment_reference||'—'}</strong></div><div><span>Received at</span><strong>{new Date(receipt.received_at||Date.now()).toLocaleString('en-GB')}</strong></div><div><span>Current balance</span><strong>{fmtMoney((receipt.case||caseMap.get(receipt.case_id))?.balance_payment)}</strong></div></div>
        {receipt.notes&&<div className="receipt-note"><span>Notes</span><strong>{receipt.notes}</strong></div>}
      </div>
      <div className="modal-actions receipt-actions"><button className="secondary" onClick={()=>setReceipt(null)}>Close</button><button className="primary" onClick={()=>printReceipt(receipt)}><Icon name="print" size={16}/> Print Receipt</button></div>
    </Modal>}
  </section>
}
function CustodyView({session,profile,branches:branchOptions=[],cases,notify,seedCase,clearSeed,onOpen,onRefresh,setModuleExport}){
  const emptyForm={case_id:'',document_ids:[],from_location:'',to_location:'',notes:''};
  const [rows,setRows]=useState([]);
  const [transfers,setTransfers]=useState([]);
  const [profiles,setProfiles]=useState([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState('current');
  const [q,setQ]=useState('');
  const [searchBy,setSearchBy]=useState('tracking');
  const [open,setOpen]=useState(false);
  const [form,setForm]=useState(emptyForm);
  const [caseSearch,setCaseSearch]=useState('');
  const [selected,setSelected]=useState(new Set());
  const [bulkOpen,setBulkOpen]=useState(false);
  const [bulkTo,setBulkTo]=useState('');
  const [bulkNotes,setBulkNotes]=useState('');
  const [detail,setDetail]=useState(null);
  const [receiptTransfer,setReceiptTransfer]=useState(null);
  const [receiptStates,setReceiptStates]=useState({});
  const [receiptNotes,setReceiptNotes]=useState('');
  const [saving,setSaving]=useState(false);
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(30);
  const [filters,setFilters]=useState({location:'',branch:'',status:'',locationState:'located',age:''});
  const [historyFilters,setHistoryFilters]=useState({from:'',to:'',scope:'',date:''});
  const isAdmin=isAdminProfile(profile);
  const ownBranchId=profile?.branch_id||'';
  const [custodyBranchId,setCustodyBranchId]=useState(isAdmin?'All':ownBranchId||'All');
  useEffect(()=>setCustodyBranchId(isAdmin?'All':ownBranchId||'All'),[isAdmin,ownBranchId]);
  const ownBranchName=branchOptions.find(b=>b.id===ownBranchId)?.name||'';
  const sameLocation=(a,b)=>String(a||'').toLowerCase().replace(/\s+branch$/,'').trim()===String(b||'').toLowerCase().replace(/\s+branch$/,'').trim();

  useEffect(()=>{
    if(seedCase){
      startMove(seedCase);
      clearSeed?.();
    }
  },[seedCase?.id]);

  async function load(){
    setLoading(true);
    const [m,p,t]=await Promise.all([
      supabase.from('custody_movements').select('*').order('moved_at',{ascending:false}).limit(3000),
      supabase.from('profiles').select('id,full_name,role').order('full_name'),
      supabase.from('custody_transfers').select('*,custody_transfer_items!custody_transfer_items_transfer_id_fkey(*)').order('requested_at',{ascending:false}).limit(1000)
    ]);
    if(m.error)notify(userError(m.error));else setRows(m.data||[]);
    if(!p.error)setProfiles(p.data||[]);
    if(!t.error)setTransfers(t.data||[]);
    setLoading(false);
  }
  useEffect(()=>{load()},[]);

  const caseMap=useMemo(()=>new Map(cases.map(c=>[c.id,c])),[cases]);
  const profileMap=useMemo(()=>new Map(profiles.map(p=>[p.id,p])),[profiles]);
  const docMap=useMemo(()=>{
    const map=new Map();
    for(const c of cases)for(const d of c.documents||[])map.set(d.id,{...d,case_id:c.id});
    return map;
  },[cases]);
  const lastMovementByCase=useMemo(()=>{
    const map=new Map();
    for(const r of rows)if(!map.has(r.case_id))map.set(r.case_id,r);
    return map;
  },[rows]);
  const today=new Date().toISOString().slice(0,10);
  const locations=useMemo(()=>[...new Set(branchOptions.map(b=>b.name).filter(Boolean))].sort(),[branchOptions]);
  const branchNames=locations;
  const scopedCases=useMemo(()=>custodyBranchId==='All'?cases:cases.filter(c=>c.branch_id===custodyBranchId),[cases,custodyBranchId]);

  const movementsToday=useMemo(()=>rows.filter(r=>String(r.moved_at||'').slice(0,10)===today).length,[rows,today]);
  const locatedCases=useMemo(()=>scopedCases.filter(c=>c.physical_location).length,[scopedCases]);
  const unlocatedCases=scopedCases.length-locatedCases;
  const docMovements=useMemo(()=>rows.filter(r=>r.document_id).length,[rows]);

  function movementAge(c){
    const r=lastMovementByCase.get(c.id);
    if(!r?.moved_at)return null;
    return Math.max(0,Math.floor((Date.now()-new Date(r.moved_at).getTime())/86400000));
  }

  const normalizedQ=q.trim().toLowerCase();
    const currentRows=useMemo(()=>cases.filter(c=>{
    if(custodyBranchId!=='All'&&c.branch_id!==custodyBranchId)return false;
    if(filters.locationState==='located'&&!c.physical_location)return false;
    if(filters.locationState==='unlocated'&&c.physical_location)return false;
    if(filters.location&&(c.physical_location||'')!==filters.location)return false;
    if(filters.branch&&(c.branches?.name||'')!==filters.branch)return false;
    if(filters.status&&c.overall_status!==filters.status)return false;
    const age=movementAge(c);
    if(filters.age==='today'&&age!==0)return false;
    if(filters.age==='1-3'&&(age===null||age<1||age>3))return false;
    if(filters.age==='4+'&&(age===null||age<4))return false;
    if(normalizedQ){
      const hay=[c.tracking_reference,c.customer_name,c.mobile,c.bill_no,c.physical_location,c.branches?.name,...(c.documents||[]).map(d=>d.document_name)].join(' ').toLowerCase();
      if(!caseMatchesFieldSearch(c,normalizedQ,searchBy,hay))return false;
    }
    return true;
  }),[cases,filters,normalizedQ,lastMovementByCase,searchBy,custodyBranchId]);

  const historyRows=useMemo(()=>rows.filter(r=>{
    const c=caseMap.get(r.case_id),d=docMap.get(r.document_id);
    if(historyFilters.from&&String(r.from_location||'')!==historyFilters.from)return false;
    if(historyFilters.to&&String(r.to_location||'')!==historyFilters.to)return false;
    if(historyFilters.scope==='case'&&r.document_id)return false;
    if(historyFilters.scope==='document'&&!r.document_id)return false;
    if(historyFilters.date&&String(r.moved_at||'').slice(0,10)!==historyFilters.date)return false;
    if(normalizedQ){
      const hay=[c?.tracking_reference,c?.customer_name,c?.mobile,d?.document_name,r.from_location,r.to_location,r.notes,profileMap.get(r.handed_by)?.full_name].join(' ').toLowerCase();
      if(c&&!caseMatchesFieldSearch(c,normalizedQ,searchBy,hay))return false;
      if(!c&&!hay.includes(normalizedQ))return false;
    }
    return true;
  }),[rows,historyFilters,normalizedQ,caseMap,docMap,profileMap,searchBy]);

  const visibleTransfers=useMemo(()=>isAdmin?transfers:transfers.filter(t=>sameLocation(t.from_location,ownBranchName)||sameLocation(t.to_location,ownBranchName)),[transfers,isAdmin,ownBranchName]);
  const pendingTransfers=useMemo(()=>visibleTransfers.filter(t=>t.status==='In Transit'),[visibleTransfers]);
  const receivedTransfers=useMemo(()=>visibleTransfers.filter(t=>{if(t.status!=='Received')return false;if(!normalizedQ)return true;const itemCases=(t.custody_transfer_items||[]).map(i=>caseMap.get(i.case_id));const hay=[t.transfer_no,t.from_location,t.to_location,t.notes,t.received_at,...itemCases.flatMap(c=>[c?.tracking_reference,c?.customer_name,c?.mobile])].join(' ').toLowerCase();return hay.includes(normalizedQ)}),[visibleTransfers,normalizedQ,caseMap]);
  const activeRows=tab==='current'?currentRows:tab==='history'?historyRows:receivedTransfers;
  useEffect(()=>setModuleExport?.({view:'custody',title:tab==='current'?'Current Custody':tab==='history'?'Custody Movement History':'Received Transfer Archive',rows:tab==='current'?currentRows.map(c=>{const last=lastMovementByCase.get(c.id);return{'Tracking No.':c.tracking_reference||'','Customer':c.customer_name||'','Mobile':c.mobile||'','Branch':c.branches?.name||'','Status':c.overall_status||'','Current Location':c.physical_location||'Unassigned','Documents':c.documents?.length||0,'Last Movement':last?.moved_at||''}}):tab==='history'?historyRows.map(r=>{const c=caseMap.get(r.case_id),d=docMap.get(r.document_id),actor=profileMap.get(r.handed_by);return{'Moved At':r.moved_at||'','Tracking No.':c?.tracking_reference||'','Customer':c?.customer_name||'','Scope':d?.document_name||'Whole Case','From':r.from_location||'Unassigned','To':r.to_location||'','Handled By':actor?.full_name||'Staff','Notes':r.notes||''}}):receivedTransfers.map(t=>({'Transfer No.':t.transfer_no||'','From':t.from_location||'','To':t.to_location||'','Requested':t.requested_at||'','Received':t.received_at||'','Documents':t.custody_transfer_items?.length||0,'Notes':t.notes||''}))}),[tab,currentRows,historyRows,receivedTransfers,lastMovementByCase,caseMap,docMap,profileMap,setModuleExport]);
  const totalPages=Math.max(1,Math.ceil(activeRows.length/pageSize));
  const safePage=Math.min(page,totalPages);
  const visibleRows=activeRows.slice((safePage-1)*pageSize,safePage*pageSize);
  useEffect(()=>setPage(1),[tab,normalizedQ,filters,historyFilters,pageSize]);
  useEffect(()=>{if(page>totalPages)setPage(totalPages)},[page,totalPages]);

  const selectedCase=caseMap.get(form.case_id);
  const handoverDestinations=branchOptions.filter(b=>!sameLocation(b.name,form.from_location||(!isAdmin?ownBranchName:'')));
  const selectedOrigins=[...new Set([...selected].map(id=>caseMap.get(id)?.physical_location||caseMap.get(id)?.branches?.name).filter(Boolean))];
  const bulkDestinations=branchOptions.filter(b=>!selectedOrigins.some(origin=>sameLocation(origin,b.name))&&(!ownBranchName||isAdmin||!sameLocation(b.name,ownBranchName)));
  const caseMatches=useMemo(()=>{
    const s=caseSearch.trim().toLowerCase();
    if(!s)return [];
    return scopedCases.filter(c=>caseMatchesFieldSearch(c,s,'all',[c.tracking_reference,c.customer_name,c.mobile,c.bill_no].join(' '))).slice(0,8);
  },[caseSearch,scopedCases]);

  function startMove(c){
    setForm({case_id:c.id,document_ids:(c.documents||[]).map(d=>d.id),from_location:c.physical_location||c.branches?.name||'',to_location:'',notes:''});
    setCaseSearch(`#${c.tracking_reference} · ${c.customer_name||''}`);
    setOpen(true);
  }
  function chooseCase(c){
    setForm({case_id:c.id,document_ids:(c.documents||[]).map(d=>d.id),from_location:c.physical_location||c.branches?.name||'',to_location:'',notes:''});
    setCaseSearch(`#${c.tracking_reference} · ${c.customer_name||''}`);
  }
  function toggle(id){setSelected(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n})}
  function selectPage(){setSelected(p=>new Set([...p,...visibleRows.filter(x=>x.id).map(c=>c.id)]))}
  function clearSelection(){setSelected(new Set())}

  async function writeHistory(caseId,action,value){
    await supabase.from('case_history').insert({case_id:caseId,user_id:session.user.id,action,field_name:'physical_location',new_value:value,metadata:{source:'custody'}});
  }

  async function save(e){
    e.preventDefault();
    if(!form.case_id)return notify('Select a case.');
    if(!form.to_location.trim())return notify('Enter the destination location.');
    if((selectedCase?.documents||[]).length&&!form.document_ids.length)return notify('Select at least one document.');
    setSaving(true);
    const transferNo=`TRF-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${String(Date.now()).slice(-6)}`;
    const destinationBranch=branchOptions.find(b=>sameLocation(b.name,form.to_location));
    const sourceBranch=branchOptions.find(b=>sameLocation(b.name,form.from_location));
    const {data,error}=await supabase.from('custody_transfers').insert({transfer_no:transferNo,from_branch_id:sourceBranch?.id||selectedCase?.branch_id||ownBranchId||null,to_branch_id:destinationBranch?.id||null,from_location:form.from_location||null,to_location:form.to_location.trim(),status:'In Transit',requested_by:session.user.id,notes:form.notes||null}).select('*').single();
    if(error){setSaving(false);return notify(userError(error))}
    const documentIds=form.document_ids.length?form.document_ids:[null];
    const items=documentIds.map(documentId=>({transfer_id:data.id,case_id:form.case_id,document_id:documentId}));
    const itemResult=await supabase.from('custody_transfer_items').insert(items);
    if(itemResult.error){await supabase.from('custody_transfers').delete().eq('id',data.id);setSaving(false);return notify(userError(itemResult.error))}
    await writeHistory(form.case_id,'Custody transfer dispatched',`${form.from_location||'Unassigned'} → ${form.to_location.trim()} · ${transferNo}`);
    setOpen(false);setForm(emptyForm);setCaseSearch('');setSaving(false);
    notify(`${transferNo} created. Location will change after receipt is confirmed.`);
    await load();await onRefresh?.();
  }

  async function bulkMove(e){
    e.preventDefault();
    if(!selected.size)return notify('Select cases first.');
    if(!bulkTo.trim())return notify('Enter a destination location.');
    setSaving(true);
    const ids=[...selected],transferNo=`TRF-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${String(Date.now()).slice(-6)}`;
    const origins=[...new Set(ids.map(id=>caseMap.get(id)?.physical_location||caseMap.get(id)?.branches?.name).filter(Boolean))];
    const destinationBranch=branchOptions.find(b=>sameLocation(b.name,bulkTo));
    const sourceBranchIds=[...new Set(origins.map(origin=>branchOptions.find(b=>sameLocation(b.name,origin))?.id).filter(Boolean))];
    const {data,error}=await supabase.from('custody_transfers').insert({transfer_no:transferNo,from_branch_id:sourceBranchIds.length===1?sourceBranchIds[0]:ownBranchId||null,to_branch_id:destinationBranch?.id||null,from_location:origins.length===1?origins[0]:'Multiple locations',to_location:bulkTo.trim(),status:'In Transit',requested_by:session.user.id,notes:bulkNotes||null}).select('*').single();
    if(error){setSaving(false);return notify(userError(error))}
    const items=ids.flatMap(id=>{const docs=caseMap.get(id)?.documents||[];return docs.length?docs.map(d=>({transfer_id:data.id,case_id:id,document_id:d.id})):[{transfer_id:data.id,case_id:id,document_id:null}]});
    const itemResult=await supabase.from('custody_transfer_items').insert(items);
    if(itemResult.error){await supabase.from('custody_transfers').delete().eq('id',data.id);setSaving(false);return notify(userError(itemResult.error))}
    await supabase.from('case_history').insert(ids.map(id=>({case_id:id,user_id:session.user.id,action:'Custody batch dispatched',field_name:'physical_location',new_value:`${bulkTo.trim()} · ${transferNo}`,metadata:{source:'custody',transfer_id:data.id}})));
    notify(`${transferNo} created with ${items.length} document(s). Awaiting receipt.`);
    setBulkOpen(false);setBulkTo('');setBulkNotes('');clearSelection();setSaving(false);
    await load();await onRefresh?.();
  }

  function openReceipt(transfer){
    if(!isAdmin&&!sameLocation(transfer.to_location,ownBranchName))return notify(`Only ${transfer.to_location} branch can confirm this receipt.`);
    setReceiptStates(Object.fromEntries((transfer.custody_transfer_items||[]).map(item=>[item.id,{status:item.receive_status==='Pending'?'Verified':item.receive_status||'Verified',note:item.discrepancy_note||''}])));
    setReceiptNotes(transfer.receipt_notes||'');setReceiptTransfer(transfer);
  }

  async function confirmTransfer(e){
    e.preventDefault();const transfer=receiptTransfer;
    if(!transfer||saving)return;
    if(saving)return;
    if(!isAdmin&&!sameLocation(transfer.to_location,ownBranchName))return notify(`Only ${transfer.to_location} branch can confirm this receipt.`);
    setSaving(true);
    const items=transfer.custody_transfer_items||[];
    const checkedItems=items.map(item=>({...item,receive_status:receiptStates[item.id]?.status||'Verified',discrepancy_note:receiptStates[item.id]?.note||null}));
    const documentIds=checkedItems.filter(x=>x.receive_status!=='Missing').map(x=>x.document_id).filter(Boolean);
    const caseIds=[...new Set(items.map(x=>x.case_id).filter(Boolean))];
    const hasDiscrepancy=checkedItems.some(x=>x.receive_status==='Missing'||x.receive_status==='Damaged');
    const rpcResult=await supabase.rpc('confirm_custody_receipt',{target_transfer:transfer.id,receipt_items:checkedItems.map(x=>({id:x.id,status:x.receive_status,note:x.discrepancy_note||''})),receipt_note:receiptNotes||null});
    if(!rpcResult.error){
      setReceiptTransfer(null);setReceiptStates({});setReceiptNotes('');setSaving(false);
      notify(hasDiscrepancy?`${transfer.transfer_no} received with discrepancy recorded.`:`${transfer.transfer_no} fully received. Current document location updated.`);
      Promise.all([load(),onRefresh?.()]).catch(()=>{});return;
    }
    setSaving(false);
    return notify(userError(rpcResult.error));
  }

  function printTransferManifest(t){
    const items=t.custody_transfer_items||[],w=window.open('','_blank','width=980,height=900');if(!w)return notify('Please allow pop-ups to print the manifest.');
    const rowsHtml=items.map((item,i)=>{const c=caseMap.get(item.case_id),d=docMap.get(item.document_id);return `<tr><td>${i+1}</td><td>#${escapeHtml(c?.tracking_reference||'—')}</td><td>${escapeHtml(c?.customer_name||'—')}</td><td>${escapeHtml(d?.document_name||'Whole case')}</td><td>${escapeHtml(d?.holder_name||c?.customer_name||'—')}</td><td>${escapeHtml(item.receive_status||'Pending')}</td></tr>`}).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(t.transfer_no)}</title><style>${premiumPrintCss('A4 portrait')}</style></head><body><div class="print-page">${premiumPrintHeader('Document Custody Manifest',`${items.length} document movement record${items.length===1?'':'s'}`,t.transfer_no||'INTERNAL TRANSFER')}<main class="print-body"><section class="print-meta"><div><small>Transfer No.</small><strong>${escapeHtml(t.transfer_no||'—')}</strong></div><div><small>Requested</small><strong>${escapeHtml(t.requested_at?new Date(t.requested_at).toLocaleString('en-GB'):'—')}</strong></div><div><small>Documents</small><strong>${items.length}</strong></div><div><small>Status</small><strong>${escapeHtml(t.status||'In Transit')}</strong></div></section><div class="print-route"><div><small>FROM</small><strong>${escapeHtml(t.from_location||'Unassigned')}</strong></div><b>→</b><div><small>TO</small><strong>${escapeHtml(t.to_location||'—')}</strong></div></div><table class="print-table"><thead><tr><th>#</th><th>Tracking</th><th>Customer</th><th>Document</th><th>Holder</th><th>Receipt</th></tr></thead><tbody>${rowsHtml}</tbody></table>${t.notes?`<div class="print-note"><b>Dispatch notes</b><br>${escapeHtml(t.notes)}</div>`:''}<div class="print-signatures"><div>Dispatched by / Date</div><div>Received and verified by / Date</div></div>${premiumPrintFooter()}</main></div><script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`);w.document.close();
  }

  function printSlip(r){
    const c=caseMap.get(r.case_id),d=docMap.get(r.document_id),actor=profileMap.get(r.handed_by);
    const w=window.open('','_blank','width=760,height=860');
    if(!w)return notify('Please allow pop-ups to print the handover slip.');
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Custody Handover</title><style>${premiumPrintCss('A5 portrait')}</style></head><body><div class="print-page">${premiumPrintHeader('Custody Handover Slip',`Movement confirmation for tracking #${c?.tracking_reference||'—'}`,'INTERNAL CUSTODY')}<main class="print-body"><section class="print-meta"><div><small>Date</small><strong>${escapeHtml(r.moved_at?new Date(r.moved_at).toLocaleDateString('en-GB'):'—')}</strong></div><div><small>Tracking</small><strong>#${escapeHtml(c?.tracking_reference||'—')}</strong></div><div><small>Customer</small><strong>${escapeHtml(c?.customer_name||'—')}</strong></div><div><small>Scope</small><strong>${escapeHtml(d?.document_name||'Whole Case')}</strong></div></section><div class="print-route"><div><small>FROM</small><strong>${escapeHtml(r.from_location||'Unassigned')}</strong></div><b>→</b><div><small>TO</small><strong>${escapeHtml(r.to_location||'—')}</strong></div></div><section class="print-meta"><div><small>Handled by</small><strong>${escapeHtml(actor?.full_name||'Staff')}</strong></div><div><small>Movement type</small><strong>${escapeHtml(d?'Document':'Whole Case')}</strong></div><div><small>Current location</small><strong>${escapeHtml(r.to_location||'—')}</strong></div><div><small>Confirmation</small><strong>Recorded</strong></div></section>${r.notes?`<div class="print-note"><b>Notes</b><br>${escapeHtml(r.notes)}</div>`:''}<div class="print-signatures"><div>Handed by / Date</div><div>Received by / Date</div></div>${premiumPrintFooter()}</main></div><script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`;
    w.document.open();w.document.write(html);w.document.close();
  }

  function Pagination(){
    if(activeRows.length<=pageSize)return null;
    return <div className="custody-pagination"><span>{((safePage-1)*pageSize+1).toLocaleString()}–{Math.min(safePage*pageSize,activeRows.length).toLocaleString()} of {activeRows.length.toLocaleString()}</span><div><button className="secondary" disabled={safePage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹</button><b>{safePage} / {totalPages}</b><button className="secondary" disabled={safePage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>›</button><select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}><option value="30">30 / page</option><option value="60">60 / page</option><option value="90">90 / page</option></select></div></div>
  }

  const canConfirmTransfer=t=>isAdmin||sameLocation(t.to_location,ownBranchName);

  return <section className="custody-manager">
    <div className="custody-actions-row"><div className="custody-branch-view"><span>Branch view</span><select value={custodyBranchId} onChange={e=>{setCustodyBranchId(e.target.value);setSelected(new Set())}}>{isAdmin&&<option value="All">All branches</option>}{branchOptions.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>{!isAdmin&&ownBranchName&&<small>Logged in: {ownBranchName}</small>}</div><button className="secondary" disabled={tab!=='current'||!visibleRows.length} onClick={selectPage}>Select Page</button><button className="secondary" disabled={!selected.size} onClick={clearSelection}>Clear</button><button className="secondary" disabled={!selected.size} onClick={()=>setBulkOpen(true)}>Bulk Move {selected.size?`(${selected.size})`:''}</button><button className="primary" onClick={()=>{setForm(emptyForm);setCaseSearch('');setOpen(true)}}>+ Handover</button></div>

    <div className="custody-kpis">
      <button className={tab==='current'?'active':''} onClick={()=>setTab('current')}><span>LOCATED CASES</span><strong>{locatedCases.toLocaleString()}</strong><small>Current physical location recorded</small></button>
      <div><span>MOVEMENTS TODAY</span><strong>{movementsToday.toLocaleString()}</strong><small>Physical handovers today</small></div>
      <div><span>UNASSIGNED LOCATION</span><strong>{unlocatedCases.toLocaleString()}</strong><small>No current case location</small></div>
      <button className={tab==='history'?'active':''} onClick={()=>setTab('history')}><span>MOVEMENT HISTORY</span><strong>{rows.length.toLocaleString()}</strong><small>{docMovements.toLocaleString()} document-level moves</small></button>
    </div>

    <div className="custody-transfer-queue">
      <div className="custody-transfer-title"><div><span>BRANCH TRANSFERS</span><h3>Awaiting receipt confirmation</h3></div><b>{pendingTransfers.length} in transit</b></div>
      <div className="custody-transfer-list">{pendingTransfers.map(t=>{const items=t.custody_transfer_items||[],caseCount=new Set(items.map(x=>x.case_id)).size,canReceive=canConfirmTransfer(t),ageDays=Math.max(0,Math.floor((Date.now()-new Date(t.requested_at).getTime())/86400000)),overdue=ageDays>=2;return <article className={overdue?'overdue':''} key={t.id}><div className="custody-transfer-no"><span>{t.transfer_no}</span><b className={overdue?'overdue-badge':''}>{overdue?`OVERDUE · ${ageDays}D`:'IN TRANSIT'}</b></div><div className="custody-transfer-route"><strong>{t.from_location||'Unassigned'}</strong><i>→</i><strong>{t.to_location}</strong></div><div className="custody-transfer-counts"><span>{caseCount} case{caseCount===1?'':'s'}</span><span>{items.length} document{items.length===1?'':'s'}</span><span>{t.requested_at?new Date(t.requested_at).toLocaleString('en-GB'):'—'}</span></div>{t.notes&&<p>{t.notes}</p>}<div className="custody-transfer-actions"><button className="secondary" onClick={()=>printTransferManifest(t)}>Print Manifest</button>{canReceive?<button className="primary" disabled={saving} onClick={()=>openReceipt(t)}>Check & Receive</button>:<span className="custody-awaiting-branch">Awaiting {t.to_location} confirmation</span>}</div></article>})}{!pendingTransfers.length&&<div className="custody-transfer-empty"><Icon name="check" size={18}/><span>No transfers awaiting receipt.</span></div>}</div>
    </div>

    <div className="custody-panel">
      <div className="custody-tabs"><button className={tab==='current'?'active':''} onClick={()=>setTab('current')}>Current Custody <b>{currentRows.length.toLocaleString()}</b></button><button className={tab==='history'?'active':''} onClick={()=>setTab('history')}>Movement History <b>{historyRows.length.toLocaleString()}</b></button><button className={tab==='transfers'?'active':''} onClick={()=>setTab('transfers')}>Received Transfers <b>{receivedTransfers.length.toLocaleString()}</b></button></div>
      <div className="custody-toolbar"><SearchBySelect value={searchBy} onChange={setSearchBy}/><div className="custody-search"><Icon name="search" size={15}/><input placeholder={tab==='current'?'Search tracking, customer, mobile, document or location…':tab==='history'?'Search movement, tracking, document, location or staff…':'Search transfer, branch, tracking or customer…'} value={q} onChange={e=>setQ(e.target.value)}/></div>{tab==='current'?<><select value={filters.locationState} onChange={e=>setFilters({...filters,locationState:e.target.value})}><option value="located">Located cases</option><option value="">All cases</option><option value="unlocated">Unassigned location</option></select><select value={filters.location} onChange={e=>setFilters({...filters,location:e.target.value})}><option value="">All locations</option>{locations.map(x=><option key={x}>{x}</option>)}</select><button className="secondary" onClick={()=>setFilters({...filters,location:'',branch:'',status:'',locationState:'located',age:''})}>Clear</button></>:tab==='history'?<><select value={historyFilters.scope} onChange={e=>setHistoryFilters({...historyFilters,scope:e.target.value})}><option value="">All movements</option><option value="case">Whole case</option><option value="document">Document only</option></select><input className="custody-date" type="date" value={historyFilters.date} onChange={e=>setHistoryFilters({...historyFilters,date:e.target.value})}/><button className="secondary" onClick={()=>setHistoryFilters({from:'',to:'',scope:'',date:''})}>Clear</button></>:<button className="secondary" disabled={!q} onClick={()=>setQ('')}>Clear</button>}</div>

      {tab==='current'&&<div className="custody-filter-row"><select value={filters.branch} onChange={e=>setFilters({...filters,branch:e.target.value})}><option value="">All branches</option>{branchNames.map(x=><option key={x}>{x}</option>)}</select><select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="">All statuses</option>{CASE_STATUSES.map(x=><option key={x}>{x}</option>)}</select><select value={filters.age} onChange={e=>setFilters({...filters,age:e.target.value})}><option value="">Any movement age</option><option value="today">Moved today</option><option value="1-3">Moved 1–3 days ago</option><option value="4+">Moved 4+ days ago</option></select></div>}
      {tab==='history'&&<div className="custody-filter-row"><select value={historyFilters.from} onChange={e=>setHistoryFilters({...historyFilters,from:e.target.value})}><option value="">Any origin</option>{locations.map(x=><option key={x}>{x}</option>)}</select><select value={historyFilters.to} onChange={e=>setHistoryFilters({...historyFilters,to:e.target.value})}><option value="">Any destination</option>{locations.map(x=><option key={x}>{x}</option>)}</select></div>}

      <Pagination/>

      {loading?<div className="custody-empty">Loading custody data…</div>:tab==='current'?<div className="custody-case-grid">{visibleRows.map(c=>{const last=lastMovementByCase.get(c.id),age=movementAge(c);return <article className={`custody-case-card ${selected.has(c.id)?'selected':''}`} key={c.id}><div className="custody-case-head"><input type="checkbox" checked={selected.has(c.id)} onChange={()=>toggle(c.id)}/><div><div className="custody-trackline"><section><strong>#{c.tracking_reference}</strong><small>{c.bill_no||'—'}</small></section><StatusPill status={c.overall_status}/></div><h3>{c.customer_name||'Unnamed customer'}</h3></div></div><div className="custody-location-band"><span>CURRENT LOCATION</span><strong>{c.physical_location||'Unassigned'}</strong></div><div className="custody-card-info"><div><small>BRANCH</small><strong>{c.branches?.name||'—'}</strong></div><div><small>MOBILE</small><strong>{c.mobile||'—'}</strong></div><div><small>DOCUMENTS</small><strong>{c.documents?.length||0}</strong></div><div><small>LAST MOVE</small><strong>{last?.moved_at?(age===0?'Today':`${age}d ago`):'No history'}</strong></div></div><div className="custody-docline">{(c.documents||[]).map(d=>`${d.document_name} × ${d.quantity||1}`).join(' · ')||'No document details'}</div><div className="custody-card-actions"><button className="secondary tiny" onClick={()=>onOpen?.(c)}><Icon name="eye" size={14}/> Quick View</button><button className="secondary tiny" onClick={()=>startMove(c)}>Move / Handover</button>{last&&<button className="secondary tiny" onClick={()=>setDetail(last)}>Last Movement</button>}</div></article>})}{!visibleRows.length&&<div className="custody-empty">No cases match the current custody filters.</div>}</div>:tab==='history'?<div className="custody-history-grid">{visibleRows.map(r=>{const c=caseMap.get(r.case_id),d=docMap.get(r.document_id),actor=profileMap.get(r.handed_by);return <article className="custody-history-card" key={r.id}><div className="custody-history-head"><div><strong>#{c?.tracking_reference||'—'}</strong><small>{r.moved_at?new Date(r.moved_at).toLocaleString('en-GB'):'—'}</small></div><span>{d?'Document':'Whole Case'}</span></div><h3>{c?.customer_name||'Unknown case'}</h3>{d&&<div className="custody-history-doc">{d.document_name}</div>}<div className="custody-route-advanced"><div><small>FROM</small><strong>{r.from_location||'Unassigned'}</strong></div><b>→</b><div><small>TO</small><strong>{r.to_location||'—'}</strong></div></div><div className="custody-history-meta"><span>Handled by {actor?.full_name||'Staff'}</span>{r.notes&&<span>{r.notes}</span>}</div><div className="custody-card-actions"><button className="secondary tiny" onClick={()=>setDetail(r)}>View</button><button className="secondary tiny" onClick={()=>printSlip(r)}>Print Slip</button>{c&&<button className="secondary tiny" onClick={()=>startMove(c)}>Move Again</button>}</div></article>})}{!visibleRows.length&&<div className="custody-empty">No custody movements match the current filters.</div>}</div>:<div className="custody-transfer-archive-grid">{visibleRows.map(t=>{const items=t.custody_transfer_items||[],caseCount=new Set(items.map(x=>x.case_id)).size;return <article key={t.id}><div className="custody-archive-head"><div><small>RECEIVED TRANSFER</small><strong>{t.transfer_no}</strong></div><span><Icon name="check" size={13}/> Received</span></div><div className="custody-archive-route"><div><small>FROM</small><strong>{t.from_location||'Unassigned'}</strong></div><b>→</b><div><small>TO</small><strong>{t.to_location||'—'}</strong></div></div><div className="custody-archive-meta"><span>{caseCount} case{caseCount===1?'':'s'}</span><span>{items.length} document{items.length===1?'':'s'}</span><span>{t.received_at?new Date(t.received_at).toLocaleString('en-GB'):'—'}</span></div>{t.notes&&<p>{t.notes}</p>}<div className="custody-card-actions"><button className="secondary tiny" onClick={()=>printTransferManifest(t)}><Icon name="print" size={14}/> Print Manifest</button></div></article>})}{!visibleRows.length&&<div className="custody-empty">No received transfers match your search.</div>}</div>}

      <Pagination/>
    </div>

    {open&&<Modal title="Create Transfer Request" subtitle="Dispatch selected documents. Their location changes only after the receiving branch confirms receipt." onClose={()=>{setOpen(false);setForm(emptyForm);setCaseSearch('')}}><form className="custody-form custody-transfer-form" onSubmit={save}>
      <div className="custody-case-picker wide"><label>Case</label><input value={caseSearch} onChange={e=>{setCaseSearch(e.target.value);if(form.case_id)setForm({...emptyForm})}} placeholder="Search tracking, customer, mobile or bill…"/>{caseMatches.length>0&&!form.case_id&&<div className="custody-case-results">{caseMatches.map(c=><button type="button" key={c.id} onClick={()=>chooseCase(c)}><strong>#{c.tracking_reference}</strong><span>{c.customer_name}</span><small>{c.physical_location||c.branches?.name||'No location'}</small></button>)}</div>}</div>
      {selectedCase&&<div className="custody-selected-case wide"><div><small>TRACKING</small><strong>#{selectedCase.tracking_reference}</strong></div><div><small>CUSTOMER</small><strong>{selectedCase.customer_name}</strong></div><div><small>SUBMITTED BRANCH</small><strong>{selectedCase.branches?.name||'—'}</strong></div><div><small>CURRENT LOCATION</small><strong>{selectedCase.physical_location||selectedCase.branches?.name||'Unassigned'}</strong></div></div>}
      {selectedCase&&<div className="custody-document-picker wide"><div className="custody-picker-head"><div><strong>Select documents</strong><span>{form.document_ids.length} of {selectedCase.documents?.length||0} selected</span></div><button type="button" className="secondary tiny" onClick={()=>setForm({...form,document_ids:form.document_ids.length===(selectedCase.documents?.length||0)?[]:(selectedCase.documents||[]).map(d=>d.id)})}>{form.document_ids.length===(selectedCase.documents?.length||0)?'Clear all':'Select all'}</button></div><div className="custody-document-options">{(selectedCase.documents||[]).map(d=><label key={d.id} className={form.document_ids.includes(d.id)?'selected':''}><input type="checkbox" checked={form.document_ids.includes(d.id)} onChange={()=>setForm({...form,document_ids:form.document_ids.includes(d.id)?form.document_ids.filter(id=>id!==d.id):[...form.document_ids,d.id]})}/><span><strong>{d.document_name}</strong><small>{d.holder_name||selectedCase.customer_name} · Qty {d.quantity||1} · {d.physical_location||selectedCase.physical_location||selectedCase.branches?.name||'Unassigned'}</small></span></label>)}</div>{!(selectedCase.documents||[]).length&&<p className="custody-no-docs">No document rows are available. This request will transfer the whole case.</p>}</div>}
      <Field label="From"><input value={form.from_location} onChange={e=>setForm({...form,from_location:e.target.value})} placeholder="Sending branch / current location"/></Field>
      <Field label="Receiving branch"><select required value={form.to_location} onChange={e=>setForm({...form,to_location:e.target.value})}><option value="">Select receiving branch</option>{handoverDestinations.map(b=><option key={b.id} value={b.name}>{b.name}</option>)}</select></Field>
      <div className="custody-location-presets wide"><span>Other branches</span>{handoverDestinations.map(b=><button type="button" key={b.id} className={form.to_location===b.name?'active':''} onClick={()=>setForm({...form,to_location:b.name})}>{b.name}</button>)}</div>
      <Field label="Dispatch notes" wide><textarea rows="3" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Envelope, courier, receiver or handover note…"/></Field>
      <div className="custody-scope-note wide">Submitted branch remains unchanged. Selected documents stay at their current location until the receiving branch confirms receipt.</div>
      <div className="modal-actions wide"><button type="button" className="secondary" onClick={()=>{setOpen(false);setForm(emptyForm);setCaseSearch('')}}>Cancel</button><button className="primary" disabled={saving||!form.case_id}>{saving?'Creating…':'Create Transfer Request'}</button></div>
    </form></Modal>}

    {bulkOpen&&<Modal className="custody-bulk-modal" title={`Bulk Custody Move · ${selected.size} Cases`} subtitle="Create one branch transfer request for the selected cases." onClose={()=>setBulkOpen(false)}><form className="custody-bulk-form" onSubmit={bulkMove}><Field label="Destination branch" wide><select required value={bulkTo} onChange={e=>setBulkTo(e.target.value)}><option value="">Select another branch</option>{bulkDestinations.map(b=><option key={b.id} value={b.name}>{b.name}</option>)}</select></Field><div className="custody-location-presets wide"><span>Other branches</span>{bulkDestinations.map(b=><button type="button" key={b.id} className={bulkTo===b.name?'active':''} onClick={()=>setBulkTo(b.name)}>{b.name}</button>)}</div><Field label="Dispatch notes" wide><textarea rows="3" value={bulkNotes} onChange={e=>setBulkNotes(e.target.value)} placeholder="Envelope, courier or receiver details…"/></Field><div className="custody-scope-note wide">The submitted branch will not change. Current location updates only after the receiving branch confirms receipt.</div><div className="modal-actions wide"><button type="button" className="secondary" onClick={()=>setBulkOpen(false)}>Cancel</button><button className="primary" disabled={saving||!bulkTo}>{saving?'Creating…':'Create Transfer Request'}</button></div></form></Modal>}

    {receiptTransfer&&<Modal className="custody-receipt-modal" title={`Receive ${receiptTransfer.transfer_no}`} subtitle={`Verify every document received at ${receiptTransfer.to_location}.`} onClose={()=>!saving&&setReceiptTransfer(null)}><form onSubmit={confirmTransfer}><div className="custody-receipt-route"><div><small>FROM</small><strong>{receiptTransfer.from_location||'Unassigned'}</strong></div><b>→</b><div><small>RECEIVING BRANCH</small><strong>{receiptTransfer.to_location}</strong></div></div><div className="custody-receipt-toolbar"><span>{(receiptTransfer.custody_transfer_items||[]).length} documents to verify</span><button type="button" className="secondary tiny" onClick={()=>setReceiptStates(Object.fromEntries((receiptTransfer.custody_transfer_items||[]).map(item=>[item.id,{status:'Verified',note:''}])))}>Mark all received</button></div><div className="custody-receipt-items">{(receiptTransfer.custody_transfer_items||[]).map(item=>{const c=caseMap.get(item.case_id),d=docMap.get(item.document_id),state=receiptStates[item.id]||{status:'Verified',note:''};return <div className={`custody-receipt-item ${state.status.toLowerCase()}`} key={item.id}><div className="custody-receipt-identity"><span>#{c?.tracking_reference||'—'}</span><strong>{d?.document_name||'Whole case'}</strong><small>{d?.holder_name||c?.customer_name||'—'}</small></div><select value={state.status} onChange={e=>setReceiptStates(p=>({...p,[item.id]:{...state,status:e.target.value}}))}><option value="Verified">Received</option><option value="Missing">Missing</option><option value="Damaged">Received damaged</option></select>{state.status!=='Verified'&&<input required value={state.note} onChange={e=>setReceiptStates(p=>({...p,[item.id]:{...state,note:e.target.value}}))} placeholder="Required discrepancy note"/>}</div>})}</div><Field label="Receipt notes" wide><textarea rows="3" value={receiptNotes} onChange={e=>setReceiptNotes(e.target.value)} placeholder="Receiver, envelope condition or other notes…"/></Field><div className="custody-receipt-warning">Only received documents will move to {receiptTransfer.to_location}. Missing documents keep their previous location and remain recorded as a discrepancy.</div><div className="modal-actions"><button type="button" className="secondary" disabled={saving} onClick={()=>setReceiptTransfer(null)}>Cancel</button><button className="primary" disabled={saving}>{saving?'Confirming…':'Confirm Verified Receipt'}</button></div></form></Modal>}

    {detail&&<Modal className="custody-movement-modal" title="Custody Movement" subtitle={`Verified movement · Tracking #${caseMap.get(detail.case_id)?.tracking_reference||'—'}`} onClose={()=>setDetail(null)}><div className="custody-detail custody-detail-premium"><div className="custody-detail-route"><div><small>ORIGIN</small><strong>{detail.from_location||'Unassigned'}</strong></div><b>→</b><div><small>CURRENT LOCATION</small><strong>{detail.to_location||'—'}</strong></div></div><div className="custody-detail-identity"><div><i><Icon name="file" size={18}/></i><section><small>CUSTOMER</small><strong>{caseMap.get(detail.case_id)?.customer_name||'—'}</strong><span>#{caseMap.get(detail.case_id)?.tracking_reference||'—'}</span></section></div><div><small>MOVEMENT SCOPE</small><strong>{docMap.get(detail.document_id)?.document_name||'Whole Case'}</strong></div></div><div className="custody-detail-meta"><div><small>MOVED</small><strong>{detail.moved_at?new Date(detail.moved_at).toLocaleString('en-GB'):'—'}</strong></div><div><small>HANDLED BY</small><strong>{profileMap.get(detail.handed_by)?.full_name||'Staff'}</strong></div>{detail.notes&&<div className="wide"><small>HANDOVER NOTES</small><strong>{detail.notes}</strong></div>}</div></div><div className="modal-actions custody-detail-actions"><button className="secondary" onClick={()=>setDetail(null)}>Close</button><button className="primary" onClick={()=>printSlip(detail)}><Icon name="print" size={15}/> Print Handover Slip</button></div></Modal>}
  </section>
}
function DeliveryQrScanner({cases,onClose,onOpenCase,onAction,notify,title='Scan Case QR'}){
  const videoRef=useRef(null),canvasRef=useRef(null),streamRef=useRef(null),rafRef=useRef(null);
  const [running,setRunning]=useState(false),[message,setMessage]=useState('Camera is not running.'),[manual,setManual]=useState(''),[result,setResult]=useState(''),[found,setFound]=useState(null);

  function stopCamera(){
    if(rafRef.current)cancelAnimationFrame(rafRef.current);
    rafRef.current=null;
    streamRef.current?.getTracks?.().forEach(t=>t.stop());
    streamRef.current=null;
    if(videoRef.current){videoRef.current.srcObject=null}
    setRunning(false);
  }
  useEffect(()=>()=>stopCamera(),[]);

  function resolveCode(raw){
    const value=String(raw||'').trim();
    if(!value)return false;
    let c=null;
    if(value.startsWith('DOCOPS-CASE:')){
      const id=value.slice('DOCOPS-CASE:'.length).trim();
      c=cases.find(x=>x.id===id);
    }
    if(!c)c=cases.find(x=>String(x.tracking_reference||'').trim()===value.replace(/^#/,''));
    if(!c){
      setResult('No matching case found for this QR / tracking reference.');
      return false;
    }
    setResult(`Found #${c.tracking_reference} · ${c.customer_name||''}`);
    stopCamera();
    setFound(c);
    return true;
  }

  function choose(action){
    if(!found)return;
    if(onAction){onAction(action,found);onClose();return}
    if(onOpenCase&&(action==='delivery'||action==='case')){onOpenCase(found);onClose()}
  }

  async function startCamera(){
    if(!navigator.mediaDevices?.getUserMedia){
      setMessage('Camera access is not supported in this browser. Use Upload QR Image.');
      return;
    }
    try{
      stopCamera();
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      streamRef.current=stream;
      const video=videoRef.current;
      video.srcObject=stream;
      await video.play();
      setRunning(true);setMessage('');
      const canvas=canvasRef.current,ctx=canvas.getContext('2d',{willReadFrequently:true});
      const scan=()=>{
        if(!streamRef.current)return;
        if(video.readyState>=2&&video.videoWidth&&video.videoHeight){
          canvas.width=video.videoWidth;canvas.height=video.videoHeight;
          ctx.drawImage(video,0,0,canvas.width,canvas.height);
          const img=ctx.getImageData(0,0,canvas.width,canvas.height);
          const code=jsQR(img.data,img.width,img.height,{inversionAttempts:'dontInvert'});
          if(code?.data&&resolveCode(code.data))return;
        }
        rafRef.current=requestAnimationFrame(scan);
      };
      scan();
    }catch{
      setRunning(false);
      setMessage('Camera could not start. Allow camera permission, or use Upload QR Image.');
    }
  }

  async function scanImage(file){
    if(!file)return;
    try{
      const bmp=await createImageBitmap(file);
      const canvas=canvasRef.current,ctx=canvas.getContext('2d',{willReadFrequently:true});
      const max=1400,scale=Math.min(1,max/Math.max(bmp.width,bmp.height));
      canvas.width=Math.max(1,Math.round(bmp.width*scale));
      canvas.height=Math.max(1,Math.round(bmp.height*scale));
      ctx.drawImage(bmp,0,0,canvas.width,canvas.height);
      const img=ctx.getImageData(0,0,canvas.width,canvas.height);
      const code=jsQR(img.data,img.width,img.height,{inversionAttempts:'attemptBoth'});
      if(!code?.data){setResult('No QR code found in the image.');return}
      resolveCode(code.data);
    }catch{setResult('Could not read that image.')}
  }

  return <div className="modal-backdrop qr-legacy-backdrop" onMouseDown={()=>{stopCamera();onClose()}}>
    <div className="qr-legacy-dialog" onMouseDown={e=>e.stopPropagation()}>
      <div className="qr-legacy-head">
        <div><h2>{title}</h2><p>Scan an envelope label, then choose the operational action.</p></div>
        <button className="secondary" onClick={()=>{stopCamera();onClose()}}>Close</button>
      </div>
      <div className={`qr-legacy-body ${found?'has-result':'scan-only'}`}>
        <div className="qr-scan-shell">
          <div className="qr-camera-wrap">
            <video ref={videoRef} playsInline muted className={running?'running':''}/>
            <div className={`qr-scan-frame ${running?'show':''}`}><span></span></div>
            {!running&&<div className="qr-camera-message">{message}</div>}
          </div>
          <div className="qr-scan-actions">
            <button className="primary" type="button" onClick={startCamera}>Start Camera</button>
            <label className="secondary qr-upload-label">Upload QR Image<input type="file" accept="image/*" hidden onChange={e=>e.target.files?.[0]&&scanImage(e.target.files[0])}/></label>
          </div>
          <div className="qr-scan-divider"><span>or enter the label code</span></div>
          <form className="qr-manual-form" onSubmit={e=>{e.preventDefault();resolveCode(manual)}}>
            <input value={manual} onChange={e=>setManual(e.target.value)} placeholder="Scan/paste QR value or tracking reference"/>
            <button className="secondary" type="submit">Open</button>
          </form>
          <canvas ref={canvasRef} hidden/>
          <div className={`qr-scan-result ${result&&result.startsWith('Found')?'good':result?'error':''}`}>{result}</div>
        </div>
        {found&&<div className="qr-action-sheet"><div className="qr-action-case"><span>CASE FOUND</span><strong>#{found.tracking_reference}</strong><h3>{found.customer_name||'Customer'}</h3><small>{found.documents?.length||0} documents · {found.overall_status}</small></div><div className="qr-action-grid"><button onClick={()=>choose('case')}><i><Icon name="file" size={19}/></i><strong>Open Case</strong><span>View full details</span></button><button onClick={()=>choose('delivery')}><i><Icon name="package" size={19}/></i><strong>Delivery</strong><span>Give documents to customer</span></button><button onClick={()=>choose('handover')}><i><Icon name="handover" size={19}/></i><strong>Handover</strong><span>Internal custody transfer</span></button><button onClick={()=>choose('payment')}><i><Icon name="wallet" size={19}/></i><strong>Payment</strong><span>Record a collection</span></button></div><button className="qr-scan-again" onClick={()=>{setFound(null);setResult('');setManual('');startCamera()}}>Scan another case</button></div>}
      </div>
    </div>
  </div>
}

function DeliveriesView({session,cases,notify,reload,seedCase,clearSeed,onQrAction,setModuleExport}){
  const [rows,setRows]=useState([]),[deliveriesLoaded,setDeliveriesLoaded]=useState(false),[q,setQ]=useState(''),[searchBy,setSearchBy]=useState('tracking'),[filter,setFilter]=useState('Ready for Delivery'),[selected,setSelected]=useState(new Set()),[financeOpen,setFinanceOpen]=useState(new Set()),[open,setOpen]=useState(null),[view,setView]=useState(null),[scan,setScan]=useState(false),[labelCase,setLabelCase]=useState(null),[labelSheetOpen,setLabelSheetOpen]=useState(false),[labelSheetTick,setLabelSheetTick]=useState(0),[form,setForm]=useState({receiver_name:'',receiver_mobile:'',receiver_id_reference:'',payment_collected:'',payment_method:'Cash',payment_reference:'',assigned_to:'',notes:'',selected_docs:[]});
  async function load(){const {data,error}=await supabase.from('deliveries').select('*').order('created_at',{ascending:false}).limit(1000);if(error)notify(userError(error));else setRows(data||[]);setDeliveriesLoaded(true)}useEffect(()=>{load()},[]);useEffect(()=>{if(seedCase&&deliveriesLoaded){startDelivery(seedCase);clearSeed?.()}},[seedCase,deliveriesLoaded]);
  const deliveredDocumentIds=useMemo(()=>{const map=new Map();for(const delivery of rows){const ids=(delivery.items||[]).map(i=>i.id).filter(Boolean);if(!ids.length)continue;const set=map.get(delivery.case_id)||new Set();ids.forEach(id=>set.add(id));map.set(delivery.case_id,set)}return map},[rows]);
  const remainingDocuments=c=>(c.documents||[]).filter(d=>!deliveredDocumentIds.get(c.id)?.has(d.id));
  const latestDelivery=c=>rows.find(r=>r.case_id===c.id);
  const ready=cases.filter(c=>c.overall_status==='Ready for Delivery'&&remainingDocuments(c).length>0);
  const allReadySelected=ready.length>0&&ready.every(c=>selected.has(c.id));
  const labelSheetCount=useMemo(()=>{try{return JSON.parse(localStorage.getItem('kenza_label_sheet_queue_v1')||'[]').length}catch{return 0}},[labelSheetTick,cases.length]);
  useEffect(()=>{
    try{
      const q=JSON.parse(localStorage.getItem('kenza_label_sheet_queue_v1')||'[]');
      if(q.length)setSelected(prev=>new Set([...prev,...q.map(x=>x.id)]));
    }catch{}
  },[cases.length]);
  function addLabelSelection(c){
    setSelected(prev=>{const n=new Set(prev);n.add(c.id);return n});
  }const today=new Date().toISOString().slice(0,10);const deliveredToday=rows.filter(r=>String(r.delivered_at||'').slice(0,10)===today&&r.status==='Delivered').length,partial=rows.filter(r=>r.status==='Partial').length;
  const deliveryBase=filter==='Ready for Delivery'?ready:filter==='Delivered'?cases.filter(c=>rows.some(r=>r.case_id===c.id&&r.status==='Delivered')):ready;
  const visible=rankCaseSearchResults(deliveryBase.filter(c=>caseMatchesFieldSearch(c,q,searchBy,[c.tracking_reference,c.customer_name,c.mobile,c.bill_no].join(' '))),q,searchBy);
  useEffect(()=>setModuleExport?.({view:'deliveries',title:filter==='Delivered'?'Delivered Cases':'Ready for Customer Delivery',rows:visible.map(c=>{const delivery=rows.find(r=>r.case_id===c.id),m=moneyParts(c);return{'Tracking No.':c.tracking_reference||'','Customer':c.customer_name||'','Mobile':c.mobile||'','Branch':c.branches?.name||'','Status':delivery?.status||c.overall_status||'','Documents':c.documents?.map(d=>`${d.document_name} × ${d.quantity||1}`).join('; ')||'','Receiver':delivery?.receiver_name||'','Delivered At':delivery?.delivered_at||'','Balance (QAR)':m.balance,'Collected at Delivery (QAR)':Number(delivery?.payment_collected||0)}})}),[visible,rows,filter,setModuleExport]);
  function startDelivery(c){const pending=remainingDocuments(c);if(!pending.length){const completed=latestDelivery(c);if(completed)setView(completed);notify('All documents for this case were already delivered. You can print the delivery slip.');return}setOpen(c);setForm({receiver_name:c.customer_name||'',receiver_mobile:c.mobile||'',receiver_id_reference:'',payment_collected:Number(c.balance_payment||0)>0?String(c.balance_payment):'',payment_method:'Cash',payment_reference:'',assigned_to:'',notes:'',selected_docs:pending.map(d=>d.id)})}
  async function confirm(e){e.preventDefault();const c=open,pending=remainingDocuments(c);const docs=pending.filter(d=>form.selected_docs.includes(d.id));if(!docs.length)return notify('Select at least one undelivered document.');const isPartial=docs.length<pending.length,collected=Number(form.payment_collected||0),deliveryRef=`DLV-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${String(c.tracking_reference).slice(-6)}`;const audit=[{text:`Delivery ${isPartial?'partially completed':'completed'} by ${session.user.email||'user'}`,at:new Date().toISOString()}];const payload={case_id:c.id,status:isPartial?'Partial':'Delivered',receiver_name:form.receiver_name,receiver_mobile:form.receiver_mobile||null,receiver_id_reference:form.receiver_id_reference||null,payment_collected:collected,payment_method:form.payment_method||null,payment_reference:form.payment_reference||null,assigned_to:form.assigned_to||null,items:docs.map(d=>({id:d.id,name:d.document_name,qty:Number(d.quantity||1)})),audit,print_count:0,delivered_by:session.user.id,delivered_at:new Date().toISOString(),notes:form.notes||null};const {data,error}=await supabase.from('deliveries').insert(payload).select('*').single();if(error)return notify(userError(error));if(collected>0){await supabase.from('payments').insert({case_id:c.id,amount:collected,payment_method:form.payment_method,payment_reference:form.payment_reference||deliveryRef,notes:`Collected on ${deliveryRef}`,received_by:session.user.id})}await supabase.from('cases').update({overall_status:isPartial?'Ready for Delivery':'Delivered',balance_payment:Math.max(0,Number(c.balance_payment||0)-collected),updated_by:session.user.id}).eq('id',c.id);setOpen(null);setView(data);notify(isPartial?'Partial delivery saved.':'Delivery completed.');load();reload()}
  function printLabel(c){setLabelCase(c)}
  async function printSelected(){const cs=ready.filter(c=>selected.has(c.id));if(!cs.length)return notify('Select ready cases first.');await printCaseLabels(cs)}
  function printNote(d){const c=cases.find(x=>x.id===d.case_id);return printConfiguredDocument({orgId:c?.organization_id||activePrintContext.orgId,brand:activePrintContext.brand,currency:activePrintContext.currency,kind:'delivery',record:{...d,document_no:d.delivery_no||'',customer_name:c?.customer_name,customer_mobile:d.receiver_mobile||c?.mobile,tracking_reference:c?.tracking_reference,created_at:d.delivered_at,items:d.items||[]},notify})}

  return <section className="delivery-manager"><div className="module-titlebar"><div><h1>Deliveries</h1><p>Ready-for-delivery queue, payment clearance, QR scanning and document handover.</p></div><div><button className="secondary" onClick={()=>setSelected(allReadySelected?new Set():new Set(ready.map(c=>c.id)))}>{allReadySelected?'Deselect Ready':'Select Ready'}</button><button className="primary" onClick={printSelected}>Print Labels <span className="count-chip">{selected.size}</span></button><button className="secondary" onClick={()=>setLabelSheetOpen(true)}>Label Sheet <span className="count-chip">{labelSheetCount}</span></button><button className="secondary" onClick={()=>setScan(true)}>Scan QR</button></div></div><div className="delivery-stats"><div><span>READY</span><strong>{ready.length}</strong><small>Cases awaiting collection</small></div><div><span>DELIVERED TODAY</span><strong>{deliveredToday}</strong><small>Completed today</small></div><div><span>DELIVERED</span><strong>{rows.filter(r=>r.status==='Delivered').length}</strong><small>Saved handovers</small></div><div><span>PARTIAL</span><strong>{partial}</strong><small>Some documents remain</small></div></div><div className="panel"><div className="delivery-filterbar"><SearchBySelect value={searchBy} onChange={setSearchBy}/><div className="delivery-searchbox"><Icon name="search" size={15}/><input placeholder={searchBy==='tracking'?'Enter full or partial tracking number…':searchBy==='mobile'?'Enter full or partial mobile number…':searchBy==='bill'?'Enter full or partial bill number…':searchBy==='name'?'Enter customer name…':'Search all fields…'} value={q} onChange={e=>setQ(e.target.value)}/></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option>Ready for Delivery</option><option>Delivered</option></select><button className="secondary" onClick={()=>{setQ('');setFilter('Ready for Delivery')}}>Clear</button></div><div className="delivery-grid delivery-case-grid">{visible.map(c=>{
  const m=moneyParts(c),delivery=latestDelivery(c),displayDocs=filter==='Delivered'?(delivery?.items||[]):remainingDocuments(c);
  return <article className={`delivery-case-card ${selected.has(c.id)?'selected':''}`} key={c.id}>
    <div className="delivery-case-main">
      <div className="delivery-case-check">{filter==='Ready for Delivery'&&<input type="checkbox" checked={selected.has(c.id)} onChange={()=>setSelected(p=>{const n=new Set(p);n.has(c.id)?n.delete(c.id):n.add(c.id);return n})}/>}</div>
      <div className="delivery-case-identity">
        <div className="delivery-case-trackline"><div><strong>#{c.tracking_reference}</strong><small>{c.bill_no||'—'}</small></div><StatusPill status={c.overall_status}/></div>
        <h3>{c.customer_name||'Unnamed customer'}</h3>
      </div>
    </div>

    <div className="delivery-case-info">
      <div><span className="ico"><Icon name="phone" size={14}/></span><section><small>MOBILE</small><strong>{c.mobile||'—'}</strong></section></div>
      <div><span className="ico"><Icon name="map" size={14}/></span><section><small>BRANCH</small><strong>{c.branches?.name||'—'}</strong></section></div>
      <div><span className="ico"><Icon name="calendar" size={14}/></span><section><small>SUBMITTED</small><strong>{fmtDate(c.submission_date)}</strong></section></div>

    </div>

    <div className="delivery-case-docline">{displayDocs.map(d=>`${d.document_name||d.name} × ${d.quantity||d.qty||1}`).join(' · ')||(filter==='Delivered'?'Delivery record has no document details':'No undelivered documents')}</div>
    <button className="delivery-finance-toggle" onClick={()=>setFinanceOpen(p=>{const n=new Set(p);n.has(c.id)?n.delete(c.id):n.add(c.id);return n})}>
      <span>Finance</span><strong>{m.balance>0?`Balance ${fmtMoney(m.balance).replace('.00','')}`:'Paid'}</strong><Icon name={financeOpen.has(c.id)?'chevron-up':'chevron-down'} size={14}/>
    </button>
    {financeOpen.has(c.id)&&<div className="delivery-finance-accordion">
      <div><small>TOTAL</small><strong>{fmtMoney(c.total_amount).replace('.00','')}</strong></div>
      <div><small>PAID</small><strong>{fmtMoney(m.paid).replace('.00','')}</strong></div>
      <div><small>BALANCE</small><strong className={m.balance>0?'due':'paid'}>{fmtMoney(m.balance).replace('.00','')}</strong></div>
    </div>}

    <div className="delivery-case-actions">
      <button className="secondary tiny" onClick={()=>setView({casePreview:c})}><Icon name="eye" size={14}/> Quick View</button>
      {filter==='Delivered'?<button className="primary tiny" disabled={!delivery} onClick={()=>delivery&&printNote(delivery)}><Icon name="print" size={14}/> Print Delivery Slip</button>:<><button className="secondary tiny" onClick={()=>printLabel(c)}><Icon name="print" size={14}/> Print Label</button><button className="primary tiny" onClick={()=>startDelivery(c)}>Deliver</button></>}
    </div>
  </article>
})}</div></div>
  {open&&<Modal className="delivery-confirm-modal" title={`Customer Delivery · #${open.tracking_reference}`} subtitle={`${open.customer_name} · Confirm exactly what is handed to the customer.`} onClose={()=>setOpen(null)}><form className="delivery-form delivery-confirm-form" onSubmit={confirm}><div className="delivery-modal-section-head"><span><Icon name="package" size={18}/></span><div><strong>Documents to deliver</strong><small>Only undelivered documents are shown. Unselected documents remain ready for delivery.</small></div><b>{form.selected_docs.length} selected</b></div><div className="delivery-doc-selector">{remainingDocuments(open).map(d=><label key={d.id} className={form.selected_docs.includes(d.id)?'selected':''}><input type="checkbox" checked={form.selected_docs.includes(d.id)} onChange={e=>setForm({...form,selected_docs:e.target.checked?[...form.selected_docs,d.id]:form.selected_docs.filter(x=>x!==d.id)})}/><span><strong>{d.document_name}</strong><small>{d.holder_name||open.customer_name||'Customer document'}</small></span><b>Qty {d.quantity||1}</b></label>)}</div><div className="delivery-modal-section-head receiver"><span><Icon name="user" size={18}/></span><div><strong>Receiver & payment</strong><small>Capture the handover proof and any amount collected now.</small></div></div><div className="form-grid delivery-fields"><Field label="Receiver Name" wide><input required value={form.receiver_name} onChange={e=>setForm({...form,receiver_name:e.target.value})} placeholder="Full name of receiver"/></Field><Field label="Receiver Mobile"><input value={form.receiver_mobile} onChange={e=>setForm({...form,receiver_mobile:e.target.value})} placeholder="Mobile number"/></Field><Field label="ID / Reference"><input value={form.receiver_id_reference} onChange={e=>setForm({...form,receiver_id_reference:e.target.value})} placeholder="QID, receipt or reference"/></Field><Field label="Assigned To"><input value={form.assigned_to} onChange={e=>setForm({...form,assigned_to:e.target.value})} placeholder="Staff member"/></Field><Field label="Outstanding Balance"><input disabled value={fmtMoney(open.balance_payment)}/></Field><Field label="Amount Collected"><input type="number" step="0.01" min="0" value={form.payment_collected} onChange={e=>setForm({...form,payment_collected:e.target.value})} placeholder="0.00"/></Field><Field label="Payment Method"><select value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})}><option>Cash</option><option>Card</option><option>Bank Transfer</option><option>Online</option></select></Field><Field label="Payment Reference"><input value={form.payment_reference} onChange={e=>setForm({...form,payment_reference:e.target.value})} placeholder="Optional transaction reference"/></Field><Field label="Delivery Notes" wide><textarea rows="3" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Receiver confirmation, delivery condition or other notes…"/></Field><div className="modal-actions wide"><button type="button" className="secondary" onClick={()=>setOpen(null)}>Cancel</button><button className="primary" disabled={!form.selected_docs.length}>Confirm Customer Delivery</button></div></div></form></Modal>}
  {scan&&<DeliveryQrScanner cases={cases} onClose={()=>setScan(false)} notify={notify} onOpenCase={c=>startDelivery(c)} onAction={onQrAction}/>}
  {view?.casePreview&&<QuickView c={view.casePreview} branches={[]} session={session} notify={notify} refreshCase={reload} onClose={()=>setView(null)} updateStatus={async()=>{}} updateStage={async()=>{}} reorderStages={()=>{}} onAddDoc={()=>{}} deleteDocument={()=>{}} addStage={()=>{}} renameStage={()=>{}} deleteStage={()=>{}} onAppointment={()=>{}} onDeliver={()=>startDelivery(view.casePreview)} onCustody={()=>onQrAction?.('handover',view.casePreview)} onPayment={()=>onQrAction?.('payment',view.casePreview)}/>}
  {view?.id&&<Modal className="delivery-detail-modal" title={view.delivery_no||'Delivery confirmation'} subtitle={`Customer handover · ${view.status}`} onClose={()=>setView(null)}><div className="delivery-detail premium-delivery-detail"><div className="delivery-detail-hero"><div><small>DELIVERY STATUS</small><strong>{view.status}</strong><span>{view.delivered_at?new Date(view.delivered_at).toLocaleString('en-GB'):'Saved customer handover'}</span></div><i><Icon name="package" size={24}/></i></div><div className="delivery-detail-grid"><div><small>Receiver</small><strong>{view.receiver_name||'—'}</strong><span>{view.receiver_mobile||'No mobile recorded'}</span></div><div><small>ID / Reference</small><strong>{view.receiver_id_reference||'—'}</strong><span>Receiver verification</span></div><div><small>Amount collected</small><strong>{fmtMoney(view.payment_collected)}</strong><span>{view.payment_method||'No payment method'}</span></div><div><small>Payment reference</small><strong>{view.payment_reference||'—'}</strong><span>Transaction reference</span></div></div><div className="delivery-documents-head"><div><small>DOCUMENT HANDOVER</small><strong>{(view.items||[]).length} item{(view.items||[]).length===1?'':'s'} delivered</strong></div><span>Verified</span></div><div className="delivery-view-docs">{(view.items||[]).map((i,idx)=><div key={idx}><i>{idx+1}</i><section><b>{i.name}</b><small>Delivered to {view.receiver_name||'customer'}</small></section><span>Qty {i.qty}</span></div>)}</div>{view.notes&&<div className="delivery-detail-note"><small>DELIVERY NOTES</small><p>{view.notes}</p></div>}<div className="modal-actions delivery-detail-actions"><button className="secondary" onClick={()=>setView(null)}>Close</button><button className="primary" onClick={()=>printNote(view)}><Icon name="print" size={16}/> Print Delivery Slip</button></div></div></Modal>}
    {labelCase&&<LabelPreviewModal c={labelCase} onClose={()=>setLabelCase(null)} notify={notify} onAddToSheet={c=>{setSelected(p=>new Set([...p,c.id]));setLabelSheetTick(x=>x+1)}}/>}
    {labelSheetOpen&&<LabelSheetManager cases={cases} onClose={()=>setLabelSheetOpen(false)} notify={notify} onChange={()=>setLabelSheetTick(x=>x+1)}/>}
</section>
}



function ReportsView({session,cases,notify,setModuleExport}){
  const [tab,setTab]=useState('overview');
  const [period,setPeriod]=useState('month');
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [branch,setBranch]=useState('');
  const [status,setStatus]=useState('');
  const [q,setQ]=useState('');
  const [searchBy,setSearchBy]=useState('tracking');
  const [payments,setPayments]=useState([]);
  const [deliveries,setDeliveries]=useState([]);
  const [appointments,setAppointments]=useState([]);
  const [custody,setCustody]=useState([]);
  const [loading,setLoading]=useState(true);
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(50);

  useEffect(()=>{
    let live=true;
    setLoading(true);
    Promise.all([
      supabase.from('payments').select('id,case_id,amount,payment_method,payment_reference,received_at').order('received_at',{ascending:false}).limit(3000),
      supabase.from('deliveries').select('id,case_id,status,payment_collected,delivered_at,created_at').order('created_at',{ascending:false}).limit(3000),
      supabase.from('appointments').select('id,case_id,appointment_date,status,authority').order('appointment_date',{ascending:false}).limit(3000),
      supabase.from('custody_movements').select('id,case_id,document_id,from_location,to_location,moved_at').order('moved_at',{ascending:false}).limit(3000)
    ]).then(([p,d,a,c])=>{if(!live)return;if(!p.error)setPayments(p.data||[]);if(!d.error)setDeliveries(d.data||[]);if(!a.error)setAppointments(a.data||[]);if(!c.error)setCustody(c.data||[]);setLoading(false)}).catch(()=>setLoading(false));
    return()=>{live=false};
  },[]);

  const today=new Date();today.setHours(0,0,0,0);
  const range=useMemo(()=>{
    let start=null,end=new Date();end.setHours(23,59,59,999);
    if(period==='today')start=new Date(today);
    if(period==='7d'){start=new Date(today);start.setDate(start.getDate()-6)}
    if(period==='month'){start=new Date(today.getFullYear(),today.getMonth(),1)}
    if(period==='year'){start=new Date(today.getFullYear(),0,1)}
    if(period==='custom'){start=from?new Date(from+'T00:00:00'):null;end=to?new Date(to+'T23:59:59'):end}
    return {start,end};
  },[period,from,to]);
  const inRange=v=>{if(!v)return period==='all';const d=new Date(v);return(!range.start||d>=range.start)&&(!range.end||d<=range.end)};
  const branches=useMemo(()=>[...new Set(cases.map(c=>c.branches?.name).filter(Boolean))].sort(),[cases]);
  const caseMap=useMemo(()=>new Map(cases.map(c=>[c.id,c])),[cases]);
    const filteredCases=useMemo(()=>cases.filter(c=>{
    if(branch&&(c.branches?.name||'')!==branch)return false;
    if(status&&c.overall_status!==status)return false;
    if(period!=='all'&&!inRange(c.submission_date))return false;
    if(!caseMatchesFieldSearch(c,q,searchBy,[c.tracking_reference,c.customer_name,c.mobile,c.bill_no,c.branches?.name,c.overall_status].join(' ')))return false;
    return true;
  }),[cases,branch,status,period,range.start?.getTime(),range.end?.getTime(),q,searchBy]);
  const filteredIds=useMemo(()=>new Set(filteredCases.map(c=>c.id)),[filteredCases]);
  const pRows=useMemo(()=>payments.filter(r=>filteredIds.has(r.case_id)&&inRange(r.received_at)),[payments,filteredIds,range.start?.getTime(),range.end?.getTime(),period]);
  const dRows=useMemo(()=>deliveries.filter(r=>filteredIds.has(r.case_id)&&inRange(r.delivered_at||r.created_at)),[deliveries,filteredIds,range.start?.getTime(),range.end?.getTime(),period]);
  const aRows=useMemo(()=>appointments.filter(r=>filteredIds.has(r.case_id)&&inRange(r.appointment_date)),[appointments,filteredIds,range.start?.getTime(),range.end?.getTime(),period]);
  const cRows=useMemo(()=>custody.filter(r=>filteredIds.has(r.case_id)&&inRange(r.moved_at)),[custody,filteredIds,range.start?.getTime(),range.end?.getTime(),period]);

  const totalCollected=pRows.reduce((s,r)=>s+Number(r.amount||0),0);
  const outstanding=filteredCases.reduce((s,c)=>s+Math.max(0,Number(c.balance_payment||0)),0);
  const docs=filteredCases.reduce((n,c)=>n+(c.documents?.length||0),0);
  const activeStages=filteredCases.reduce((n,c)=>n+(c.documents||[]).flatMap(d=>d.document_stages||[]).filter(s=>['Pending','Processing'].includes(s.status)).length,0);
  const delivered=dRows.filter(r=>r.status==='Delivered').length;
  const partial=dRows.filter(r=>r.status==='Partial').length;
  const completedAppointments=aRows.filter(r=>r.status==='Completed').length;

  const statusRows=useMemo(()=>CASE_STATUSES.map(st=>({label:st,value:filteredCases.filter(c=>c.overall_status===st).length})),[filteredCases]);
  const branchRows=useMemo(()=>branches.map(b=>({label:b,value:filteredCases.filter(c=>c.branches?.name===b).length})).filter(x=>x.value).sort((a,b)=>b.value-a.value),[filteredCases,branches]);
  const methodRows=useMemo(()=>[...new Set(pRows.map(x=>x.payment_method||'Other'))].map(m=>({label:m,value:pRows.filter(x=>(x.payment_method||'Other')===m).reduce((s,x)=>s+Number(x.amount||0),0)})).sort((a,b)=>b.value-a.value),[pRows]);
  const stageRows=useMemo(()=>{
    const map=new Map();for(const c of filteredCases)for(const d of(c.documents||[]))for(const st of(d.document_stages||[])){const k=st.stage_name||'Other';const x=map.get(k)||{label:k,pending:0,processing:0,completed:0};if(st.status==='Pending')x.pending++;if(st.status==='Processing')x.processing++;if(st.status==='Completed')x.completed++;map.set(k,x)}return[...map.values()].sort((a,b)=>(b.pending+b.processing)-(a.pending+a.processing)).slice(0,20)
  },[filteredCases]);

  const detailRows=useMemo(()=>filteredCases.map(c=>({c,balance:Math.max(0,Number(c.balance_payment||0)),docs:c.documents?.length||0,active:(c.documents||[]).flatMap(d=>d.document_stages||[]).filter(s=>['Pending','Processing'].includes(s.status)).length})).sort((a,b)=>b.balance-a.balance),[filteredCases]);
  const reportExportRows=useMemo(()=>detailRows.map(({c,docs,active,balance})=>{const m=moneyParts(c);return{'Tracking No.':c.tracking_reference,'Customer':c.customer_name,'Mobile':c.mobile||'','Branch':c.branches?.name||'','Status':c.overall_status,'Documents':docs,'Active Stages':active,'Total (QAR)':Number(c.total_amount||0),'Paid (QAR)':m.paid,'Balance (QAR)':balance,'Submission Date':c.submission_date||''}}),[detailRows]);
  const agingRows=useMemo(()=>{const now=Date.now();return[['0–7 days',0,7],['8–30 days',8,30],['31–60 days',31,60],['61–90 days',61,90],['90+ days',91,99999]].map(([label,min,max])=>{const items=filteredCases.filter(c=>{const age=c.submission_date?Math.floor((now-new Date(c.submission_date).getTime())/86400000):0;return Number(c.balance_payment||0)>0&&age>=min&&age<=max});return{label,count:items.length,value:items.reduce((s,c)=>s+Number(c.balance_payment||0),0)}})},[filteredCases]);
  const activeReportExport=useMemo(()=>{
    if(tab==='overview')return{title:'Executive Summary',rows:[...statusRows.map(x=>({'Section':'Case Status','Metric':x.label,'Count':x.value})),...branchRows.map(x=>({'Section':'Branch Workload','Metric':x.label,'Count':x.value}))]};
    if(tab==='operations')return{title:'Stage Workload',rows:stageRows.map(x=>({'Stage':x.label,'Pending':x.pending,'Processing':x.processing,'Completed':x.completed,'Open Total':x.pending+x.processing}))};
    if(tab==='finance')return{title:'Finance and Receivables',rows:[...pRows.map(r=>{const c=caseMap.get(r.case_id);return{'Record Type':'Payment','Date':r.received_at||'','Tracking No.':c?.tracking_reference||'','Customer':c?.customer_name||'','Method':r.payment_method||'','Amount (QAR)':Number(r.amount||0),'Balance (QAR)':''}}),...filteredCases.filter(c=>Number(c.balance_payment||0)>0).map(c=>({'Record Type':'Receivable','Date':c.submission_date||'','Tracking No.':c.tracking_reference||'','Customer':c.customer_name||'','Method':'','Amount (QAR)':'','Balance (QAR)':Number(c.balance_payment||0)}))]};
    if(tab==='delivery')return{title:'Delivery Performance',rows:dRows.map(r=>{const c=caseMap.get(r.case_id);return{'Date':r.delivered_at||r.created_at||'','Tracking No.':c?.tracking_reference||'','Customer':c?.customer_name||'','Branch':c?.branches?.name||'','Delivery Status':r.status||'','Collected (QAR)':Number(r.payment_collected||0)}})};
    if(tab==='appointments')return{title:'Appointment Performance',rows:aRows.map(r=>{const c=caseMap.get(r.case_id);return{'Date':r.appointment_date||'','Tracking No.':c?.tracking_reference||'','Customer':c?.customer_name||'','Authority':r.authority||'','Status':r.status||''}})};
    if(tab==='custody')return{title:'Custody Movement',rows:cRows.map(r=>{const c=caseMap.get(r.case_id);return{'Moved At':r.moved_at||'','Tracking No.':c?.tracking_reference||'','Customer':c?.customer_name||'','From':r.from_location||'','To':r.to_location||'','Scope':r.document_id?'Document':'Whole Case'}})};
    return{title:'Case Detail',rows:reportExportRows};
  },[tab,statusRows,branchRows,stageRows,pRows,filteredCases,dRows,aRows,cRows,caseMap,reportExportRows]);
  useEffect(()=>setModuleExport?.({view:'reports',title:activeReportExport.title,rows:activeReportExport.rows}),[activeReportExport,setModuleExport]);
  const totalPages=Math.max(1,Math.ceil(detailRows.length/pageSize));const safePage=Math.min(page,totalPages);const visible=detailRows.slice((safePage-1)*pageSize,safePage*pageSize);
  useEffect(()=>setPage(1),[period,from,to,branch,status,q,pageSize,tab]);

  function exportCsv(){
    const head=['Tracking','Customer','Mobile','Branch','Status','Documents','Active Stages','Total','Paid','Balance','Submission Date'];
    const rows=[head,...detailRows.map(({c,docs,active,balance})=>{const m=moneyParts(c);return[c.tracking_reference,c.customer_name,c.mobile,c.branches?.name,c.overall_status,docs,active,c.total_amount,m.paid,balance,c.submission_date]})];
    const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`kenza-report-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
  }
  function printReport(){
    const w=window.open('','_blank','width=1100,height=850');if(!w)return notify('Please allow pop-ups to print reports.');
    const rows=visible.map(({c,docs,active,balance})=>`<tr><td>#${escapeHtml(c.tracking_reference)}</td><td>${escapeHtml(c.customer_name||'')}</td><td>${escapeHtml(c.branches?.name||'')}</td><td>${escapeHtml(c.overall_status)}</td><td>${docs}</td><td>${active}</td><td>${fmtMoney(balance)}</td></tr>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Operations Report</title><style>${premiumPrintCss('A4 landscape')}</style></head><body><div class="print-page">${premiumPrintHeader('Operations Management Report',`${period} · ${branch||'All branches'} · ${status||'All statuses'}`,'LIVE REPORT')}<main class="print-body"><section class="print-kpis"><div><small>Cases</small><strong>${filteredCases.length}</strong></div><div><small>Collected</small><strong>${fmtMoney(totalCollected)}</strong></div><div><small>Outstanding</small><strong>${fmtMoney(outstanding)}</strong></div><div><small>Delivered</small><strong>${delivered}</strong></div></section><table class="print-table"><thead><tr><th>Tracking</th><th>Customer</th><th>Branch</th><th>Status</th><th>Docs</th><th>Active</th><th>Balance</th></tr></thead><tbody>${rows}</tbody></table>${premiumPrintFooter()}</main></div><script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`);w.document.close()
  }
  function Pagination(){if(detailRows.length<=pageSize)return null;return <div className="reports-pagination"><span>{((safePage-1)*pageSize+1).toLocaleString()}–{Math.min(safePage*pageSize,detailRows.length).toLocaleString()} of {detailRows.length.toLocaleString()}</span><div><button className="secondary" disabled={safePage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹</button><b>{safePage} / {totalPages}</b><button className="secondary" disabled={safePage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>›</button><select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}><option value="50">50 / page</option><option value="100">100 / page</option><option value="200">200 / page</option></select></div></div>}

  return <section className="reports-manager-advanced">
    <div className="reports-actions"><div><strong>Management Reports</strong><span>Live operational, financial and movement analysis</span></div><button className="secondary" onClick={()=>exportRowsToPdf(activeReportExport.title,activeReportExport.rows,notify)}><Icon name="print" size={15}/> Print Current</button><ExportMenu title={activeReportExport.title} rows={activeReportExport.rows} notify={notify}/></div>
    <div className="reports-filterbar"><SearchBySelect value={searchBy} onChange={setSearchBy}/><div className="reports-search"><Icon name="search" size={15}/><input placeholder="Search report cases…" value={q} onChange={e=>setQ(e.target.value)}/></div><select value={period} onChange={e=>setPeriod(e.target.value)}><option value="today">Today</option><option value="7d">Last 7 Days</option><option value="month">This Month</option><option value="year">This Year</option><option value="all">All Time</option><option value="custom">Custom Range</option></select>{period==='custom'&&<><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></>}<select value={branch} onChange={e=>setBranch(e.target.value)}><option value="">All branches</option>{branches.map(x=><option key={x}>{x}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{CASE_STATUSES.map(x=><option key={x}>{x}</option>)}</select><button className="secondary" onClick={()=>{setQ('');setBranch('');setStatus('');setPeriod('month');setFrom('');setTo('')}}>Clear</button></div>
    <div className="reports-kpis-advanced"><div><span>CASES</span><strong>{filteredCases.length.toLocaleString()}</strong><small>{docs.toLocaleString()} documents</small></div><div><span>COLLECTED</span><strong>{fmtMoney(totalCollected).replace('.00','')}</strong><small>{pRows.length} payments</small></div><div><span>OUTSTANDING</span><strong className="due">{fmtMoney(outstanding).replace('.00','')}</strong><small>Current case balances</small></div><div><span>DELIVERIES</span><strong>{delivered.toLocaleString()}</strong><small>{partial} partial</small></div><div><span>ACTIVE STAGES</span><strong>{activeStages.toLocaleString()}</strong><small>Pending / processing</small></div><div><span>APPOINTMENTS</span><strong>{aRows.length.toLocaleString()}</strong><small>{completedAppointments} completed</small></div></div>
    <div className="report-library"><button onClick={()=>setTab('overview')}><Icon name="chart" size={18}/><span><strong>Executive Summary</strong><small>KPIs, status and branches</small></span></button><button onClick={()=>setTab('operations')}><Icon name="activity" size={18}/><span><strong>Stage Workload</strong><small>Pending and processing stages</small></span></button><button onClick={()=>setTab('finance')}><Icon name="wallet" size={18}/><span><strong>Finance & Aging</strong><small>Collections and receivables</small></span></button><button onClick={()=>setTab('delivery')}><Icon name="package" size={18}/><span><strong>Delivery Performance</strong><small>Full and partial handovers</small></span></button><button onClick={()=>setTab('appointments')}><Icon name="calendar" size={18}/><span><strong>Appointments</strong><small>Scheduled and completed visits</small></span></button><button onClick={()=>setTab('custody')}><Icon name="handover" size={18}/><span><strong>Custody Movement</strong><small>Internal document transfers</small></span></button></div>
    <div className="reports-tabs"><button className={tab==='overview'?'active':''} onClick={()=>setTab('overview')}>Overview</button><button className={tab==='operations'?'active':''} onClick={()=>setTab('operations')}>Operations</button><button className={tab==='finance'?'active':''} onClick={()=>setTab('finance')}>Finance</button><button className={tab==='delivery'?'active':''} onClick={()=>setTab('delivery')}>Delivery</button><button className={tab==='appointments'?'active':''} onClick={()=>setTab('appointments')}>Appointments</button><button className={tab==='custody'?'active':''} onClick={()=>setTab('custody')}>Custody</button><button className={tab==='cases'?'active':''} onClick={()=>setTab('cases')}>Case Detail</button></div>
    {loading&&<div className="reports-loading">Loading live report data…</div>}
    {tab==='overview'&&<div className="reports-grid"><div className="report-block"><h3>Case Status</h3>{statusRows.map(x=><div className="report-bar-row" key={x.label}><span>{x.label}</span><div><i style={{width:`${filteredCases.length?Math.max(2,x.value/filteredCases.length*100):0}%`}}></i></div><b>{x.value}</b></div>)}</div><div className="report-block"><h3>Branch Workload</h3>{branchRows.slice(0,12).map(x=><div className="report-list-row" key={x.label}><span>{x.label}</span><b>{x.value}</b></div>)}{!branchRows.length&&<Empty text="No branch data"/>}</div><div className="report-block"><h3>Activity</h3><div className="report-stat-list"><div><span>Payments</span><b>{pRows.length}</b></div><div><span>Deliveries</span><b>{dRows.length}</b></div><div><span>Appointments</span><b>{aRows.length}</b></div><div><span>Custody moves</span><b>{cRows.length}</b></div></div></div></div>}
    {tab==='operations'&&<div className="report-block full-report-block"><h3>Stage Workload</h3><div className="reports-stage-table"><div className="head"><span>Stage</span><span>Pending</span><span>Processing</span><span>Completed</span></div>{stageRows.map(x=><div className="row" key={x.label}><strong>{x.label}</strong><span>{x.pending}</span><span>{x.processing}</span><span>{x.completed}</span></div>)}</div></div>}
    {tab==='finance'&&<div className="reports-grid"><div className="report-block"><h3>Payment Methods</h3>{methodRows.map(x=><div className="report-list-row" key={x.label}><span>{x.label}</span><b>{fmtMoney(x.value).replace('.00','')}</b></div>)}{!methodRows.length&&<Empty text="No payments in this period"/>}</div><div className="report-block"><h3>Receivables Aging</h3>{agingRows.map(x=><div className="report-list-row" key={x.label}><span>{x.label} <small>{x.count} cases</small></span><b className={x.value?'due':''}>{fmtMoney(x.value).replace('.00','')}</b></div>)}</div><div className="report-block"><h3>Receivables Summary</h3><div className="report-stat-list"><div><span>Outstanding cases</span><b>{filteredCases.filter(c=>Number(c.balance_payment||0)>0).length}</b></div><div><span>Outstanding amount</span><b>{fmtMoney(outstanding).replace('.00','')}</b></div><div><span>Collected</span><b>{fmtMoney(totalCollected).replace('.00','')}</b></div></div></div></div>}
    {tab==='delivery'&&<div className="reports-grid"><div className="report-block"><h3>Delivery Outcomes</h3><div className="report-stat-list"><div><span>Completed deliveries</span><b>{delivered}</b></div><div><span>Partial deliveries</span><b>{partial}</b></div><div><span>Documents awaiting customer</span><b>{filteredCases.filter(c=>c.overall_status==='Ready for Delivery').reduce((n,c)=>n+(c.documents?.length||0),0)}</b></div><div><span>Collection rate</span><b>{dRows.length?Math.round(delivered/dRows.length*100):0}%</b></div></div></div><div className="report-block"><h3>Recent Delivery Activity</h3>{dRows.slice(0,12).map(r=>{const c=caseMap.get(r.case_id);return <div className="report-list-row" key={r.id}><span>#{c?.tracking_reference||'—'} · {c?.customer_name||'Unknown'}</span><b>{r.status}</b></div>})}{!dRows.length&&<Empty text="No deliveries in this period"/>}</div></div>}
    {tab==='appointments'&&<div className="reports-grid"><div className="report-block"><h3>Appointment Outcomes</h3>{['Scheduled','Confirmed','Completed','Cancelled','Missed'].map(s=><div className="report-list-row" key={s}><span>{s}</span><b>{aRows.filter(x=>x.status===s).length}</b></div>)}</div><div className="report-block"><h3>Authority Workload</h3>{[...new Set(aRows.map(x=>x.authority||'Unassigned'))].map(name=>({name,count:aRows.filter(x=>(x.authority||'Unassigned')===name).length})).sort((a,b)=>b.count-a.count).slice(0,12).map(x=><div className="report-list-row" key={x.name}><span>{x.name}</span><b>{x.count}</b></div>)}</div></div>}
    {tab==='custody'&&<div className="reports-grid"><div className="report-block"><h3>Custody Transfers</h3><div className="report-stat-list"><div><span>Total movements</span><b>{cRows.length}</b></div><div><span>Cases moved</span><b>{new Set(cRows.map(x=>x.case_id)).size}</b></div><div><span>Document-level movements</span><b>{cRows.filter(x=>x.document_id).length}</b></div></div></div><div className="report-block"><h3>Top Destinations</h3>{[...new Set(cRows.map(x=>x.to_location||'Unassigned'))].map(name=>({name,count:cRows.filter(x=>(x.to_location||'Unassigned')===name).length})).sort((a,b)=>b.count-a.count).slice(0,12).map(x=><div className="report-list-row" key={x.name}><span>{x.name}</span><b>{x.count}</b></div>)}</div></div>}
    {tab==='cases'&&<div className="report-cases-panel"><Pagination/><div className="report-case-table"><div className="head"><span>Tracking</span><span>Customer</span><span>Status</span><span>Branch</span><span>Docs</span><span>Active</span><span>Balance</span></div>{visible.map(({c,docs,active,balance})=><button className="row" key={c.id}><strong>#{c.tracking_reference}</strong><span>{c.customer_name}</span><StatusPill status={c.overall_status}/><span>{c.branches?.name||'—'}</span><span>{docs}</span><span>{active}</span><b className={balance>0?'due':''}>{fmtMoney(balance).replace('.00','')}</b></button>)}</div><Pagination/></div>}
  </section>
}

function CourierShipmentsView({session,cases,notify,reload,setModuleExport}){
  const [shipments,setShipments]=useState([]);const [loading,setLoading]=useState(true);const [open,setOpen]=useState(false);const [detail,setDetail]=useState(null);const [q,setQ]=useState('');const [searchBy,setSearchBy]=useState('tracking');const [selected,setSelected]=useState(new Set());const [openCases,setOpenCases]=useState(new Set());const [workMap,setWorkMap]=useState({});const [editId,setEditId]=useState(null);
  const empty={shipment_no:'',destination:'Delhi Office',agent_name:'',carrier:'DHL',awb_no:'',direction:'Outbound',dispatch_date:new Date().toISOString().slice(0,10)};const [form,setForm]=useState(empty);const [saving,setSaving]=useState(false);
  function availableStages(d){return [...new Set((d.document_stages||[]).filter(st=>!['Not Required','Cancelled'].includes(st.status)).map(st=>st.stage_name).filter(Boolean))]}
  function suggestedAttestation(d){const stages=(d.document_stages||[]).filter(st=>!['Not Required','Cancelled'].includes(st.status));const pending=stages.filter(st=>st.status!=='Completed');const use=pending.length?pending:stages;return use.map(st=>st.stage_name).filter(Boolean).join(' • ')||''}
  const docs=useMemo(()=>cases.flatMap(c=>(c.documents||[]).map(d=>({c,d,search:[c.tracking_reference,d.source_tracking_reference,c.customer_name,d.holder_name,d.document_name,c.account_name,c.current_milestone,d.current_milestone,suggestedAttestation(d)].filter(Boolean).join(' ').toLowerCase()}))),[cases]);
  const readyBase=useMemo(()=>docs.filter(x=>{if(x.d.direct_to_delhi)return false;const m=String(x.d.current_milestone||x.c.current_milestone||'').toLowerCase();return /ready for courier|ready to send|ready for .*submission|ready for uk/.test(m)}),[docs]);
  const selectableBase=useMemo(()=>docs.filter(x=>String(x.c.overall_status||'').toLowerCase()!=='cancelled'&&String(x.d.document_status||'').toLowerCase()!=='cancelled'),[docs]);
  const pickerDocs=useMemo(()=>{const needle=q.trim().toLowerCase();if(needle){return selectableBase.filter(x=>caseMatchesFieldSearch(x.c,needle,searchBy,x.search))}const base=readyBase.length?readyBase:selectableBase;if(!editId)return base;const map=new Map(base.map(x=>[x.d.id,x]));selectableBase.filter(x=>selected.has(x.d.id)).forEach(x=>map.set(x.d.id,x));return [...map.values()]},[selectableBase,readyBase,q,searchBy,editId,selected,cases]);
  const ready=readyBase;
  useEffect(()=>setModuleExport?.({view:'courier',title:'Courier Shipments',rows:shipments.map(sh=>({'Shipment No.':sh.shipment_no||'','Direction':sh.direction||'','Destination':sh.destination||'','Agent / Office':sh.agent_name||'','Carrier':sh.carrier||'','AWB':sh.awb_no||'','Dispatch Date':sh.dispatch_date||'','Status':sh.status||'','Documents':sh.courier_shipment_items?.length||0,'Received':(sh.courier_shipment_items||[]).filter(i=>i.receipt_status==='Received').length,'Missing':(sh.courier_shipment_items||[]).filter(i=>i.receipt_status==='Missing').length}))}),[shipments,setModuleExport]);
  const caseGroups=useMemo(()=>{const map=new Map();for(const x of pickerDocs){if(!map.has(x.c.id))map.set(x.c.id,{c:x.c,docs:[]});map.get(x.c.id).docs.push(x.d)}return [...map.values()]},[pickerDocs]);
  const selectedRows=useMemo(()=>docs.filter(x=>selected.has(x.d.id)),[docs,selected]);
  async function load(){setLoading(true);const {data,error}=await supabase.from('courier_shipments').select('*,courier_shipment_items!courier_shipment_items_shipment_id_fkey(id,document_id,required_attestation,received_at,receipt_status,exception_note)').order('created_at',{ascending:false}).limit(300);if(error)notify(userError(error));else setShipments(data||[]);setLoading(false)}
  useEffect(()=>{load()},[]);
  function resetEditor(){setOpen(false);setEditId(null);setSelected(new Set());setWorkMap({});setForm(empty);setQ('');setOpenCases(new Set())}
  function startCreate(){setEditId(null);setSelected(new Set());setWorkMap({});setForm(empty);setQ('');setOpenCases(new Set());setOpen(true)}
  function startEdit(sh){const items=sh.courier_shipment_items||[];setEditId(sh.id);setForm({shipment_no:sh.shipment_no||'',destination:sh.destination||'',agent_name:sh.agent_name||'',carrier:sh.carrier||'DHL',awb_no:sh.awb_no||'',direction:sh.direction||'Outbound',dispatch_date:sh.dispatch_date||new Date().toISOString().slice(0,10)});setSelected(new Set(items.map(x=>x.document_id)));setWorkMap(Object.fromEntries(items.map(x=>[x.document_id,x.required_attestation||''])));setQ('');setOpenCases(new Set());setOpen(true)}
  function toggle(id){setSelected(prev=>{const n=new Set(prev);if(n.has(id)){n.delete(id)}else{n.add(id);setWorkMap(w=>({...w,[id]:w[id]||''}))}return n})}
  function toggleCase(id){setOpenCases(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})}
  function toggleCaseDocs(group){setSelected(prev=>{const n=new Set(prev);const ids=group.docs.map(d=>d.id);const all=ids.every(id=>n.has(id));ids.forEach(id=>{if(all)n.delete(id);else n.add(id)});if(!all)setWorkMap(w=>{const out={...w};ids.forEach(id=>{if(out[id]===undefined)out[id]=''});return out});return n})}
  function toggleStage(id,stage){setWorkMap(prev=>{const parts=String(prev[id]||'').split(/\s*[•,]\s*/).map(x=>x.trim()).filter(Boolean);const has=parts.includes(stage);const next=has?parts.filter(x=>x!==stage):[...parts,stage];return {...prev,[id]:next.join(' • ')}})}
  async function saveShipment(e){e.preventDefault();if(!selected.size)return notify('Select at least one document for the shipment.');const missing=[...selected].filter(id=>!String(workMap[id]||'').trim());if(missing.length)return notify(`Enter required attestation / work for all selected documents (${missing.length} missing).`);setSaving(true);try{const shipNo=form.shipment_no.trim()||`SHP-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`;let shipmentId=editId;if(editId){const {error}=await supabase.from('courier_shipments').update({...form,shipment_no:shipNo,updated_by:session.user.id,updated_at:new Date().toISOString()}).eq('id',editId);if(error)throw error;const current=shipments.find(x=>x.id===editId);const existingIds=(current?.courier_shipment_items||[]).map(x=>x.document_id);const removed=existingIds.filter(id=>!selected.has(id));if(removed.length){const {error:de}=await supabase.from('courier_shipment_items').delete().eq('shipment_id',editId).in('document_id',removed);if(de)throw de}const rows=[...selected].map(document_id=>({shipment_id:editId,document_id,required_attestation:String(workMap[document_id]||'').trim()}));const {error:ue}=await supabase.from('courier_shipment_items').upsert(rows,{onConflict:'shipment_id,document_id'});if(ue)throw ue}else{const {data,error}=await supabase.from('courier_shipments').insert({...form,shipment_no:shipNo,status:'Draft',created_by:session.user.id,updated_by:session.user.id}).select('*').single();if(error)throw error;shipmentId=data.id;const items=[...selected].map(document_id=>({shipment_id:shipmentId,document_id,required_attestation:String(workMap[document_id]||'').trim(),receipt_status:'Pending'}));const {error:ie}=await supabase.from('courier_shipment_items').insert(items);if(ie)throw ie}resetEditor();notify(editId?`Shipment ${shipNo} updated.`:`Shipment ${shipNo} created.`);await load()}catch(err){notify(userError(err))}finally{setSaving(false)}}
  async function deleteShipment(sh){if(!window.confirm(`Delete shipment ${sh.shipment_no}?\n\nThis removes the shipment and its manifest items. It will not reverse any document milestone already recorded.`))return;const {error}=await supabase.from('courier_shipments').delete().eq('id',sh.id);if(error)return notify(userError(error));if(detail?.id===sh.id)setDetail(null);notify(`Shipment ${sh.shipment_no} deleted.`);await load()}
  async function changeStatus(sh,status,documentIdsOverride=null){const today=new Date().toISOString().slice(0,10);const patch={status,updated_by:session.user.id,updated_at:new Date().toISOString()};if(status==='Dispatched'&&!sh.dispatched_at)patch.dispatched_at=new Date().toISOString();if(status==='Received by Agent'&&!sh.received_at)patch.received_at=new Date().toISOString();const {error}=await supabase.from('courier_shipments').update(patch).eq('id',sh.id);if(error)return notify(userError(error));if(['Dispatched','Received by Agent'].includes(status)){const ids=documentIdsOverride||(status==='Received by Agent'?(sh.courier_shipment_items||[]).filter(x=>x.receipt_status==='Received').map(x=>x.document_id):(sh.courier_shipment_items||[]).map(x=>x.document_id));if(ids.length){const milestone=status==='Dispatched'?(sh.destination?.toLowerCase().includes('delhi')?'On Courier to Delhi':`On Courier to ${sh.destination}`):(sh.destination?.toLowerCase().includes('delhi')?'Received in Delhi':`Received by ${sh.destination}`);await supabase.from('documents').update({current_milestone:milestone,current_milestone_date:today}).in('id',ids);for(const c of cases){const hit=(c.documents||[]).filter(d=>ids.includes(d.id));if(hit.length)await supabase.from('case_history').insert(hit.map(d=>({case_id:c.id,user_id:session.user.id,action:'Courier shipment update',field_name:'courier',new_value:`${sh.shipment_no} · ${milestone}`,metadata:{shipment_id:sh.id,document_id:d.id,awb_no:sh.awb_no||null}})))}}}notify(`Shipment updated to ${status}.`);await load();await reload?.()}
  async function confirmReceipt(sh){const received=new Date().toISOString();const ids=(sh.courier_shipment_items||[]).map(x=>x.id);if(!ids.length)return;const {error}=await supabase.from('courier_shipment_items').update({receipt_status:'Received',received_at:received,received_by:session.user.id}).in('id',ids);if(error)return notify(userError(error));await changeStatus(sh,'Received by Agent',(sh.courier_shipment_items||[]).map(x=>x.document_id))}
  async function setItemReceipt(sh,item,status){const received=status==='Received'?new Date().toISOString():null;const {error}=await supabase.from('courier_shipment_items').update({receipt_status:status,received_at:received,received_by:status==='Received'?session.user.id:null}).eq('id',item.id);if(error)return notify(userError(error));if(status==='Received'){const milestone=sh.destination?.toLowerCase().includes('delhi')?'Received in Delhi':`Received by ${sh.destination}`;await supabase.from('documents').update({current_milestone:milestone,current_milestone_date:new Date().toISOString().slice(0,10)}).eq('id',item.document_id)}await load();await reload?.()}
  function printManifest(sh){const items=sh.courier_shipment_items||[];const rows=items.map(item=>{const x=docs.find(z=>z.d.id===item.document_id);return x?{...x,item}:null}).filter(Boolean);const w=window.open('','_blank');if(!w)return notify('Please allow pop-ups to print the manifest.');w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(sh.shipment_no)}</title><style>${premiumPrintCss('A4 portrait')}</style></head><body><div class="print-page">${premiumPrintHeader('Document Courier Manifest',`${sh.direction||'Outbound'} shipment to ${sh.destination||'destination'}`,sh.shipment_no||'COURIER')}<main class="print-body"><section class="print-meta"><div><small>Carrier</small><strong>${escapeHtml(sh.carrier||'—')}</strong></div><div><small>AWB / Tracking</small><strong>${escapeHtml(sh.awb_no||'—')}</strong></div><div><small>Dispatch date</small><strong>${escapeHtml(fmtDate(sh.dispatch_date))}</strong></div><div><small>Receiving agent</small><strong>${escapeHtml(sh.agent_name||'—')}</strong></div></section><table class="print-table"><thead><tr><th>#</th><th>Tracking</th><th>Document holder</th><th>Document</th><th>Qty</th><th>Required attestation / work</th></tr></thead><tbody>${rows.map((x,i)=>`<tr><td>${i+1}</td><td><b>#${escapeHtml(x.d.source_tracking_reference||x.c.tracking_reference)}</b></td><td>${escapeHtml(x.d.holder_name||x.c.customer_name||'—')}</td><td>${escapeHtml(x.d.document_name||'—')}</td><td>${Number(x.d.quantity||1)}</td><td><b>${escapeHtml(x.item.required_attestation||'—')}</b></td></tr>`).join('')||'<tr><td colspan="6">No documents assigned.</td></tr>'}</tbody></table><section class="print-kpis"><div><small>Documents</small><strong>${rows.length}</strong></div><div><small>Total quantity</small><strong>${rows.reduce((n,x)=>n+Number(x.d.quantity||1),0)}</strong></div><div><small>Direction</small><strong>${escapeHtml(sh.direction||'Outbound')}</strong></div><div><small>Status</small><strong>${escapeHtml(sh.status||'Draft')}</strong></div></section><div class="print-signatures"><div>Prepared / Sent by</div><div>Received and verified by agent</div></div>${premiumPrintFooter()}</main></div><script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`);w.document.close()}
  return <section className="courier-module"><div className="courier-kpis"><div><span>SHIPMENTS</span><strong>{shipments.length}</strong><small>Recent batches</small></div><div><span>IN TRANSIT</span><strong>{shipments.filter(x=>['Dispatched','In Transit'].includes(x.status)).length}</strong><small>Active courier movement</small></div><div><span>WAITING RECEIPT</span><strong>{shipments.filter(x=>x.status==='Dispatched').length}</strong><small>Agent confirmation pending</small></div><div><span>DOCUMENTS READY</span><strong>{ready.length}</strong><small>Available for batch selection</small></div></div><div className="courier-toolbar"><div><h2>Courier Batches</h2><p>Create, edit, receive and manage courier shipment batches.</p></div><button className="primary" onClick={startCreate}>＋ Create Shipment</button></div>{loading?<Empty text="Loading shipments…"/>:<div className="courier-grid">{shipments.length?shipments.map(sh=><article className="courier-card" key={sh.id}><div className="courier-card-head"><div><span>{sh.direction||'Outbound'} · {sh.carrier||'Courier'}</span><strong>{sh.shipment_no}</strong><small>{sh.destination} · {fmtDate(sh.dispatch_date)}</small></div><StatusPill status={sh.status}/></div><div className="courier-meta"><span><b>{sh.courier_shipment_items?.length||0}</b> documents</span><span>AWB <b>{sh.awb_no||'—'}</b></span></div><div className="courier-actions"><button className="secondary" onClick={()=>printManifest(sh)}>Print Manifest</button><button className="secondary" onClick={()=>startEdit(sh)}>Edit</button>{sh.status==='Draft'&&<button className="primary" onClick={()=>changeStatus(sh,'Dispatched')}>Dispatch</button>}{sh.status==='Dispatched'&&<button className="primary" onClick={()=>confirmReceipt(sh)}>Mark All Received</button>}<button className="secondary" onClick={()=>setDetail(detail?.id===sh.id?null:sh)}>{detail?.id===sh.id?'Hide':'Details'}</button><button className="secondary courier-delete" onClick={()=>deleteShipment(sh)}>Delete</button></div>{detail?.id===sh.id&&<div className="courier-detail"><p><b>Agent:</b> {sh.agent_name||'—'}</p><label>Status<select value={sh.status} onChange={e=>changeStatus(sh,e.target.value)}><option>Draft</option><option>Prepared</option><option>Dispatched</option><option>In Transit</option><option>Received by Agent</option><option>Closed</option><option>Cancelled</option></select></label><div className="courier-receipt-list">{(sh.courier_shipment_items||[]).map(item=>{const x=docs.find(z=>z.d.id===item.document_id);return <div key={item.id}><span><b>#{x?.d?.source_tracking_reference||x?.c?.tracking_reference||'—'}</b> · {x?.d?.holder_name||x?.c?.customer_name||'Document'} · {x?.d?.document_name||''}<small className="courier-detail-work">Required: {item.required_attestation||'—'}</small></span><div><button className={item.receipt_status==='Received'?'receipt-active':''} onClick={()=>setItemReceipt(sh,item,'Received')}>Received</button><button className={item.receipt_status==='Missing'?'missing-active':''} onClick={()=>setItemReceipt(sh,item,'Missing')}>Missing</button></div></div>})}</div></div>}</article>):<Empty text="No courier shipments yet"/>}</div>}
  {open&&<Modal title={editId?'Edit Courier Shipment':'Create Courier Shipment'} subtitle={editId?'Update shipment details, selected documents and assigned work.':'Search cases on the left and build the shipment on the right.'} onClose={resetEditor}><form className="courier-create courier-create-wide" onSubmit={saveShipment}><div className="courier-wide-form"><div className="courier-wide-fields"><Field label="Shipment No."><input value={form.shipment_no} onChange={e=>setForm({...form,shipment_no:e.target.value})} placeholder="Auto if blank"/></Field><Field label="Direction"><select value={form.direction} onChange={e=>setForm({...form,direction:e.target.value})}><option>Outbound</option><option>Return</option><option>Domestic</option></select></Field><Field label="Destination"><input required value={form.destination} onChange={e=>setForm({...form,destination:e.target.value})}/></Field><Field label="Receiving Agent / Office"><input value={form.agent_name} onChange={e=>setForm({...form,agent_name:e.target.value})}/></Field><Field label="Carrier"><select value={form.carrier} onChange={e=>setForm({...form,carrier:e.target.value})}><option>DHL</option><option>Aramex</option><option>Internal Courier</option><option>Other</option></select></Field><Field label="AWB / Tracking"><input value={form.awb_no} onChange={e=>setForm({...form,awb_no:e.target.value})}/></Field><Field label="Dispatch Date"><input type="date" value={form.dispatch_date} onChange={e=>setForm({...form,dispatch_date:e.target.value})}/></Field></div><div className="courier-split-picker"><section className="courier-search-pane"><div className="courier-pane-title"><div><strong>Find Documents</strong><span>Search and expand a case to select documents</span></div><b>{caseGroups.length} cases</b></div><SearchBySelect value={searchBy} onChange={setSearchBy}/><div className="courier-side-search"><Icon name="search" size={16}/><input autoFocus placeholder="Tracking, customer, holder, document, stage…" value={q} onChange={e=>setQ(e.target.value)}/>{q&&<button type="button" onClick={()=>setQ('')}>×</button>}</div><div className="courier-side-results">{caseGroups.slice(0,150).map(group=>{const c=group.c;const isOpen=openCases.has(c.id)||!!q||group.docs.some(d=>selected.has(d.id));const selectedCount=group.docs.filter(d=>selected.has(d.id)).length;return <div className={`courier-case-accordion ${selectedCount?'has-selected':''}`} key={c.id}><div className="courier-case-row"><button type="button" className="courier-case-toggle" onClick={()=>toggleCase(c.id)}><span className="courier-chevron">{isOpen?'⌄':'›'}</span><div><strong>#{c.tracking_reference} · {c.customer_name||'Customer'}</strong><span>{c.branches?.name||'—'} · {group.docs.length} document{group.docs.length===1?'':'s'}</span></div></button><button type="button" className="courier-case-select" onClick={()=>toggleCaseDocs(group)}>{selectedCount===group.docs.length?'Clear':selectedCount?`${selectedCount}/${group.docs.length}`:'Select All'}</button></div>{isOpen&&<div className="courier-case-docs courier-case-docs-simple">{group.docs.map(d=>{const checked=selected.has(d.id);return <label key={d.id} className={checked?'selected':''}><input type="checkbox" checked={checked} onChange={()=>toggle(d.id)}/><div className="courier-doc-main"><strong>{d.holder_name||c.customer_name||'Document holder'}</strong><span>{d.document_name||'Document'} · Qty {Number(d.quantity||1)}</span><small>{d.current_milestone||c.current_milestone||d.document_status||'No milestone'}</small></div></label>})}</div>}</div>})}{!caseGroups.length&&<div className="courier-picker-empty">No matching cases or documents found.</div>}</div></section><aside className="courier-basket-pane"><div className="courier-pane-title"><div><strong>Shipment Basket</strong><span>Assign only the work this agent must complete</span></div><b>{selected.size} selected</b></div><div className="courier-basket-list">{selectedRows.map(({c,d})=>{const stages=availableStages(d);return <div className="courier-basket-item" key={d.id}><div className="courier-basket-item-head"><div><strong>#{d.source_tracking_reference||c.tracking_reference}</strong><span>{d.holder_name||c.customer_name||'Document holder'}</span><small>{d.document_name||'Document'} · Qty {Number(d.quantity||1)}</small></div><button type="button" title="Remove" onClick={()=>toggle(d.id)}>×</button></div><label>Required Work / Attestation<input className="courier-work-input" value={workMap[d.id]||''} onChange={e=>setWorkMap(prev=>({...prev,[d.id]:e.target.value}))} placeholder="e.g. MEA"/></label>{stages.length>0&&<div className="courier-work-chips">{stages.map(stage=>{const active=String(workMap[d.id]||'').split(/\s*[•,]\s*/).map(x=>x.trim()).includes(stage);return <button type="button" className={active?'active':''} key={stage} onClick={()=>toggleStage(d.id,stage)}>{stage}</button>})}</div>}</div>})}{!selectedRows.length&&<div className="courier-basket-empty"><strong>No documents selected</strong><span>Search on the left, expand a case and select the documents for this shipment.</span></div>}</div><div className="courier-basket-summary"><span>Total document instances</span><strong>{selected.size}</strong></div></aside></div></div><div className="modal-actions courier-wide-actions"><button type="button" className="secondary" onClick={resetEditor}>Cancel</button><button className="primary" disabled={saving||!selected.size}>{saving?'Saving…':editId?`Save Changes · ${selected.size}`:`Create Shipment · ${selected.size}`}</button></div></form></Modal>}
  </section>
}

function TrackingPreviewView({cases}){
  const [q,setQ]=useState('');
  const [found,setFound]=useState(null);
  const [mobileMatches,setMobileMatches]=useState([]);
  const [searched,setSearched]=useState(false);
  const [trackingLoading,setTrackingLoading]=useState(false);
  const [docOpen,setDocOpen]=useState(new Set());
  const [mode,setMode]=useState('reference');

  const activeStages=d=>(d.document_stages||[]).filter(s=>!['Not Required','Cancelled'].includes(s.status));
  const completeStages=d=>activeStages(d).filter(s=>s.status==='Completed').length;
  const docProgress=d=>{
    const stages=activeStages(d);
    if(!stages.length)return 0;
    return Math.round(completeStages(d)/stages.length*100);
  };
  const overallProgress=c=>{
    const stages=(c.documents||[]).flatMap(activeStages);
    if(!stages.length)return ['Completed','Ready for Delivery','Delivered'].includes(c.overall_status)?100:0;
    return Math.round(stages.filter(s=>s.status==='Completed').length/stages.length*100);
  };
  const journey=['Received','Under Process','Completed','Ready for Delivery','Delivered'];
  const journeyIndex=status=>{
    if(status==='Waiting')return 1;
    if(status==='Cancelled')return 0;
    return Math.max(0,journey.indexOf(status));
  };

  function run(e){
    e?.preventDefault();
    const raw=q.trim();
    if(!raw)return;
    setTrackingLoading(true);
    setSearched(false);
    setFound(null);
    setMobileMatches([]);
    setDocOpen(new Set());

    // Small deliberate transition makes local/cache searches feel consistent
    // with the future public tracking endpoint instead of flashing instantly.
    window.setTimeout(()=>{
      const k=raw.toLowerCase();
      if(mode==='mobile'){
        let digits=raw.replace(/\D/g,'');
        const local=digits.startsWith('974')&&digits.length>8?digits.slice(3):digits;
        const matches=cases.filter(x=>{
          const stored=String(x.mobile||'').replace(/\D/g,'');
          const storedLocal=stored.startsWith('974')&&stored.length>8?stored.slice(3):stored;
          return stored&&storedLocal===local;
        }).sort((a,b)=>{
          const rank=s=>s==='Ready for Delivery'?0:s==='Under Process'?1:s==='Waiting'?2:s==='Received'?3:s==='Completed'?4:s==='Delivered'?5:6;
          return rank(a.overall_status)-rank(b.overall_status)||new Date(b.submission_date||b.created_at||0)-new Date(a.submission_date||a.created_at||0);
        });
        setMobileMatches(matches);
        setFound(matches.length===1?matches[0]:null);
      }else{
        const c=cases.find(x=>String(x.tracking_reference||'').trim().toLowerCase()===k);
        setFound(c||null);
      }
      setTrackingLoading(false);
      setSearched(true);
    },420);
  }

  function changeMode(next){
    setMode(next);setQ('');setFound(null);setMobileMatches([]);setSearched(false);setTrackingLoading(false);setDocOpen(new Set());
  }
  function toggleDoc(id){setDocOpen(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n})}
  function copyReference(){if(found)navigator.clipboard?.writeText(String(found.tracking_reference||''))}
  function printTracking(){
    if(!found)return;
    const result=document.querySelector('.customer-track-result');
    if(!result)return;

    // Print a clone inside the current document. This uses the CSS/fonts that
    // are already loaded and avoids popup rendering races.
    document.getElementById('kenza-tracking-print-root')?.remove();
    const host=document.createElement('div');
    host.id='kenza-tracking-print-root';
    const clone=result.cloneNode(true);
    clone.querySelectorAll('.premium-help-actions,.premium-result-identity button').forEach(el=>el.remove());
    host.appendChild(clone);
    document.body.appendChild(host);
    document.body.classList.add('kenza-print-tracking');

    let cleaned=false;
    const cleanup=()=>{
      if(cleaned)return;
      cleaned=true;
      document.body.classList.remove('kenza-print-tracking');
      document.getElementById('kenza-tracking-print-root')?.remove();
      window.removeEventListener('afterprint',cleanup);
    };
    window.addEventListener('afterprint',cleanup);

    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      window.print();
      window.setTimeout(cleanup,5000);
    }));
  }

  const docs=found?.documents||[];
  const progress=found?overallProgress(found):0;
  const completedDocs=docs.filter(d=>docProgress(d)===100).length;
  const status=String(found?.overall_status||'Received');
  const currentStep=journeyIndex(status);
  const ready=['Ready for Delivery','Delivered'].includes(status);

  return <section className="customer-tracking-module premium-tracking">
    <div className="customer-preview-banner">
      <div><span>Customer-facing preview</span><strong>Clean public view — internal and financial information is hidden.</strong></div>
      <div className="customer-preview-note">Tracking Reference is the customer-facing key.</div>
    </div>

    <div className="customer-track-hero">
      <div className="customer-track-brand"><div className="brand-mark">K</div><div><strong>{configuredCompanyName()}</strong><span>Document Attestation Tracking</span></div></div>
      <div className="customer-track-copy">
        <span className="customer-track-kicker">DOCUMENT TRACKING</span>
        <h2>Where are my documents?</h2>
        <p>Follow your attestation journey and see the latest progress for each document.</p>
      </div>
      <div className="customer-track-searchbox">
        <div className="customer-search-tabs">
          <button type="button" className={mode==='reference'?'active':''} onClick={()=>changeMode('reference')}>Tracking Reference</button>
          <button type="button" className={mode==='mobile'?'active':''} onClick={()=>changeMode('mobile')}>Mobile Number</button>
        </div>
        <form onSubmit={run}>
          <div className="customer-search-input"><Icon name={mode==='mobile'?'phone':'search'} size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={mode==='mobile'?'Enter registered mobile number':'Enter your tracking reference'} autoComplete="off"/></div>
          <button className="primary" disabled={!q.trim()||trackingLoading}>{trackingLoading?'Checking…':'Track'}</button>
        </form>
        <small>{mode==='reference'?`Enter the Tracking No. provided by ${configuredCompanyName()}.`:'If several cases use the same mobile number, you can choose the required tracking.'}</small>
      </div>
    </div>

    {trackingLoading&&<div className="tracking-skeleton" aria-label="Loading tracking information">
      <div className="skel-head"><i/><div><b/><span/></div><em/></div>
      <div className="skel-progress"><b/><span/></div>
      <div className="skel-cards"><i/><i/><i/></div>
      <div className="skel-doc"><b/><span/><span/></div>
      <div className="skel-doc"><b/><span/><span/></div>
    </div>}

    {searched&&!found&&mobileMatches.length===0&&<div className="customer-track-empty tracking-enter">
      <div className="customer-empty-icon">?</div><h3>No tracking record found</h3>
      <p>Check the {mode==='mobile'?'mobile number':'tracking reference'} and try again.</p>
      <button className="secondary" onClick={()=>{setQ('');setSearched(false)}}>Try Again</button>
    </div>}

    {mode==='mobile'&&mobileMatches.length>1&&!found&&<div className="customer-mobile-results tracking-enter">
      <div className="customer-mobile-results-head">
        <div><span>MATCHING TRACKINGS</span><h3>{mobileMatches.length} active records found</h3><p>Choose the tracking reference you want to view.</p></div>
      </div>
      <div className="customer-mobile-case-list">
        {mobileMatches.map(c=>{
          const cdocs=c.documents||[], cprogress=overallProgress(c);
          return <button key={c.id} className="customer-mobile-case" onClick={()=>{setFound(c);setDocOpen(new Set())}}>
            <div className="customer-mobile-case-ref"><small>TRACKING</small><strong>#{c.tracking_reference}</strong></div>
            <div className="customer-mobile-case-name"><strong>{c.customer_name||'Customer'}</strong><span>{fmtDate(c.submission_date)} · {cdocs.length} document{cdocs.length===1?'':'s'}</span></div>
            <div className="customer-mobile-case-progress"><span><i style={{width:`${cprogress}%`}}/></span><small>{cprogress}%</small></div>
            <div className="customer-mobile-status">{c.overall_status}</div>
            <Icon name="chevron-down" size={15}/>
          </button>
        })}
      </div>
    </div>}

    {mode==='mobile'&&mobileMatches.length>1&&found&&<div className="customer-mobile-switch tracking-enter">
      <span>There are <strong>{mobileMatches.length}</strong> trackings linked to this mobile number.</span>
      <button className="secondary" onClick={()=>{setFound(null);setDocOpen(new Set())}}>View All Trackings</button>
    </div>}

    {found&&<div className="customer-track-result tracking-enter">
      <div className="premium-result-hero">
        <div className="premium-result-identity">
          <span>TRACKING REFERENCE</span>
          <div><h3>#{found.tracking_reference}</h3><button onClick={copyReference}>Copy</button></div>
          <p>{found.customer_name||'Customer'}</p>
        </div>
        <div className="premium-result-progress">
          <div className="premium-progress-ring" style={{'--progress':`${progress*3.6}deg`}}><div><strong>{progress}%</strong><span>Progress</span></div></div>
        </div>
      </div>

      <div className="premium-journey">
        <div className="premium-journey-line"><i style={{width:`${currentStep/(journey.length-1)*100}%`}}/></div>
        {journey.map((s,i)=><div className={`premium-journey-step ${i<currentStep?'done':i===currentStep?'current':''}`} key={s}>
          <b>{i<currentStep?'✓':i+1}</b><span>{s}</span>
        </div>)}
      </div>

      <div className="premium-summary">
        <div><small>SUBMITTED</small><strong>{fmtDate(found.submission_date)}</strong></div>
        <div><small>DOCUMENTS</small><strong>{docs.length}</strong></div>
        <div><small>DOCUMENTS COMPLETED</small><strong>{completedDocs} / {docs.length}</strong></div>
      </div>

      {ready&&<div className={`premium-ready ${status==='Delivered'?'delivered':''}`}>
        <div className="premium-ready-icon">{status==='Delivered'?'✓':'!'}</div>
        <div><strong>{status==='Delivered'?'Documents delivered':'Your documents are ready'}</strong><span>{status==='Delivered'?'This tracking has been completed and handed over.':`Please contact ${configuredCompanyName()} to arrange collection or delivery.`}</span></div>
      </div>}

      <div className="premium-doc-head">
        <div><span>DOCUMENT JOURNEY</span><h3>Your documents</h3><p>Select a document to see its attestation stages.</p></div>
        <strong>{docs.length}</strong>
      </div>

      <div className="premium-document-list">
        {docs.map((d,di)=>{
          const stages=activeStages(d), pct=docProgress(d), open=docOpen.has(d.id);
          const done=completeStages(d);
          return <article className={`premium-document ${open?'open':''}`} key={d.id}>
            <button className="premium-document-main" onClick={()=>toggleDoc(d.id)}>
              <div className="premium-doc-icon"><Icon name="file" size={18}/></div>
              <div className="premium-doc-name"><strong>{d.document_name||`Document ${di+1}`}</strong><span>{stages.length?`${done} of ${stages.length} stages completed`:'Processing details will appear here'}</span></div>
              <div className="premium-doc-meter"><span><i style={{width:`${pct}%`}}/></span><b>{pct}%</b></div>
              <div className={`premium-doc-state ${pct===100?'complete':pct>0?'active':''}`}>{pct===100?'Complete':pct>0?'In progress':'Received'}</div>
              <Icon name={open?'chevron-up':'chevron-down'} size={15}/>
            </button>
            {open&&<div className="premium-stage-list">
              {stages.length?stages.map((s,si)=>{
                const done=s.status==='Completed',active=s.status==='Processing';
                return <div className={`premium-stage ${done?'done':active?'active':''}`} key={s.id}>
                  <div className="premium-stage-node">{done?'✓':si+1}</div>
                  <div><strong>{s.stage_name}</strong><span>{done?'Completed':active?'Currently processing':'Pending'}</span></div>
                </div>
              }):<div className="premium-no-stage">Stage details are being prepared.</div>}
            </div>}
          </article>
        })}
        {!docs.length&&<div className="premium-no-documents"><Icon name="file" size={20}/><strong>Documents are being prepared</strong><span>Tracking details will appear here once the workflow is updated.</span></div>}
      </div>

      <div className="premium-help">
        <div><strong>Need assistance?</strong><span>Keep tracking #{found.tracking_reference} ready when contacting {configuredCompanyName()}.</span></div>
        <div className="premium-help-actions">
          <button className="secondary" onClick={copyReference}>Copy Tracking No.</button>
          <button className="primary" onClick={printTracking}>Print / Save PDF</button>
        </div>
      </div>
    </div>}
  </section>
}
function LabelSheetManager({cases,onClose,notify,onChange}){
  const key='kenza_label_sheet_queue_v1';
  const [items,setItems]=useState(()=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return []}});
  function persist(next){setItems(next);localStorage.setItem(key,JSON.stringify(next));onChange?.()}
  function remove(id){persist(items.filter(x=>x.id!==id))}
  function clearAll(){if(!items.length)return;if(confirm('Clear all labels from the saved label sheet?')){persist([]);notify?.('Label sheet cleared.')}}
  async function printSheet(){if(!items.length)return notify?.('Label sheet is empty.');const hydrated=items.map(i=>cases.find(c=>c.id===i.id)||i);await printCaseLabels(hydrated)}
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal label-sheet-manager" onMouseDown={e=>e.stopPropagation()}>
      <div className="label-sheet-manager-head"><div><h2>Label Sheet</h2><p>Manage labels saved for the next A4 print sheet.</p></div><button className="icon-btn" onClick={onClose}><Icon name="close" size={18}/></button></div>
      <div className="label-sheet-manager-toolbar"><div><strong>{items.length}</strong><span> saved label{items.length===1?'':'s'}</span></div><div><button className="secondary" disabled={!items.length} onClick={clearAll}>Clear Sheet</button><button className="primary" disabled={!items.length} onClick={printSheet}>Print Sheet</button></div></div>
      <div className="label-sheet-manager-list">
        {items.length?items.map((i,idx)=><div className="label-sheet-row" key={i.id}><span className="label-sheet-index">{idx+1}</span><div><strong>#{i.tracking_reference}</strong><span>{i.customer_name||'Unnamed customer'} · {i.mobile||'No mobile'}</span></div><button className="secondary tiny" onClick={()=>remove(i.id)}>Remove</button></div>):<div className="label-sheet-empty">No labels saved. Use “Add to Label Sheet” from a case label preview.</div>}
      </div>
    </div>
  </div>
}

function LabelPreviewModal({c,onClose,notify,onAddToSheet}){
  const [qr,setQr]=useState(''),[size,setSize]=useState(()=>getLabelSize()),[settings,setSettings]=useState(false);
  useEffect(()=>{let live=true;labelQr(c,220).then(x=>{if(live)setQr(x)});return()=>{live=false}},[c.id,c.updated_at]);

  function addToSheet(){
    try{
      const key='kenza_label_sheet_queue_v1';
      const old=JSON.parse(localStorage.getItem(key)||'[]');
      const item={id:c.id,tracking_reference:c.tracking_reference,customer_name:c.customer_name,mobile:c.mobile,balance_payment:c.balance_payment,documents:c.documents||[]};
      localStorage.setItem(key,JSON.stringify([...old.filter(x=>x.id!==c.id),item]));
      onAddToSheet?.(c);
      notify?.(`Label #${c.tracking_reference} added to label sheet.`);
      onClose();
    }catch{notify?.('Could not add this label to the sheet.')}
  }
  function applySize(){
    const next=saveLabelSize(size);
    setSize(next);setSettings(false);
    notify?.(`Sticker size set to ${next.width} × ${next.height} mm.`);
  }

  return <div className="modal-backdrop delivery-label-backdrop" onMouseDown={onClose}>
    <div className="legacy-label-dialog" onMouseDown={e=>e.stopPropagation()}>
      <div className="legacy-label-head">
        <div><h2>Envelope Label</h2><p>Print or save the A4 label as PDF.</p></div>
        <div className="legacy-label-head-actions"><button className="secondary" onClick={()=>setSettings(v=>!v)}>Sticker Size</button><button className="secondary" onClick={onClose}>Close</button></div>
      </div>
      {settings&&<div className="label-size-settings">
        <div><label>Width (mm)</label><input type="number" min="50" max="75" step="1" value={size.width} onChange={e=>setSize({...size,width:e.target.value})}/></div>
        <div><label>Height (mm)</label><input type="number" min="20" max="35" step="1" value={size.height} onChange={e=>setSize({...size,height:e.target.value})}/></div>
        <button className="primary" onClick={applySize}>Apply Size</button>
        <span>Legacy sheet slots remain 75 × 35 mm.</span>
      </div>}
      <div className="legacy-label-body">
        <div className="legacy-label-preview">
          <div className="legacy-compact-label print-match-label" style={{width:`${Math.round(Number(size.width)*7.45)}px`,height:`${Math.round(Number(size.height)*7.45)}px`}}>
            <div className="legacy-compact-copy">
              <div className="legacy-compact-brand">{configuredCompanyName().toUpperCase()}</div>
              <div className="preview-label-row"><span>Track No.</span><strong>#{c.tracking_reference}</strong></div>
              <div className="preview-label-row"><span>Name</span><strong>{c.customer_name||'—'}</strong></div>
              <div className="preview-label-row"><span>Mobile</span><strong>{c.mobile||'—'}</strong></div>
              <div className="preview-label-row remarks"><span>Remarks</span><strong>{labelRemarks(c)}</strong></div>
            </div>
            <div className="legacy-compact-qr">
              {qr?<img src={qr} alt="Delivery QR"/>:<div className="qr-placeholder">QR</div>}
              <div>SCAN</div>
            </div>
          </div>
        </div>
        <div className="legacy-label-actions">
          <button className="secondary" onClick={addToSheet}>Add to Label Sheet</button>
          <button className="primary" onClick={()=>printCaseLabels([c])}>Print This Label</button>
        </div>
      </div>
    </div>
  </div>
}
function QuickView({c,branches=[],session,favorite=false,onToggleFavorite,onDetailedShare,onClose,refreshCase,notify,updateStatus,updateStage,updateStageDate,reorderStages,onAddDoc,deleteDocument,addStage,renameStage,deleteStage,onAppointment,onDeliver,onCustody,onPayment,onDeleted}){
  const [deletingCase,setDeletingCase]=useState(false);
  const [deleteReview,setDeleteReview]=useState(null);
  const [deleteChecking,setDeleteChecking]=useState(false);
  const [historyRows,setHistoryRows]=useState([]),[activityLoading,setActivityLoading]=useState(false),[edit,setEdit]=useState(false),[labelOpen,setLabelOpen]=useState(false),[editSaving,setEditSaving]=useState(false),[editError,setEditError]=useState(''),[form,setForm]=useState({...c}); const m=moneyParts(c);
  const activityKey=(c.documents||[]).flatMap(d=>d.document_stages||[]).map(st=>`${st.id}:${st.status}:${st.stage_order}:${st.updated_at||''}`).join('|');
  useEffect(()=>{let live=true;setActivityLoading(true);(async()=>{
    const safe=async(table)=>{const r=await supabase.from(table).select('*').eq('case_id',c.id).limit(250);return r.error?[]:(r.data||[])};
    const [history,payments,appointments,deliveries,custody]=await Promise.all([
      supabase.from('case_history').select('id,action,field_name,old_value,new_value,metadata,created_at,profiles!case_history_user_id_fkey(full_name)').eq('case_id',c.id).order('created_at',{ascending:false}).limit(250).then(r=>r.data||[]),
      safe('payments'),safe('appointments'),safe('deliveries'),safe('custody_movements')
    ]);
    const events=[
      ...history.map(h=>({...h,type:auditCategory(h),date:h.created_at,detail:h.old_value&&h.new_value?`${h.old_value} → ${h.new_value}`:h.new_value||'',actor:h.profiles?.full_name||''})),
      ...payments.map(x=>({id:`payment-${x.id}`,type:'payments',action:'Payment recorded',date:x.payment_date||x.paid_at||x.created_at,detail:`${fmtMoney(x.amount)}${x.payment_method?` · ${x.payment_method}`:''}`})),
      ...appointments.map(x=>({id:`appointment-${x.id}`,type:'appointments',action:`Appointment ${x.status||'scheduled'}`,date:x.appointment_date?`${String(x.appointment_date).slice(0,10)}T${x.appointment_time||'00:00:00'}`:x.created_at,detail:[x.authority,x.assigned_to].filter(Boolean).join(' · ')})),
      ...deliveries.map(x=>({id:`delivery-${x.id}`,type:'deliveries',action:`Customer delivery ${String(x.status||'recorded').toLowerCase()}`,date:x.delivered_at||x.created_at,detail:[x.delivery_no,x.receiver_name].filter(Boolean).join(' · ')})),
      ...custody.map(x=>({id:`custody-${x.id}`,type:'custody',action:'Custody movement confirmed',date:x.moved_at||x.created_at,detail:`${x.from_location||'Unassigned'} → ${x.to_location||'Unassigned'}`}))
    ].filter(x=>x.date).sort((a,b)=>new Date(b.date)-new Date(a.date));
    if(live){setHistoryRows(events);setActivityLoading(false)}
  })();return()=>{live=false}},[c.id,c.updated_at,activityKey]);
  useEffect(()=>setForm({...c}),[c.id,c.updated_at]);
  const contactNumber=String(c.mobile||'').replace(/\D/g,'');
  const callCustomer=()=>{if(!contactNumber)return notify?.('No mobile number is saved for this case.');window.location.href=`tel:${contactNumber}`};
  const whatsappCustomer=()=>{if(!contactNumber)return notify?.('No mobile number is saved for this case.');onDetailedShare?.({whatsapp:true})};
  const shareCase=()=>onDetailedShare?.({whatsapp:false});

  async function saveCase(e){
    e.preventDefault();
    if(editSaving)return;
    setEditSaving(true);
    setEditError('');

    try{
      const tracking=String(form.tracking_reference||'').trim();
      const customer=String(form.customer_name||'').trim();
      if(!tracking)throw new Error('Tracking Reference is required.');
      if(!customer)throw new Error('Customer name is required.');

      const total=Number(form.total_amount||0);
      const advance=Number(form.advance_paid||0);
      const second=Number(form.second_payment||0);
      const discount=Number(form.discount_return||0);

      if(!Number.isFinite(total)||!Number.isFinite(advance)||!Number.isFinite(second)||!Number.isFinite(discount)){
        throw new Error('Please check the financial amounts.');
      }

      const payload={
        tracking_reference:tracking,
        bill_no:String(form.bill_no||'').trim()||null,
        internal_invoice_no:String(form.internal_invoice_no||'').trim()||null,
        customer_name:customer,
        mobile:String(form.mobile||'').trim()||null,
        customer_email:String(form.customer_email||'').trim()||null,
        email_updates:Boolean(form.email_updates),
        whatsapp_opt_in:Boolean(form.whatsapp_opt_in),
        tracking_family:trackingFamily(tracking),
        account_name:String(form.account_name||'').trim()||null,
        account_contact:String(form.account_contact||'').trim()||null,
        account_mobile:String(form.account_mobile||'').trim()||null,
        intake_source:form.intake_source||'Branch',
        direct_to_delhi:Boolean(form.direct_to_delhi),
        direct_destination:String(form.direct_destination||'').trim()||null,
        current_milestone:String(form.current_milestone||'').trim()||null,
        current_milestone_date:form.current_milestone_date?String(form.current_milestone_date).slice(0,10):null,
        submission_date:form.submission_date?String(form.submission_date).slice(0,10):null,
        promise_date:form.promise_date?String(form.promise_date).slice(0,10):null,
        branch_id:form.branch_id||null,
        total_amount:total,
        advance_paid:advance,
        second_payment:second,
        discount_return:discount,
        balance_payment:Math.max(0,total-advance-second+discount),
        notes:String(form.notes||'').trim()||null,
        overall_status:form.overall_status||'Received',
        updated_by:session.user.id
      };

      // Request the updated row back. This prevents a silent success when
      // RLS/policies affect zero rows and also avoids writing trigger-managed
      // updated_at manually.
      const {data,error}=await supabase
        .from('cases')
        .update(payload)
        .eq('id',c.id)
        .select('id,tracking_reference,customer_name,overall_status,balance_payment')
        .single();

      if(error)throw error;
      if(!data?.id)throw new Error('The case was not updated. Please check your access permissions and try again.');

      // Record the edit in history, but do not fail the actual save if history
      // logging is temporarily unavailable.
      try{
        await supabase.from('case_history').insert({
          case_id:c.id,
          user_id:session.user.id,
          action:'Case edited',
          field_name:'case',
          old_value:null,
          new_value:`${data.tracking_reference} · ${data.customer_name}`,
          metadata:{source:'quick_view_edit'}
        });
      }catch{}

      await refreshCase(c.id);
      notify?.('Case changes saved successfully.');
      setEdit(false);
    }catch(err){
      const message=userError(err,{type:'tracking',trackingReference:String(form.tracking_reference||'').trim()});
      setEditError(message);
      notify?.(message);
    }finally{
      setEditSaving(false);
    }
  }

  async function queryDeleteDependency(table,select,caseId){
    const result=await supabase.from(table).select(select).eq('case_id',caseId);
    if(result.error){
      const raw=String(result.error.message||'');
      if(/does not exist|schema cache|Could not find|relation .* does not exist|column .* does not exist/i.test(raw))return [];
      throw result.error;
    }
    return result.data||[];
  }

  async function reviewCaseDeletion(){
    if(deleteChecking||deletingCase)return;
    setDeleteChecking(true);
    try{
      const blockers=[];
      const {data:docRows,error:docError}=await supabase.from('documents').select('id,document_name,holder_name,source_tracking_reference').eq('case_id',c.id);
      if(docError)throw docError;
      const docs=docRows||[];
      const documentIds=docs.map(x=>x.id).filter(Boolean);
      const docMap=Object.fromEntries(docs.map(x=>[x.id,x]));

      if(documentIds.length){
        const {data:items,error:itemError}=await supabase
          .from('courier_shipment_items')
          .select('id,document_id,required_attestation,receipt_status,courier_shipments!courier_shipment_items_shipment_id_fkey(id,shipment_no,status,destination)')
          .in('document_id',documentIds);
        if(itemError && !/does not exist|schema cache|Could not find|relation .* does not exist/i.test(String(itemError.message||'')))throw itemError;
        for(const item of items||[]){
          const d=docMap[item.document_id]||{};
          const sh=item.courier_shipments||{};
          blockers.push({
            type:'Courier Shipment',
            title:`Shipment ${sh.shipment_no||'linked shipment'}`,
            detail:`${d.document_name||'Document'}${d.holder_name?` · ${d.holder_name}`:''}${sh.destination?` · ${sh.destination}`:''}${sh.status?` · ${sh.status}`:''}`,
            action:'Open Courier Shipments → Edit this shipment → remove this document from the shipment list → Save. Then return and delete the case.'
          });
        }
      }

      const transferItems=await queryDeleteDependency('custody_transfer_items','id,transfer_id,document_id,receive_status,custody_transfers!custody_transfer_items_transfer_id_fkey(transfer_no,status,from_location,to_location)',c.id);
      for(const row of transferItems){
        const transfer=row.custody_transfers||{};
        blockers.push({
          type:'Custody Transfer',
          title:transfer.transfer_no||'Branch custody transfer',
          detail:[transfer.from_location&&`${transfer.from_location} → ${transfer.to_location||'destination'}`,transfer.status,row.receive_status].filter(Boolean).join(' · '),
          action:'Open Custody → Transfer History and resolve or remove this transfer item before deleting the case.'
        });
      }

      const appointments=await queryDeleteDependency('appointments','id,appointment_date,appointment_time,authority,status',c.id);
      for(const row of appointments){
        blockers.push({type:'Appointment',title:`${row.authority||'Appointment'}${row.appointment_date?` · ${fmtDate(row.appointment_date)}`:''}`,detail:row.status||'Scheduled',action:'Open Appointments and remove/delete this appointment before deleting the case.'});
      }

      const batchItems=await queryDeleteDependency('batch_report_items','id,batch_id,document_id,stage_id,batch_reports(id,report_name,batch_type,batch_date)',c.id);
      for(const row of batchItems){
        const br=row.batch_reports||{};
        blockers.push({type:'Batch Report',title:br.report_name||br.batch_type||'Batch report',detail:br.batch_date?fmtDate(br.batch_date):'Case is included in this batch',action:'Open Batch Reports and remove this case/document from that batch first.'});
      }

      const deliveries=await queryDeleteDependency('deliveries','id,delivery_no,status,delivered_at,receiver_name',c.id);
      for(const row of deliveries){
        blockers.push({type:'Delivery',title:row.delivery_no||'Delivery record',detail:`${row.status||'Delivery'}${row.receiver_name?` · ${row.receiver_name}`:''}`,action:'Open Deliveries and remove/void this delivery record first.'});
      }

      for(const [table,type,action] of [
        ['payments','Payment','Open Payments and delete/reverse the payment record first.'],
        ['custody_movements','Custody Movement','Resolve/remove the custody movement first so the chain of custody is not left orphaned.']
      ]){
        let rows=[];
        try{
          const r=await supabase.from(table).select('*').eq('case_id',c.id);
          if(r.error){
            const raw=String(r.error.message||'');
            if(!/does not exist|schema cache|Could not find|relation .* does not exist|column .* does not exist/i.test(raw))throw r.error;
          }else rows=r.data||[];
        }catch(err){
          const raw=String(err?.message||'');
          if(!/does not exist|schema cache|Could not find|relation .* does not exist|column .* does not exist/i.test(raw))throw err;
        }
        for(const row of rows){
          const title=type==='Payment'
            ? `Payment${row.amount!=null?` · QAR ${Number(row.amount||0).toFixed(2)}`:''}`
            : `Custody record${row.status?` · ${row.status}`:''}`;
          const detail=type==='Payment'
            ? [row.payment_method,row.payment_reference,row.payment_date||row.created_at].filter(Boolean).join(' · ')
            : [row.location,row.assigned_to,row.notes].filter(Boolean).join(' · ');
          blockers.push({type,title,detail:detail||'Linked operational record',action});
        }
      }

      setDeleteReview({blockers});
    }catch(err){
      notify?.(`Could not review case dependencies: ${err?.message||String(err)}`);
    }finally{
      setDeleteChecking(false);
    }
  }

  async function deleteCase(){
    if(deletingCase)return;
    if(!deleteReview || deleteReview.blockers?.length)return;
    setDeletingCase(true);
    try{
      const removeCase=()=>supabase.from('cases').delete().eq('id',c.id).select('id,tracking_reference').maybeSingle();
      let {data:deleted,error:deleteError}=await removeCase();
      const rawDelete=String(deleteError?.message||'');
      if(deleteError&&/foreign key|violates foreign key constraint/i.test(rawDelete)&&/documents|document.*case_id/i.test(rawDelete)){
        const {error:documentsError}=await supabase.from('documents').delete().eq('case_id',c.id);
        if(documentsError)throw documentsError;
        const retry=await removeCase();deleted=retry.data;deleteError=retry.error;
      }
      if(deleteError)throw deleteError;
      if(!deleted?.id)throw new Error('The case was not deleted. Your account may not have permission to delete this case.');

      setDeleteReview(null);
      onDeleted?.(c.id);
      notify(`Case ${c.tracking_reference} deleted successfully.`);
    }catch(err){
      const raw=String(err?.message||'Unable to delete case.');
      if(/foreign key|violates foreign key constraint/i.test(raw)){
        setDeleteReview(null);
        notify('Deletion was blocked by a linked record. Nothing was deleted. Open Delete Case again to review the latest dependency list.');
      }else notify(raw);
    }finally{
      setDeletingCase(false);
    }
  }

  const quickDocuments=c.documents||[];
  const quickStages=quickDocuments.flatMap(d=>d.document_stages||[]);
  const completedStages=quickStages.filter(s=>String(s.status||'').toLowerCase()==='completed').length;
  const activeStages=quickStages.filter(s=>['pending','processing','in progress'].includes(String(s.status||'').toLowerCase())).length;
  const workflowPercent=quickStages.length?Math.round((completedStages/quickStages.length)*100):0;
  const documentLocations=[...new Set(quickDocuments.map(d=>d.physical_location).filter(Boolean))];
  const currentLocation=documentLocations.length>1?'Mixed locations':documentLocations[0]||c.physical_location||c.branches?.name||'Unassigned';

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal quick-modal quick-modal-v323" onMouseDown={e=>e.stopPropagation()}>
      <button className="quick-corner-close" onClick={onClose} aria-label="Close quick view"><Icon name="close" size={15}/></button>
      <div className="quick-hero">
        <div>
          <div className="quick-context-label">Case workspace</div>
          <div className="quick-ref">#{c.tracking_reference}</div>
          <h2>{c.customer_name}</h2>
          <div className="quick-identity-chips">
            <span><Icon name="phone" size={13}/>{c.mobile||'No mobile'}</span>
            <span><Icon name="home" size={13}/>{c.branches?.name||'No branch'}</span>
            <span><Icon name="file" size={13}/>Bill {c.bill_no||'—'}</span>
            <span className="quick-location-chip"><Icon name="handover" size={13}/>Current: {currentLocation}</span>
            <select aria-label="Case status" className={`quick-status-select quick-inline-status ${slug(c.overall_status)}`} value={c.overall_status} onChange={e=>updateStatus(c,e.target.value)}>
              {CASE_STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="quick-function-bar quick-ops-dock">
        <div className="quick-dock-title"><span>Quick actions</span><small>Manage this case</small></div>
        <button onClick={onDeliver}><Icon name="package" size={16}/><span><strong>Delivery</strong><small>To customer</small></span></button>
        <button onClick={onCustody}><Icon name="handover" size={16}/><span><strong>Handover</strong><small>Internal custody</small></span></button>
        <button onClick={onPayment}><Icon name="wallet" size={16}/><span><strong>Payment</strong><small>Record collection</small></span></button>
        <button onClick={onAppointment}><Icon name="calendar" size={16}/><span><strong>Appointment</strong><small>Schedule work</small></span></button>
        <button onClick={onAddDoc}><Icon name="plus" size={17}/><span><strong>Add Document</strong><small>New workflow</small></span></button>
        <button onClick={()=>setLabelOpen(true)}><Icon name="print" size={16}/><span><strong>Print Label</strong><small>Envelope QR</small></span></button>
        <button onClick={()=>{setForm({...c});setEditError('');setEdit(true)}}><Icon name="edit" size={16}/><span><strong>Edit Case</strong><small>Update details</small></span></button>
        <div className="quick-contact-dock" aria-label="Customer and case shortcuts"><button type="button" onClick={callCustomer} title="Call customer" aria-label="Call customer"><Icon name="phone" size={17}/></button><button type="button" onClick={whatsappCustomer} title="WhatsApp" aria-label="WhatsApp"><b>W</b></button><button type="button" onClick={shareCase} title="Share case" aria-label="Share case"><Icon name="share" size={17}/></button><button type="button" className={favorite?'active':''} onClick={onToggleFavorite} title={favorite?'Remove favorite':'Add favorite'} aria-label={favorite?'Remove favorite':'Add favorite'}><Icon name="bookmark" size={17}/></button></div>
        <button className="danger" onClick={reviewCaseDeletion} disabled={deletingCase||deleteChecking}>{deleteChecking?'Checking…':deletingCase?'Deleting…':'Delete Case'}</button>
      </div>

      <div className="quick-stats">
        <div><span>Total</span><strong>{fmtMoney(c.total_amount)}</strong></div>
        <div><span>Paid</span><strong>{fmtMoney(m.paid)}</strong></div>
        <div><span>Balance</span><strong className={m.balance>0?'due':''}>{fmtMoney(m.balance)}</strong></div>
        <div><span>Documents</span><strong>{quickDocuments.length}</strong></div>
        <div><span>Active stages</span><strong>{activeStages}</strong></div>
        <div><span>Promise</span><strong>{fmtDate(c.promise_date)}</strong></div>
      </div>

      <div className="quick-body">
        <section>
          <div className="section-head">
            <div><h3>Documents & Attestation</h3><p>Each document is an independent workflow.</p></div>
            <div className="quick-section-tools">
              <div className="quick-progress" title={`${completedStages} of ${quickStages.length} stages completed`}>
                <span><b>{workflowPercent}%</b> complete</span>
                <i><em style={{width:`${workflowPercent}%`}}/></i>
              </div>
            </div>
          </div>
          <div className="doc-list quick-docs">
            {c.documents?.length
              ? c.documents.map(d=><DocRow key={d.id} c={c} d={d} updateStage={updateStage} updateStageDate={updateStageDate} reorderStages={reorderStages} addStage={addStage} renameStage={renameStage} deleteStage={deleteStage} compact onDelete={()=>deleteDocument(c,d)}/>)
              : <Empty text="No documents added"/>}
          </div>
        </section>

        <aside className="quick-side">
          <div className="quick-side-section">
            <div className="quick-side-heading"><span><Icon name="info" size={15}/></span><h3>Case details</h3></div>
            <dl>
              <dt>Submission</dt><dd>{fmtDate(c.submission_date)}</dd>
              <dt>Submitted branch</dt><dd>{c.branches?.name||'—'}</dd>
              <dt>Current location</dt><dd><span className={`quick-location-value ${documentLocations.length>1?'mixed':''}`}>{currentLocation}</span></dd>
              <dt>Created</dt><dd>{fmtDate(c.created_at)}</dd>
              <dt>Internal invoice</dt><dd>{c.internal_invoice_no||'—'}</dd>
              <dt>Milestone</dt><dd>{c.current_milestone||'—'}{c.current_milestone_date?` · ${fmtDate(c.current_milestone_date)}`:''}</dd><dt>Intake</dt><dd>{c.intake_source||'Branch'}{c.direct_to_delhi?' · DD':''}</dd><dt>Organization</dt><dd>{c.account_name||'—'}</dd><dt>Notes</dt><dd>{c.notes||'—'}</dd>
            </dl>
          </div>
          <div className="quick-side-section quick-activity-section">
            <div className="quick-side-heading"><span><Icon name="activity" size={15}/></span><div><h3>Complete activity</h3><small>{historyRows.length} chronological events</small></div></div>
            <div className="timeline activity-scroll">
              {activityLoading?<p className="muted small-text">Loading complete timeline…</p>:historyRows.length
                ? historyRows.map(h=><div className={`timeline-item ${h.type||'cases'}`} key={`${h.type||'case'}-${h.id}`}><i></i><div><strong>{h.action}</strong>{h.detail&&<span>{h.detail}</span>}<small>{new Date(h.date).toLocaleString('en-GB')}{h.actor?` · ${h.actor}`:''}</small></div></div>)
                : <p className="muted small-text">No activity recorded yet.</p>}
            </div>
          </div>
        </aside>
      </div>

      {edit&&<div className="quick-edit-layer" onMouseDown={()=>setEdit(false)}>
        <div className="quick-edit-panel" onMouseDown={e=>e.stopPropagation()}>
          <div className="quick-edit-head">
            <div><h3>Edit Case</h3><p>Update customer, dates, finance and overall case status.</p></div>
            <button type="button" className="icon-btn" onClick={()=>setEdit(false)}><Icon name="close" size={17}/></button>
          </div>
          <form className="quick-edit-form" onSubmit={saveCase}>
            <Field label="Tracking"><input required value={form.tracking_reference||''} onChange={e=>setForm({...form,tracking_reference:e.target.value})}/></Field>
            <Field label="Software Bill"><input value={form.bill_no||''} onChange={e=>setForm({...form,bill_no:e.target.value})}/></Field>
            <Field label="Customer"><input required value={form.customer_name||''} onChange={e=>setForm({...form,customer_name:e.target.value})}/></Field>
            <Field label="Mobile"><input value={form.mobile||''} onChange={e=>setForm({...form,mobile:e.target.value})}/></Field>
            <Field label="Customer email"><input type="email" value={form.customer_email||''} onChange={e=>setForm({...form,customer_email:e.target.value})}/></Field>
            <label className="wide check-line"><input type="checkbox" checked={Boolean(form.email_updates)} onChange={e=>setForm({...form,email_updates:e.target.checked})}/><span>Customer agrees to email updates</span></label>
            <label className="wide check-line"><input type="checkbox" checked={Boolean(form.whatsapp_opt_in)} onChange={e=>setForm({...form,whatsapp_opt_in:e.target.checked})}/><span>Customer opted in to WhatsApp updates</span></label>
            <Field label="Organization / B2B"><input value={form.account_name||''} onChange={e=>setForm({...form,account_name:e.target.value})}/></Field>
            <Field label="Account Contact"><input value={form.account_contact||''} onChange={e=>setForm({...form,account_contact:e.target.value})}/></Field>
            <Field label="Intake Source"><select value={form.intake_source||'Branch'} onChange={e=>setForm({...form,intake_source:e.target.value})}><option>Branch</option><option>Collection</option><option>External Office</option></select></Field>
            <Field label="Current Milestone"><input value={form.current_milestone||''} onChange={e=>setForm({...form,current_milestone:e.target.value})}/></Field>
            <Field label="Milestone Date"><input type="date" value={String(form.current_milestone_date||'').slice(0,10)} onChange={e=>setForm({...form,current_milestone_date:e.target.value})}/></Field>
            <label className="wide check-line"><input type="checkbox" checked={Boolean(form.direct_to_delhi)} onChange={e=>setForm({...form,direct_to_delhi:e.target.checked})}/><span>DD / Customer direct to Delhi</span></label>
            <Field label="Branch"><select value={form.branch_id||''} onChange={e=>setForm({...form,branch_id:e.target.value})}><option value="">No branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            <Field label="Overall Status"><select value={form.overall_status} onChange={e=>setForm({...form,overall_status:e.target.value})}>{CASE_STATUSES.map(x=><option key={x}>{x}</option>)}</select></Field>
            <Field label="Submission"><input type="date" value={String(form.submission_date||'').slice(0,10)} onChange={e=>setForm({...form,submission_date:e.target.value})}/></Field>
            <Field label="Promise"><input type="date" value={String(form.promise_date||'').slice(0,10)} onChange={e=>setForm({...form,promise_date:e.target.value})}/></Field>
            <Field label="Total"><input type="number" step=".01" value={form.total_amount||0} onChange={e=>setForm({...form,total_amount:e.target.value})}/></Field>
            <Field label="Advance"><input type="number" step=".01" value={form.advance_paid||0} onChange={e=>setForm({...form,advance_paid:e.target.value})}/></Field>
            <Field label="Second Payment"><input type="number" step=".01" value={form.second_payment||0} onChange={e=>setForm({...form,second_payment:e.target.value})}/></Field>
            <Field label="Discount / Return"><input type="number" step=".01" value={form.discount_return||0} onChange={e=>setForm({...form,discount_return:e.target.value})}/></Field>
            <label className="wide"><span>Notes</span><textarea rows="3" value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
            {editError&&<div className="quick-edit-save-error wide">{editError}</div>}
            <div className="quick-edit-actions wide">
              <button type="button" className="secondary" disabled={editSaving} onClick={()=>setEdit(false)}>Cancel</button>
              <button type="submit" className="primary" disabled={editSaving}>{editSaving?'Saving Changes…':'Save Changes'}</button>
            </div>
          </form>
        </div>
      </div>}
      {labelOpen&&<LabelPreviewModal c={c} onClose={()=>setLabelOpen(false)} notify={notify}/>}
      {deleteReview&&<div className="delete-review-backdrop" onMouseDown={()=>!deletingCase&&setDeleteReview(null)}>
        <div className="delete-review-modal" onMouseDown={e=>e.stopPropagation()}>
          <div className="delete-review-head">
            <div><span className="delete-review-kicker">DELETE SAFETY CHECK</span><h3>Case #{c.tracking_reference}</h3><p>{deleteReview.blockers?.length?'Deletion is blocked. Nothing has been deleted.':'No protected operational links were found.'}</p></div>
            <button className="secondary" onClick={()=>setDeleteReview(null)} disabled={deletingCase}>Close</button>
          </div>
          {deleteReview.blockers?.length?<>
            <div className="delete-review-warning"><strong>Cannot delete this case</strong><span>Resolve the records below first. The system will not automatically remove linked courier, appointment, batch, delivery, payment or custody records.</span></div>
            <div className="delete-blocker-list">{deleteReview.blockers.map((b,i)=><div className="delete-blocker" key={`${b.type}-${i}`}>
              <div className="delete-blocker-type">{b.type}</div>
              <strong>{b.title}</strong>
              {b.detail&&<span>{b.detail}</span>}
              <p><b>Required action:</b> {b.action}</p>
            </div>)}</div>
            <div className="delete-review-foot"><span>{deleteReview.blockers.length} linked record{deleteReview.blockers.length===1?'':'s'} must be resolved.</span><button className="primary" onClick={()=>setDeleteReview(null)}>OK, I’ll review them</button></div>
          </>:<>
            <div className="delete-safe-box"><strong>Safe to delete</strong><span>The case has no protected operational links. Its own documents and attestation stages will be deleted with it.</span></div>
            <div className="delete-review-foot"><button className="secondary" onClick={()=>setDeleteReview(null)} disabled={deletingCase}>Cancel</button><button className="danger" onClick={deleteCase} disabled={deletingCase}>{deletingCase?'Deleting…':'Permanently Delete Case'}</button></div>
          </>}
        </div>
      </div>}
    </div>
  </div>
}
