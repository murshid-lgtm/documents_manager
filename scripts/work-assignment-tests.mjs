import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();let checks=0;const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function login(n){await db.exec('reset role');const now=Math.floor(Date.now()/1000);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(n),role:'authenticated',session_id:id(n+100),iat:now,exp:now+3600})]);await db.exec('set role authenticated')}
async function system(){await db.exec("reset role;select set_config('request.jwt.claims','{}',false)")}
async function denied(sql,params=[]){await assert.rejects(()=>db.query(sql,params));checks++}
try{
 await db.exec(`create role postgres superuser;set session authorization postgres;create role anon;create role authenticated;create role service_role bypassrls;alter default privileges in schema public grant execute on functions to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on all functions in schema auth to authenticated,service_role;`);
 await db.exec(fs.readFileSync(new URL('../supabase/V4_0_CLEAN_INSTALL.sql',import.meta.url),'utf8').replace('create extension if not exists pgcrypto;',''));

 await db.query("insert into organizations(id,name,slug) values($1,'A','a'),($2,'B','b')",[id(1),id(2)]);
 await db.query("insert into organization_settings(organization_id,company_name) values($1,'A'),($2,'B')",[id(1),id(2)]);
 await db.query("insert into branches(id,organization_id,name) values($1,$4,'Al Khor'),($2,$4,'Safari'),($3,$5,'Other')",[id(11),id(12),id(13),id(1),id(2)]);
 for(const n of [21,22,23,24,25]){await db.query('insert into auth.users(id,email) values($1,$2)',[id(n),`u${n}@example.test`]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[id(n+100),id(n)])}
 for(const [n,org,role,branch,modules,platform] of [[21,1,'admin',null,null,false],[22,1,'branch',11,null,false],[23,1,'branch',12,null,false],[24,2,'staff',null,null,false],[25,1,'staff',11,['crm'],false]])await db.query('update profiles set organization_id=$2,role=$3,branch_id=$4,staff_modules=$5,is_platform_super_admin=$6 where id=$1',[id(n),id(org),role,branch?id(branch):null,modules,platform]);


 await login(21);

 const caseId=id(701),jobId=id(702),appointmentId=id(703);
 await db.query("insert into cases(id,organization_id,branch_id,tracking_reference,customer_name) values($1,$2,$3,'112233','TEST')",[caseId,id(1),id(11)]);
 await db.query("insert into service_jobs(id,organization_id,branch_id,title,customer_name,assigned_to) values($1,$2,$3,'Service','TEST','Legacy owner')",[jobId,id(1),id(11)]);
 await db.query("insert into appointments(id,organization_id,case_id,appointment_date) values($1,$2,$3,current_date)",[appointmentId,id(1),caseId]);
 const staff=async(type,record)=>(await db.query('select * from work_assignment_staff($1,$2,$3)',[id(1),type,record])).rows;
 assert.deepEqual((await staff('attestation',caseId)).map(p=>p.id).sort(),[id(21),id(22)]);checks++;
 const row=async(table,key)=>(await db.query('select * from '+table+' where id=$1',[key])).rows[0];
 const save=async(type,record,input,key)=>(await db.query('select save_work_assignment($1,$2,$3,$4,$5) data',[id(1),type,record,JSON.stringify(input),id(key)])).rows[0].data;
 let original=await row('service_jobs',jobId);
 let input={owner_action:'keep',due_date:'2026-11-01',expected_updated_at:original.updated_at};
 let result=await save('service',jobId,input,901);assert.equal(result.assigned_to,'Legacy owner');assert.equal(result.due_date,'2026-11-01');checks+=2;
 assert.deepEqual(await save('service',jobId,input,901),result);checks++;
 await assert.rejects(()=>save('service',jobId,{...input,due_date:'2026-11-02'},901),/request key/);checks++;
 await assert.rejects(()=>save('service',jobId,input,902),/changed/);checks++;
 input={owner_action:'set',assigned_profile_id:id(22),due_date:null,expected_updated_at:result.updated_at};
 result=await save('service',jobId,input,903);assert.equal(result.assigned_profile_id,id(22));assert.equal(result.due_date,null);checks+=2;
 for(const bad of [23,24,25]){await assert.rejects(()=>save('service',jobId,{...input,assigned_profile_id:id(bad),expected_updated_at:result.updated_at},910+bad),/eligible/);checks++}
 const history=(await db.query('select work_assignment_history($1,$2,$3) data',[id(1),'service',jobId])).rows[0].data;assert.equal(history.length,2);assert.equal(history[1].previous_owner,'Legacy owner');checks+=2;
 await db.query("update service_jobs set assigned_to='New legacy owner' where id=$1",[jobId]);assert.equal((await row('service_jobs',jobId)).assigned_profile_id,null);checks++;
 await denied('update service_jobs set assigned_profile_id=$1 where id=$2',[id(24),jobId]);
 await login(23);assert.equal((await staff('service',jobId)).length,0);checks++;await denied('select save_work_assignment($1,$2,$3,$4,$5)',[id(1),'service',jobId,JSON.stringify(input),id(950)]);
 await login(24);assert.equal((await staff('attestation',caseId)).length,0);checks++;
 await login(21);await denied('update appointments set duration_minutes=0 where id=$1',[appointmentId]);await db.query('update appointments set duration_minutes=90,appointment_time=null where id=$1',[appointmentId]);assert.equal((await row('appointments',appointmentId)).duration_minutes,90);checks++;
 original=await row('appointments',appointmentId);await assert.rejects(()=>save('appointment',appointmentId,{owner_action:'set',assigned_profile_id:id(22),due_date:null,expected_updated_at:original.updated_at},960),/date is required/);checks++;
 // Receiving custody grants operational access without moving the submission branch.
 await login(22);await db.query("insert into custody_transfers(id,transfer_no,from_branch_id,to_branch_id,to_location,requested_by) values($1,'ASSIGN-TRANSFER',$2,$3,'Safari',$4)",[id(980),id(11),id(12),id(22)]);
 await db.query('insert into custody_transfer_items(id,transfer_id,case_id) values($1,$2,$3)',[id(981),id(980),caseId]);
 await login(23);assert.equal((await staff('attestation',caseId)).length,0);checks++;
 await db.query('select confirm_custody_receipt($1,$2::jsonb,null)',[id(980),JSON.stringify([{id:id(981),status:'Verified'}])]);
 assert((await staff('attestation',caseId)).some(p=>p.id===id(23)));checks++;
 let queue=(await db.query('select workspace_work_queue($1) data',[id(1)])).rows[0].data;assert(queue.rows.some(r=>r.id===caseId));assert(queue.rows.some(r=>r.id===appointmentId));checks+=2;
 original=await row('cases',caseId);result=await save('attestation',caseId,{owner_action:'set',assigned_profile_id:id(23),due_date:'2026-11-05',expected_updated_at:original.updated_at},982);assert.equal(result.assigned_profile_id,id(23));assert.equal(result.branch_id,id(11));checks+=2;
 await system();await db.query("update cases set physical_location='Al Khor' where id=$1",[caseId]);await login(23);assert.equal((await staff('attestation',caseId)).length,0);checks++;
 await system();await db.exec('set role anon');await denied('select work_assignment_staff($1,$2,$3)',[id(1),'service',jobId]);await denied('select * from operations_private.work_assignment_commands');
 console.log(`PASS: ${checks} assignment checks: legacy preservation, eligibility, stale edits, replay, audit, tenant/branch denial, optional time and duration bounds. Local database only.`);
}catch(e){console.error(e.message);console.error(e.where||e.detail||e.stack);process.exitCode=1}finally{await db.close()}
