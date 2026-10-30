const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('components/AppShell.js','utf8').split('function AppointmentsView(')[1];
const load=source.split('\n').find(line=>line.startsWith('  async function load(){'));
(async()=>{
 const requests=[];let rows=['previous'],error='',busy=false,loaded=false;
 const query={select(){return this},order(){return this},range(){return new Promise((resolve,reject)=>requests.push({resolve,reject}))}};
 const c={loadSequence:{current:0},supabase:{from:()=>query},setScheduleLoading:v=>busy=v,setScheduleError:v=>error=v,setScheduleLoaded:v=>loaded=v,setRows:v=>rows=v,userError:e=>typeof e==='string'?e:e.message};vm.createContext(c);vm.runInContext(load,c);
 const older=c.load(),newer=c.load();requests[1].resolve({data:[{id:'new'}]});await newer;requests[0].resolve({data:[{id:'old'}]});await older;assert.equal(rows[0].id,'new');assert.equal(busy,false);assert.equal(loaded,true);
 const failed=c.load();requests[2].reject(Error('Network lost'));await failed;assert.equal(error,'Network lost');assert.equal(rows[0].id,'new');assert.equal(busy,false);
 const retry=c.load();requests[3].resolve({data:[]});await retry;assert.equal(rows.length,0);assert.equal(error,'');
 const cancelled=c.load();c.loadSequence.current++;requests[4].resolve({data:[{id:'unmounted'}]});await cancelled;assert.equal(rows.length,0);
 const invalid=c.load();requests[5].resolve({data:null});await invalid;assert.match(error,/could not be loaded/);assert.equal(busy,false);
 console.log('PASS: appointment refresh ignores old and unmounted responses, preserves the last schedule on failures, retries successfully and rejects unconfirmed empty results.');
})().catch(e=>{console.error(e);process.exitCode=1});
