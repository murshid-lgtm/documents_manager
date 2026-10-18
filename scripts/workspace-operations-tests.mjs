import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();let checks=0;const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function login(n){await db.exec('reset role');const now=Math.floor(Date.now()/1000);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(n),role:'authenticated',session_id:id(n+100),iat:now,exp:now+3600})]);await db.exec('set role authenticated')}
async function system(){await db.exec("reset role;select set_config('request.jwt.claims','{}',false)")}
async function denied(sql,params=[]){await assert.rejects(()=>db.query(sql,params));checks++}
try{
 await db.exec(`create role postgres superuser;set session authorization postgres;create role anon;create role authenticated;create role service_role bypassrls;alter default privileges in schema public grant execute on functions to anon,authenticated;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on all functions in schema auth to authenticated,service_role;`);
 await db.exec(fs.readFileSync(new URL('../supabase/V4_0_CLEAN_INSTALL.sql',import.meta.url),'utf8').replace('create extension if not exists pgcrypto;',''));

 await db.query("insert into organizations(id,name,slug) values($1,'A','a'),($2,'B','b')",[id(1),id(2)]);
 await db.query("insert into organization_settings(organization_id,company_name) values($1,'A'),($2,'B')",[id(1),id(2)]);
 await db.query("insert into branches(id,organization_id,name) values($1,$4,'Al Khor'),($2,$4,'Safari'),($3,$5,'Other')",[id(11),id(12),id(13),id(1),id(2)]);
 for(const n of [21,22,23,24,25]){await db.query('insert into auth.users(id,email) values($1,$2)',[id(n),`u${n}@example.test`]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[id(n+100),id(n)])}
 for(const [n,org,role,branch,modules,platform] of [[21,1,'admin',null,null,false],[22,1,'branch',11,null,false],[23,1,'branch',12,null,false],[24,2,'staff',null,null,false],[25,1,'staff',null,['crm'],false]])await db.query('update profiles set organization_id=$2,role=$3,branch_id=$4,staff_modules=$5,is_platform_super_admin=$6 where id=$1',[id(n),id(org),role,branch?id(branch):null,modules,platform]);

 await db.exec('alter table sales_documents add column if not exists document_date date');
 await db.exec(fs.readFileSync(new URL('../supabase/V5_12_WORK_QUEUES_COLLECTIONS.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../supabase/V5_13_CUSTOMER_CREDIT.sql',import.meta.url),'utf8'));
 await login(21);
 const items=JSON.stringify([{description:'Service',quantity:1,unit_price:100}]);
 const invoice=(await db.query("insert into sales_documents(organization_id,branch_id,customer_name,status,items,due_date) values($1,$2,'Alice','Issued',$3,current_date-40) returning *",[id(1),id(11),items])).rows[0];
 const other=(await db.query("insert into sales_documents(organization_id,branch_id,customer_name,status,items,due_date) values($1,$2,'Bob','Issued',$3,current_date-10) returning *",[id(1),id(12),items])).rows[0];
 await db.query("insert into service_jobs(organization_id,branch_id,title,customer_name,assigned_to,due_date) values($1,$2,'Job A','Alice',$3,current_date-1),($1,$4,'Job B','Bob',null,current_date+1)",[id(1),id(11),id(22),id(12)]);
 await login(22);
 let queue=(await db.query('select workspace_work_queue($1) data',[id(1)])).rows[0].data;
 assert.equal(queue.total,2);assert.equal(queue.summary.overdue,1);assert.equal(queue.summary.mine,1);checks+=3;
 assert.equal((await db.query("select workspace_work_queue($1,'unassigned') data",[id(1)])).rows[0].data.total,1);checks++;
 let collections=(await db.query('select workspace_collections($1) data',[id(1)])).rows[0].data;
 assert.equal(collections.total,1);assert.equal(collections.summary.outstanding,100);assert.equal(collections.rows[0].bucket,'31-60');checks+=3;
 assert.equal((await db.query('select workspace_collections($1) data',[id(2)])).rows[0].data.total,0);checks++;
 const follow=(await db.query("insert into collection_followups(organization_id,branch_id,document_id,outcome,notes,next_follow_up) values($1,$2,$3,'Contacted','Follow up',current_date) returning id",[id(1),id(11),invoice.id])).rows[0].id;
 await denied("insert into collection_followups(organization_id,branch_id,document_id,outcome) values($1,$2,$3,'Contacted')",[id(1),id(11),other.id]);
 await denied("update collection_followups set notes='changed' where id=$1",[follow]);
 await denied('delete from collection_followups where id=$1',[follow]);
 await denied("insert into collection_followups(organization_id,branch_id,document_id,outcome,created_by) values($1,$2,$3,'Contacted',$4)",[id(1),id(11),invoice.id,id(21)]);
 collections=(await db.query("select workspace_collections($1,'follow-up') data",[id(1)])).rows[0].data;
 assert.equal(collections.total,1);assert.equal(collections.rows[0].follow_up.notes,'Follow up');checks+=2;
 await login(23);assert.equal((await db.query('select count(*) n from collection_followups')).rows[0].n,0);checks++;
 await login(25);assert.equal((await db.query('select workspace_collections($1) data',[id(1)])).rows[0].data.total,0);checks++;
 await login(21);
 const customer=(await db.query("insert into crm_customers(organization_id,branch_id,name) values($1,$2,'Credit customer') returning id",[id(1),id(11)])).rows[0].id;
 await db.query("insert into customer_credit_policies(organization_id,customer_id,credit_limit) values($1,$2,50)",[id(1),customer]);
 await db.query("insert into sales_documents(organization_id,branch_id,customer_id,customer_name,status,items) values($1,$2,$3,'Credit customer','Issued',$4)",[id(1),id(11),customer,items]);
 await login(22);const credit=(await db.query('select customer_credit_snapshot($1,$2) data',[id(1),customer])).rows[0].data;assert.equal(credit.credit_limit,50);assert.equal(credit.balance,100);checks+=2;
 await denied('insert into customer_credit_policies(organization_id,customer_id,credit_limit) values($1,$2,500)',[id(1),customer]);
 assert.equal((await db.query('update customer_credit_policies set credit_limit=500 where customer_id=$1 returning *',[customer])).rows.length,0);checks++;
 await login(23);assert.equal((await db.query('select customer_credit_snapshot($1,$2) data',[id(1),customer])).rows[0].data,null);checks++;
 await system();await db.exec('set role anon');await denied('select workspace_collections($1)',[id(1)]);await denied('select workspace_work_queue($1)',[id(1)]);await denied('select * from collection_followups');
 console.log(`PASS: ${checks} operational queue and collection checks (aging, branch isolation, module restrictions, append-only follow-ups, anonymous denial).`);
}finally{await db.close()}
