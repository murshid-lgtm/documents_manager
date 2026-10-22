begin;
create schema if not exists automation_private;
revoke all on schema automation_private from public,anon,authenticated;
grant usage on schema automation_private to service_role;
create table public.workspace_alert_rules(
 organization_id uuid not null references public.organizations(id),rule_key text not null check(rule_key in('case_overdue','service_overdue','appointment_due','ready_delivery','unpaid_invoice','unassigned_chat','document_expiry')),
 enabled boolean not null default true,threshold integer not null default 0 check(threshold between 0 and 365),minimum_amount numeric(14,2) not null default 0 check(minimum_amount between 0 and 100000000),updated_at timestamptz not null default now(),primary key(organization_id,rule_key)
);
create table public.workspace_alerts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),branch_id uuid references public.branches(id),module text not null,
 rule_key text not null,resource_type text not null,resource_id uuid not null,target_type text not null,target_id uuid not null,
 reference text not null,title text not null,body text not null,priority text not null check(priority in('High','Normal')),due_on date,amount numeric(14,2),
 status text not null default 'Active' check(status in('Active','Resolved')),first_seen_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),resolved_at timestamptz,
 unique(organization_id,rule_key,resource_id),foreign key(organization_id,rule_key) references public.workspace_alert_rules(organization_id,rule_key)
);
create table public.workspace_alert_actions(alert_id uuid not null references public.workspace_alerts(id),user_id uuid not null references public.profiles(id),read_at timestamptz,snoozed_until timestamptz,dismissed boolean not null default false,primary key(alert_id,user_id));
create table public.workspace_alert_events(id uuid primary key default gen_random_uuid(),alert_id uuid not null references public.workspace_alerts(id),action text not null check(action in('Created','Resolved','Reopened')),created_at timestamptz not null default now());
create table public.workspace_alert_runs(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),actor_id uuid references public.profiles(id),created_at timestamptz not null default now(),created_count integer not null,resolved_count integer not null,reopened_count integer not null);
create index workspace_alert_scope on public.workspace_alerts(organization_id,status,branch_id,last_seen_at desc);
create index workspace_alert_event_recent on public.workspace_alert_events(alert_id,created_at desc);
create index workspace_alert_runs_recent on public.workspace_alert_runs(organization_id,created_at desc);
create function public.workspace_alert_source_visible(kind text,resource uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select case kind when 'attestation' then exists(select 1 from public.cases where id=resource)
 when 'service' then exists(select 1 from public.service_jobs where id=resource)
 when 'appointment' then exists(select 1 from public.appointments where id=resource)
 when 'invoice' then exists(select 1 from public.sales_documents where id=resource)
 when 'chat' then exists(select 1 from public.whatsapp_conversations where id=resource)
 when 'document' then exists(select 1 from public.customer_records where id=resource) else false end;
$$;
revoke all on function public.workspace_alert_source_visible(text,uuid) from public,anon;
grant execute on function public.workspace_alert_source_visible(text,uuid) to authenticated,service_role;
do $$declare t text;begin foreach t in array array['workspace_alert_rules','workspace_alerts','workspace_alert_actions','workspace_alert_events','workspace_alert_runs'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);execute format('grant select on public.%I to authenticated',t);end loop;end $$;
create policy alert_rules_admin on public.workspace_alert_rules for select to authenticated using(public.is_current_session_valid() and public.is_organization_admin(organization_id));
create policy alert_scope on public.workspace_alerts for select to authenticated using(public.business_access(organization_id,branch_id,module) and public.workspace_alert_source_visible(resource_type,resource_id));
create policy alert_action_read on public.workspace_alert_actions for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.workspace_alerts where id=alert_id));
create policy alert_event_read on public.workspace_alert_events for select to authenticated using(exists(select 1 from public.workspace_alerts where id=alert_id));
create policy alert_run_admin on public.workspace_alert_runs for select to authenticated using(public.is_current_session_valid() and public.is_organization_admin(organization_id));
create function automation_private.scan_alerts(org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare today date;stamp timestamptz;r record;old_alert public.workspace_alerts;alert_id uuid;created integer:=0;resolved integer:=0;reopened integer:=0;
begin
 if not exists(select 1 from public.organizations where id=org and status='Active') then return '{}'::jsonb;end if;
 perform pg_advisory_xact_lock(hashtextextended('workspace-alert-scan:'||org::text,0));stamp:=clock_timestamp();
 select (now() at time zone coalesce(timezone,'Asia/Qatar'))::date into today from public.organizations where id=org;
 insert into public.workspace_alert_rules(organization_id,rule_key,threshold) select org,k,n from (values('case_overdue',0),('service_overdue',0),('appointment_due',0),('ready_delivery',0),('unpaid_invoice',7),('unassigned_chat',15),('document_expiry',30)) v(k,n) on conflict do nothing;
 for r in
 with rules as (select * from public.workspace_alert_rules where organization_id=org and enabled),candidates as (
 select c.branch_id,'cases'::text module,rule.rule_key,'attestation'::text resource_type,c.id resource_id,'attestation'::text target_type,c.id target_id,c.tracking_reference reference,'Attestation overdue'::text title,c.customer_name||' · Promise date passed with work still open.' body,'High'::text priority,c.promise_date due_on,null::numeric amount
 from public.cases c join rules rule on rule.rule_key='case_overdue' where c.organization_id=org and c.promise_date+rule.threshold<today and c.overall_status not in('Completed','Ready for Delivery','Delivered','Returned','Cancelled')
 union all select j.branch_id,'services',rule.rule_key,'service',j.id,'service',j.id,j.job_no,'Service job overdue',j.customer_name||' · '||j.title,'High',j.due_date,null
 from public.service_jobs j join rules rule on rule.rule_key='service_overdue' where j.organization_id=org and j.due_date+rule.threshold<today and j.status not in('Completed','Cancelled')
 union all select c.branch_id,'appointments',rule.rule_key,'appointment',a.id,'appointment',a.id,c.tracking_reference,'Appointment due',c.customer_name||' · '||coalesce(a.authority,a.location,'Scheduled appointment'),case when a.appointment_date<today then 'High' else 'Normal' end,a.appointment_date,null
 from public.appointments a join public.cases c on c.id=a.case_id join rules rule on rule.rule_key='appointment_due' where a.organization_id=org and a.appointment_date<=today+rule.threshold and a.status in('Scheduled','Confirmed','Missed')
 union all select c.branch_id,'deliveries',rule.rule_key,'attestation',c.id,'attestation',c.id,c.tracking_reference,'Ready for collection',c.customer_name||' · Documents are ready for customer handoverule.','Normal',c.promise_date,c.balance_payment
 from public.cases c join rules rule on rule.rule_key='ready_delivery' where c.organization_id=org and c.overall_status='Ready for Delivery'
 union all select d.branch_id,'sales',rule.rule_key,'invoice',d.id,'invoice',d.id,d.document_no,'Payment overdue',d.customer_name||' · Follow up the outstanding invoice balance.','High',coalesce(d.due_date,d.document_date)+rule.threshold,d.total-d.paid_total
 from public.sales_documents d join rules rule on rule.rule_key='unpaid_invoice' where d.organization_id=org and d.kind='Invoice' and d.status='Issued' and d.total-d.paid_total>rule.minimum_amount and coalesce(d.due_date,d.document_date)+rule.threshold<today
 union all select c.branch_id,'crm',rule.rule_key,'chat',c.id,'chat',c.id,c.peer,'Conversation unassigned',coalesce(u.name,'+'||c.peer)||' · Assign a teammate to follow up.','Normal',null,null
 from public.whatsapp_conversations c left join public.crm_customers u on u.id=c.customer_id join rules rule on rule.rule_key='unassigned_chat' where c.organization_id=org and c.status<>'Closed' and c.assigned_to is null and c.last_message_at<=now()-make_interval(mins=>rule.threshold)
 union all select c.branch_id,'crm',rule.rule_key,'document',d.id,'customer',c.id,coalesce(d.reference,d.name),'Document renewal due',c.name||' · '||d.name,case when d.expires_on<today then 'High' else 'Normal' end,d.expires_on,null
 from public.customer_records d join public.crm_customers c on c.id=d.customer_id join rules rule on rule.rule_key='document_expiry' where d.organization_id=org and not d.archived and not c.archived and d.record_kind='Document' and d.reminder_enabled and d.expires_on<=today+rule.threshold and (d.snoozed_until is null or d.snoozed_until<=today)
 ) select * from candidates order by rule_key,resource_id
 loop
  select * into old_alert from public.workspace_alerts where organization_id=org and rule_key=r.rule_key and resource_id=r.resource_id for update;
  if not found then
   insert into public.workspace_alerts(organization_id,branch_id,module,rule_key,resource_type,resource_id,target_type,target_id,reference,title,body,priority,due_on,amount,last_seen_at) values(org,r.branch_id,r.module,r.rule_key,r.resource_type,r.resource_id,r.target_type,r.target_id,r.reference,r.title,r.body,r.priority,r.due_on,r.amount,stamp) returning id into alert_id;
   insert into public.workspace_alert_events(alert_id,action) values(alert_id,'Created');created:=created+1;
  else
   update public.workspace_alerts set branch_id=r.branch_id,module=r.module,target_type=r.target_type,target_id=r.target_id,reference=r.reference,title=r.title,body=r.body,priority=r.priority,due_on=r.due_on,amount=r.amount,last_seen_at=stamp,status='Active',resolved_at=null where id=old_alert.id;
   if old_alert.status='Resolved' then delete from public.workspace_alert_actions where workspace_alert_actions.alert_id=old_alert.id;insert into public.workspace_alert_events(alert_id,action) values(old_alert.id,'Reopened');reopened:=reopened+1;end if;
  end if;
 end loop;
 for old_alert in update public.workspace_alerts set status='Resolved',resolved_at=stamp where organization_id=org and status='Active' and last_seen_at<stamp returning * loop insert into public.workspace_alert_events(alert_id,action) values(old_alert.id,'Resolved');resolved:=resolved+1;end loop;
 insert into public.workspace_alert_runs(organization_id,actor_id,created_count,resolved_count,reopened_count) values(org,auth.uid(),created,resolved,reopened);
 delete from public.workspace_alert_runs where organization_id=org and created_at<now()-interval '30 days';
 return jsonb_build_object('created',created,'resolved',resolved,'reopened',reopened,'checked_at',stamp);
end $$;
revoke all on function automation_private.scan_alerts(uuid) from public,anon,authenticated;
grant execute on function automation_private.scan_alerts(uuid) to service_role;
create function public.run_workspace_alert_scan(target_org uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not public.is_current_session_valid() or not public.is_organization_admin(target_org) then raise exception 'Only company administrators can run an alert scan.';end if;return automation_private.scan_alerts(target_org);end $$;
revoke all on function public.run_workspace_alert_scan(uuid) from public,anon;
grant execute on function public.run_workspace_alert_scan(uuid) to authenticated;
create function public.save_workspace_alert_rules(target_org uuid,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;begin
 if not public.is_current_session_valid() or not public.is_organization_admin(target_org) then raise exception 'Only company administrators can change automation rules.';end if;
 if coalesce(jsonb_typeof(input),'null')<>'array' or jsonb_array_length(input)>7 then raise exception 'Choose valid alert rules.';end if;
 perform pg_advisory_xact_lock(hashtextextended('workspace-alert-scan:'||target_org::text,0));
 perform automation_private.scan_alerts(target_org);
 for r in select value from jsonb_array_elements(input) loop update public.workspace_alert_rules set enabled=(r->>'enabled')::boolean,threshold=(r->>'threshold')::integer,minimum_amount=(r->>'minimum_amount')::numeric,updated_at=now() where organization_id=target_org and rule_key=r->>'rule_key';if not found then raise exception 'Choose a supported alert rule.';end if;end loop;
 return automation_private.scan_alerts(target_org);
end $$;
revoke all on function public.save_workspace_alert_rules(uuid,jsonb) from public,anon;
grant execute on function public.save_workspace_alert_rules(uuid,jsonb) to authenticated;
alter function public.run_workspace_alert_scan(uuid) set schema automation_private;
alter function public.save_workspace_alert_rules(uuid,jsonb) set schema automation_private;
grant usage on schema automation_private to authenticated;
create function public.run_workspace_alert_scan(target_org uuid) returns jsonb language sql security invoker set search_path='' as $$select automation_private.run_workspace_alert_scan(target_org)$$;
create function public.save_workspace_alert_rules(target_org uuid,input jsonb) returns jsonb language sql security invoker set search_path='' as $$select automation_private.save_workspace_alert_rules(target_org,input)$$;
revoke all on function public.run_workspace_alert_scan(uuid),public.save_workspace_alert_rules(uuid,jsonb) from public,anon;
grant execute on function public.run_workspace_alert_scan(uuid),public.save_workspace_alert_rules(uuid,jsonb) to authenticated;
grant insert,update on public.workspace_alert_actions to authenticated;
create policy alert_action_insert on public.workspace_alert_actions for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.workspace_alerts where id=alert_id));
create policy alert_action_update on public.workspace_alert_actions for update to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.workspace_alerts where id=alert_id)) with check(user_id=(select auth.uid()) and exists(select 1 from public.workspace_alerts where id=alert_id));
create function public.act_on_workspace_alert(target_alert uuid,action text) returns void language plpgsql security invoker set search_path='' as $$begin
 if auth.uid() is null or not exists(select 1 from public.workspace_alerts where id=target_alert) then raise exception 'Alert unavailable.';end if;
 if action not in('read','snooze','dismiss','restore') then raise exception 'Choose an available alert action.';end if;
 insert into public.workspace_alert_actions(alert_id,user_id,read_at,snoozed_until,dismissed) values(target_alert,auth.uid(),case when action='restore' then null else now() end,case when action='snooze' then now()+interval '1 day' end,action='dismiss') on conflict(alert_id,user_id) do update set read_at=excluded.read_at,snoozed_until=excluded.snoozed_until,dismissed=excluded.dismissed;
