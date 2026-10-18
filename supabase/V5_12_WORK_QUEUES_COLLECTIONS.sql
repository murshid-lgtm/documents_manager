-- Additive operational read models and collection follow-ups. Invoices remain canonical.
begin;
create index if not exists cases_work_due on public.cases(organization_id,promise_date,id);
create index if not exists jobs_work_due on public.service_jobs(organization_id,due_date,id);
create index if not exists invoices_outstanding_due on public.sales_documents(organization_id,due_date,id) where kind='Invoice' and status='Issued';

create or replace function public.workspace_work_queue(target_org uuid,queue_name text default 'all',query_text text default '',result_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
 with viewer as (select id,full_name from public.profiles where id=auth.uid() and is_active),
 clock as (select (now() at time zone coalesce(nullif(timezone,''),'Asia/Qatar'))::date as today from public.organizations where id=target_org),
 work as (
 select 'attestation'::text as type,c.id,c.tracking_reference::text as reference,c.customer_name as title,c.mobile,c.overall_status as status,c.assigned_to::text as owner,c.promise_date as due_date,c.branch_id,c.updated_at,
 0::bigint as completed,0::bigint as stages
 from public.cases c where c.organization_id=target_org and public.business_access(c.organization_id,c.branch_id,'cases') and c.overall_status not in ('Delivered','Cancelled')
 union all
 select 'service',j.id,j.job_no,j.title||' · '||j.customer_name,null,j.status,j.assigned_to,j.due_date,j.branch_id,j.updated_at,
 (select count(*) from jsonb_array_elements(j.stages) s where s->>'status'='Completed'),jsonb_array_length(j.stages)::bigint
 from public.service_jobs j where j.organization_id=target_org and public.business_access(j.organization_id,j.branch_id,'services') and j.status not in ('Completed','Cancelled')
 union all
 select 'appointment',a.id,coalesce(c.tracking_reference,'Appointment'),coalesce(a.authority,'Appointment')||' · '||coalesce(c.customer_name,''),c.mobile,a.status,a.assigned_to,a.appointment_date,a.branch_id,a.updated_at,0::bigint,0::bigint
 from (select a.*,c.branch_id from public.appointments a join public.cases c on c.id=a.case_id and c.organization_id=a.organization_id where a.organization_id=target_org) a
 join public.cases c on c.id=a.case_id
 where public.business_access(a.organization_id,a.branch_id,'appointments') and a.status not in ('Completed','Cancelled','Missed')
 ), marked as (
 select w.*,clock.today,w.due_date<clock.today as overdue,w.due_date=clock.today as due_today,
 (w.owner=(select id::text from viewer) or (nullif(btrim(w.owner),'') is not null and lower(btrim(w.owner))=lower((select full_name from viewer)))) as mine
 from work w cross join clock
 ), filtered as (
 select * from marked where (coalesce(query_text,'')='' or concat_ws(' ',reference,title,mobile,owner) ilike '%'||left(query_text,100)||'%')
 and case queue_name when 'mine' then mine when 'overdue' then overdue when 'today' then due_today when 'unassigned' then nullif(btrim(owner),'') is null when 'attestation' then type='attestation' when 'service' then type='service' when 'appointment' then type='appointment' else true end
 ) select jsonb_build_object('summary',(select jsonb_build_object('all',count(*),'mine',count(*) filter(where mine),'overdue',count(*) filter(where overdue),'today',count(*) filter(where due_today),'unassigned',count(*) filter(where nullif(btrim(owner),'') is null)) from marked),
 'total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(r)||case when r.type='attestation' then jsonb_build_object('completed',(select count(*) from public.documents d join public.document_stages s on s.document_id=d.id where d.case_id=r.id and s.status='Completed'),'stages',(select count(*) from public.documents d join public.document_stages s on s.document_id=d.id where d.case_id=r.id and s.status not in ('Not Required','Cancelled'))) else '{}'::jsonb end) from (select * from filtered order by overdue desc nulls last,due_date nulls last,updated_at desc,id limit 30 offset greatest(0,least(result_offset,1000000))) r),'[]'::jsonb))
$$;
revoke all on function public.workspace_work_queue(uuid,text,text,integer) from public,anon;
grant execute on function public.workspace_work_queue(uuid,text,text,integer) to authenticated;

create table if not exists public.collection_followups(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 document_id uuid not null,branch_id uuid,created_by uuid not null default auth.uid() references public.profiles(id),
 outcome text not null check(outcome in ('Contacted','No answer','Promise to pay','Disputed','Resolved')),
 next_follow_up date,promise_date date,notes text check(length(notes)<=2000),created_at timestamptz not null default now(),
 foreign key(document_id,organization_id) references public.sales_documents(id,organization_id)
);
create index if not exists collection_followups_document on public.collection_followups(organization_id,document_id,created_at desc);
alter table public.collection_followups enable row level security;
revoke all on public.collection_followups from anon,authenticated;
grant select,insert on public.collection_followups to authenticated;
drop policy if exists collection_read on public.collection_followups;
create policy collection_read on public.collection_followups for select to authenticated using(exists(select 1 from public.sales_documents d where d.id=document_id and d.organization_id=collection_followups.organization_id and public.business_access(d.organization_id,d.branch_id,'sales')));
drop policy if exists collection_create on public.collection_followups;
create policy collection_create on public.collection_followups for insert to authenticated with check(created_by=auth.uid() and exists(select 1 from public.sales_documents d where d.id=document_id and d.organization_id=collection_followups.organization_id and d.branch_id is not distinct from collection_followups.branch_id and d.kind='Invoice' and d.status='Issued' and public.business_access(d.organization_id,d.branch_id,'sales')));

create or replace function public.workspace_collections(target_org uuid,bucket_name text default 'all',query_text text default '',result_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
 with clock as (select (now() at time zone coalesce(nullif(timezone,''),'Asia/Qatar'))::date today from public.organizations where id=target_org),
 invoices as (select d.id,d.branch_id,d.customer_id,d.document_no,d.customer_name,d.customer_mobile,d.document_date,d.due_date,d.total,d.paid_total,greatest(0,d.total-d.paid_total) balance,
 greatest(0,clock.today-d.due_date) overdue_days,
 case when d.due_date is null then 'no-date' when d.due_date>=clock.today then 'current' when clock.today-d.due_date<=30 then '1-30' when clock.today-d.due_date<=60 then '31-60' when clock.today-d.due_date<=90 then '61-90' else '90+' end bucket,
 (select to_jsonb(f) from public.collection_followups f where f.document_id=d.id and f.organization_id=d.organization_id order by f.created_at desc,f.id desc limit 1) follow_up
 from public.sales_documents d cross join clock where d.organization_id=target_org and d.kind='Invoice' and d.status='Issued' and d.total>d.paid_total and public.business_access(d.organization_id,d.branch_id,'sales')),
 filtered as (select * from invoices where (coalesce(query_text,'')='' or concat_ws(' ',document_no,customer_name,customer_mobile) ilike '%'||left(query_text,100)||'%') and (bucket_name='all' or bucket=bucket_name or (bucket_name='follow-up' and (follow_up->>'next_follow_up')::date<=(select today from clock))))
 select jsonb_build_object('summary',(select jsonb_build_object('outstanding',coalesce(sum(balance),0),'overdue',coalesce(sum(balance) filter(where overdue_days>0),0),'invoices',count(*),'customers',count(distinct coalesce(customer_id,id)),'buckets',jsonb_build_object('current',coalesce(sum(balance) filter(where bucket='current'),0),'1-30',coalesce(sum(balance) filter(where bucket='1-30'),0),'31-60',coalesce(sum(balance) filter(where bucket='31-60'),0),'61-90',coalesce(sum(balance) filter(where bucket='61-90'),0),'90+',coalesce(sum(balance) filter(where bucket='90+'),0),'no-date',coalesce(sum(balance) filter(where bucket='no-date'),0))) from invoices),
 'total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from filtered order by overdue_days desc nulls last,balance desc,id limit 30 offset greatest(0,least(result_offset,1000000))) r),'[]'::jsonb))
$$;
revoke all on function public.workspace_collections(uuid,text,text,integer) from public,anon;
grant execute on function public.workspace_collections(uuid,text,text,integer) to authenticated;
commit;
