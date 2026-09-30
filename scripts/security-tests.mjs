import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {verifyWorkspaceSession} from '../lib/workspaceSession.js';
import {portalDecision,canManageAccount} from '../lib/portalPolicy.js';
import {validateStaffPassword,validateStaffModules} from '../lib/modules.js';
import {CASE_SELECT} from '../lib/caseSelect.js';

const db=new PGlite();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let checks=0;
assert.throws(()=>validateStaffPassword('short'),{code:'INVALID_PASSWORD'});assert.throws(()=>validateStaffPassword({}),{code:'INVALID_PASSWORD'});assert.throws(()=>validateStaffModules(['admin']),{code:'INVALID_MODULES'});assert.ok(CASE_SELECT.includes('branches!cases_branch_id_fkey('));assert.ok(CASE_SELECT.includes('documents!documents_case_id_fkey('));assert.ok(CASE_SELECT.includes('document_stages!document_stages_document_id_fkey('));checks+=6;

const fixtureSession={user:{id:'admin-account'}};
function workspaceClient({session=fixtureSession,valid=true,profile={id:'admin-account',role:'admin',is_active:true},profileError=null,userError=null}={}){
 return {auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session?.user},error:userError})},rpc:async()=>({data:valid}),from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:profile,error:profileError})})})})};
}
assert.equal((await verifyWorkspaceSession(workspaceClient())).profile.role,'admin');
assert.equal((await verifyWorkspaceSession(workspaceClient({session:null}))).status,'signed-out');
assert.equal((await verifyWorkspaceSession(workspaceClient({valid:false}))).status,'expired');
assert.equal((await verifyWorkspaceSession(workspaceClient({userError:{status:401}}))).status,'expired');
await assert.rejects(()=>verifyWorkspaceSession(workspaceClient({profileError:{message:'db details'}})),/account settings could not be loaded/);
await assert.rejects(()=>verifyWorkspaceSession(workspaceClient({userError:{status:503}})),/temporarily unavailable/);
assert.equal((await verifyWorkspaceSession(workspaceClient({profile:null}))).status,'blocked');
assert.equal((await verifyWorkspaceSession(workspaceClient({profile:{role:'unknown',is_active:true}}))).status,'blocked');
checks+=8;

const companyAdmin={role:'admin',is_active:true,organization_id:'kenza',is_platform_super_admin:false};
const owner={role:'admin',is_active:true,is_platform_super_admin:true};
const portalInput={platformOrigin:'https://tracker.mellodeals.com',companyDomain:'kenza.tracker.mellodeals.com',profile:companyAdmin};
assert.equal(portalDecision({...portalInput,host:'tracker.mellodeals.com'}).code,'WRONG_PORTAL');
assert.equal(portalDecision({...portalInput,host:'kenza.tracker.mellodeals.com'}).allowed,true);
assert.equal(portalDecision({...portalInput,host:'docuway.tracker.mellodeals.com'}).allowed,false);
assert.equal(portalDecision({...portalInput,host:'tracker.mellodeals.com',profile:owner}).allowed,true);
assert.equal(portalDecision({...portalInput,host:'kenza.tracker.mellodeals.com',profile:owner}).allowed,false);
assert.equal(portalDecision({...portalInput,host:'kenza.tracker.mellodeals.com.evil.test'}).allowed,false);
assert.equal(portalDecision({...portalInput,host:'kenza.tracker.mellodeals.com',companyDomain:''}).status,503);
assert.equal(canManageAccount(companyAdmin,{role:'staff',organization_id:'kenza'}),true);
assert.equal(canManageAccount(companyAdmin,{role:'admin',organization_id:'kenza'}),false);
assert.equal(canManageAccount(companyAdmin,{role:'staff',organization_id:'docuway'}),false);
assert.equal(canManageAccount(owner,{role:'admin',organization_id:'kenza'}),true);
assert.equal(canManageAccount(owner,{is_platform_super_admin:true}),false);
assert.equal((await verifyWorkspaceSession(workspaceClient(),async()=>({status:'wrong-portal'}))).status,'wrong-portal');
assert.equal(portalDecision({...portalInput,host:'tracker.mellodeals.com',companyDomain:'tracker.mellodeals.com'}).status,503);
checks+=14;


