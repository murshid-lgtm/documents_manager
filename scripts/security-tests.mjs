import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const db=new PGlite();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let checks=0;
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
  const grants=(await db.query("select has_function_privilege('anon','public.confirm_custody_receipt(uuid,jsonb,text)','execute') as receipt,has_function_privilege('anon','public.can_read_case(uuid)','execute') as case_read,has_function_privilege('authenticated','public.protect_profile_privileges()','execute') as trigger_access")).rows[0];
  assert.equal(grants.receipt,false);assert.equal(grants.case_read,false);assert.equal(grants.trigger_access,false);checks+=3;
  // Reapplying an upgrade must be safe.
  await db.exec(fs.readFileSync(new URL('../supabase/V4_0_20_SECURITY_HARDENING.sql',import.meta.url),'utf8'));
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
  await denied('update profiles set is_platform_super_admin=true where id=$1',[id(21)]);
  await login(25);assert.equal(await count('cases'),3);checks++;
  await system();await db.query('delete from auth.sessions where id=$1',[id(122)]);
  await login(22);assert.equal(await count('cases'),0);assert.equal(await count('profiles'),0);checks+=2;
  await denied('insert into cases(tracking_reference,customer_name,branch_id) values($1,$2,$3)',['bad','Revoked',id(11)]);
  await system();assert.equal((await db.query("select consume_api_rate_limit('test','hash',1,900) as allowed")).rows[0].allowed,true);assert.equal((await db.query("select consume_api_rate_limit('test','hash',1,900) as allowed")).rows[0].allowed,false);checks+=2;
  await login(21);await denied("select consume_api_rate_limit('test','hash',999,900)");
  console.log(`PASS: ${checks} security assertions; clean install and repeatable upgrade compile.`);
}finally{await db.close();}
