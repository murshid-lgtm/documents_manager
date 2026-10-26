const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('components/AppShell.js','utf8').split('function AppointmentsView(')[1].split('function batchReportPrintHtml')[0];
const functions=['save','moveAppointment','del','bulkCreate','applyBulk'].map(name=>source.split('\n').find(line=>line.startsWith(`  async function ${name}(`))).join('\n');
(async()=>{
 let writes=0,release,fail=false,open=true,busy=false,notices=[];
 const query={update(){writes++;return this},insert(){writes++;return this},delete(){writes++;return this},eq(){return this},in(){return this},select(){return this},single(){return this},then(resolve,reject){return new Promise((ok,bad)=>{release=()=>fail?bad(new Error('Network failed')):ok({data:{id:'a'},error:null})}).then(resolve,reject)}};
 const context={supabase:{from:()=>query},session:{user:{id:'staff'}},form:{id:'a',case_id:'case',appointment_date:'2026-10-27'},empty:{},actionLock:{current:false},setBusy:v=>busy=v,setOpen:v=>open=v,setForm:()=>{},notify:m=>notices.push(m),userError:e=>e.message,load:async()=>{},onActionClose:()=>{},setRows:()=>{},confirm:()=>true,setSelected:()=>{},bulkRefs:['case'],bulkForm:{appointment_date:'2026-10-27'},setBulkOpen:()=>{},setBulkRefs:()=>{},selected:new Set(['a']),setBulkEdit:()=>{}};
 vm.createContext(context);vm.runInContext(functions,context);
 for(const name of ['save','moveAppointment','del','bulkCreate','applyBulk']){
  writes=0;fail=true;open=true;notices=[];
  const args=name==='save'||name==='bulkCreate'?[{preventDefault(){}}]:name==='moveAppointment'?['a',{status:'Confirmed'}]:['a'];
  const pending=context[name](...args);await new Promise(r=>setImmediate(r));
  await context[name](...args);assert.equal(writes,1,`${name}: duplicate request blocked`);
  release();await pending;assert.equal(busy,false);assert.equal(context.actionLock.current,false);assert.ok(notices.includes('Network failed'));
  if(name==='save')assert.equal(open,true,'failed save keeps editor open');
  fail=false;const retry=context[name](...args);await new Promise(r=>setImmediate(r));release();await retry;
  assert.equal(writes,2,`${name}: retry permitted`);assert.equal(busy,false);
 }
 console.log('PASS: five appointment actions block duplicate writes, report network failures, unlock and permit retry; failed save preserves editor.');
})().catch(e=>{console.error(e);process.exit(1)});
