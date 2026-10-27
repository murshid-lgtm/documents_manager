begin;
-- Company-local eligibility; expiry/threshold deduplication keys are intentionally unchanged.
create or replace function public.customer_renewal_queue(target_org uuid,query_text text default '',record_type text default '',due_filter text default '30',customer_filter uuid default null,result_offset integer default 0,audience_filter text default 'all',channel_filter text default 'email')
returns table(id uuid,customer_id uuid,customer_name text,customer_type text,mobile text,email text,email_updates boolean,whatsapp_opt_in boolean,marketing_opt_in boolean,record_kind text,name text,reference text,document_type text,expires_on date,reminder_days integer,last_contacted_on date,snoozed_until date,service_id uuid,service_name text,parent_name text,reminder_enabled boolean)
language sql stable security invoker set search_path='' as $$
 with clock as (select (now() at time zone coalesce(nullif(timezone,''),'Asia/Qatar'))::date today from public.organizations where id=target_org)
 select r.id,r.customer_id,c.name,c.customer_type,c.mobile,c.email,c.email_updates,c.whatsapp_opt_in,c.marketing_opt_in,r.record_kind,r.name,r.reference,r.document_type,r.expires_on,r.reminder_days,r.last_contacted_on,r.snoozed_until,r.service_id,s.name,p.name,r.reminder_enabled
 from public.customer_records r cross join clock join public.crm_customers c on c.id=r.customer_id and c.organization_id=r.organization_id
 left join public.service_catalog s on s.id=r.service_id and s.organization_id=r.organization_id
 left join public.customer_records p on p.id=r.parent_id and p.organization_id=r.organization_id
 where r.organization_id=target_org and not r.archived and not c.archived and r.expires_on is not null
 and (customer_filter is null or r.customer_id=customer_filter)
 and (record_type='' or r.record_kind=record_type)
 and (audience_filter='all' or audience_filter='service' and (channel_filter='email' and c.email_updates and nullif(c.email,'') is not null or channel_filter='whatsapp' and c.whatsapp_opt_in and nullif(c.mobile,'') is not null) or audience_filter='marketing' and c.marketing_opt_in and (channel_filter='email' and c.email_updates and nullif(c.email,'') is not null or channel_filter='whatsapp' and c.whatsapp_opt_in and nullif(c.mobile,'') is not null))
 and (query_text='' or position(lower(left(query_text,200)) in lower(concat_ws(' ',r.name,r.reference,c.name,c.mobile,s.name,p.name)))>0)
 and (due_filter='all' or due_filter='overdue' and r.expires_on<clock.today or due_filter in ('7','30','60','90') and r.expires_on<=clock.today+case due_filter when '7' then 7 when '60' then 60 when '90' then 90 else 30 end or due_filter='due' and r.reminder_enabled and r.expires_on-r.reminder_days<=clock.today and coalesce(r.snoozed_until,clock.today)<=clock.today)
 order by r.expires_on,r.id limit 31 offset greatest(0,least(coalesce(result_offset,0),1000000))
$$;
revoke all on function public.customer_renewal_queue(uuid,text,text,text,uuid,integer,text,text) from public,anon;
grant execute on function public.customer_renewal_queue(uuid,text,text,text,uuid,integer,text,text) to authenticated;
create or replace function public.queue_document_expiry_emails() returns integer language plpgsql security definer set search_path='' as $$
declare r record;threshold integer;queued integer:=0;
begin
 for r in select x.*,c.email,c.email_updates,c.name customer_name,b.company_name,t.threshold from public.customer_records x join public.crm_customers c on c.id=x.customer_id and c.organization_id=x.organization_id join public.communication_settings s on s.organization_id=x.organization_id join public.organization_settings b on b.organization_id=x.organization_id join public.organizations o on o.id=x.organization_id and o.status='Active'
 cross join lateral (select (now() at time zone coalesce(nullif(o.timezone,''),'Asia/Qatar'))::date today) clock
 cross join lateral (select case when x.expires_on<clock.today then -1 else min(v) end threshold from unnest(s.reminder_offsets||array[x.reminder_days]) v where v>=x.expires_on-clock.today) t
 where not x.archived and not c.archived and x.reminder_enabled and x.expires_on is not null and s.email_enabled and s.document_reminders_enabled and s.event_types ? 'renewal' and c.email_updates and nullif(c.email,'') is not null and coalesce(x.snoozed_until,clock.today)<=clock.today and t.threshold is not null and (x.expires_on>=clock.today or -1=any(s.reminder_offsets))
 and not exists(select 1 from public.communication_outbox m where m.organization_id=x.organization_id and m.channel='email' and m.event_key='document-expiry:'||x.id::text||':'||x.expires_on::text||':'||t.threshold::text)
 order by x.expires_on,x.id limit 200 loop
 threshold:=r.threshold;
 perform public.enqueue_customer_update(r.organization_id,'renewal','document-expiry:'||r.id::text||':'||r.expires_on::text||':'||threshold::text,r.email,r.email_updates,null,false,jsonb_build_object('company',r.company_name,'name',r.customer_name,'customer_id',r.customer_id,'record_id',r.id,'document_name',r.name,'reference',r.reference,'expiry_date',r.expires_on,'date',r.expires_on,'event','renewal','status','Expires on '||r.expires_on::text,'automatic',true));queued:=queued+1;
 end loop;return queued;
end $$;
revoke all on function public.queue_document_expiry_emails() from public,anon,authenticated;
grant execute on function public.queue_document_expiry_emails() to service_role;
-- Invoker security preserves customer/tenant RLS; retries on the same company day are no-ops.
create or replace function public.mark_customer_record_contacted(target_org uuid,target_record uuid)
returns date language plpgsql security invoker set search_path='' as $$
declare today date; existing date;
begin
 if auth.uid() is null then raise exception 'Sign in to record a follow-up.'; end if;
 select (now() at time zone coalesce(nullif(timezone,''),'Asia/Qatar'))::date into today from public.organizations where id=target_org and status='Active';
 if today is null then raise exception 'Company unavailable.'; end if;
 select r.last_contacted_on into existing from public.customer_records r where r.id=target_record and r.organization_id=target_org and not r.archived for update;
 if not found then raise exception 'Record unavailable or access denied.'; end if;
 if existing is distinct from today then
  update public.customer_records set last_contacted_on=today where id=target_record and organization_id=target_org and not archived;
  if not found then raise exception 'Record unavailable or access denied.'; end if;
 end if;
 return today;
end $$;
revoke all on function public.mark_customer_record_contacted(uuid,uuid) from public,anon;
grant execute on function public.mark_customer_record_contacted(uuid,uuid) to authenticated;
commit;
notify pgrst,'reload schema';
