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
 await db.exec(fs.readFileSync(new URL('../supabase/V5_0_BUSINESS_PLATFORM.sql',import.meta.url),'utf8'));
 await db.query("insert into organizations(id,name,slug) values($1,'A','a'),($2,'B','b')",[id(1),id(2)]);
 await db.query("insert into organization_settings(organization_id,company_name) values($1,'A'),($2,'B')",[id(1),id(2)]);
 await db.query("insert into branches(id,organization_id,name) values($1,$4,'Al Khor'),($2,$4,'Safari'),($3,$5,'Other')",[id(11),id(12),id(13),id(1),id(2)]);
 for(const n of [21,22,23,24,25]){await db.query('insert into auth.users(id,email) values($1,$2)',[id(n),`u${n}@example.test`]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[id(n+100),id(n)])}
 for(const [n,org,role,branch,modules,platform] of [[21,1,'admin',null,null,false],[22,1,'branch',11,null,false],[23,1,'branch',12,null,false],[24,2,'staff',null,null,false],[25,1,'staff',null,['crm'],false]])await db.query('update profiles set organization_id=$2,role=$3,branch_id=$4,staff_modules=$5,is_platform_super_admin=$6 where id=$1',[id(n),id(org),role,branch?id(branch):null,modules,platform]);
 await login(21);
 const c=(await db.query("insert into crm_customers(organization_id,branch_id,name,email) values($1,$2,'Alice','a@example.test') returning id",[id(1),id(11)])).rows[0].id;checks++;
 const c2=(await db.query("insert into crm_customers(organization_id,branch_id,name) values($1,$2,'Bob') returning id",[id(1),id(12)])).rows[0].id;
 await login(22);assert.equal((await db.query('select count(*) n from crm_customers')).rows[0].n,1);checks++;
 await denied("insert into crm_leads(organization_id,branch_id,customer_id,title) values($1,$2,$3,'wrong')",[id(1),id(11),c2]);
 await denied("insert into crm_customers(organization_id,branch_id,name) values($1,$2,'wrong branch')",[id(1),id(12)]);
 const items=JSON.stringify([{description:'Business setup',quantity:2,unit_price:100}]);
 const invoice=(await db.query("insert into sales_documents(organization_id,branch_id,customer_id,customer_name,status,items,discount,tax_percent,paid_total,total) values($1,$2,$3,'Alice','Issued',$4,20,10,999,1) returning *",[id(1),id(11),c,items])).rows[0];assert.equal(Number(invoice.total),198);assert.equal(Number(invoice.paid_total),0);checks+=2;
 await denied("insert into sales_payments(organization_id,document_id,amount) values($1,$2,199)",[id(1),invoice.id]);
 const payment=(await db.query("insert into sales_payments(organization_id,branch_id,document_id,amount) values($1,$2,$3,100) returning *",[id(1),id(12),invoice.id])).rows[0];assert.equal(payment.branch_id,id(11));checks++;
 const paid=(await db.query('select paid_total from sales_documents where id=$1',[invoice.id])).rows[0];assert.equal(Number(paid.paid_total),100);checks++;
 await denied('update sales_documents set items=$1 where id=$2',[JSON.stringify([{description:'Changed',quantity:1,unit_price:50}]),invoice.id]);
 await denied("select void_business_payment($1,'Correction')",[payment.id]);
 await denied('update sales_payments set amount=1 where id=$1',[payment.id]);
 await denied('delete from sales_payments where id=$1',[payment.id]);
 const quote=(await db.query("insert into sales_documents(organization_id,branch_id,customer_name,kind,status,items) values($1,$2,'Alice','Quotation','Issued',$3) returning id",[id(1),id(11),items])).rows[0].id;
 await denied('insert into sales_payments(organization_id,document_id,amount) values($1,$2,10)',[id(1),quote]);
 const converted=(await db.query('select convert_business_quote($1) id',[quote])).rows[0].id;assert.equal((await db.query('select convert_business_quote($1) id',[quote])).rows[0].id,converted);checks++;
 await login(23);assert.equal((await db.query('select count(*) n from sales_documents')).rows[0].n,0);checks++;
 await denied('insert into sales_payments(organization_id,document_id,amount) values($1,$2,10)',[id(1),invoice.id]);
 await login(24);assert.equal((await db.query('select count(*) n from crm_customers')).rows[0].n,0);checks++;
 await denied("insert into service_jobs(organization_id,branch_id,customer_id,title,customer_name) values($1,$2,$3,'cross','wrong')",[id(2),id(13),c]);
 await login(25);assert.equal((await db.query("select can_use_module('case_data') ok")).rows[0].ok,false);checks++;assert.equal((await db.query('select count(*) n from sales_documents')).rows[0].n,0);checks++;
 await denied("insert into service_jobs(organization_id,branch_id,title,customer_name) values($1,$2,'no access','Alice')",[id(1),id(11)]);
 await denied("insert into platform_subscriptions(organization_id,plan_name) values($1,'Escalation')",[id(1)]);
 await login(21);await db.query('select void_business_payment($1,$2)',[payment.id,'Duplicate payment correction']);assert.equal(Number((await db.query('select paid_total from sales_documents where id=$1',[invoice.id])).rows[0].paid_total),0);checks++;
 await denied("insert into business_events(organization_id,module,resource_id,action,summary) values($1,'sales',$2,'INSERT','Forged')",[id(1),invoice.id]);
 assert.ok((await db.query('select count(*) n from business_events where resource_id=$1',[invoice.id])).rows[0].n>=3);checks++;
 await system();await db.query('insert into platform_subscriptions(organization_id,seat_limit,branch_limit,allowed_modules) values($1,4,2,$2)',[id(1),JSON.stringify(['crm','services'])]);
 await login(21);assert.equal((await db.query('select count(*) n from sales_documents')).rows[0].n,0);checks++;
 await denied("insert into branches(organization_id,name) values($1,'Overflow')",[id(1)]);
 await db.exec('reset role;set role anon');await denied('select * from crm_customers');await denied('select convert_business_quote($1)',[quote]);
 console.log(`PASS: ${checks} business assertions; tenant/branch/module isolation, authoritative totals, payment corrections, plan limits and idempotent quotation conversion.`);
}finally{await db.close()}
