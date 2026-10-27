begin;
alter table public.cases add column assigned_profile_id uuid references public.profiles(id);
alter table public.service_jobs add column assigned_profile_id uuid references public.profiles(id);
alter table public.appointments add column assigned_profile_id uuid references public.profiles(id);
alter table public.appointments add column duration_minutes integer not null default 30 check(duration_minutes between 1 and 1440);
create index cases_assigned_profile on public.cases(assigned_profile_id);
create index jobs_assigned_profile on public.service_jobs(assigned_profile_id);
create index appointments_assigned_profile on public.appointments(assigned_profile_id);

-- Branch access may follow a verified received custody transfer, without changing submission branch.
create function public.work_case_scope(target_org uuid,target_case uuid,module_name text) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.cases c where c.id=target_case and c.organization_id=target_org and public.can_access_case(c.id) and
 (public.business_access(target_org,c.branch_id,module_name) or (public.business_access(target_org,public.current_profile_branch_id(),module_name) and exists(
 select 1 from public.custody_transfers t join public.custody_transfer_items i on i.transfer_id=t.id join public.branches b on b.id=public.current_profile_branch_id()
 where t.organization_id=target_org and t.to_branch_id=b.id and t.status='Received' and i.case_id=c.id and i.receive_status in ('Verified','Damaged')
 and (c.physical_location=b.name or exists(select 1 from public.documents d where d.case_id=c.id and d.physical_location=b.name and (i.document_id is null or i.document_id=d.id)))
 ))))
