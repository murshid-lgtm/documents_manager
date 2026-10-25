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

 const customer=(await db.query('select quick_add_customer($1,$2) id',[JSON.stringify({organization_id:id(1),branch_id:id(11),name:'Delivery test customer',mobile:'70000011'}),id(601)])).rows[0].id;
 const makeCase=async(n,total=100)=>{await db.query("insert into cases(id,organization_id,branch_id,customer_id,tracking_reference,customer_name,mobile,submission_date,total_amount,balance_payment,overall_status) values($1,$2,$3,$4,$5,'Delivery customer','70000011','2026-10-25',$6,$6,'Ready for Delivery')",[id(n),id(1),id(11),customer,'DEL-'+n,total]);for(let d=1;d<=2;d++)await db.query('insert into documents(id,organization_id,case_id,document_name,quantity) values($1,$2,$3,$4,$5)',[id(n*10+d),id(1),id(n),'Certificate '+d,d]);};
 for(let n=701;n<=709;n++)await makeCase(n);
 const input=(n,docs=[1,2],amount=0)=>({selected_docs:docs.map(d=>id(n*10+d)),receiver_name:'Receiver',payment_collected:amount,payment_method:'Cash'});
 const confirm=async(n,p,key)=> (await db.query('select confirm_customer_delivery($1,$2,$3) data',[id(n),JSON.stringify(p),id(key)])).rows[0].data;
 const fail=async(n,p,key,pattern)=>{await assert.rejects(()=>confirm(n,p,key),pattern);checks++};
 let partial=await confirm(701,input(701,[1],20),901);assert.equal(partial.status,'Partial');assert.equal(partial.items[0].name,'Certificate 1');assert.equal(partial.items[0].qty,1);assert(partial.payment_id);checks+=4;
 let c=(await db.query('select * from cases where id=$1',[id(701)])).rows[0];assert.equal(c.overall_status,'Ready for Delivery');assert.equal(Number(c.balance_payment),80);assert.equal(Number(c.second_payment),20);checks+=3;
 const replay=await confirm(701,input(701,[1],20),901);assert.equal(replay.id,partial.id);assert.equal(Number((await db.query('select sum(amount) amount from payments where case_id=$1',[id(701)])).rows[0].amount),20);checks+=2;
 await fail(701,input(701,[1],21),901,/request key/);await fail(701,input(701,[1],20),902,/already delivered/);await fail(701,input(701,[2],81),903,/exceeds/);
 let full=await confirm(701,input(701,[2],80),904);assert.equal(full.status,'Delivered');c=(await db.query('select * from cases where id=$1',[id(701)])).rows[0];assert.equal(Number(c.balance_payment),0);assert.equal(Number(c.second_payment),100);assert.equal(c.overall_status,'Delivered');checks+=4;
 assert.equal((await confirm(701,input(701,[2],80),904)).id,full.id);checks++;await fail(701,input(701),905,/no longer ready/);
 await fail(702,input(702,[1,1]),906,/once/);await fail(702,input(703),907,/belong/);await fail(702,input(702,[]),908,/once/);await fail(702,input(702,[1],-1),909,/valid amount/);await fail(702,input(702,[1],1.001),910,/decimal/);await fail(702,{...input(702),receiver_name:' '},911,/receiver/);
 for(const value of ['NaN','Infinity','-Infinity'])await fail(702,{...input(702),payment_collected:value},912,/valid amount/);
 // Inject a failure after receipt insertion, proving the whole command rolls back.
 await system();await db.exec("create function public.delivery_test_failure() returns trigger language plpgsql as $$begin if new.notes='FAIL_AFTER_PAYMENT' then raise exception 'Injected delivery failure';end if;return new;end$$;create trigger delivery_test_failure before insert on public.deliveries for each row execute function public.delivery_test_failure();");
 await login(21);await fail(702,{...input(702,[1],10),notes:'FAIL_AFTER_PAYMENT'},913,/Injected/);
 assert.equal((await db.query('select count(*)::int n from payments where case_id=$1',[id(702)])).rows[0].n,0);assert.equal(Number((await db.query('select balance_payment from cases where id=$1',[id(702)])).rows[0].balance_payment),100);checks+=2;
 await system();await db.exec('drop trigger delivery_test_failure on public.deliveries;drop function public.delivery_test_failure();');
 // Delivery-only staff can confirm a handover but cannot collect money or edit a case.
 await db.query("update profiles set staff_modules=array['deliveries'] where id=$1",[id(25)]);await login(25);
 await fail(703,input(703,[1],10),914,/Payment access/);assert.equal((await db.query("update cases set customer_name='unauthorized' where id=$1 returning id",[id(703)])).rows.length,0);checks++;
 assert.equal((await confirm(703,input(703),915)).status,'Delivered');checks++;
 await login(24);await fail(704,input(704),916,/access denied/);await login(23);await fail(704,input(704),917,/access denied/);
 await system();await db.query("update profiles set staff_modules=array['crm'] where id=$1",[id(25)]);await login(25);await fail(704,input(704),918,/access denied/);
 await system();await db.exec('set role anon');await fail(704,input(704),919,/permission denied/);

 await system();await db.query('update auth.sessions set not_after=now()-interval \'1 minute\' where id=$1',[id(121)]);await login(21);await fail(704,input(704),920,/access denied/);await system();await db.query('update auth.sessions set not_after=null where id=$1',[id(121)]);
 // A cancelled slip does not hide undelivered documents.
 await login(21);await db.query("insert into deliveries(organization_id,case_id,status,items) values($1,$2,'Cancelled',$3)",[id(1),id(704),JSON.stringify([{id:id(7041)}])]);assert.equal((await confirm(704,input(704),921)).status,'Delivered');checks++;
 // A final case-update failure must also undo the slip and payment.
 await system();await db.exec("create function public.case_test_failure() returns trigger language plpgsql as $$begin if new.id='00000000-0000-4000-8000-000000000707' and new.overall_status='Delivered' then raise exception 'Injected case update failure';end if;return new;end$$;create trigger case_test_failure before update on public.cases for each row execute function public.case_test_failure();");await login(21);await fail(707,input(707,[1,2],10),925,/Injected case update/);
 assert.equal((await db.query('select count(*)::int n from deliveries where case_id=$1',[id(707)])).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from payments where case_id=$1',[id(707)])).rows[0].n,0);assert.equal(Number((await db.query('select balance_payment from cases where id=$1',[id(707)])).rows[0].balance_payment),100);checks+=3;
 await system();await db.exec('drop trigger case_test_failure on public.cases;drop function public.case_test_failure();');await login(21);
 // Connected attestation receipts synchronize invoice totals and post once.
 await db.query('select connect_attestation_financials($1,false)',[id(1)]);
 let linked=(await db.query('select invoice_id from cases where id=$1',[id(705)])).rows[0].invoice_id;assert(linked);checks++;
 let paid=await confirm(705,input(705,[1],25),922);assert(paid.payment_id);checks++;
 let bill=(await db.query('select * from sales_documents where id=$1',[linked])).rows[0];assert.equal(Number(bill.paid_total),25);c=(await db.query('select * from cases where id=$1',[id(705)])).rows[0];assert.equal(Number(c.balance_payment),75);assert.equal(Number(c.second_payment),25);checks+=3;
 assert.equal((await db.query('select count(*)::int n from sales_payments where id=$1',[paid.payment_id])).rows[0].n,1);assert.equal((await db.query("select count(*)::int n from finance_journals where source='Receipt' and source_id=$1",[paid.payment_id])).rows[0].n,1);checks+=2;
 await confirm(705,input(705,[1],25),922);assert.equal(Number((await db.query('select paid_total from sales_documents where id=$1',[linked])).rows[0].paid_total),25);checks++;
 // Failure in downstream receipt processing also rolls back the delivery.
 await system();await db.exec("create function public.receipt_test_failure() returns trigger language plpgsql as $$begin raise exception 'Injected receipt failure';end$$;create trigger receipt_test_failure after insert on public.sales_payments for each row execute function public.receipt_test_failure();");await login(21);await fail(706,input(706,[1],10),923,/Injected receipt/);assert.equal((await db.query('select count(*)::int n from deliveries where case_id=$1',[id(706)])).rows[0].n,0);checks++;
 await system();await db.exec('drop trigger receipt_test_failure on public.sales_payments;drop function public.receipt_test_failure();');await db.query("update profiles set staff_modules=array['deliveries','payments'] where id=$1",[id(25)]);await login(25);await fail(706,input(706,[1],10),924,/Payment access/);
 await login(21);assert.equal((await confirm(706,input(706,[1],10),923)).status,'Partial');checks++;
 console.log(`PASS: ${checks} atomic delivery checks: partial/full handovers, receipt linkage, journal posting, rollback, safe retries, stale documents, amount validation, cancelled slips, expired sessions and tenant/module isolation. Local database only.`);
}catch(e){console.error(e.message);console.error(e.where||e.detail||e.stack);process.exitCode=1}finally{await db.close()}
