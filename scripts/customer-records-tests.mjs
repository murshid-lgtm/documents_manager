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
 const base={organization_id:id(1),branch_id:id(11)};
 const add=async(input,n)=>(await db.query('select quick_add_customer($1,$2) id',[JSON.stringify({...base,...input}),id(n)])).rows[0].id;
 const personal=await add({name:'Personal client'},601),company=await add({name:'Company client',customer_type:'Company',company:'Company LLC'},602);
 assert.equal(await add({name:'Retry ignored',customer_type:'Personal'},602),company);checks++;
 let c=(await db.query('select * from crm_customers where id=$1',[personal])).rows[0];assert.equal(c.customer_type,'Personal');assert.equal(c.marketing_opt_in,false);assert.equal(c.marketing_consent_at,null);checks+=3;
 await denied('select quick_add_customer($1,$2)',[JSON.stringify({...base,name:'Invalid type',customer_type:'Bad'}),id(603)]);
 const addRecord=async(customer,kind,name,extra={})=>(await db.query('insert into customer_records(organization_id,customer_id,record_kind,name,reference,expires_on,details) values($1,$2,$3,$4,$5,current_date+15,$6) returning id',[id(1),customer,kind,name,'REF-123',JSON.stringify(extra)])).rows[0].id;
 const staff=await addRecord(company,'Staff','Company employee',{position:'Manager'}),vehicle=await addRecord(company,'Vehicle','Company car',{plate:'12345'}),doc=await addRecord(company,'Document','Trade licence');
 const passport=await addRecord(company,'Document','Staff passport');await db.query('update customer_records set parent_id=$2 where id=$1',[passport,staff]);
 const personalDoc=await addRecord(personal,'Document','Optional passport');checks+=2;
 await denied('insert into customer_records(organization_id,customer_id,record_kind,name) values($1,$2,$3,$4)',[id(1),personal,'Staff','Not a company']);
 await denied('update customer_records set parent_id=$2 where id=$1',[personalDoc,vehicle]);
 await denied('update customer_records set parent_id=$2 where id=$1',[passport,doc]);
 await denied('update customer_records set customer_id=$2 where id=$1',[doc,personal]);
 await denied("update crm_customers set customer_type='Personal' where id=$1",[company]);
 await denied("update customer_records set issued_on=current_date+20 where id=$1",[doc]);
 const queue=async(audience='all',channel='email',due='30')=>(await db.query('select * from customer_renewal_queue($1,$2,$3,$4,null,0,$5,$6)',[id(1),'','',due,audience,channel])).rows;
 assert.equal((await queue()).length,5);assert.equal((await queue('marketing')).length,0);checks+=2;
 await db.query('update crm_customers set marketing_opt_in=true,email_updates=true,email=$2 where id=$1',[company,'company@example.test']);
 assert.equal((await queue('marketing')).length,4);assert.equal((await queue('marketing','whatsapp')).length,0);checks+=2;
 c=(await db.query('select * from crm_customers where id=$1',[company])).rows[0];assert(c.marketing_consent_at);checks++;
 await db.query('update crm_customers set marketing_opt_in=false where id=$1',[company]);assert.equal((await queue('marketing')).length,0);assert.equal((await queue('service')).length,4);checks+=2;
 await db.query('update customer_records set expires_on=current_date+365 where id=$1',[doc]);assert.equal((await queue()).length,4);checks++;
 assert.equal((await db.query('select * from customer_record_renewals where record_id=$1',[doc])).rows.length,1);checks++;
 await denied('delete from customer_record_renewals where record_id=$1',[doc]);
 await denied('insert into customer_record_renewals(organization_id,customer_id,record_id) values($1,$2,$3)',[id(1),company,doc]);
 const file=id(610),path=`${id(1)}/${company}/${doc}/${file}`;
 await db.query("insert into customer_record_files(id,organization_id,customer_id,record_id,name,object_path,size_bytes,content_type) values($1,$2,$3,$4,'Licence.pdf',$5,100,'application/pdf')",[file,id(1),company,doc,path]);
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['customer-records',path]);checks++;
 await denied('insert into storage.objects(bucket_id,name) values($1,$2)',['customer-records','another-company/secret']);
 await denied("insert into customer_record_files(organization_id,customer_id,record_id,name,object_path,size_bytes,content_type) values($1,$2,$3,'Bad','wrong-path',100,'application/pdf')",[id(1),company,doc]);
 await login(23);assert.equal((await queue()).length,0);assert.equal((await db.query('select * from customer_records')).rows.length,0);assert.equal((await db.query('select * from customer_record_files')).rows.length,0);assert.equal((await db.query('select * from storage.objects')).rows.length,0);checks+=4;
 await denied('insert into customer_records(organization_id,customer_id,record_kind,name) values($1,$2,$3,$4)',[id(1),company,'Document','Wrong branch']);
 await login(24);assert.equal((await queue()).length,0);assert.equal((await db.query('select * from customer_records')).rows.length,0);checks+=2;
 await login(25);assert.equal((await queue()).length,4);await db.query('update customer_records set last_contacted_on=current_date where id=$1',[passport]);checks+=2;
 await login(21);await db.query('update customer_records set reminder_enabled=false where id=$1',[personalDoc]);assert.equal((await queue()).length,3);checks++;
 await db.query('update customer_records set archived=true where id=$1',[vehicle]);assert.equal((await queue()).length,2);checks++;
 await db.query('update customer_records set snoozed_until=current_date+20,expires_on=current_date+1 where id=$1',[passport]);assert.equal((await queue('all','email','due')).length,1);checks++;
 await db.query('update customer_records set archived=true where id=$1',[staff]);assert.equal((await db.query('select archived from customer_records where id=$1',[passport])).rows[0].archived,true);assert.equal((await queue()).length,0);checks+=2;
 await system();await db.exec('set role anon');await denied('select * from customer_records');await denied('select * from customer_record_files');await denied('select * from customer_renewal_queue($1)',[id(1)]);
 console.log(`PASS: ${checks} customer register checks: optional personal/company data, linked staff/vehicles/documents, expiry history, consent withdrawal, channel audiences, scoped files, tenant/branch isolation and anonymous denial.`);
}catch(e){console.error(e.message);process.exitCode=1}finally{await db.close()}
