import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';import assert from 'node:assert/strict';
const db=new PGlite();let checks=0;const org='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003';
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table organizations(id uuid primary key,status text);create table profiles(id uuid primary key);create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),decrypted_secret text,name text);create view vault.decrypted_secrets as select id,decrypted_secret from vault.secrets;create function vault.create_secret(value text,secret_name text) returns uuid language sql as $$insert into vault.secrets(decrypted_secret,name) values(value,secret_name) returning id$$;create function vault.update_secret(sid uuid,value text) returns void language sql as $$update vault.secrets set decrypted_secret=value where id=sid$$;grant usage on schema public to service_role;`);
 await db.exec(fs.readFileSync('supabase/V5_23_WHATSAPP_TEST_LAB.sql','utf8'));
 await db.query('insert into organizations values($1,$3),($2,$3)',[org,other,'Active']);
 const cfg={phone_id:'123456789',business_id:'987654321',api_version:'v25.0',recipients:['97470000001'],enabled:true},secret={access_token:'test-fixture-only',app_secret:'a'.repeat(32)};
 const save=(target=org,input=cfg,key=secret)=>db.query('select save_whatsapp_test_connection($1,$2,$3)',[target,JSON.stringify(input),key?JSON.stringify(key):null]);
 await save();assert.equal((await db.query('select count(*) n from vault.secrets')).rows[0].n,1);checks++;
 await save(org,cfg,null);assert.equal((await db.query('select count(*) n from vault.secrets')).rows[0].n,1);checks++;
 await assert.rejects(()=>save(other,cfg,null));checks++;
 for(const recipients of [[],['bad'],Array.from({length:6},(_,i)=>'9747000000'+i)]){await assert.rejects(()=>save(org,{...cfg,recipients},null));checks++}
 await save(other,cfg,secret);
 await db.exec('set role authenticated');for(const sql of ['select * from whatsapp_test_connections','select * from whatsapp_test_messages','select whatsapp_test_secret($1)','select save_whatsapp_test_connection($1,$2,$3)','select whatsapp_test_delivery($1,$2,$3,$4,$5,$6)']){await assert.rejects(()=>db.query(sql,Array.from({length:(sql.match(/\$\d/g)||[]).length},()=>null)));checks++}await db.exec('reset role');
 await db.query("insert into whatsapp_test_messages(id,organization_id,phone_id,peer,direction,kind,body,status) values($1,$2,$3,$4,'outgoing','template','Hello','Processing')",[id,org,cfg.phone_id,cfg.recipients[0]]);
 const delivery=(status,target=org,phone=cfg.phone_id,request=id,provider='wamid.fixture')=>db.query('select whatsapp_test_delivery($1,$2,$3,$4,$5,$6)',[target,phone,provider,request,status,null]);
 await delivery('Delivered',other);await delivery('Read',org,'111111111');assert.equal((await db.query('select status from whatsapp_test_messages')).rows[0].status,'Processing');checks++;
 await delivery('Delivered');await delivery('Accepted');assert.equal((await db.query('select status from whatsapp_test_messages')).rows[0].status,'Delivered');checks++;
 await delivery('Read');await delivery('Failed');await delivery('Unconfirmed');assert.equal((await db.query('select status from whatsapp_test_messages')).rows[0].status,'Read');checks++;
 await delivery('Accepted',org,cfg.phone_id,id,'wamid.different');assert.equal((await db.query('select provider_id from whatsapp_test_messages')).rows[0].provider_id,'wamid.fixture');checks++;
 const rls=await db.query("select count(*) n from pg_class where relname in ('whatsapp_test_messages','whatsapp_test_connections') and relrowsecurity");assert.equal(rls.rows[0].n,2);checks++;
 console.log(`PASS: ${checks} WhatsApp sandbox database checks: encrypted credential isolation, server-only grants, recipient limits, cross-company delivery isolation and webhook ordering.`);
}finally{await db.close()}
