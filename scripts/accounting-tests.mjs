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
 for(const [n,org,role,branch,modules,platform] of [[21,1,'admin',null,null,false],[22,1,'branch',11,null,false],[23,1,'branch',12,null,false],[24,2,'staff',null,null,false],[25,1,'staff',11,['crm'],false]])await db.query('update profiles set organization_id=$2,role=$3,branch_id=$4,staff_modules=$5,is_platform_super_admin=$6 where id=$1',[id(n),id(org),role,branch?id(branch):null,modules,platform]);
 await login(22);
 const base={organization_id:id(1),branch_id:id(11)};
 const cmd=async(action,input,n)=>(await db.query('select finance_command($1,$2,$3) id',[action,JSON.stringify({...base,...input}),id(n)])).rows[0].id;
 const supplier=await cmd('supplier',{name:'Supplier'},401);assert.equal(supplier,id(401));checks++;
 assert.equal(await cmd('supplier',{name:'Supplier'},401),supplier);checks++;
 await denied('select finance_command($1,$2,$3)',['supplier',JSON.stringify({...base,branch_id:id(12),name:'Wrong branch'}),id(402)]);
 const bill=await cmd('bill',{kind:'Purchase',supplier_id:supplier,description:'Paper supplies',amount:100,tax_amount:5,paid:0,date:'2026-10-01'},403);
 assert.equal(bill,id(403));checks++;
 assert.equal(await cmd('bill',{kind:'Purchase',supplier_id:supplier,description:'Paper supplies',amount:100,tax_amount:5,paid:0},403),bill);checks++;
 const cash=(await db.query("select id from finance_accounts where code='1000'")).rows[0].id;
 await cmd('pay',{bill_id:bill,amount:40,account_id:cash},404);
 assert.equal(await cmd('pay',{bill_id:bill,amount:40,account_id:cash},404),bill);checks++;
 assert.equal(Number((await db.query('select paid_total from finance_bills where id=$1',[bill])).rows[0].paid_total),40);checks++;
 await denied('select finance_command($1,$2,$3)',['pay',JSON.stringify({...base,bill_id:bill,amount:66,account_id:cash}),id(405)]);
 await denied('select finance_command($1,$2,$3)',['bill',JSON.stringify({...base,kind:'Expense',description:'Bad',amount:'NaN'}),id(406)]);
 await denied('select finance_command($1,$2,$3)',['void',JSON.stringify({...base,bill_id:bill,reason:'Invalid correction'}),id(407)]);
 await denied("update finance_bills set paid_total=0 where id=$1",[bill]);
 await denied("insert into finance_accounts(organization_id,code,name,kind) values($1,'fake','Fake','Asset')",[id(1)]);
 await denied("select accounting_private.chart($1)",[id(1)]);
 const expense=await cmd('bill',{kind:'Expense',description:'Stationery',amount:25,paid:25,account_id:cash},408);assert.ok(expense);checks++;
 const unpaid=await cmd('bill',{kind:'Expense',description:'Incorrect expense',amount:10},409);
 await login(21);await cmd('void',{bill_id:unpaid,reason:'Duplicated expense'},410);
 assert.equal((await db.query('select status from finance_bills where id=$1',[unpaid])).rows[0].status,'Voided');checks++;
 await denied('select finance_command($1,$2,$3)',['void',JSON.stringify({...base,bill_id:bill,reason:'Has a payment'}),id(411)]);
 const bank=await cmd('account',{name:'QNB',amount:500},412);assert.ok(bank);checks++;
 await cmd('transfer',{account_id:bank,destination_id:cash,amount:100},413);
 await cmd('transfer',{account_id:bank,destination_id:cash,amount:100},413);
 assert.equal((await db.query("select count(*) n from finance_journals where source='Transfer'")).rows[0].n,1);checks++;
 const reports=(await db.query('select * from finance_report($1,$2,$3,$4)',[id(1),id(11),'2026-01-01','2026-12-31'])).rows;
 assert.equal(Number(reports.find(x=>x.code==='2000').closing),-65);checks++;
 assert.equal(reports.reduce((n,r)=>n+Number(r.closing),0),0);checks++;
 const invoice=(await db.query("insert into sales_documents(organization_id,branch_id,kind,status,customer_name,items) values($1,$2,'Invoice','Issued','Client',$3) returning id",[id(1),id(11),JSON.stringify([{description:'Service',quantity:1,government_fee:20,service_fee:80}])])).rows[0].id;
 await db.query("insert into sales_payments(organization_id,branch_id,document_id,amount) values($1,$2,$3,30)",[id(1),id(11),invoice]);
 let r=(await db.query('select * from finance_report($1,$2,$3,$4)',[id(1),id(11),'2026-01-01','2026-12-31'])).rows;
 assert.equal(Number(r.find(x=>x.code==='1100').closing),70);checks++;
 assert.equal(Number(r.find(x=>x.code==='4010').closing),-20);checks++;
 await cmd('sync',{},414);await cmd('sync',{},415);
 assert.equal((await db.query("select count(*) n from finance_journals where source='Receipt'")).rows[0].n,1);checks++;
 await denied("update sales_documents set items=$2 where id=$1",[invoice,JSON.stringify([{description:'Service',quantity:1,government_fee:20,service_fee:100}])]);
 const receipt=(await db.query('select id from sales_payments where document_id=$1',[invoice])).rows[0].id;
 await db.query("select void_business_payment($1,'Customer payment correction')",[receipt]);
 r=(await db.query('select * from finance_report($1,$2,$3,$4)',[id(1),id(11),'2026-01-01','2026-12-31'])).rows;assert.equal(Number(r.find(x=>x.code==='1100').closing),100);checks++;
 await db.query("update sales_documents set items=$2 where id=$1",[invoice,JSON.stringify([{description:'Service',quantity:1,government_fee:20,service_fee:100}])]);
 r=(await db.query('select * from finance_report($1,$2,$3,$4)',[id(1),id(11),'2026-01-01','2026-12-31'])).rows;assert.equal(Number(r.find(x=>x.code==='1100').closing),120);checks++;
 await denied('delete from sales_documents where id=$1',[invoice]);
 await db.query("update sales_documents set status='Cancelled' where id=$1",[invoice]);
 r=(await db.query('select * from finance_report($1,$2,$3,$4)',[id(1),id(11),'2026-01-01','2026-12-31'])).rows;assert.equal(Number(r.find(x=>x.code==='1100').closing),0);checks++;
 const mismatch=(await db.query('select journal_id from finance_lines group by journal_id having sum(debit-credit)<>0')).rows;assert.equal(mismatch.length,0);checks++;
 await login(23);assert.equal((await db.query('select count(*) n from finance_bills')).rows[0].n,0);checks++;
 await denied('select finance_command($1,$2,$3)',['pay',JSON.stringify({organization_id:id(1),branch_id:id(12),bill_id:bill,amount:5,account_id:cash}),id(416)]);
 await login(25);await denied('select finance_command($1,$2,$3)',['supplier',JSON.stringify({...base,name:'CRM only'}),id(417)]);
 await login(24);assert.equal((await db.query('select count(*) n from finance_journals')).rows[0].n,0);checks++;
 await login(21);
 await db.query('insert into organization_print_settings(organization_id,templates) values($1,$2)',[id(1),JSON.stringify({invoice:{paper:'A5',title:'Invoice',show_logo:false},receipt:{paper:'58mm'}})]);
 assert.equal((await db.query('select templates from organization_print_settings')).rows[0].templates.receipt.paper,'58mm');checks++;
 await denied('update organization_print_settings set templates=$1 where organization_id=$2',[JSON.stringify({invoice:{paper:'unknown'}}),id(1)]);
 await login(22);assert.equal((await db.query('select count(*) n from organization_print_settings')).rows[0].n,1);checks++;
 assert.equal((await db.query('update organization_print_settings set templates=$1 returning organization_id',[JSON.stringify({})])).rows.length,0);checks++;
 await login(24);assert.equal((await db.query('select count(*) n from organization_print_settings')).rows[0].n,0);checks++;
 await db.exec('reset role;set role anon');await denied('select finance_command($1,$2,$3)',['supplier',JSON.stringify({...base,name:'Anon'}),id(418)]);
 console.log(`PASS: ${checks} accounting assertions.`);
}finally{await db.close()}