$$;
revoke all on function public.work_case_scope(uuid,uuid,text) from public,anon;
grant execute on function public.work_case_scope(uuid,uuid,text) to authenticated;
-- Module checks use the viewer's branch, while case access includes received custody.
create or replace function public.work_record_access(target_org uuid,work_type text,target_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select case work_type
 when 'attestation' then exists(select 1 from public.cases c where c.id=target_id and c.organization_id=target_org and public.work_case_scope(target_org,c.id,'cases'))
 when 'appointment_case' then exists(select 1 from public.cases c where c.id=target_id and c.organization_id=target_org and public.work_case_scope(target_org,c.id,'appointments'))
 when 'appointment' then exists(select 1 from public.appointments a where a.id=target_id and a.organization_id=target_org and public.work_case_scope(target_org,a.case_id,'appointments'))
 when 'service' then exists(select 1 from public.service_jobs j where j.id=target_id and j.organization_id=target_org and public.business_access(target_org,j.branch_id,'services'))
 else false end
$$;
revoke all on function public.work_record_access(uuid,text,uuid) from public,anon;
grant execute on function public.work_record_access(uuid,text,uuid) to authenticated;

create or replace function public.work_assignment_staff(target_org uuid,work_type text,target_id uuid)
returns table(id uuid,full_name text) language sql stable security invoker set search_path='' as $$
 with target as (
 select c.branch_id,c.id case_id,'cases'::text module_name from public.cases c where work_type='attestation' and c.id=target_id and c.organization_id=target_org
 union all select c.branch_id,c.id,'appointments' from public.cases c where work_type='appointment_case' and c.id=target_id and c.organization_id=target_org
 union all select c.branch_id,c.id,'appointments' from public.appointments a join public.cases c on c.id=a.case_id and c.organization_id=a.organization_id where work_type='appointment' and a.id=target_id and a.organization_id=target_org
 union all select j.branch_id,null::uuid,'services' from public.service_jobs j where work_type='service' and j.id=target_id and j.organization_id=target_org
 ) select p.id,coalesce(nullif(btrim(p.full_name),''),'Team member') from public.profiles p cross join target t
 where public.work_record_access(target_org,work_type,target_id) and p.organization_id=target_org and p.is_active and not p.is_platform_super_admin
 and (p.role='admin' or p.staff_modules is null or t.module_name=any(p.staff_modules))
 and (p.role='admin' or p.branch_id=t.branch_id or exists(
 select 1 from public.custody_transfers ct join public.custody_transfer_items i on i.transfer_id=ct.id join public.branches b on b.id=p.branch_id join public.cases c on c.id=t.case_id
 where ct.organization_id=target_org and ct.to_branch_id=p.branch_id and ct.status='Received' and i.case_id=t.case_id and i.receive_status in ('Verified','Damaged')
 and (c.physical_location=b.name or exists(select 1 from public.documents d where d.case_id=c.id and d.physical_location=b.name and (i.document_id is null or i.document_id=d.id)))
 )) order by lower(p.full_name),p.id
$$;
revoke all on function public.work_assignment_staff(uuid,text,uuid) from public,anon;
grant execute on function public.work_assignment_staff(uuid,text,uuid) to authenticated;

create table operations_private.work_assignment_commands (
 request_key uuid primary key,organization_id uuid not null,work_type text not null,record_id uuid not null,
 actor_id uuid not null, input jsonb not null,before_data jsonb not null,after_data jsonb not null,created_at timestamptz not null default now()
);
alter table operations_private.work_assignment_commands enable row level security;
revoke all on operations_private.work_assignment_commands from public,anon,authenticated;
create or replace function operations_private.save_work_assignment(target_org uuid,work_type text,target_id uuid,input jsonb,request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tab text;due_col text;before_row jsonb;after_row jsonb;prior operations_private.work_assignment_commands;owner uuid;owner_name text;deadline date;
begin
 if work_type not in ('attestation','service','appointment') or not public.work_record_access(target_org,work_type,target_id) then raise exception 'Work item unavailable or access denied.';end if;
 if request_key is null or jsonb_typeof(input)<>'object' then raise exception 'Invalid assignment request.';end if;
 perform pg_advisory_xact_lock(hashtextextended(request_key::text,0));
 select * into prior from operations_private.work_assignment_commands c where c.request_key=save_work_assignment.request_key;
 if found then
  if prior.actor_id<>auth.uid() or prior.organization_id<>target_org or prior.work_type<>work_type or prior.record_id<>target_id or prior.input<>input then raise exception 'This request key was already used for another edit.';end if;
  return prior.after_data;
 end if;
 tab:=case work_type when 'attestation' then 'cases' when 'service' then 'service_jobs' when 'appointment' then 'appointments' end;
 due_col:=case work_type when 'attestation' then 'promise_date' when 'service' then 'due_date' when 'appointment' then 'appointment_date' end;
 execute format('select to_jsonb(r) from public.%I r where id=$1 and organization_id=$2 for update',tab) into before_row using target_id,target_org;
 if before_row is null or not public.work_record_access(target_org,work_type,target_id) then raise exception 'Work item unavailable or access denied.';end if;
 if (input->>'expected_updated_at') is null or (input->>'expected_updated_at')::timestamptz is distinct from (before_row->>'updated_at')::timestamptz then raise exception 'This item changed. Close and reopen it before saving.';end if;
 owner:=nullif(input->>'assigned_profile_id','')::uuid;
 deadline:=nullif(input->>'due_date','')::date;
 if work_type='appointment' and deadline is null then raise exception 'An appointment date is required.';end if;
 if input->>'owner_action'='keep' then
  owner:=(before_row->>'assigned_profile_id')::uuid;owner_name:=before_row->>'assigned_to';
 elsif input->>'owner_action'='set' then
  if owner is not null then
   select s.full_name into owner_name from public.work_assignment_staff(target_org,work_type,target_id) s where s.id=owner;
   if not found then raise exception 'Choose an eligible active staff member.';end if;
  end if;
 else raise exception 'Choose whether to keep or change the owner.';end if;
 execute format('update public.%I set assigned_profile_id=$1,assigned_to=$2,%I=$3,updated_at=clock_timestamp() where id=$4 and organization_id=$5 returning to_jsonb(%I)',tab,due_col,tab) into after_row using owner,owner_name,deadline,target_id,target_org;
 insert into operations_private.work_assignment_commands values(request_key,target_org,work_type,target_id,auth.uid(),input,before_row,after_row,now());
 return after_row;
end $$;
revoke all on function operations_private.save_work_assignment(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function operations_private.save_work_assignment(uuid,text,uuid,jsonb,uuid) to authenticated;
create function public.save_work_assignment(target_org uuid,work_type text,target_id uuid,input jsonb,request_key uuid) returns jsonb language sql security invoker set search_path='' as $$select operations_private.save_work_assignment(target_org,work_type,target_id,input,request_key)$$;
revoke all on function public.save_work_assignment(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.save_work_assignment(uuid,text,uuid,jsonb,uuid) to authenticated;
create function operations_private.work_assignment_history(target_org uuid,work_type text,target_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') from (select c.created_at,coalesce(p.full_name,'Team member') actor,c.before_data->>'assigned_to' previous_owner,c.after_data->>'assigned_to' owner,coalesce(c.before_data->>'promise_date',c.before_data->>'due_date',c.before_data->>'appointment_date') previous_due,coalesce(c.after_data->>'promise_date',c.after_data->>'due_date',c.after_data->>'appointment_date') due_date from operations_private.work_assignment_commands c left join public.profiles p on p.id=c.actor_id where c.organization_id=target_org and c.work_type=work_assignment_history.work_type and c.record_id=target_id and public.work_record_access(target_org,work_type,target_id) order by c.created_at desc limit 30) r
$$;
revoke all on function operations_private.work_assignment_history(uuid,text,uuid) from public,anon,authenticated;
grant execute on function operations_private.work_assignment_history(uuid,text,uuid) to authenticated;
create function public.work_assignment_history(target_org uuid,work_type text,target_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select operations_private.work_assignment_history(target_org,work_type,target_id)$$;
revoke all on function public.work_assignment_history(uuid,text,uuid) from public,anon;
grant execute on function public.work_assignment_history(uuid,text,uuid) to authenticated;
-- Legacy free-text editors remain usable; changing their text clears a stale ID.
create function public.work_assignment_legacy_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.assigned_profile_id is not null and new.assigned_profile_id is not distinct from old.assigned_profile_id and new.assigned_to is distinct from old.assigned_to
 and not exists(select 1 from public.profiles p where p.id=new.assigned_profile_id and p.organization_id=new.organization_id and coalesce(nullif(btrim(p.full_name),''),'Team member')=new.assigned_to) then new.assigned_profile_id:=null;end if;
 return new;
end $$;
create function public.work_assignment_id_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare kind text:=case tg_table_name when 'cases' then 'attestation' when 'service_jobs' then 'service' else 'appointment' end;
begin
 if new.assigned_profile_id is not null and (tg_op='INSERT' or new.assigned_profile_id is distinct from old.assigned_profile_id) then
 if not exists(select 1 from public.work_assignment_staff(new.organization_id,kind,new.id) s where s.id=new.assigned_profile_id) then raise exception 'Choose an eligible active staff member.';end if;
 end if;
 return new;
end $$;
create trigger work_assignment_legacy_guard before update on public.cases for each row execute function public.work_assignment_legacy_guard();
create trigger work_assignment_legacy_guard before update on public.service_jobs for each row execute function public.work_assignment_legacy_guard();
create trigger work_assignment_legacy_guard before update on public.appointments for each row execute function public.work_assignment_legacy_guard();
create trigger work_assignment_id_guard after insert or update on public.cases for each row execute function public.work_assignment_id_guard();
create trigger work_assignment_id_guard after insert or update on public.service_jobs for each row execute function public.work_assignment_id_guard();
create trigger work_assignment_id_guard after insert or update on public.appointments for each row execute function public.work_assignment_id_guard();
revoke all on function public.work_assignment_legacy_guard(),public.work_assignment_id_guard() from public,anon,authenticated;
create or replace function public.workspace_work_queue(target_org uuid,queue_name text default 'all',query_text text default '',result_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
 with viewer as (select id,full_name from public.profiles where id=auth.uid() and is_active),
 clock as (select (now() at time zone coalesce(nullif(timezone,''),'Asia/Qatar'))::date as today from public.organizations where id=target_org),
 work as (
 select 'attestation'::text as type,c.id,c.tracking_reference::text as reference,c.customer_name as title,c.mobile,c.overall_status as status,coalesce((select p.full_name from public.profiles p where p.id=c.assigned_profile_id),c.assigned_to)::text as owner,c.assigned_profile_id,c.promise_date as due_date,c.branch_id,c.updated_at,
 0::bigint as completed,0::bigint as stages
 from public.cases c where c.organization_id=target_org and public.work_record_access(c.organization_id,'attestation',c.id) and c.overall_status not in ('Delivered','Cancelled')
 union all
 select 'service',j.id,j.job_no,j.title||' · '||j.customer_name,null,j.status,coalesce((select p.full_name from public.profiles p where p.id=j.assigned_profile_id),j.assigned_to),j.assigned_profile_id,j.due_date,j.branch_id,j.updated_at,
 (select count(*) from jsonb_array_elements(j.stages) s where s->>'status'='Completed'),jsonb_array_length(j.stages)::bigint
 from public.service_jobs j where j.organization_id=target_org and public.business_access(j.organization_id,j.branch_id,'services') and j.status not in ('Completed','Cancelled')
 union all
 select 'appointment',a.id,coalesce(c.tracking_reference,'Appointment'),coalesce(a.authority,'Appointment')||' · '||coalesce(c.customer_name,''),c.mobile,a.status,coalesce((select p.full_name from public.profiles p where p.id=a.assigned_profile_id),a.assigned_to),a.assigned_profile_id,a.appointment_date,a.branch_id,a.updated_at,0::bigint,0::bigint
 from (select a.*,c.branch_id from public.appointments a join public.cases c on c.id=a.case_id and c.organization_id=a.organization_id where a.organization_id=target_org) a
 join public.cases c on c.id=a.case_id
 where public.work_record_access(a.organization_id,'appointment',a.id) and a.status not in ('Completed','Cancelled','Missed')
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
