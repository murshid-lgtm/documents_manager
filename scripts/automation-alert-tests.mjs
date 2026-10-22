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
 await db.query("insert into cases(id,organization_id,branch_id,tracking_reference,customer_name,mobile,promise_date,overall_status) values($1,$2,$3,'ALERT-1','Test customer','70000011',current_date-2,'Under Process'),($4,$2,$5,'ALERT-2','Other branch','70000012',current_date-2,'Under Process')",[id(701),id(1),id(11),id(702),id(12)]);
 let scan=(await db.query('select run_workspace_alert_scan($1) data',[id(1)])).rows[0].data;assert.equal(scan.created,2);checks++;
 let result=(await db.query('select workspace_alert_list($1) data',[id(1)])).rows[0].data;assert.equal(result.counts.unread,2);checks++;
 const alert=result.rows.find(a=>a.reference==='ALERT-1').id;
 await db.query("select act_on_workspace_alert($1,'read')",[alert]);result=(await db.query('select workspace_alert_list($1) data',[id(1)])).rows[0].data;assert.equal(result.counts.unread,1);checks++;
 await db.query("select act_on_workspace_alert($1,'snooze')",[alert]);assert.equal((await db.query('select workspace_alert_list($1) data',[id(1)])).rows[0].data.counts.active,1);checks++;
 await db.query("select act_on_workspace_alert($1,'restore')",[alert]);assert.equal((await db.query('select workspace_alert_list($1) data',[id(1)])).rows[0].data.counts.active,2);checks++;
 scan=(await db.query('select run_workspace_alert_scan($1) data',[id(1)])).rows[0].data;assert.equal(scan.created,0);checks++;
 await login(22);assert.equal((await db.query('select workspace_alert_list($1) data',[id(1)])).rows[0].data.total,1);checks++;
 await denied('select run_workspace_alert_scan($1)',[id(1)]);await denied('select save_workspace_alert_rules($1,$2)',[id(1),'[]']);
 await login(24);assert.equal((await db.query('select workspace_alert_list($1) data',[id(1)])).rows[0].data.total,0);checks++;await denied("select act_on_workspace_alert($1,'read')",[alert]);
 await login(25);assert.equal((await db.query('select workspace_alert_list($1) data',[id(1)])).rows[0].data.total,0);checks++;
 await login(21);await db.query("update cases set overall_status='Delivered' where id=$1",[id(701)]);scan=(await db.query('select run_workspace_alert_scan($1) data',[id(1)])).rows[0].data;assert.equal(scan.resolved,1);checks++;
 await db.query("update cases set overall_status='Under Process' where id=$1",[id(701)]);scan=(await db.query('select run_workspace_alert_scan($1) data',[id(1)])).rows[0].data;assert.equal(scan.reopened,1);checks++;
 await db.query('select save_workspace_alert_rules($1,$2)',[id(1),JSON.stringify([{rule_key:'case_overdue',enabled:false,threshold:0,minimum_amount:0}])]);assert.equal((await db.query('select workspace_alert_list($1) data',[id(1)])).rows[0].data.counts.active,0);checks++;
 await system();await db.query("update cases set branch_id=$2 where id=$1",[id(701),id(12)]);await login(22);assert.equal((await db.query("select count(*)::int n from workspace_alerts where id=$1",[alert])).rows[0].n,0);checks++;await denied("select act_on_workspace_alert($1,'restore')",[alert]);
 await login(21);
 const customer=(await db.query('select quick_add_customer($1,$2) id',[JSON.stringify({organization_id:id(1),branch_id:id(11),name:'Reminder customer',mobile:'70000055'}),id(901)])).rows[0].id;
 await db.query("insert into cases(id,organization_id,branch_id,tracking_reference,customer_name,mobile,overall_status) values($1,$2,$3,'READY-1','Ready customer','70000022','Ready for Delivery')",[id(703),id(1),id(11)]);
 await db.query("insert into service_jobs(id,organization_id,branch_id,title,customer_name,due_date) values($1,$2,$3,'License renewal','Reminder customer',current_date-2)",[id(704),id(1),id(11)]);
 await db.query("insert into appointments(id,organization_id,case_id,appointment_date) values($1,$2,$3,current_date)",[id(705),id(1),id(703)]);
 await db.query("insert into customer_records(id,organization_id,customer_id,record_kind,name,expires_on,reminder_enabled) values($1,$2,$3,'Document','Commercial registration',current_date+5,true)",[id(706),id(1),customer]);
 await db.query("insert into sales_documents(id,organization_id,branch_id,customer_name,kind,status,items,document_date,due_date) values($1,$2,$3,'Reminder customer','Invoice','Issued',$4,current_date-20,current_date-15)",[id(707),id(1),id(11),JSON.stringify([{description:'Service',quantity:1,unit_price:100}])]);
 await system();await db.query("insert into whatsapp_conversations(id,organization_id,phone_id,peer,branch_id,last_message_at) values($1,$2,'123','97470000055',$3,now()-interval '1 hour')",[id(708),id(1),id(11)]);await login(21);
 await db.query('select run_workspace_alert_scan($1)',[id(1)]);
 result=(await db.query('select workspace_alert_list($1) data',[id(1)])).rows[0].data;
 for(const key of ['service_overdue','appointment_due','ready_delivery','unpaid_invoice','unassigned_chat','document_expiry']){assert(result.rows.some(a=>a.rule_key===key),'Missing rule '+key);checks++}
 await db.query('select save_workspace_alert_rules($1,$2)',[id(1),JSON.stringify([{rule_key:'unpaid_invoice',enabled:true,threshold:7,minimum_amount:101}])]);assert(!(await db.query('select workspace_alert_list($1) data',[id(1)])).rows[0].data.rows.some(a=>a.rule_key==='unpaid_invoice'));checks++;
 const outboxBefore=(await db.query('select count(*)::int n from communication_outbox')).rows[0].n;
 await db.query('select run_workspace_alert_scan($1)',[id(1)]);assert.equal((await db.query('select count(*)::int n from communication_outbox')).rows[0].n,outboxBefore);checks++;
 await db.exec('reset role;set role anon');await denied('select workspace_alert_list($1)',[id(1)]);await denied('select run_workspace_alert_scan($1)',[id(1)]);
 console.log('PASS: '+checks+' alert DB checks: scans, idempotency, resolve/reopen, personal actions, tenant/branch/module access, revoked source access and administrator rules.');
}finally{await db.close()}