end $$;
revoke all on function public.act_on_workspace_alert(uuid,text) from public,anon;
grant execute on function public.act_on_workspace_alert(uuid,text) to authenticated;
create function public.workspace_alert_list(target_org uuid,bucket text default 'active',search text default '',rule_filter text default '',page_number integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$
 with visible as(select a.*,p.read_at,p.snoozed_until,coalesce(p.dismissed,false) dismissed from public.workspace_alerts a left join public.workspace_alert_actions p on p.alert_id=a.id and p.user_id=auth.uid() where a.organization_id=target_org),filtered as(select * from visible where (coalesce(search,'')='' or reference ilike '%'||left(search,100)||'%' or body ilike '%'||left(search,100)||'%') and (coalesce(rule_filter,'')='' or rule_key=rule_filter) and case bucket when 'high' then status='Active' and priority='High' and not dismissed and coalesce(snoozed_until,'epoch')<=now() when 'resolved' then status='Resolved' when 'snoozed' then status='Active' and snoozed_until>now() when 'dismissed' then status='Active' and dismissed when 'unread' then status='Active' and read_at is null and not dismissed and coalesce(snoozed_until,'epoch')<=now() else status='Active' and not dismissed and coalesce(snoozed_until,'epoch')<=now() end),paged as(select * from filtered order by case priority when 'High' then 0 else 1 end,due_on nulls last,first_seen_at desc,id limit 30 offset greatest(0,least(page_number,10000))*30)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)) from paged p),'[]'),'total',(select count(*) from filtered),'counts',jsonb_build_object('active',(select count(*) from visible where status='Active' and not dismissed and coalesce(snoozed_until,'epoch')<=now()),'unread',(select count(*) from visible where status='Active' and read_at is null and not dismissed and coalesce(snoozed_until,'epoch')<=now()),'high',(select count(*) from visible where status='Active' and priority='High' and not dismissed and coalesce(snoozed_until,'epoch')<=now()),'resolved',(select count(*) from visible where status='Resolved')));
$$;
revoke all on function public.workspace_alert_list(uuid,text,text,text,integer) from public,anon;
grant execute on function public.workspace_alert_list(uuid,text,text,text,integer) to authenticated;
create function automation_private.scan_all_alerts() returns void language plpgsql security definer set search_path='' as $$declare org uuid;begin for org in select id from public.organizations where status='Active' loop perform automation_private.scan_alerts(org);end loop;end $$;
revoke all on function automation_private.scan_all_alerts() from public,anon,authenticated;
grant execute on function automation_private.scan_all_alerts() to service_role;
do $$begin if to_regnamespace('cron') is not null then execute $job$select cron.schedule('workspace-internal-alerts-v5','*/10 * * * *','select automation_private.scan_all_alerts();')$job$;end if;end $$;
commit;
notify pgrst,'reload schema';
