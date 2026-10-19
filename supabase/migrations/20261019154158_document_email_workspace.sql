begin;
-- Visibility is separate from permission to send reminders.
drop function public.customer_renewal_queue(uuid,text,text,text,uuid,integer,text,text);

create function public.customer_renewal_queue(target_org uuid,query_text text default '',record_type text default '',due_filter text default '30',customer_filter uuid default null,result_offset integer default 0,audience_filter text default 'all',channel_filter text default 'email')
returns table(id uuid,customer_id uuid,customer_name text,customer_type text,mobile text,email text,email_updates boolean,whatsapp_opt_in boolean,marketing_opt_in boolean,record_kind text,name text,reference text,document_type text,expires_on date,reminder_days integer,last_contacted_on date,snoozed_until date,service_id uuid,service_name text,parent_name text,reminder_enabled boolean)
language sql stable security invoker set search_path='' as $$
 select r.id,r.customer_id,c.name,c.customer_type,c.mobile,c.email,c.email_updates,c.whatsapp_opt_in,c.marketing_opt_in,r.record_kind,r.name,r.reference,r.document_type,r.expires_on,r.reminder_days,r.last_contacted_on,r.snoozed_until,r.service_id,s.name,p.name,r.reminder_enabled
 from public.customer_records r join public.crm_customers c on c.id=r.customer_id and c.organization_id=r.organization_id
 left join public.service_catalog s on s.id=r.service_id and s.organization_id=r.organization_id
 left join public.customer_records p on p.id=r.parent_id and p.organization_id=r.organization_id
 where r.organization_id=target_org and not r.archived and not c.archived and r.expires_on is not null
 and (customer_filter is null or r.customer_id=customer_filter)
 and (record_type='' or r.record_kind=record_type)
 and (audience_filter='all' or audience_filter='service' and (channel_filter='email' and c.email_updates and nullif(c.email,'') is not null or channel_filter='whatsapp' and c.whatsapp_opt_in and nullif(c.mobile,'') is not null) or audience_filter='marketing' and c.marketing_opt_in and (channel_filter='email' and c.email_updates and nullif(c.email,'') is not null or channel_filter='whatsapp' and c.whatsapp_opt_in and nullif(c.mobile,'') is not null))
 and (query_text='' or position(lower(left(query_text,200)) in lower(concat_ws(' ',r.name,r.reference,c.name,c.mobile,s.name,p.name)))>0)
 and (due_filter='all' or due_filter='overdue' and r.expires_on<current_date or due_filter in ('7','30','60','90') and r.expires_on<=current_date+case due_filter when '7' then 7 when '60' then 60 when '90' then 90 else 30 end or due_filter='due' and r.reminder_enabled and r.expires_on-r.reminder_days<=current_date and coalesce(r.snoozed_until,current_date)<=current_date)
 order by r.expires_on,r.id limit 31 offset greatest(0,least(coalesce(result_offset,0),1000000))
$$;
revoke all on function public.customer_renewal_queue(uuid,text,text,text,uuid,integer,text,text) from public,anon;
grant execute on function public.customer_renewal_queue(uuid,text,text,text,uuid,integer,text,text) to authenticated;
create function public.customer_registry_rows(target_org uuid,query_text text default '',kind_filter text default '',customer_filter uuid default null,result_offset integer default 0) returns setof jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(r)||jsonb_build_object('customer_name',c.name,'customer_type',c.customer_type,'parent_name',p.name,'service_name',s.name) from public.customer_records r join public.crm_customers c on c.id=r.customer_id and c.organization_id=r.organization_id left join public.customer_records p on p.id=r.parent_id and p.organization_id=r.organization_id left join public.service_catalog s on s.id=r.service_id and s.organization_id=r.organization_id
 where r.organization_id=target_org and not r.archived and not c.archived and (kind_filter='' or r.record_kind=kind_filter) and (customer_filter is null or r.customer_id=customer_filter) and (query_text='' or position(lower(left(query_text,200)) in lower(concat_ws(' ',r.name,r.reference,c.name,p.name,s.name)))>0) order by c.name,r.name,r.id limit 31 offset greatest(0,least(coalesce(result_offset,0),1000000))
