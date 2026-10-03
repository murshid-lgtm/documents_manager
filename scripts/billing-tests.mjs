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


 await db.exec("create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;");
 await db.exec(fs.readFileSync(new URL('../supabase/V5_8_PRIVATE_BILLING_FILES.sql',import.meta.url),'utf8'));
 await db.query("insert into organizations(id,name,slug) values($1,'A','a'),($2,'B','b')",[id(1),id(2)]);
 await db.query("insert into organization_settings(organization_id,company_name) values($1,'A'),($2,'B')",[id(1),id(2)]);
 await db.query("insert into branches(id,organization_id,name) values($1,$4,'Al Khor'),($2,$4,'Safari'),($3,$5,'Other')",[id(11),id(12),id(13),id(1),id(2)]);
 for(const n of [21,22,23,24,25]){await db.query('insert into auth.users(id,email) values($1,$2)',[id(n),`u${n}@example.test`]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[id(n+100),id(n)])}
 for(const [n,org,role,branch,modules,platform] of [[21,1,'admin',null,null,false],[22,1,'branch',11,null,false],[23,1,'branch',12,null,false],[24,2,'staff',null,null,false],[25,1,'staff',11,['crm'],false]])await db.query('update profiles set organization_id=$2,role=$3,branch_id=$4,staff_modules=$5,is_platform_super_admin=$6 where id=$1',[id(n),id(org),role,branch?id(branch):null,modules,platform]);
 await login(21);
 const customer=(await db.query("insert into crm_customers(organization_id,branch_id,name,mobile) values($1,$2,'Search Client','+974 5010-0240') returning id",[id(1),id(11)])).rows[0].id;
 assert.equal((await db.query('select * from search_business_customers($1,$2)',[id(1),'50100240'])).rows[0].id,customer);checks++;
 assert.equal((await db.query('select * from search_business_customers($1,$2)',[id(1),'s'])).rows.length,1);checks++;
 await denied("insert into crm_customers(organization_id,branch_id,name,mobile) values($1,$2,'Search Client','+97450100240')",[id(1),id(11)]);
 const template=(await db.query("insert into named_print_templates(organization_id,kind,name,settings) values($1,'invoice','A4 custom',$2) returning id",[id(1),JSON.stringify({paper:'A4',footer:''})])).rows[0].id;
 await db.query('select set_default_print_template($1)',[template]);
 assert.equal((await db.query('select is_default from named_print_templates where id=$1',[template])).rows[0].is_default,true);checks++;
 await login(22);
 const base={organization_id:id(1),branch_id:id(11),customer_id:customer,customer_name:'Search Client',kind:'Invoice',status:'Draft',document_date:'2026-10-03',template_id:template,items:[{description:'Typing',quantity:2,government_fee:10,service_fee:40,discount:5,workflow:[]}],discount:5,adjustment:-2,tax_percent:0};
 const save=async(x,n)=>(await db.query('select save_billing_document($1,$2) id',[JSON.stringify(x),id(n)])).rows[0].id;
 const draft=await save(base,501);assert.equal(await save(base,501),draft);checks++;
 let row=(await db.query('select * from sales_documents where id=$1',[draft])).rows[0];assert.equal(Number(row.total),88);checks++;
 assert.equal((await db.query("select count(*) n from finance_journals where source='Invoice'")).rows[0].n,0);checks++;
 await save({...base,id:draft,status:'Issued',document_no:row.document_no},502);
 const pay=async(n)=>(await db.query('select record_sales_payment($1,$2) id',[JSON.stringify({document_id:draft,amount:20,method:'Cash'}),id(n)])).rows[0].id;
 assert.equal(await pay(503),await pay(503));checks++;
 assert.equal((await db.query('select count(*) n from sales_payments where document_id=$1',[draft])).rows[0].n,1);checks++;
 assert.equal(Number((await db.query('select paid_total from sales_documents where id=$1',[draft])).rows[0].paid_total),20);checks++;
 await denied('select record_sales_payment($1,$2)',[JSON.stringify({document_id:draft,amount:100}),id(504)]);
 await denied('select save_billing_document($1,$2)',[JSON.stringify({...base,id:draft,status:'Issued',adjustment:10}),id(505)]);
 await denied('select save_billing_document($1,$2)',[JSON.stringify({...base,branch_id:id(12)}),id(506)]);
 assert.equal((await db.query("update billing_preferences set invoice_prefix='BAD' where organization_id=$1 returning organization_id",[id(1)])).rows.length,0);checks++;
 const staged={...base,customer_name:'Search Client',status:'Issued',kind:'Quotation',template_id:null,reference_no:'Order 123',subject:'New subject',customer_notes:'Customer copy',terms:'Conditions',items:[{description:'Renewal of QID',quantity:1,government_fee:25,service_fee:75,workflow:['Approval','Delivery']}],discount:0,adjustment:0};
 const quote=await save(staged,508);const invoice=(await db.query('select convert_business_quote($1) id',[quote])).rows[0].id;
 assert.equal((await db.query('select convert_business_quote($1) id',[quote])).rows[0].id,invoice);checks++;
 row=(await db.query('select * from sales_documents where id=$1',[invoice])).rows[0];assert.equal(row.subject,'New subject');checks++;
 assert.equal((await db.query('select count(*) n from service_jobs where invoice_id=$1',[invoice])).rows[0].n,1);checks++;
 const report=(await db.query('select * from finance_report($1,$2,$3,$4)',[id(1),id(11),'2026-01-01','2026-12-31'])).rows;
 assert.equal(report.reduce((n,r)=>n+Math.round(Number(r.closing)*100),0),0);checks++;
 const attachment=id(550),path=`${id(1)}/${draft}/${attachment}`;
 await db.query('insert into billing_attachments(id,organization_id,branch_id,document_id,name,object_path,size_bytes,content_type) values($1,$2,$3,$4,$5,$6,100,$7)',[attachment,id(1),id(11),draft,'Sample.pdf',path,'application/pdf']);
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['billing-files',path]);
 assert.equal((await db.query('select * from storage.objects')).rows.length,1);checks++;
 await denied('insert into storage.objects(bucket_id,name) values($1,$2)',['billing-files',`${id(1)}/${draft}/${id(551)}`]);
 await login(23);assert.equal((await db.query('select * from storage.objects')).rows.length,0);checks++;
 await denied('insert into billing_attachments(id,organization_id,branch_id,document_id,name,object_path,size_bytes,content_type) values($1,$2,$3,$4,$5,$6,100,$7)',[id(551),id(1),id(11),draft,'Sample.pdf',`${id(1)}/${draft}/${id(551)}`,'application/pdf']);
 assert.equal((await db.query('select * from search_business_customers($1,$2)',[id(1),'50100240'])).rows.length,0);checks++;
 await denied('select record_sales_payment($1,$2)',[JSON.stringify({document_id:draft,amount:1}),id(510)]);
 await login(24);assert.equal((await db.query('select * from search_business_customers($1,$2)',[id(1),'Search'])).rows.length,0);checks++;
 assert.equal((await db.query('select * from named_print_templates where organization_id=$1',[id(1)])).rows.length,0);checks++;
 console.log(`PASS: ${checks} billing workspace assertions.`);
}finally{await db.close()}
