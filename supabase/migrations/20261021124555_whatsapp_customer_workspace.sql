begin;
create table public.whatsapp_threads(
 organization_id uuid not null references public.organizations(id),customer_id uuid not null,
 status text not null default 'Open' check(status in ('Open','Waiting','Closed')),labels text[] not null default '{}',
 assigned_to uuid references public.profiles(id),follow_up_date date,starred boolean not null default false,
 last_contacted_at timestamptz,updated_at timestamptz not null default now(),
 primary key(organization_id,customer_id),foreign key(customer_id,organization_id) references public.crm_customers(id,organization_id),
 check(cardinality(labels)<=8 and length(array_to_string(labels,','))<=327)
);
create table public.whatsapp_activity(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,customer_id uuid not null,
 kind text not null check(kind in ('Note','Prepared','Incoming','Outgoing','Contacted')),
 body text not null check(length(btrim(body)) between 1 and 5000),request_key uuid not null,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 foreign key(organization_id,customer_id) references public.whatsapp_threads(organization_id,customer_id),unique(organization_id,request_key)
);
create table public.whatsapp_replies(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 name text not null check(length(btrim(name)) between 1 and 100),body text not null check(length(btrim(body)) between 1 and 4000),
 created_at timestamptz not null default now(),unique(organization_id,name)
);
create index whatsapp_followups on public.whatsapp_threads(organization_id,follow_up_date) where follow_up_date is not null and status<>'Closed';
create index whatsapp_assigned on public.whatsapp_threads(organization_id,assigned_to,status);
create index whatsapp_activity_customer on public.whatsapp_activity(organization_id,customer_id,created_at desc,id);
alter table public.whatsapp_threads enable row level security;alter table public.whatsapp_activity enable row level security;alter table public.whatsapp_replies enable row level security;
create policy whatsapp_thread_read on public.whatsapp_threads for select to authenticated using(exists(select 1 from public.crm_customers c where c.id=customer_id and c.organization_id=whatsapp_threads.organization_id and not c.archived and public.business_access(c.organization_id,c.branch_id,'crm')));
create policy whatsapp_thread_insert on public.whatsapp_threads for insert to authenticated with check(exists(select 1 from public.crm_customers c where c.id=customer_id and c.organization_id=whatsapp_threads.organization_id and not c.archived and public.business_access(c.organization_id,c.branch_id,'crm')));
create policy whatsapp_thread_update on public.whatsapp_threads for update to authenticated using(exists(select 1 from public.crm_customers c where c.id=customer_id and c.organization_id=whatsapp_threads.organization_id and not c.archived and public.business_access(c.organization_id,c.branch_id,'crm'))) with check(exists(select 1 from public.crm_customers c where c.id=customer_id and c.organization_id=whatsapp_threads.organization_id and not c.archived and public.business_access(c.organization_id,c.branch_id,'crm')));
create policy whatsapp_activity_read on public.whatsapp_activity for select to authenticated using(exists(select 1 from public.whatsapp_threads t where t.customer_id=whatsapp_activity.customer_id and t.organization_id=whatsapp_activity.organization_id));
create policy whatsapp_activity_insert on public.whatsapp_activity for insert to authenticated with check(created_by=auth.uid() and exists(select 1 from public.whatsapp_threads t where t.customer_id=whatsapp_activity.customer_id and t.organization_id=whatsapp_activity.organization_id));
create policy whatsapp_note_edit on public.whatsapp_activity for update to authenticated using((kind='Note' and created_by=auth.uid() or public.is_organization_admin(organization_id)) and exists(select 1 from public.whatsapp_threads t where t.customer_id=whatsapp_activity.customer_id and t.organization_id=whatsapp_activity.organization_id)) with check(exists(select 1 from public.whatsapp_threads t where t.customer_id=whatsapp_activity.customer_id and t.organization_id=whatsapp_activity.organization_id));
create policy whatsapp_note_delete on public.whatsapp_activity for delete to authenticated using((kind='Note' and created_by=auth.uid() or public.is_organization_admin(organization_id)) and exists(select 1 from public.whatsapp_threads t where t.customer_id=whatsapp_activity.customer_id and t.organization_id=whatsapp_activity.organization_id));
create policy whatsapp_reply_read on public.whatsapp_replies for select to authenticated using(public.business_access(organization_id,public.current_profile_branch_id(),'crm'));
create policy whatsapp_reply_write on public.whatsapp_replies for all to authenticated using(public.is_organization_admin(organization_id) and public.business_access(organization_id,public.current_profile_branch_id(),'crm')) with check(public.is_organization_admin(organization_id) and public.business_access(organization_id,public.current_profile_branch_id(),'crm'));
revoke all on public.whatsapp_threads,public.whatsapp_activity,public.whatsapp_replies from public,anon,authenticated;
grant select,insert on public.whatsapp_threads to authenticated;grant update(status,labels,assigned_to,follow_up_date,starred,last_contacted_at,updated_at) on public.whatsapp_threads to authenticated;
grant select,insert,delete on public.whatsapp_activity to authenticated;grant update(body) on public.whatsapp_activity to authenticated;
grant select,insert,delete on public.whatsapp_replies to authenticated;grant update(name,body) on public.whatsapp_replies to authenticated;
grant all on public.whatsapp_threads,public.whatsapp_activity,public.whatsapp_replies to service_role;
create function public.validate_whatsapp_thread() returns trigger language plpgsql security invoker set search_path='' as $$
declare label text;begin
 if new.assigned_to is not null and not exists(select 1 from public.profiles p where p.id=new.assigned_to and p.organization_id=new.organization_id and p.is_active and not p.is_platform_super_admin) then raise exception 'Choose an active team member in this company.';end if;
 foreach label in array new.labels loop if label is null or length(btrim(label)) not between 1 and 40 then raise exception 'Use labels between 1 and 40 characters.';end if;end loop;
 new.updated_at:=now();return new;end $$;
