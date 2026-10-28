begin;
-- Evaluate viewer/module permissions and custody membership once per queue request.
create or replace function public.workspace_work_queue(target_org uuid,queue_name text default 'all',query_text text default '',result_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
 with viewer as materialized (select id,full_name,branch_id,role,is_platform_super_admin from public.profiles where id=(select auth.uid()) and is_active),
 permissions as materialized (select public.business_access(target_org,public.current_profile_branch_id(),'cases') cases_allowed,public.business_access(target_org,public.current_profile_branch_id(),'appointments') appointments_allowed,public.business_access(target_org,public.current_profile_branch_id(),'services') services_allowed),
 received as materialized (select distinct i.case_id from public.custody_transfers t join public.custody_transfer_items i on i.transfer_id=t.id join public.branches b on b.id=t.to_branch_id join public.cases c on c.id=i.case_id
 where t.organization_id=target_org and t.to_branch_id=(select branch_id from viewer) and t.status='Received' and i.receive_status in ('Verified','Damaged')
 and (c.physical_location=b.name or exists(select 1 from public.documents d where d.case_id=c.id and d.physical_location=b.name and (i.document_id is null or i.document_id=d.id)))),
 clock as (select (now() at time zone coalesce(nullif(timezone,''),'Asia/Qatar'))::date as today from public.organizations where id=target_org),
 work as (
 select 'attestation'::text as type,c.id,c.tracking_reference::text as reference,c.customer_name as title,c.mobile,c.overall_status as status,coalesce((select p.full_name from public.profiles p where p.id=c.assigned_profile_id),c.assigned_to)::text as owner,c.assigned_profile_id,c.promise_date as due_date,c.branch_id,c.updated_at,
 0::bigint as completed,0::bigint as stages
 from public.cases c where c.organization_id=target_org and (select cases_allowed from permissions) and ((select role='admin' or is_platform_super_admin from viewer) or c.branch_id=(select branch_id from viewer) or c.id in (select case_id from received)) and c.overall_status not in ('Delivered','Cancelled')
 union all
 select 'service',j.id,j.job_no,j.title||' · '||j.customer_name,null,j.status,coalesce((select p.full_name from public.profiles p where p.id=j.assigned_profile_id),j.assigned_to),j.assigned_profile_id,j.due_date,j.branch_id,j.updated_at,
 (select count(*) from jsonb_array_elements(j.stages) s where s->>'status'='Completed'),jsonb_array_length(j.stages)::bigint
 from public.service_jobs j where j.organization_id=target_org and (select services_allowed from permissions) and ((select role='admin' or is_platform_super_admin from viewer) or j.branch_id=(select branch_id from viewer)) and j.status not in ('Completed','Cancelled')
 union all
 select 'appointment',a.id,coalesce(c.tracking_reference,'Appointment'),coalesce(a.authority,'Appointment')||' · '||coalesce(c.customer_name,''),c.mobile,a.status,coalesce((select p.full_name from public.profiles p where p.id=a.assigned_profile_id),a.assigned_to),a.assigned_profile_id,a.appointment_date,a.branch_id,a.updated_at,0::bigint,0::bigint
 from (select a.*,c.branch_id from public.appointments a join public.cases c on c.id=a.case_id and c.organization_id=a.organization_id where a.organization_id=target_org) a
 join public.cases c on c.id=a.case_id
 where (select appointments_allowed from permissions) and ((select role='admin' or is_platform_super_admin from viewer) or a.branch_id=(select branch_id from viewer) or a.case_id in (select case_id from received)) and a.status not in ('Completed','Cancelled','Missed')
 ), marked as (
 select w.*,clock.today,w.due_date<clock.today as overdue,w.due_date=clock.today as due_today,
 (w.assigned_profile_id=(select id from viewer) or (w.assigned_profile_id is null and (w.owner=(select id::text from viewer) or (nullif(btrim(w.owner),'') is not null and lower(btrim(w.owner))=lower((select full_name from viewer)) and (select count(*) from public.profiles p where p.organization_id=target_org and p.is_active and lower(btrim(p.full_name))=lower(btrim(w.owner)))=1)))) as mine
 from work w cross join clock
 ), filtered as (
 select * from marked where (coalesce(query_text,'')='' or concat_ws(' ',reference,title,mobile,owner) ilike '%'||left(query_text,100)||'%')
 and case queue_name when 'mine' then mine when 'overdue' then overdue when 'today' then due_today when 'unassigned' then nullif(btrim(owner),'') is null when 'attestation' then type='attestation' when 'service' then type='service' when 'appointment' then type='appointment' else true end
 ) select jsonb_build_object('summary',(select jsonb_build_object('all',count(*),'mine',count(*) filter(where mine),'overdue',count(*) filter(where overdue),'today',count(*) filter(where due_today),'unassigned',count(*) filter(where nullif(btrim(owner),'') is null)) from marked),
 'total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(r)||case when r.type='attestation' then jsonb_build_object('completed',(select count(*) from public.documents d join public.document_stages s on s.document_id=d.id where d.case_id=r.id and s.status='Completed'),'stages',(select count(*) from public.documents d join public.document_stages s on s.document_id=d.id where d.case_id=r.id and s.status not in ('Not Required','Cancelled'))) else '{}'::jsonb end) from (select * from filtered order by overdue desc nulls last,due_date nulls last,updated_at desc,id limit 30 offset greatest(0,least(result_offset,1000000))) r),'[]'::jsonb))
$$;
revoke all on function public.workspace_work_queue(uuid,text,text,integer) from public,anon;
grant execute on function public.workspace_work_queue(uuid,text,text,integer) to authenticated;

commit;
notify pgrst,'reload schema';