async function login(user){
  await db.exec('reset role');
  const now=Math.floor(Date.now()/1000);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(user),role:'authenticated',session_id:id(user+100),iat:now,exp:now+3600})]);
  await db.exec('set role authenticated');
}
async function system(){await db.exec("reset role;select set_config('request.jwt.claims','{}',false)");}
async function count(table){return Number((await db.query(`select count(*) as n from public.${table}`)).rows[0].n);}
async function denied(sql,params=[]){let rejected=false;try{await db.query(sql,params)}catch{rejected=true}assert.ok(rejected,'Expected rejection: '+sql);checks++;}
try{
  await db.exec(`create role postgres superuser;set session authorization postgres;
    create role anon;create role authenticated;create role service_role bypassrls;
    alter default privileges in schema public grant execute on functions to anon,authenticated;
    create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on all functions in schema auth to authenticated,service_role;`);
  await db.exec(fs.readFileSync(new URL('../supabase/V4_0_CLEAN_INSTALL.sql',import.meta.url),'utf8').replace('create extension if not exists pgcrypto;',''));
  await db.exec(fs.readFileSync(new URL('../supabase/V4_0_20_SECURITY_HARDENING.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/V4_0_21_WORKFLOW_REPAIR.sql',import.meta.url),'utf8'));
  const grants=(await db.query("select has_function_privilege('anon','public.confirm_custody_receipt(uuid,jsonb,text)','execute') as receipt,has_function_privilege('anon','public.can_read_case(uuid)','execute') as case_read,has_function_privilege('authenticated','public.protect_profile_privileges()','execute') as trigger_access")).rows[0];
  assert.equal(grants.receipt,false);assert.equal(grants.case_read,false);assert.equal(grants.trigger_access,false);checks+=3;
  // Reapplying an upgrade must be safe.
  await db.exec(fs.readFileSync(new URL('../supabase/V4_0_20_SECURITY_HARDENING.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/V4_0_21_WORKFLOW_REPAIR.sql',import.meta.url),'utf8'));
  await db.query("insert into organizations(id,name,slug) values($1,'Company A','a'),($2,'Company B','b')",[id(1),id(2)]);
  await db.query("insert into branches(id,organization_id,name) values($1,$4,'Al Khor'),($2,$4,'Safari'),($3,$5,'Other')",[id(11),id(12),id(13),id(1),id(2)]);
  for(const n of [21,22,23,24,25]){
    await db.query('insert into auth.users(id,email) values($1,$2)',[id(n),`u${n}@example.test`]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[id(n+100),id(n)]);
  }
  for(const [n,org,role,branch,platform] of [[21,1,'admin',null,false],[22,1,'branch',11,false],[23,1,'branch',12,false],[24,2,'staff',null,false],[25,null,'admin',null,true]]){
    await db.query('update profiles set organization_id=$2,role=$3,branch_id=$4,is_platform_super_admin=$5 where id=$1',[id(n),org?id(org):null,role,branch?id(branch):null,platform]);
  }
  await db.query("insert into cases(id,organization_id,branch_id,tracking_reference,customer_name,physical_location) values($1,$4,$6,'100','Alice','Al Khor'),($2,$4,$7,'101','Bob','Safari'),($3,$5,$8,'102','Carol','Other')",[id(31),id(32),id(33),id(1),id(2),id(11),id(12),id(13)]);
  await db.query("insert into documents(id,organization_id,case_id,document_name,physical_location) values($1,$5,$3,'Degree','Al Khor'),($2,$5,$4,'Certificate','Safari')",[id(41),id(42),id(31),id(32),id(1)]);
  await login(22);assert.equal(await count('cases'),1);checks++;
  await denied("insert into cases(tracking_reference,customer_name,branch_id) values('wrong-branch','Cross branch',$1) returning id",[id(12)]);
  const branchCreated=await db.query("insert into cases(tracking_reference,customer_name,branch_id) values('own-branch','Own branch',$1) returning id",[id(11)]);assert.equal(branchCreated.rows.length,1);checks++;
  await system();await db.query('delete from cases where id=$1',[branchCreated.rows[0].id]);await login(22);
  assert.equal((await db.query('update cases set notes=$1 where id=$2 returning id',['not allowed',id(32)])).rows.length,0);checks++;
  await denied('update profiles set is_platform_super_admin=true where id=$1',[id(22)]);
  await denied('insert into documents(organization_id,case_id,document_name) values($1,$2,$3)',[id(1),id(33),'Cross tenant']);
  await denied('insert into appointments(case_id,document_id,appointment_date) values($1,$2,current_date)',[id(31),id(42)]);
  await denied('update cases set branch_id=$1 where id=$2',[id(12),id(31)]);
  await db.query('insert into custody_transfers(id,transfer_no,from_branch_id,to_branch_id,to_location,requested_by) values($1,$2,$3,$4,$5,$6)',[id(51),'T1',id(11),id(12),'Safari',id(22)]);
  await db.query('insert into custody_transfer_items(id,transfer_id,case_id,document_id) values($1,$2,$3,$4)',[id(61),id(51),id(31),id(41)]);
  await login(23);assert.equal(await count('cases'),2);checks++;
  assert.equal(await count('custody_transfer_items'),1);checks++;
  assert.equal((await db.query('update cases set notes=$1 where id=$2 returning id',['pending receive',id(31)])).rows.length,0);checks++;
  await denied("update custody_transfers set status='Received' where id=$1",[id(51)]);
  await denied('select confirm_custody_receipt($1,$2::jsonb,null)',[id(51),JSON.stringify([{id:id(61),status:'Verified'},{id:id(61),status:'Verified'}])]);
  await login(22);await denied('select confirm_custody_receipt($1,$2::jsonb,null)',[id(51),JSON.stringify([{id:id(61),status:'Verified'}])]);
  await login(23);await db.query('select confirm_custody_receipt($1,$2::jsonb,null)',[id(51),JSON.stringify([{id:id(61),status:'Verified'}])]);
  const received=(await db.query('select branch_id,physical_location from cases where id=$1',[id(31)])).rows[0];
  assert.equal(received.branch_id,id(11));assert.equal(received.physical_location,'Safari');assert.equal(await count('custody_movements'),1);assert.equal(await count('case_history'),1);checks+=4;
  await denied('select confirm_custody_receipt($1,$2::jsonb,null)',[id(51),JSON.stringify([{id:id(61),status:'Verified'}])]);
  await login(24);assert.equal(await count('cases'),1);assert.equal(await count('custody_transfers'),0);checks+=2;
  await login(21);assert.equal(await count('cases'),2);checks++;
  const created=await db.query("insert into cases(tracking_reference,customer_name,branch_id) values('new-admin-case','New customer',$1) returning id",[id(11)]);assert.equal(created.rows.length,1);checks++;
  await db.query('delete from cases where id=$1',[created.rows[0].id]);
  await denied('update profiles set is_platform_super_admin=true where id=$1',[id(21)]);
  await login(25);assert.equal(await count('cases'),3);checks++;
  await system();await db.query('update profiles set staff_modules=$1 where id=$2',[['cases'],id(23)]);
  await login(23);assert.equal((await db.query("select can_use_module('cases') as cases,can_use_module('custody') as custody")).rows[0].custody,false);checks++;
  assert.equal(await count('custody_transfers'),0);checks++;
  await denied('select confirm_custody_receipt($1,$2::jsonb,null)',[id(51),JSON.stringify([{id:id(61),status:'Verified'}])]);
  await denied('update profiles set staff_modules=$1 where id=$2',[['custody'],id(23)]);
  await system();await db.query('update profiles set staff_modules=$1 where id=$2',[[],id(23)]);
  await login(23);assert.equal(await count('cases'),0);checks++;
  await system();await db.query('update profiles set staff_modules=null where id=$1',[id(23)]);

  await system();await db.query('delete from auth.sessions where id=$1',[id(122)]);
  await login(22);assert.equal(await count('cases'),0);assert.equal(await count('profiles'),0);checks+=2;
  await denied('insert into cases(tracking_reference,customer_name,branch_id) values($1,$2,$3)',['bad','Revoked',id(11)]);
  await system();assert.equal((await db.query("select consume_api_rate_limit('test','hash',1,900) as allowed")).rows[0].allowed,true);assert.equal((await db.query("select consume_api_rate_limit('test','hash',1,900) as allowed")).rows[0].allowed,false);checks+=2;
  await login(21);await denied("select consume_api_rate_limit('test','hash',999,900)");
  console.log(`PASS: ${checks} security assertions; clean install and repeatable upgrade compile.`);
}finally{await db.close();}
