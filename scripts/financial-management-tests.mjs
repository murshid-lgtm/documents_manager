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

 await login(21);
 const base={organization_id:id(1),branch_id:id(11)};
 const cmd=async(action,input,n)=>(await db.query('select finance_command($1,$2,$3) id',[action,JSON.stringify({...base,...input}),id(n)])).rows[0].id;
 const manage=async(entity,action,target,input,n)=>(await db.query('select manage_financial_record($1,$2,$3,$4) id',[entity,action,JSON.stringify({organization_id:id(1),id:target,reason:'Correction after review',...input}),id(n)])).rows[0].id;
 await cmd('setup',{},501);const cash=(await db.query("select id from finance_accounts where code='1000'")).rows[0].id;
 const customer=(await db.query("insert into crm_customers(organization_id,branch_id,name) values($1,$2,'Customer') returning id",[id(1),id(11)])).rows[0].id;
 const invoice=(await db.query("insert into sales_documents(organization_id,branch_id,customer_id,customer_name,status,items,document_date) values($1,$2,$3,'Customer','Issued',$4,'2026-10-01') returning id",[id(1),id(11),customer,JSON.stringify([{description:'Service',quantity:1,government_fee:0,service_fee:100}])])).rows[0].id;
 const receipt=(await db.query('select record_sales_payment($1,$2) id',[JSON.stringify({document_id:invoice,amount:30,account_id:cash,date:'2026-10-02'}),id(502)])).rows[0].id;
 assert.equal((await db.query('select received_at::date::text dated from sales_payments where id=$1',[receipt])).rows[0].dated,'2026-10-02');checks++;
 const next=await manage('receipt','edit',receipt,{amount:40,account_id:cash,date:'2026-10-03'},503);
 assert.notEqual(next,receipt);assert.equal((await db.query('select voided from sales_payments where id=$1',[receipt])).rows[0].voided,true);assert.equal(Number((await db.query('select paid_total from sales_documents where id=$1',[invoice])).rows[0].paid_total),40);checks+=3;
 assert.equal(await manage('receipt','edit',receipt,{amount:40,account_id:cash,date:'2026-10-03'},503),next);checks++;
 await denied('select manage_financial_record($1,$2,$3,$4)',['receipt','delete',JSON.stringify({organization_id:id(1),id:next,reason:'Other action'}),id(503)]);
 await db.query('update sales_documents set items=$2,document_no=$3 where id=$1',[invoice,JSON.stringify([{description:'Service',quantity:1,unit_price:120}]),'MANUAL-001']);
 assert.equal(Number((await db.query('select total from sales_documents where id=$1',[invoice])).rows[0].total),120);checks++;
 const editable=(await db.query('select * from sales_documents where id=$1',[invoice])).rows[0];
 await manage('invoice','edit',invoice,{document:{...editable,customer_notes:'Reviewed by administrator'}},528);assert.equal((await db.query('select customer_notes from sales_documents where id=$1',[invoice])).rows[0].customer_notes,'Reviewed by administrator');checks++;
 await denied('select manage_financial_record($1,$2,$3,$4)',['invoice','edit',JSON.stringify({organization_id:id(1),id:invoice,reason:'Wrong nested document',document:{...editable,id:id(999)}}),id(529)]);
 await denied('update sales_documents set items=$2 where id=$1',[invoice,JSON.stringify([{description:'Service',quantity:1,unit_price:20}])]);
 const snap=(await db.query('select billing_financial_snapshot($1,$2) data',[id(1),customer])).rows[0].data;assert.equal(snap.total,120);assert.equal(snap.paid,40);assert.equal(snap.balance,80);checks+=3;
 assert.equal((await db.query("select * from billing_financial_rows($1,$2,'all',null,'balance')",[id(1),customer])).rows.length,1);checks++;
 await login(22);await denied('select manage_financial_record($1,$2,$3,$4)',['receipt','delete',JSON.stringify({organization_id:id(1),id:next,reason:'Staff denial'}),id(504)]);
 await denied('update sales_documents set items=$2 where id=$1',[invoice,JSON.stringify([{description:'Service',quantity:1,unit_price:140}])]);
 await login(23);assert.equal((await db.query('select billing_financial_snapshot($1,$2) data',[id(1),customer])).rows[0].data.total,0);assert.equal((await db.query('select * from billing_financial_rows($1)',[id(1)])).rows.length,0);checks+=2;
 await login(24);await denied('select manage_financial_record($1,$2,$3,$4)',['invoice','delete',JSON.stringify({organization_id:id(1),id:invoice,reason:'Cross company'}),id(505)]);
 await login(21);await denied('select accounting_private.restate_cost($1,$2,false,$3)',[id(990),'{}','No private helper access']);
 await manage('receipt','delete',next,{},506);assert.equal(Number((await db.query('select paid_total from sales_documents where id=$1',[invoice])).rows[0].paid_total),0);checks++;
 const cost=(await db.query('select invoice_cost_command($1,$2,$3) id',['cost',JSON.stringify({...base,invoice_id:invoice,description:'Courier fees',amount:20,date:'2026-10-01',paid_now:false}),id(507)])).rows[0].id;
 await manage('cost','edit',cost,{description:'Corrected courier fees',amount:25,incurred_on:'2026-10-01',paid_now:true,paid_on:'2026-10-03',account_id:cash},508);
 let c=(await db.query('select * from invoice_costs where id=$1',[cost])).rows[0];assert.equal(c.status,'Paid');assert.equal(Number(c.amount),25);assert.equal(c.liability_visible,true);checks+=3;
 let reports=(await db.query('select * from finance_report($1,$2,$3,$4)',[id(1),id(11),'2026-10-01','2026-10-02'])).rows;assert.equal(Number(reports.find(x=>x.code==='2200').closing),-25);checks++;
 await manage('cost','edit',cost,{amount:25,paid_now:true,paid_on:'2026-10-01',account_id:cash},509);
 c=(await db.query('select * from invoice_costs where id=$1',[cost])).rows[0];assert.equal(c.liability_visible,false);checks++;
 const before=(await db.query('select count(*) n from finance_journals')).rows[0].n;
 await denied('select manage_financial_record($1,$2,$3,$4)',['cost','edit',JSON.stringify({organization_id:id(1),id:cost,reason:'Invalid date correction',paid_now:true,paid_on:'2026-09-01',account_id:cash}),id(510)]);
 assert.equal((await db.query('select count(*) n from finance_journals')).rows[0].n,before);checks++;
 await manage('cost','delete',cost,{},511);assert.equal((await db.query('select status from invoice_costs where id=$1',[cost])).rows[0].status,'Cancelled');checks++;
 const paidAgain=(await db.query('select record_sales_payment($1,$2) id',[JSON.stringify({document_id:invoice,amount:50,account_id:cash,date:'2026-10-03'}),id(512)])).rows[0].id;
 await manage('invoice','delete',invoice,{},513);assert.equal((await db.query('select status from sales_documents where id=$1',[invoice])).rows[0].status,'Cancelled');assert.equal((await db.query('select voided from sales_payments where id=$1',[paidAgain])).rows[0].voided,true);checks+=2;
 const bank=await cmd('account',{name:'Unused bank',amount:0},514);await manage('account','edit',bank,{name:'Renamed bank',payment_type:'Bank'},515);assert.equal((await db.query('select name from finance_accounts where id=$1',[bank])).rows[0].name,'Renamed bank');checks++;
 await manage('account','delete',bank,{},516);assert.equal((await db.query('select count(*) n from finance_accounts where id=$1',[bank])).rows[0].n,0);checks++;
 await denied('select manage_financial_record($1,$2,$3,$4)',['account','delete',JSON.stringify({organization_id:id(1),id:cash,reason:'Cannot lose history'}),id(517)]);
 const bill=await cmd('bill',{kind:'Expense',description:'Supplies',amount:100,tax_amount:5,paid:40,account_id:cash,date:'2026-10-02'},518);
 await manage('bill','edit',bill,{amount:120,tax_amount:5,description:'Corrected supplies'},519);assert.equal(Number((await db.query('select total from finance_bills where id=$1',[bill])).rows[0].total),125);checks++;
 await denied('select manage_financial_record($1,$2,$3,$4)',['bill','delete',JSON.stringify({organization_id:id(1),id:bill,reason:'Refund is required'}),id(520)]);
 const unpaid=await cmd('bill',{kind:'Expense',description:'Duplicate supplies',amount:10,paid:0},521);await manage('bill','delete',unpaid,{},522);checks++;
 await db.query("insert into cases(organization_id,branch_id,tracking_reference,customer_name,total_amount,advance_paid,balance_payment) values($1,$2,'900001','Legacy',500,100,400)",[id(1),id(11)]);
 assert.equal((await db.query('select billing_financial_snapshot($1) data',[id(1)])).rows[0].data.total,0);checks++;
 const cid=(await db.query('select create_attestation_checkout($1,$2) id',[JSON.stringify({case:{...base,tracking_reference:'900002',customer_name:'Attestation customer',mobile:'71315535',submission_date:'2026-10-01',advance_paid:30},documents:[{document_name:'Degree',quantity:1,government_fee:20,service_fee:80,stages:['MEA','MOFA']}]}),id(523)])).rows[0].id;
 const linked=(await db.query('select * from cases where id=$1',[cid])).rows[0];
 const linkedReceipt=(await db.query('select * from sales_payments where document_id=$1',[linked.invoice_id])).rows[0];
 await manage('receipt','edit',linkedReceipt.id,{amount:45,account_id:cash,date:'2026-10-03'},524);
 assert.equal(Number((await db.query('select balance_payment from cases where id=$1',[cid])).rows[0].balance_payment),55);checks++;
 const automatic=(await db.query('select * from invoice_costs where invoice_id=$1 and automatic',[linked.invoice_id])).rows[0];
 await db.query('select invoice_cost_command($1,$2,$3)',['cost_pay',JSON.stringify({...base,cost_id:automatic.id,paid_on:'2026-10-03',account_id:cash}),id(525)]);
 await db.query('update documents set government_fee=25 where case_id=$1',[cid]);assert.equal(Number((await db.query('select amount from invoice_costs where id=$1',[automatic.id])).rows[0].amount),25);checks++;
 await denied('select manage_financial_record($1,$2,$3,$4)',['cost','edit',JSON.stringify({organization_id:id(1),id:automatic.id,reason:'Unconfirmed amount edit',amount:28}),id(530)]);
 await manage('cost','edit',automatic.id,{amount:28,actual_cost_override:true},531);let actual=(await db.query('select * from invoice_costs where id=$1',[automatic.id])).rows[0];assert.equal(Number(actual.amount),28);assert.equal(actual.amount_override,true);checks+=2;
 await db.query("update sales_documents set customer_notes='Updated notes' where id=$1",[linked.invoice_id]);assert.equal(Number((await db.query('select amount from invoice_costs where id=$1',[automatic.id])).rows[0].amount),28);checks++;
 assert.equal(Number((await db.query('select total from sales_documents where id=$1',[linked.invoice_id])).rows[0].total),105);checks++;
 await manage('invoice','delete',linked.invoice_id,{},526);assert.equal((await db.query('select overall_status from cases where id=$1',[cid])).rows[0].overall_status,'Cancelled');assert.equal((await db.query('select status from invoice_costs where id=$1',[automatic.id])).rows[0].status,'Paid');checks+=2;
 assert.equal((await db.query('select journal_id from finance_lines group by journal_id having sum(debit-credit)<>0')).rows.length,0);checks++;
 assert.ok((await db.query('select count(*) n from financial_record_changes')).rows[0].n>=10);checks++;
 await denied('delete from financial_record_changes');
 await system();await db.exec('set role anon');await denied('select billing_financial_snapshot($1)',[id(1)]);await denied('select manage_financial_record($1,$2,$3,$4)',['invoice','delete',JSON.stringify({organization_id:id(1),id:invoice,reason:'Anonymous denial'}),id(527)]);
 console.log(`PASS: ${checks} admin financial correction checks: roles/tenants, idempotency, paid invoices, receipt replacement, connected attestations, date-correct expenses, reversals and balanced ledgers.`);
}finally{await db.close()}