revoke all on function public.validate_whatsapp_thread() from public,anon,authenticated;
create trigger whatsapp_thread_validation before insert or update on public.whatsapp_threads for each row execute function public.validate_whatsapp_thread();
create function public.save_whatsapp_thread(target_org uuid,customer uuid,input jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.crm_customers c where c.id=customer and c.organization_id=target_org and not c.archived and public.business_access(c.organization_id,c.branch_id,'crm')) then raise exception 'This customer is unavailable.';end if;
 if jsonb_typeof(input->'labels') is distinct from 'array' then raise exception 'Choose valid labels.';end if;
 insert into public.whatsapp_threads(organization_id,customer_id,status,labels,assigned_to,follow_up_date,starred)
 values(target_org,customer,coalesce(input->>'status','Open'),array(select jsonb_array_elements_text(input->'labels')),nullif(input->>'assigned_to','')::uuid,nullif(input->>'follow_up_date','')::date,coalesce((input->>'starred')::boolean,false))
 on conflict(organization_id,customer_id) do update set status=excluded.status,labels=excluded.labels,assigned_to=excluded.assigned_to,follow_up_date=excluded.follow_up_date,starred=excluded.starred;
end $$;
create function public.record_whatsapp_activity(target_org uuid,customer uuid,event_kind text,message text,request_key uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;begin
 if not exists(select 1 from public.crm_customers c where c.id=customer and c.organization_id=target_org and not c.archived and public.business_access(c.organization_id,c.branch_id,'crm')) then raise exception 'This customer is unavailable.';end if;
 insert into public.whatsapp_threads(organization_id,customer_id) values(target_org,customer) on conflict do nothing;
 insert into public.whatsapp_activity(organization_id,customer_id,kind,body,request_key,created_by) values(target_org,customer,event_kind,btrim(message),request_key,auth.uid()) on conflict on constraint whatsapp_activity_organization_id_request_key_key do nothing returning id into result;
 if result is not null and event_kind in ('Outgoing','Contacted') then update public.whatsapp_threads set last_contacted_at=now() where organization_id=target_org and customer_id=customer;end if;
 if result is null then select id into result from public.whatsapp_activity a where a.organization_id=target_org and a.request_key=record_whatsapp_activity.request_key;end if;return result;
end $$;
create function public.whatsapp_crm_list(target_org uuid,search text default '',bucket text default 'all',label_filter text default '',page_number integer default 0,today date default current_date) returns jsonb language sql stable security invoker set search_path='' as $$
 with base as materialized(
 select c.id,c.name,c.mobile,c.email,c.company,c.branch_id,c.whatsapp_opt_in,coalesce(t.status,'Open') status,coalesce(t.labels,'{}') labels,t.assigned_to,t.follow_up_date,coalesce(t.starred,false) starred,t.last_contacted_at,t.updated_at
 from public.crm_customers c left join public.whatsapp_threads t on t.organization_id=c.organization_id and t.customer_id=c.id
 where c.organization_id=target_org and not c.archived and nullif(btrim(c.mobile),'') is not null and public.business_access(c.organization_id,c.branch_id,'crm')
 ), filtered as(select * from base b where (b.name ilike '%'||left(search,100)||'%' or b.mobile ilike '%'||left(search,100)||'%' or b.company ilike '%'||left(search,100)||'%')
 and (label_filter='' or label_filter=any(b.labels)) and case bucket when 'due' then b.follow_up_date<=today and b.status<>'Closed' when 'mine' then b.assigned_to=auth.uid() when 'starred' then b.starred when 'Open' then b.status='Open' when 'Waiting' then b.status='Waiting' when 'Closed' then b.status='Closed' else true end)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)) from(select * from filtered order by starred desc,name,id limit 30 offset greatest(0,least(page_number,10000))*30)p),'[]'::jsonb),'total',(select count(*) from filtered),'counts',(select jsonb_build_object('all',count(*),'due',count(*) filter(where follow_up_date<=today and status<>'Closed'),'mine',count(*) filter(where assigned_to=auth.uid()),'open',count(*) filter(where status='Open')) from base),'labels',coalesce((select jsonb_agg(l order by l) from(select distinct unnest(labels) l from base)x),'[]'::jsonb))
$$;
revoke all on function public.save_whatsapp_thread(uuid,uuid,jsonb),public.record_whatsapp_activity(uuid,uuid,text,text,uuid),public.whatsapp_crm_list(uuid,text,text,text,integer,date) from public,anon;
grant execute on function public.save_whatsapp_thread(uuid,uuid,jsonb),public.record_whatsapp_activity(uuid,uuid,text,text,uuid),public.whatsapp_crm_list(uuid,text,text,text,integer,date) to authenticated,service_role;
commit;
notify pgrst,'reload schema';