$$;
revoke all on function public.customer_registry_rows(uuid,text,text,uuid,integer) from public,anon;
grant execute on function public.customer_registry_rows(uuid,text,text,uuid,integer) to authenticated;

alter table public.communication_settings add column if not exists document_reminders_enabled boolean not null default false;
alter table public.communication_settings add column if not exists reminder_offsets integer[] not null default '{30,7,1,0}' check(cardinality(reminder_offsets) between 1 and 10 and reminder_offsets <@ array[365,180,90,60,45,30,21,15,14,10,7,5,3,2,1,0,-1]);
create table public.email_domains(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),provider_id text not null,name text not null,status text not null default 'not_started',records jsonb not null default '[]',updated_at timestamptz not null default now(),unique(id,organization_id),unique(organization_id,name));
create table public.email_senders(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),domain_id uuid not null,name text not null check(length(name) between 1 and 120),email text not null check(email ~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'),reply_to text,active boolean not null default true,created_at timestamptz not null default now(),unique(id,organization_id),unique(organization_id,email),foreign key(domain_id,organization_id) references public.email_domains(id,organization_id));
create index email_senders_domain_idx on public.email_senders(domain_id,organization_id);
create table public.email_templates(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),name text not null check(length(btrim(name)) between 1 and 120),purpose text not null check(purpose in ('case_created','case_status','payment','appointment','delivery','job_status','invoice_issued','renewal','invoice','receipt','quotation','ledger','statement','report','marketing','new_service')),subject text not null check(length(subject) between 1 and 200),body text not null check(length(body) between 1 and 10000),button_label text not null default 'Request service' check(length(button_label)<=80),sender_id uuid,is_default boolean not null default false,active boolean not null default true,updated_at timestamptz not null default now(),unique(id,organization_id),foreign key(sender_id,organization_id) references public.email_senders(id,organization_id));
create unique index email_templates_default_idx on public.email_templates(organization_id,purpose) where is_default and active;
create index email_templates_sender_idx on public.email_templates(sender_id,organization_id) where sender_id is not null;
create table public.service_requests(id uuid primary key,organization_id uuid not null references public.organizations(id),customer_id uuid not null,record_id uuid,service_id uuid,status text not null default 'Invited' check(status in ('Invited','Requested','Contacted','Completed','Cancelled')),expires_at timestamptz not null default now()+interval '45 days',lead_id uuid,created_at timestamptz not null default now(),requested_at timestamptz,unique(id,organization_id),foreign key(customer_id,organization_id) references public.crm_customers(id,organization_id),foreign key(record_id,organization_id,customer_id) references public.customer_records(id,organization_id,customer_id),foreign key(service_id,organization_id) references public.service_catalog(id,organization_id),foreign key(lead_id,organization_id) references public.crm_leads(id,organization_id));
create index service_requests_customer_idx on public.service_requests(customer_id,organization_id,created_at desc);
create index service_requests_record_idx on public.service_requests(record_id,organization_id,customer_id) where record_id is not null;
create index service_requests_service_idx on public.service_requests(service_id,organization_id) where service_id is not null;
create index service_requests_lead_idx on public.service_requests(lead_id,organization_id) where lead_id is not null;
create table public.email_attachments(id uuid primary key,organization_id uuid not null references public.organizations(id),name text not null check(length(name) between 1 and 180),content_base64 text not null check(length(content_base64)<=2100000),size_bytes integer not null check(size_bytes between 1 and 1500000),created_at timestamptz not null default now());
alter table public.communication_outbox add column if not exists attachment_id uuid references public.email_attachments(id);
create index communication_attachment_idx on public.communication_outbox(attachment_id) where attachment_id is not null;
-- All new management writes go through the authenticated administrator API.
do $$ declare t text;begin foreach t in array array['email_domains','email_senders','email_templates','service_requests','email_attachments'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 execute format('create policy email_workspace_read on public.%I for select to authenticated using(public.is_current_session_valid() and public.is_organization_admin(organization_id))',t);
 if t<>'email_attachments' then execute format('grant select on public.%I to authenticated',t);end if;
 end loop;end $$;
grant select(id,organization_id,name,size_bytes,created_at) on public.email_attachments to authenticated;

create function accounting_private.save_workspace_email_template(target_org uuid,input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid:=coalesce(nullif(input->>'id','')::uuid,gen_random_uuid());
begin
 if auth.uid() is null or not public.is_current_session_valid() or not public.is_organization_admin(target_org) then raise exception 'Administrator access required.';end if;
 perform pg_advisory_xact_lock(hashtextextended('email-template:'||target_org::text,0));
 if exists(select 1 from public.email_templates where id=target and organization_id<>target_org) then raise exception 'Template access denied.';end if;
 if coalesce((input->>'is_default')::boolean,false) then update public.email_templates set is_default=false where organization_id=target_org and purpose=input->>'purpose' and id<>target;end if;
 insert into public.email_templates(id,organization_id,name,purpose,subject,body,button_label,sender_id,is_default,active) values(target,target_org,btrim(input->>'name'),input->>'purpose',input->>'subject',input->>'body',coalesce(input->>'button_label','Request service'),nullif(input->>'sender_id','')::uuid,coalesce((input->>'is_default')::boolean,false),coalesce((input->>'active')::boolean,true)) on conflict(id) do update set name=excluded.name,purpose=excluded.purpose,subject=excluded.subject,body=excluded.body,button_label=excluded.button_label,sender_id=excluded.sender_id,is_default=excluded.is_default,active=excluded.active,updated_at=now() where public.email_templates.organization_id=target_org;return target;
end $$;
revoke all on function accounting_private.save_workspace_email_template(uuid,jsonb) from public,anon,authenticated;
grant execute on function accounting_private.save_workspace_email_template(uuid,jsonb) to authenticated;
create function public.save_workspace_email_template(target_org uuid,input jsonb) returns uuid language sql security invoker set search_path='' as $$select accounting_private.save_workspace_email_template(target_org,input)$$;
revoke all on function public.save_workspace_email_template(uuid,jsonb) from public,anon;
grant execute on function public.save_workspace_email_template(uuid,jsonb) to authenticated;
-- Preserve existing case/customer consent checks, then add marketing and document checks.
alter function public.communication_recipient_allowed(uuid) rename to communication_recipient_allowed_v51;
create function public.communication_recipient_allowed(message_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare m public.communication_outbox;c public.crm_customers;r public.customer_records;
begin
 if not public.communication_recipient_allowed_v51(message_id) then return false;end if;
 select * into m from public.communication_outbox where id=message_id;
 if m.event_type in ('marketing','new_service') then select * into c from public.crm_customers where id=(m.payload->>'customer_id')::uuid and organization_id=m.organization_id;if not coalesce(c.marketing_opt_in,false) then return false;end if;end if;
 if nullif(m.payload->>'record_id','') is not null then select * into r from public.customer_records where id=(m.payload->>'record_id')::uuid and organization_id=m.organization_id;if r.id is null or r.archived then return false;end if;if m.payload->>'automatic'='true' and (not r.reminder_enabled or r.expires_on::text is distinct from m.payload->>'expiry_date') then return false;end if;end if;
 return true;
end $$;
revoke all on function public.communication_recipient_allowed(uuid) from public,anon,authenticated;
grant execute on function public.communication_recipient_allowed(uuid) to service_role;
create function public.queue_document_expiry_emails() returns integer language plpgsql security definer set search_path='' as $$
declare r record;threshold integer;queued integer:=0;
begin
 for r in select x.*,c.email,c.email_updates,c.name customer_name,b.company_name,t.threshold from public.customer_records x join public.crm_customers c on c.id=x.customer_id and c.organization_id=x.organization_id join public.communication_settings s on s.organization_id=x.organization_id join public.organization_settings b on b.organization_id=x.organization_id join public.organizations o on o.id=x.organization_id and o.status='Active'
 cross join lateral (select case when x.expires_on<current_date then -1 else min(v) end threshold from unnest(s.reminder_offsets||array[x.reminder_days]) v where v>=x.expires_on-current_date) t
 where not x.archived and not c.archived and x.reminder_enabled and x.expires_on is not null and s.email_enabled and s.document_reminders_enabled and s.event_types ? 'renewal' and c.email_updates and nullif(c.email,'') is not null and coalesce(x.snoozed_until,current_date)<=current_date and t.threshold is not null and (x.expires_on>=current_date or -1=any(s.reminder_offsets))
 and not exists(select 1 from public.communication_outbox m where m.organization_id=x.organization_id and m.channel='email' and m.event_key='document-expiry:'||x.id::text||':'||x.expires_on::text||':'||t.threshold::text)
 order by x.expires_on,x.id limit 200 loop
 threshold:=r.threshold;
 perform public.enqueue_customer_update(r.organization_id,'renewal','document-expiry:'||r.id::text||':'||r.expires_on::text||':'||threshold::text,r.email,r.email_updates,null,false,jsonb_build_object('company',r.company_name,'name',r.customer_name,'customer_id',r.customer_id,'record_id',r.id,'document_name',r.name,'reference',r.reference,'expiry_date',r.expires_on,'date',r.expires_on,'event','renewal','status','Expires on '||r.expires_on::text,'automatic',true));queued:=queued+1;
 end loop;return queued;
end $$;
revoke all on function public.queue_document_expiry_emails() from public,anon,authenticated;
grant execute on function public.queue_document_expiry_emails() to service_role;
create function public.submit_customer_service_request(invitation uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.service_requests;c public.crm_customers;d public.customer_records;title text;new_lead uuid;
begin
 select * into r from public.service_requests where id=invitation for update;
 if r.id is null or r.status='Cancelled' or r.expires_at<now() then raise exception 'This request link has expired.';end if;
 if r.lead_id is not null then return r.lead_id;end if;
 select * into c from public.crm_customers where id=r.customer_id and organization_id=r.organization_id and not archived;
 if c.id is null or not exists(select 1 from public.organizations where id=r.organization_id and status='Active') then raise exception 'This request is unavailable.';end if;
 if r.record_id is not null then select * into d from public.customer_records where id=r.record_id and organization_id=r.organization_id and not archived;if d.id is null then raise exception 'This document is no longer available.';end if;end if;
 select name into title from public.service_catalog where id=r.service_id and organization_id=r.organization_id;
 insert into public.crm_leads(organization_id,branch_id,customer_id,title,contact_name,mobile,email,source,status,notes) values(r.organization_id,c.branch_id,c.id,left(coalesce(title,d.name,'Customer service request'),200),c.name,c.mobile,c.email,'Customer service link','New','Customer requested a service using their private request link.') returning id into new_lead;
 update public.service_requests set status='Requested',lead_id=new_lead,requested_at=now() where id=r.id;return new_lead;
end $$;
revoke all on function public.submit_customer_service_request(uuid) from public,anon,authenticated;
grant execute on function public.submit_customer_service_request(uuid) to service_role;
-- Delete attachment bytes after completion, and expire unsent attachments after seven days.
create function public.cleanup_email_attachments() returns void language sql security definer set search_path='' as $$
 update public.email_attachments a set content_base64='' where a.content_base64<>'' and (a.created_at<now()-interval '7 days' or a.created_at<now()-interval '1 hour' and not exists(select 1 from public.communication_outbox m where m.attachment_id=a.id and m.status in ('Queued','Processing')))
$$;
revoke all on function public.cleanup_email_attachments() from public,anon,authenticated;
grant execute on function public.cleanup_email_attachments() to service_role;
-- pg_cron is provisioned on production; clean installations without it remain portable.
do $$ begin if exists(select 1 from pg_namespace where nspname='cron') then
 execute $job$select cron.schedule('document-expiry-emails','0 * * * *','select public.queue_document_expiry_emails(); select public.cleanup_email_attachments();')$job$;
end if;end $$;
commit;
notify pgrst,'reload schema';
