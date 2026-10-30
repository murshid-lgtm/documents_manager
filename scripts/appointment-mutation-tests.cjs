const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('components/AppShell.js','utf8').split('function AppointmentsView(')[1].split('function batchReportPrintHtml')[0];
const functions=['save','moveAppointment','del','bulkCreate','applyBulk'].map(name=>source.split('\n').find(line=>line.startsWith(`  async function ${name}(`))).join('\n');
(async()=>{
 let writes=0,release,fail=false,open=true,busy=false,notices=[],bulkError='',bulkOpen=true,reply={id:'a'},sentIds=[],loads=0;
 const query={update(){writes++;return this},insert(){writes++;return this},delete(){writes++;return this},eq(){return this},in(column,ids){sentIds=[...ids];return this},select(){return this},is(){return this},maybeSingle(){return this},single(){return this},then(resolve,reject){return new Promise((ok,bad)=>{release=()=>fail?bad(new Error('Network failed')):ok({data:reply,error:null})}).then(resolve,reject)}};
 const context={creationRequest:{current:null},bulkCreationRequest:{current:null},createAppointmentsOnce:async(client,ref,rows)=>{const r=await client.from('appointments').insert(rows);if(r.error)throw r.error},supabase:{from:()=>query},session:{user:{id:'staff'}},form:{id:'a',case_id:'case',appointment_date:'2026-10-27'},empty:{},rows:[{id:'a',updated_at:'2026-10-27T00:00:00Z'}],setSaveError:()=>{},actionLock:{current:false},setBusy:v=>busy=v,setOpen:v=>open=v,setForm:()=>{},notify:m=>notices.push(m),userError:e=>e.message,load:async()=>{loads++},onActionClose:()=>{},setRows:()=>{},confirm:()=>true,setSelected:value=>context.selected=value,bulkRefs:['case'],bulkForm:{appointment_date:'2026-10-27'},setBulkOpen:()=>{},setBulkRefs:()=>{},selected:new Set(['a']),setBulkError:value=>bulkError=value,setBulkEdit:value=>bulkOpen=value};
 vm.createContext(context);vm.runInContext(functions,context);
 for(const name of ['save','moveAppointment','del','bulkCreate','applyBulk']){
  writes=0;fail=true;open=true;notices=[];context.selected=new Set(['a']);reply=name==='applyBulk'?[{id:'a'}]:{id:'a'};
  const args=name==='save'||name==='bulkCreate'?[{preventDefault(){}}]:name==='moveAppointment'?['a',{status:'Confirmed'}]:['a'];
  const pending=context[name](...args);await new Promise(r=>setImmediate(r));
  await context[name](...args);assert.equal(writes,1,`${name}: duplicate request blocked`);
  release();await pending;assert.equal(busy,false);assert.equal(context.actionLock.current,false);assert.ok(notices.includes('Network failed'));
  if(name==='save')assert.equal(open,true,'failed save keeps editor open');
  fail=false;const retry=context[name](...args);await new Promise(r=>setImmediate(r));release();await retry;
  assert.equal(writes,2,`${name}: retry permitted`);assert.equal(busy,false);
 }
 // PostgREST can return fewer rows when records disappear or RLS access changes.
 async function bulkResult(data,ids=['a','b']){context.selected=new Set(ids);context.bulkForm={status:'Confirmed'};reply=data;fail=false;bulkOpen=true;notices=[];const pending=context.applyBulk();await new Promise(r=>setImmediate(r));release();await pending;}
 await bulkResult([{id:'a'}]);assert.deepEqual([...context.selected],['b']);assert.equal(bulkOpen,true);assert.match(bulkError,/1 of 2 appointments updated/);assert.equal(notices.length,1);assert.equal(notices[0],bulkError,'partial result suppresses generic success notification');
 reply=[{id:'b'}];const retry=context.applyBulk();await new Promise(r=>setImmediate(r));release();await retry;assert.deepEqual(sentIds,['b'],'retry excludes already saved appointments');assert.equal(bulkOpen,false);assert.equal(context.selected.size,0);assert.equal(bulkError,'');
 await bulkResult([]);assert.equal(context.selected.size,2);assert.match(bulkError,/0 of 2/);assert.equal(bulkOpen,true);
 await bulkResult(null);assert.equal(context.selected.size,2);assert.match(bulkError,/could not be confirmed/);assert.equal(bulkOpen,true);
 const before=writes;context.bulkForm={};await context.applyBulk();assert.equal(writes,before,'no-op does not write timestamps');assert.match(bulkError,/Choose at least one/);assert.equal(busy,false);
 context.bulkForm={duration_minutes:'1441'};await context.applyBulk();assert.equal(writes,before);assert.match(bulkError,/between 1 and 1440/);
 assert.ok(loads>=2);assert.equal(context.actionLock.current,false);
 context.selected=new Set(['a']);reply=null;fail=false;open=true;notices=[];let staleMessage='';context.setSaveError=value=>staleMessage=value;
 const staleSave=context.save({preventDefault(){}});await new Promise(r=>setImmediate(r));release();await staleSave;assert.equal(open,true);assert.match(staleMessage,/Your edits are still here/);assert(!notices.includes('Appointment updated.'));
 notices=[];const staleMove=context.moveAppointment('a',{status:'Confirmed'});await new Promise(r=>setImmediate(r));release();await staleMove;assert(notices.some(m=>m.includes('latest schedule')));assert.equal(busy,false);
 console.log('PASS: stale appointment saves retain the editor and stale moves reload the schedule without claiming success.');
 console.log('PASS: bulk updates verify returned records, retain unsuccessful selections, retry only remaining records, reject empty changes and recover from invalid or missing results.');
 console.log('PASS: five appointment actions block duplicate writes, report network failures, unlock and permit retry; failed save preserves editor.');
})().catch(e=>{console.error(e);process.exit(1)});
