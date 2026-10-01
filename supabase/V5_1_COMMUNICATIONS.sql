-- Provider accounts are disabled by default. Secrets are stored in Supabase Vault, not client-readable settings.
begin;
create table if not exists public.communication_settings (
 organization_id uuid primary key references public.organizations(id),email_enabled boolean not null default false,
 email_provider text not null default 'brevo' check(email_provider in ('brevo','resend')),sender_name text,sender_email text,reply_to text,
 email_daily_limit integer not null default 100 check(email_daily_limit between 1 and 300),email_monthly_limit integer not null default 3000 check(email_monthly_limit between 1 and 100000),
 whatsapp_enabled boolean not null default false,whatsapp_phone_id text,whatsapp_business_id text,whatsapp_template text,whatsapp_language text not null default 'en',
 whatsapp_api_version text not null default 'v25.0',whatsapp_daily_limit integer not null default 100 check(whatsapp_daily_limit between 1 and 10000),country_code text not null default '974',
 event_types jsonb not null default '["case_created","case_status","payment","appointment","delivery","job_status","invoice_issued","renewal"]',
 updated_at timestamptz not null default now()
);
create table if not exists public.integration_credentials (
 organization_id uuid not null references public.organizations(id),kind text not null check(kind in ('email','whatsapp')),
 vault_secret_id uuid not null,updated_at timestamptz not null default now(),primary key(organization_id,kind)
);
create table if not exists public.communication_outbox (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),channel text not null check(channel in ('email','whatsapp')),
 event_type text not null,event_key text not null,recipient text not null,payload jsonb not null,
 status text not null default 'Queued' check(status in ('Queued','Processing','Accepted','Delivered','Read','Failed','Unconfirmed','Skipped')),
 attempts integer not null default 0,provider_message_id text,last_error text,next_attempt timestamptz not null default now(),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,channel,event_key)
);
create index if not exists communication_queue_idx on public.communication_outbox(next_attempt) where status='Queued';
create index if not exists communication_company_idx on public.communication_outbox(organization_id,created_at desc);
create index if not exists communication_provider_idx on public.communication_outbox(organization_id,provider_message_id);
create table if not exists public.communication_usage (
 key_hash text not null,period text not null,used integer not null default 0,primary key(key_hash,period)
);
create table if not exists public.communication_runtime (
 singleton boolean primary key default true check(singleton),worker_url text not null,token_secret_id uuid not null,updated_at timestamptz not null default now()
);
do $$ declare t text;begin foreach t in array array['communication_settings','integration_credentials','communication_outbox','communication_usage','communication_runtime'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
end loop;end $$;
drop policy if exists communications_read on public.communication_settings;create policy communications_read on public.communication_settings for select to authenticated using(public.is_current_session_valid() and public.is_organization_admin(organization_id));
drop policy if exists communications_read on public.communication_outbox;create policy communications_read on public.communication_outbox for select to authenticated using(public.is_current_session_valid() and public.is_organization_admin(organization_id));
grant select on public.communication_settings,public.communication_outbox to authenticated;
create or replace function public.save_communication_credentials(target_org uuid,credential_kind text,secret_json jsonb) returns void language plpgsql security definer set search_path='' as $$
declare secret_id uuid;
begin
 if credential_kind not in ('email','whatsapp') or jsonb_typeof(secret_json)<>'object' or length(secret_json::text)>16384 then raise exception 'Invalid integration credentials.';end if;
 perform 1 from public.organizations where id=target_org for update;if not found then raise exception 'Company not found.';end if;
 select vault_secret_id into secret_id from public.integration_credentials where organization_id=target_org and kind=credential_kind;
 if secret_id is null then select vault.create_secret(secret_json::text,'workspace-'||target_org::text||'-'||credential_kind) into secret_id;
 else perform vault.update_secret(secret_id,secret_json::text);end if;
 insert into public.integration_credentials(organization_id,kind,vault_secret_id) values(target_org,credential_kind,secret_id) on conflict(organization_id,kind) do update set updated_at=now();end $$;
create or replace function public.get_communication_credentials(target_org uuid,credential_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin select v.decrypted_secret::jsonb into result from public.integration_credentials c join vault.decrypted_secrets v on v.id=c.vault_secret_id where c.organization_id=target_org and c.kind=credential_kind;return result;end $$;
create or replace function public.configure_communication_worker(worker_url text,worker_token text) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin if worker_url !~ '^https://[a-zA-Z0-9.-]+/api/communications/worker$' or length(worker_token)<32 then raise exception 'Invalid worker configuration.';end if;
 select token_secret_id into sid from public.communication_runtime where singleton for update;
 if sid is null then select vault.create_secret(worker_token,'workspace-communications-worker') into sid;else perform vault.update_secret(sid,worker_token);end if;
 insert into public.communication_runtime(singleton,worker_url,token_secret_id) values(true,worker_url,sid) on conflict(singleton) do update set worker_url=excluded.worker_url,updated_at=now();end $$;
create or replace function public.wake_communication_worker() returns void language plpgsql security definer set search_path='' as $$
declare endpoint text;token text;
begin
 if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return;end if;
 select r.worker_url,v.decrypted_secret into endpoint,token from public.communication_runtime r join vault.decrypted_secrets v on v.id=r.token_secret_id where r.singleton;
 if endpoint is not null then execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)' using endpoint,'{}'::jsonb,jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token);end if;
 exception when others then raise warning 'Communication wake-up deferred.';
end $$;
create or replace function public.communication_wake_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.wake_communication_worker();return null;end $$;
drop trigger if exists communication_wake on public.communication_outbox;
create trigger communication_wake after insert on public.communication_outbox for each statement execute function public.communication_wake_trigger();
create or replace function public.communication_recipient_allowed(message_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare msg public.communication_outbox%rowtype;c public.cases%rowtype;customer public.crm_customers%rowtype;cfg public.communication_settings%rowtype;phone text;consent boolean;email text;
begin
 select * into msg from public.communication_outbox where id=message_id;
 if msg.id is null then return false;end if;
 select * into cfg from public.communication_settings where organization_id=msg.organization_id;
 if nullif(msg.payload->>'case_id','') is not null then
 select * into c from public.cases where id=(msg.payload->>'case_id')::uuid and organization_id=msg.organization_id;
 if c.id is null then return false;end if;
 consent:=case when msg.channel='email' then c.email_updates else c.whatsapp_opt_in end;email:=c.customer_email;phone:=c.mobile;
 if c.customer_id is not null then select * into customer from public.crm_customers where id=c.customer_id and organization_id=msg.organization_id;consent:=consent and not customer.archived and case when msg.channel='email' then customer.email_updates else customer.whatsapp_opt_in end;end if;
 elsif nullif(msg.payload->>'customer_id','') is not null then
 select * into customer from public.crm_customers where id=(msg.payload->>'customer_id')::uuid and organization_id=msg.organization_id;
 if customer.id is null or customer.archived then return false;end if;
 consent:=case when msg.channel='email' then customer.email_updates else customer.whatsapp_opt_in end;email:=customer.email;phone:=customer.mobile;
 else return false;end if;
 if not coalesce(consent,false) then return false;end if;
 if msg.channel='email' then return lower(email)=msg.recipient;end if;
 phone:=regexp_replace(coalesce(phone,''),'[^0-9]','','g');if length(phone)=8 then phone:=cfg.country_code||phone;end if;return phone=msg.recipient;
end $$;
create or replace function public.claim_communications(target_org uuid default null) returns setof public.communication_outbox language plpgsql security definer set search_path='' as $$
begin
 -- An interrupted request may already have reached the provider. Never blindly resend it.
 update public.communication_outbox set status='Unconfirmed',last_error='Delivery outcome requires review.',updated_at=now() where status='Processing' and updated_at<now()-interval '5 minutes';
 return query with picked as (select id from public.communication_outbox where status='Queued' and next_attempt<=now() and attempts<5 and (target_org is null or organization_id=target_org) order by created_at for update skip locked limit 3)
 update public.communication_outbox o set status='Processing',attempts=o.attempts+1,updated_at=now() from picked where o.id=picked.id returning o.*;
end $$;
create or replace function public.reserve_communication_quota(account_hash text,company_hash text,daily_cap integer,monthly_cap integer,company_daily_cap integer,company_monthly_cap integer) returns boolean language plpgsql security definer set search_path='' as $$
declare day_key text:=to_char(now() at time zone 'UTC','YYYY-MM-DD');month_key text:=to_char(now() at time zone 'UTC','YYYY-MM');entry record;n integer;
begin
 if account_hash !~ '^[a-f0-9]{64}$' or company_hash !~ '^[a-f0-9]{64}$' or least(daily_cap,monthly_cap,company_daily_cap,company_monthly_cap)<1 then raise exception 'Invalid quota configuration.';end if;
 -- Stable lock ordering makes shared-provider account limits safe across companies and concurrent workers.
 for entry in select * from (values(account_hash,day_key,daily_cap),(account_hash,month_key,monthly_cap),(company_hash,day_key,company_daily_cap),(company_hash,month_key,company_monthly_cap)) q(key,period,cap) order by key,period loop
 insert into public.communication_usage(key_hash,period) values(entry.key,entry.period) on conflict do nothing;
 select used into n from public.communication_usage where key_hash=entry.key and period=entry.period for update;
 if n>=entry.cap then return false;end if;
 end loop;
 update public.communication_usage set used=used+1 where (key_hash=account_hash or key_hash=company_hash) and period in(day_key,month_key);return true;
end $$;
create or replace function public.enqueue_customer_update(target_org uuid,event_name text,event_id text,email_address text,email_agreed boolean,phone_number text,whatsapp_agreed boolean,message_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare cfg public.communication_settings%rowtype;phone text;
begin
 select * into cfg from public.communication_settings where organization_id=target_org;
 if cfg.organization_id is null or not cfg.event_types ? event_name or not exists(select 1 from public.organizations where id=target_org and status='Active') then return;end if;
 if cfg.email_enabled and email_agreed and email_address ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then insert into public.communication_outbox(organization_id,channel,event_type,event_key,recipient,payload) values(target_org,'email',event_name,event_id,lower(email_address),message_payload) on conflict do nothing;end if;
 phone:=regexp_replace(coalesce(phone_number,''),'[^0-9]','','g');if length(phone)=8 then phone:=cfg.country_code||phone;end if;
 if cfg.whatsapp_enabled and whatsapp_agreed and phone ~ '^[1-9][0-9]{7,14}$' then insert into public.communication_outbox(organization_id,channel,event_type,event_key,recipient,payload) values(target_org,'whatsapp',event_name,event_id,phone,message_payload) on conflict do nothing;end if;
end $$;
create or replace function public.communication_event_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=to_jsonb(new);prev jsonb; c public.cases%rowtype;d public.sales_documents%rowtype;cust public.crm_customers%rowtype;b public.organization_settings%rowtype;event_name text;ref text;name text;status text;email text;phone text;email_ok boolean:=false;wa_ok boolean:=false;payload jsonb;event_id text;tracking text;
begin
 if tg_op='UPDATE' then prev:=to_jsonb(old);end if;
 if tg_table_name='cases' then
 if tg_op='UPDATE' and r->>'overall_status'=prev->>'overall_status' then return new;end if;
 c:=new;event_name:=case when tg_op='INSERT' then 'case_created' else 'case_status' end;
 elsif tg_table_name in ('payments','appointments','deliveries') then
 if tg_op='UPDATE' and tg_table_name='appointments' and r->>'status'=prev->>'status' and r->>'appointment_date'=prev->>'appointment_date' and r->>'appointment_time'=prev->>'appointment_time' then return new;end if;
 if tg_op='UPDATE' and tg_table_name='deliveries' then return new;end if;
 select * into c from public.cases where id=(r->>'case_id')::uuid;event_name:=case tg_table_name when 'payments' then 'payment' when 'appointments' then 'appointment' else 'delivery' end;
 elsif tg_table_name='sales_documents' then
 if new.status<>'Issued' or tg_op='UPDATE' and r->>'status'=prev->>'status' then return new;end if;
 d:=new;event_name:='invoice_issued';
 elsif tg_table_name='sales_payments' then
 if new.voided then return new;end if;select * into d from public.sales_documents where id=new.document_id;event_name:='payment';
 elsif tg_table_name='service_jobs' then
 if tg_op='UPDATE' and r->>'status'=prev->>'status' then return new;end if;
 event_name:='job_status';select * into cust from public.crm_customers where id=new.customer_id;
 end if;
 select * into b from public.organization_settings where organization_id=new.organization_id;
 if c.id is not null then ref:=c.tracking_reference;name:=c.customer_name;status:=coalesce(r->>'status',c.overall_status);email:=c.customer_email;phone:=c.mobile;email_ok:=c.email_updates;wa_ok:=c.whatsapp_opt_in;
 elsif d.id is not null then select * into cust from public.crm_customers where id=d.customer_id;ref:=d.document_no;name:=d.customer_name;status:=d.status;email:=coalesce(nullif(d.customer_email,''),cust.email);phone:=coalesce(nullif(d.customer_mobile,''),cust.mobile);email_ok:=coalesce(cust.email_updates,false);wa_ok:=coalesce(cust.whatsapp_opt_in,false);
 else ref:=r->>'job_no';name:=r->>'customer_name';status:=r->>'status';email:=cust.email;phone:=cust.mobile;email_ok:=coalesce(cust.email_updates,false);wa_ok:=coalesce(cust.whatsapp_opt_in,false);end if;
 -- Only customer-facing fields leave the database. Internal notes/custody are excluded.
 payload:=jsonb_build_object('company',b.company_name,'name',name,'reference',ref,'status',status,'amount',r->>'amount','date',coalesce(r->>'appointment_date',r->>'delivered_at',r->>'received_at'),'tracking_base',case when c.id is not null then b.tracking_base_url else null end,'event',event_name,'case_id',c.id,'customer_id',cust.id);
 event_id:=tg_table_name||':'||(r->>'id')||':'||case when tg_op='INSERT' then 'created' else coalesce(r->>'updated_at',now()::text) end;
 perform public.enqueue_customer_update(new.organization_id,event_name,event_id,email,email_ok,phone,wa_ok,payload);return new;
end $$;
do $$ declare t text;begin foreach t in array array['cases','appointments','sales_documents','service_jobs'] loop
 execute format('drop trigger if exists communication_event on public.%I',t);execute format('create trigger communication_event after insert or update on public.%I for each row execute function public.communication_event_trigger()',t);
end loop;
foreach t in array array['payments','deliveries','sales_payments'] loop execute format('drop trigger if exists communication_event on public.%I',t);execute format('create trigger communication_event after insert on public.%I for each row execute function public.communication_event_trigger()',t);end loop;end $$;
create or replace function public.queue_customer_renewals() returns void language plpgsql security definer set search_path='' as $$
declare j record;b public.organization_settings%rowtype;
begin for j in select job.organization_id,job.id,job.job_no,job.title,job.customer_name,job.renewal_date,job.customer_id,c.email,c.mobile,c.email_updates,c.whatsapp_opt_in from public.service_jobs job join public.crm_customers c on c.id=job.customer_id where job.status<>'Cancelled' and job.renewal_date=current_date+30 loop
 select * into b from public.organization_settings where organization_id=j.organization_id;
 perform public.enqueue_customer_update(j.organization_id,'renewal','renewal:'||j.id::text||':'||j.renewal_date::text,j.email,j.email_updates,j.mobile,j.whatsapp_opt_in,jsonb_build_object('company',b.company_name,'name',j.customer_name,'reference',j.job_no,'status','Renewal due on '||j.renewal_date::text,'event','renewal','customer_id',j.customer_id));
 end loop;end $$;
-- Service-role-only administration/dispatch; browser roles cannot forge messages or read provider secrets.
do $$ declare f text;begin foreach f in array array['save_communication_credentials(uuid,text,jsonb)','get_communication_credentials(uuid,text)','configure_communication_worker(text,text)','wake_communication_worker()','claim_communications(uuid)','communication_recipient_allowed(uuid)','reserve_communication_quota(text,text,integer,integer,integer,integer)','queue_customer_renewals()'] loop execute 'revoke all on function public.'||f||' from public,anon,authenticated';execute 'grant execute on function public.'||f||' to service_role';end loop;
foreach f in array array['communication_wake_trigger()','communication_event_trigger()','enqueue_customer_update(uuid,text,text,text,boolean,text,boolean,jsonb)'] loop execute 'revoke all on function public.'||f||' from public,anon,authenticated';end loop;end $$;
commit;
notify pgrst,'reload schema';
