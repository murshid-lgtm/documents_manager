const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app/api/cases/route.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const selectSource=fs.readFileSync('lib/caseSelect.js','utf8').replace('export const','const');
async function run({failure=false,admin=false}={}){
 const calls=[],rows=[{id:'a'},{id:'b'}],docs=Array.from({length:260},(_,i)=>({id:String(i),case_id:i%2?'a':'b',document_stages:[{id:'s'+i}]}));
 const client={auth:{getUser:async()=>({data:{user:{id:'user'}}})},from(table){const state={table,filters:[]};calls.push(state);const q={select(v){state.select=v;return q},eq(k,v){state.filters.push([k,v]);return q},in(k,v){state.ids=v;return q},order(){return q},range(a,b){state.range=[a,b];return q},maybeSingle(){return Promise.resolve({data:{is_active:true,organization_id:'tenant',is_platform_super_admin:admin}})},then(resolve,reject){return Promise.resolve(table==='cases'?{data:rows}:failure?{error:{code:'57014'}}:{data:docs.slice(state.range[0],state.range[1]+1)}).then(resolve,reject)}};return q}};
 const context={createClient:()=>client,checkPortal:async()=>null,bearerToken:()=> 'token',hasLiveSession:async()=>true,apiJson:(body,status=200)=>({body,status}),apiError:()=>({status:500}),process:{env:{NEXT_PUBLIC_SUPABASE_URL:'url',NEXT_PUBLIC_SUPABASE_ANON_KEY:'key'}},URL};
 vm.createContext(context);vm.runInContext(selectSource+'\n'+source+'\nthis.get=GET',context);
 const result=await context.get(new Request('https://test/api/cases'));
 if(failure){assert.equal(result.status,500);return}
 assert.equal(result.body.cases.length,2);assert.equal(result.body.cases.reduce((n,c)=>n+c.documents.length,0),260);assert.equal(result.body.cases[0].documents[0].document_stages.length,1);
 const base=calls.find(c=>c.table==='cases');assert(!base.select.includes('documents!'));assert(base.select.includes('branches!'));
 const children=calls.filter(c=>c.table==='documents');assert.equal(children.length,2);assert(children[0].select.startsWith('case_id,id,'));assert(children[0].select.endsWith('updated_at)'));assert.deepEqual(children.map(c=>Array.from(c.range)),[[0,249],[250,499]]);
 if(!admin)for(const c of [base,...children])assert(c.filters.some(([k,v])=>k==='organization_id'&&v==='tenant'));
}
(async()=>{await run();await run({admin:true});await run({failure:true});console.log('Case loading: tenant filtering, complete child pagination, stages and failure handling passed.')})().catch(e=>{console.error(e);process.exit(1)});
