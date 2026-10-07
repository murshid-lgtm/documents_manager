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
 const service=(await db.query("insert into service_catalog(organization_id,name,service_type,base_price,workflow) values($1,'Business setup','Staged service',100,$2) returning id",[id(1),JSON.stringify(['Approval','Registration'])])).rows[0].id;
 const sale=(await db.query("insert into service_catalog(organization_id,name,service_type,base_price) values($1,'Printing','Sale',5) returning id",[id(1)])).rows[0].id;
 const request={organization_id:id(1),branch_id:id(11),customer_name:'Client',customer_mobile:'50100240',items:[{service_id:service,quantity:1,government_fee:50,service_fee:100,remember:true},{service_id:sale,quantity:2,government_fee:0,service_fee:5}],paid:160,method:'Cash'};
 await login(22);
 const result=(await db.query('select checkout_sale($1,$2) id',[JSON.stringify(request),id(301)])).rows[0].id;
 assert.equal((await db.query('select checkout_sale($1,$2) id',[JSON.stringify(request),id(301)])).rows[0].id,result);checks++;
 const saved=(await db.query('select * from sales_documents where id=$1',[result])).rows[0];assert.equal(Number(saved.total),160);assert.equal(Number(saved.paid_total),160);checks+=2;
 assert.equal((await db.query('select count(*) n from service_jobs where invoice_id=$1',[result])).rows[0].n,2);checks++;
 assert.equal((await db.query('select stages from service_jobs where invoice_id=$1 and jsonb_array_length(stages)>0',[result])).rows[0].stages[0].status,'Pending');checks++;
 assert.equal((await db.query('select count(*) n from sales_payments where document_id=$1',[result])).rows[0].n,1);checks++;
 assert.equal((await db.query('select count(*) n from crm_customers')).rows[0].n,1);checks++;
 const changed={...request,paid:110,items:[{service_id:service,quantity:1,government_fee:10,service_fee:100,remember:true}]};
 await db.query('select checkout_sale($1,$2)',[JSON.stringify(changed),id(302)]);
 assert.equal(Number((await db.query('select total from sales_documents where id=$1',[result])).rows[0].total),160);checks++;
 assert.equal(Number((await db.query('select government_fee from checkout_prices')).rows[0].government_fee),10);checks++;
 await denied('select checkout_sale($1,$2)',[JSON.stringify({...request,paid:999}),id(303)]);
 assert.equal((await db.query('select count(*) n from sales_documents')).rows[0].n,2);checks++;
 await denied('select checkout_sale($1,$2)',[JSON.stringify({...request,branch_id:id(12)}),id(304)]);
 await login(24);await denied('select checkout_sale($1,$2)',[JSON.stringify(request),id(305)]);
 await login(25);await denied('select checkout_sale($1,$2)',[JSON.stringify(request),id(306)]);
 await login(22);
 const attestation={case:{organization_id:id(1),branch_id:id(11),tracking_reference:'58880',tracking_family:'58880',customer_name:'Degree customer',advance_paid:50},documents:[{document_name:'Degree certificate',quantity:1,government_fee:100,service_fee:250,stages:['MEA India','MOFA Qatar'],remember:true}]};
 const cid=(await db.query('select create_attestation_checkout($1,$2) id',[JSON.stringify(attestation),id(308)])).rows[0].id;
 assert.equal((await db.query('select create_attestation_checkout($1,$2) id',[JSON.stringify(attestation),id(308)])).rows[0].id,cid);checks++;
 const cc=(await db.query('select total_amount,second_payment,balance_payment,customer_id from cases where id=$1',[cid])).rows[0];assert.equal(Number(cc.total_amount),350);assert.equal(Number(cc.second_payment),50);assert.equal(Number(cc.balance_payment),300);assert.ok(cc.customer_id);checks+=4;
 assert.equal((await db.query('select count(*) n from documents where case_id=$1',[cid])).rows[0].n,1);checks++;
 assert.equal((await db.query('select count(*) n from payments where case_id=$1',[cid])).rows[0].n,1);checks++;
 assert.equal((await db.query('select price_key from document_prices')).rows[0].price_key,'degree certificate|mea india|mofa qatar');checks++;
 const linked=(await db.query('select invoice_id,bill_no from cases where id=$1',[cid])).rows[0];assert.ok(linked.invoice_id);checks++;
 const attInvoice=(await db.query('select * from sales_documents where id=$1',[linked.invoice_id])).rows[0];assert.equal(attInvoice.sale_type,'Attestation');assert.equal(Number(attInvoice.total),350);assert.equal(Number(attInvoice.paid_total),50);assert.equal(attInvoice.document_no,linked.bill_no);assert.deepEqual(attInvoice.items[0].required_attestations,['MEA India','MOFA Qatar']);checks+=5;
 assert.equal((await db.query('select count(*) n from service_jobs where invoice_id=$1',[linked.invoice_id])).rows[0].n,0);checks++;
 const caseReceipt=(await db.query('select * from payments where case_id=$1',[cid])).rows[0],saleReceipt=(await db.query('select * from sales_payments where document_id=$1',[linked.invoice_id])).rows[0];assert.equal(caseReceipt.id,saleReceipt.id);assert.equal(caseReceipt.receipt_no,saleReceipt.receipt_no);checks+=2;
 const extra=(await db.query('select record_sales_payment($1,$2) id',[JSON.stringify({document_id:linked.invoice_id,amount:25,method:'Cash'}),id(330)])).rows[0].id;assert.equal((await db.query('select count(*) n from payments where id=$1',[extra])).rows[0].n,1);checks++;
 assert.equal(Number((await db.query('select balance_payment from cases where id=$1',[cid])).rows[0].balance_payment),275);checks++;
 await login(21);await denied('delete from cases where id=$1',[cid]);await login(22);
 await denied('update payments set amount=1 where id=$1',[extra]);await denied('delete from payments where id=$1',[extra]);
 await db.query('update cases set total_amount=1,second_payment=0,balance_payment=1 where id=$1',[cid]);assert.equal(Number((await db.query('select balance_payment from cases where id=$1',[cid])).rows[0].balance_payment),275);checks++;
 await login(21);await db.query('select void_business_payment($1,$2)',[extra,'Incorrect cash receipt']);assert.equal((await db.query('select voided from payments where id=$1',[extra])).rows[0].voided,true);assert.equal(Number((await db.query('select balance_payment from cases where id=$1',[cid])).rows[0].balance_payment),300);checks+=2;await login(22);
 const document=(await db.query('select id from documents where case_id=$1',[cid])).rows[0].id;
 await denied('update documents set quantity=2 where id=$1',[document]);
 await login(21);await db.query('select void_business_payment($1,$2)',[saleReceipt.id,'Correct document quantity']);await login(22);
 await db.query('update documents set quantity=2 where id=$1',[document]);assert.equal(Number((await db.query('select total from sales_documents where id=$1',[linked.invoice_id])).rows[0].total),700);assert.equal(Number((await db.query('select balance_payment from cases where id=$1',[cid])).rows[0].balance_payment),700);checks+=2;
 await db.query('update documents set quantity=1 where id=$1',[document]);
 await db.query('select record_sales_payment($1,$2)',[JSON.stringify({document_id:linked.invoice_id,amount:50,method:'Cash'}),id(332)]);
 await denied('update sales_documents set items=$2 where id=$1',[linked.invoice_id,JSON.stringify([{...attInvoice.items[0],quantity:99}])]);
 await denied('select create_attestation_checkout($1,$2)',[JSON.stringify({...attestation,case:{...attestation.case,tracking_reference:'fail',advance_paid:999}}),id(309)]);
 assert.equal((await db.query('select count(*) n from cases')).rows[0].n,1);checks++;
 await login(23);await denied('select create_attestation_checkout($1,$2)',[JSON.stringify(attestation),id(310)]);
 await system();await db.query('update profiles set staff_modules=$1 where id=$2',[['cases'],id(25)]);await login(25);
 const restricted={...attestation,case:{...attestation.case,tracking_reference:'cases-only',advance_paid:0}};
 await denied('select create_attestation_checkout($1,$2)',[JSON.stringify(restricted),id(311)]); // Invoicing requires Sales; Cases-only access is unchanged.
 await system();await db.query('update profiles set staff_modules=$1 where id=$2',[['sales'],id(25)]);await login(25);
 const simple={...request,customer_name:'Sales only client',paid:5,items:[{service_id:sale,quantity:1,government_fee:0,service_fee:5}]};
 assert.ok((await db.query('select checkout_sale($1,$2) id',[JSON.stringify(simple),id(312)])).rows[0].id);checks++;
 await system();await db.query('update profiles set staff_modules=null where id=$1',[id(25)]);await login(25);
 await denied('select checkout_sale($1,$2)',[JSON.stringify({...simple,branch_id:id(12)}),id(313)]);
 const qc={organization_id:id(1),branch_id:id(11),name:'Quick customer',mobile:'50001234'};
 assert.equal((await db.query('select quick_add_customer($1,$2) id',[JSON.stringify(qc),id(318)])).rows[0].id,id(318));checks++;
 assert.equal((await db.query('select quick_add_customer($1,$2) id',[JSON.stringify(qc),id(318)])).rows[0].id,id(318));checks++;
 await denied('select quick_add_customer($1,$2)',[JSON.stringify({...qc,branch_id:id(12)}),id(319)]);
 await denied('select quick_add_service($1,$2)',[JSON.stringify({organization_id:id(1),name:'Invalid',government_fee:'NaN',service_charge:5}),id(320)]);

 const newService={organization_id:id(1),name:'Quick typed work',government_fee:20,service_charge:30,service_type:'Sale',workflow:[]};
 const sid=(await db.query('select quick_add_service($1,$2) id',[JSON.stringify(newService),id(314)])).rows[0].id;assert.equal(sid,id(314));checks++;
 assert.equal((await db.query('select quick_add_service($1,$2) id',[JSON.stringify(newService),id(314)])).rows[0].id,sid);checks++;
 const numbered={...simple,document_no:'MANUAL-2026-001',items:[{service_id:sid,quantity:2,government_fee:20,service_fee:30}],paid:100};
 const inv=(await db.query('select checkout_sale($1,$2) id',[JSON.stringify(numbered),id(315)])).rows[0].id;assert.equal((await db.query('select document_no from sales_documents where id=$1',[inv])).rows[0].document_no,'MANUAL-2026-001');checks++;
 await denied('select checkout_sale($1,$2)',[JSON.stringify(numbered),id(316)]);
 await denied("update sales_documents set document_no='changed' where id=$1",[inv]);

 await login(21);
 await denied('select quick_add_service($1,$2)',[JSON.stringify({...newService,name:'Typed quick work'}),id(321)]);
 const thermal=(await db.query("insert into named_print_templates(organization_id,kind,name,settings) values($1,'receipt','Thermal for any bill',$2) returning id",[id(1),JSON.stringify({paper:'80mm'})])).rows[0].id;
 await db.query('select finance_command($1,$2,$3)',['setup',JSON.stringify({organization_id:id(1),branch_id:id(11)}),id(322)]);
 const bank=(await db.query("select id,payment_type from finance_accounts where organization_id=$1 and code='1010'",[id(1)])).rows[0];assert.equal(bank.payment_type,'Bank');checks++;
 const posRequest={...simple,customer_name:'POS client',pos_mode:true,paid:35,account_id:bank.id,template_id:thermal,items:[{service_id:service,quantity:1,government_fee:999,service_fee:35,remember:true}]};
 const pos=(await db.query('select checkout_sale($1,$2) id',[JSON.stringify(posRequest),id(323)])).rows[0].id;
 const posDoc=(await db.query('select * from sales_documents where id=$1',[pos])).rows[0];assert.equal(Number(posDoc.total),35);assert.equal(Number(posDoc.items[0].government_fee),0);assert.equal(posDoc.template_id,thermal);assert.equal(posDoc.sale_type,'POS');assert.equal((await db.query('select count(*) n from service_jobs where invoice_id=$1',[pos])).rows[0].n,0);checks+=5;
 const remembered=(await db.query('select * from checkout_prices where service_id=$1',[service])).rows[0];assert.equal(Number(remembered.pos_rate),35);assert.equal(Number(remembered.government_fee),10);assert.equal(Number(remembered.service_fee),100);checks+=3;
 assert.equal((await db.query('select count(*) n from invoice_costs where invoice_id=$1',[pos])).rows[0].n,0);checks++;
 const receipt=(await db.query('select * from sales_payments where document_id=$1',[pos])).rows[0];assert.equal(receipt.account_id,bank.id);assert.ok(receipt.receipt_no);checks+=2;
 assert.equal((await db.query('select checkout_sale($1,$2) id',[JSON.stringify(posRequest),id(323)])).rows[0].id,pos);checks++;
 await system();await db.query('update profiles set branch_id=null where id=$1',[id(25)]);await login(25);await denied('select checkout_sale($1,$2)',[JSON.stringify(simple),id(317)]);
 await db.exec('reset role;set role anon');await denied('select checkout_sale($1,$2)',[JSON.stringify(request),id(307)]);
 console.log(`PASS: ${checks} connected checkout assertions.`);
}finally{await db.close()}
