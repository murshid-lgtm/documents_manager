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

 const input=(amount=20,extra={})=>({operation:'create',amount,payment_method:'Cash',payment_reference:null,notes:null,...extra});
 const version=r=>({amount:Number(r.amount),payment_method:r.payment_method||'',payment_reference:r.payment_reference||'',notes:r.notes||''});
 const command=async(n,p,key)=>(await db.query('select save_case_payment($1,$2,$3) data',[id(n),JSON.stringify(p),id(key)])).rows[0].data;
 const fail=async(n,p,key,pattern)=>{await assert.rejects(()=>command(n,p,key),pattern);checks++};
 let result=await command(701,input(),901);let payment=result.payment;assert.equal(Number(result.case.balance_payment),80);assert.equal(Number(result.case.second_payment),20);assert(payment.receipt_no.startsWith('RCT-'));checks+=3;
 assert.equal((await command(701,input(),901)).payment.id,payment.id);assert.equal((await db.query('select count(*)::int n from payments where case_id=$1',[id(701)])).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from case_history where case_id=$1',[id(701)])).rows[0].n,1);checks+=3;
 await fail(701,input(21),901,/request key/);await fail(701,input(81),902,/exceeds/);for(const amount of [0,-1,1.001,'NaN','Infinity'])await fail(701,input(amount),903,/greater than zero/);
 const edit={...input(30),operation:'update',payment_id:payment.id,expected:version(payment)};
 result=await command(701,edit,904);assert.equal(Number(result.case.balance_payment),70);assert.equal(Number(result.case.second_payment),30);checks+=2;assert.equal((await command(701,edit,904)).payment.id,payment.id);checks++;
 await fail(701,edit,905,/changed since/);await fail(702,edit,906,/no longer available/);
 payment=result.payment;const remove={operation:'delete',payment_id:payment.id,expected:version(payment)};result=await command(701,remove,907);assert(result.deleted);assert.equal(Number(result.case.balance_payment),100);assert.equal(Number(result.case.second_payment),0);assert((await command(701,remove,907)).deleted);checks+=4;
 assert.equal((await db.query('select count(*)::int n from payments where case_id=$1',[id(701)])).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from case_history where case_id=$1',[id(701)])).rows[0].n,3);checks+=2;
 // Preserve an imported balance baseline rather than silently recomputing it.
 await db.query('update cases set advance_paid=10,balance_payment=40 where id=$1',[id(702)]);result=await command(702,input(15),908);assert.equal(Number(result.case.balance_payment),25);checks++;
 // Any downstream history failure rolls back the payment and case balance together.
 await system();await db.exec("create function public.payment_history_test_failure() returns trigger language plpgsql as $$begin if new.action='Payment recorded' then raise exception 'Injected history failure';end if;return new;end$$;create trigger payment_history_test_failure before insert on public.case_history for each row execute function public.payment_history_test_failure();");await login(21);await fail(703,input(),909,/Injected history/);assert.equal((await db.query('select count(*)::int n from payments where case_id=$1',[id(703)])).rows[0].n,0);assert.equal(Number((await db.query('select balance_payment from cases where id=$1',[id(703)])).rows[0].balance_payment),100);checks+=2;
 await system();await db.exec('drop trigger payment_history_test_failure on public.case_history;drop function public.payment_history_test_failure();');await db.query("update profiles set staff_modules=array['payments'] where id=$1",[id(25)]);await login(25);result=await command(703,input(10),909);assert.equal(Number(result.case.balance_payment),90);checks++;
 await fail(703,{...input(20),operation:'update',payment_id:result.payment.id,expected:version(result.payment)},910,/administrator/);await fail(703,{operation:'delete',payment_id:result.payment.id,expected:version(result.payment)},911,/administrator/);
 await login(24);await fail(704,input(),912,/access denied/);await login(23);await fail(704,input(),913,/access denied/);await system();await db.exec('set role anon');await fail(704,input(),914,/permission denied/);
 await system();await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1",[id(121)]);await login(21);await fail(704,input(),915,/access denied/);await system();await db.query('update auth.sessions set not_after=null where id=$1',[id(121)]);await login(21);
 // Editing/deleting a legacy delivery collection keeps its slip snapshot consistent.
 let delivery=(await db.query('select confirm_customer_delivery($1,$2,$3) data',[id(704),JSON.stringify({selected_docs:[id(7041)],receiver_name:'Receiver',payment_collected:20,payment_method:'Cash'}),id(916)])).rows[0].data;
 payment=(await db.query('select * from payments where id=$1',[delivery.payment_id])).rows[0];result=await command(704,{...input(30),operation:'update',payment_id:payment.id,expected:version(payment)},917);assert.equal(Number((await db.query('select payment_collected from deliveries where id=$1',[delivery.id])).rows[0].payment_collected),30);checks++;
 await command(704,{operation:'delete',payment_id:payment.id,expected:version(result.payment)},918);delivery=(await db.query('select * from deliveries where id=$1',[delivery.id])).rows[0];assert.equal(Number(delivery.payment_collected),0);assert.equal(delivery.payment_id,null);assert.equal(delivery.audit.length,3);checks+=3;
 // Administrator edit/delete failures must preserve the original payment and balance.
 await system();await db.exec("create function public.payment_correction_test_failure() returns trigger language plpgsql as $$begin if new.case_id='00000000-0000-4000-8000-000000000702' then raise exception 'Injected correction failure';end if;return new;end$$;create trigger payment_correction_test_failure before insert on public.case_history for each row execute function public.payment_correction_test_failure();");await login(21);
 const original=(await db.query('select * from payments where case_id=$1',[id(702)])).rows[0];await fail(702,{...input(20),operation:'update',payment_id:original.id,expected:version(original)},925,/Injected correction/);await fail(702,{operation:'delete',payment_id:original.id,expected:version(original)},926,/Injected correction/);
 assert.equal(Number((await db.query('select amount from payments where id=$1',[original.id])).rows[0].amount),15);assert.equal(Number((await db.query('select balance_payment from cases where id=$1',[id(702)])).rows[0].balance_payment),25);checks+=2;
 await system();await db.exec('drop trigger payment_correction_test_failure on public.case_history;drop function public.payment_correction_test_failure();');await login(21);
 // Existing attestation invoices receive one canonical receipt and one journal.
 await db.query('select connect_attestation_financials($1,false)',[id(1)]);result=await command(705,input(25),919);payment=result.payment;assert.equal(Number(result.case.balance_payment),75);checks++;
 assert.equal((await db.query('select count(*)::int n from sales_payments where id=$1',[payment.id])).rows[0].n,1);assert.equal((await db.query("select count(*)::int n from finance_journals where source='Receipt' and source_id=$1",[payment.id])).rows[0].n,1);checks+=2;
 await command(705,input(25),919);assert.equal(Number((await db.query('select balance_payment from cases where id=$1',[id(705)])).rows[0].balance_payment),75);checks++;
 await fail(705,{...input(30),operation:'update',payment_id:payment.id,expected:version(payment)},920,/Sales > Payments/);await fail(705,{operation:'delete',payment_id:payment.id,expected:version(payment)},921,/Sales > Payments/);
 await login(25);await fail(706,input(),922,/Sales > Payments/);await denied('select * from operations_private.payment_commands');
 console.log(`PASS: ${checks} atomic payment checks: create/edit/delete, safe replay, stale correction protection, rollback, imported balances, delivery slip synchronization, linked receipts/journals, administrator restrictions and tenant/session isolation. Local database only.`);
}catch(e){console.error(e.message);console.error(e.where||e.detail||e.stack);process.exitCode=1}finally{await db.close()}
