begin;
create table public.whatsapp_conversations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 phone_id text not null,peer text not null check(peer ~ '^[1-9][0-9]{7,14}$'),customer_id uuid,branch_id uuid references public.branches(id),
 assigned_to uuid references public.profiles(id),status text not null default 'Open' check(status in ('Open','Waiting','Closed')),
 labels text[] not null default '{}' check(cardinality(labels)<=8 and length(array_to_string(labels,','))<=327),follow_up_date date,
 last_message_at timestamptz not null default now(),last_preview text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,phone_id,peer),foreign key(customer_id,organization_id) references public.crm_customers(id,organization_id)
);
create table public.whatsapp_conversation_reads(
 conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,user_id uuid not null references public.profiles(id),
 read_at timestamptz not null default now(),primary key(conversation_id,user_id)
);
create table public.whatsapp_conversation_notes(
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.whatsapp_conversations(id),
 body text not null check(length(btrim(body)) between 1 and 4000),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
create table public.whatsapp_conversation_audit(
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.whatsapp_conversations(id),
 action text not null check(length(action)<=100),created_by uuid references public.profiles(id),created_at timestamptz not null default now()
);
alter table public.whatsapp_test_messages add column media_id text,add column media_name text,add column attachment_id uuid references public.email_attachments(id);
create index whatsapp_inbox_recent_idx on public.whatsapp_conversations(organization_id,last_message_at desc,id);
create index whatsapp_inbox_customer_idx on public.whatsapp_conversations(organization_id,customer_id);
create index whatsapp_inbox_assignment_idx on public.whatsapp_conversations(organization_id,assigned_to,status);
create index whatsapp_notes_recent_idx on public.whatsapp_conversation_notes(conversation_id,created_at desc);
create index whatsapp_audit_recent_idx on public.whatsapp_conversation_audit(conversation_id,created_at desc);
create function public.whatsapp_inbox_access(org uuid,branch uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select public.business_access(org,branch,'crm') and (branch is not null or public.is_organization_admin(org));
$$;
revoke all on function public.whatsapp_inbox_access(uuid,uuid) from public,anon;
grant execute on function public.whatsapp_inbox_access(uuid,uuid) to authenticated,service_role;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_conversation_reads enable row level security;
alter table public.whatsapp_conversation_notes enable row level security;
alter table public.whatsapp_conversation_audit enable row level security;
revoke all on public.whatsapp_conversations,public.whatsapp_conversation_reads,public.whatsapp_conversation_notes,public.whatsapp_conversation_audit from public,anon,authenticated;
grant all on public.whatsapp_conversations,public.whatsapp_conversation_reads,public.whatsapp_conversation_notes,public.whatsapp_conversation_audit to service_role;
grant select on public.whatsapp_conversations,public.whatsapp_conversation_reads,public.whatsapp_conversation_notes,public.whatsapp_conversation_audit to authenticated;
create policy whatsapp_inbox_read on public.whatsapp_conversations for select to authenticated using(public.whatsapp_inbox_access(organization_id,branch_id));
create policy whatsapp_inbox_read on public.whatsapp_conversation_reads for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.whatsapp_conversations c where c.id=conversation_id));
create policy whatsapp_inbox_read on public.whatsapp_conversation_notes for select to authenticated using(exists(select 1 from public.whatsapp_conversations c where c.id=conversation_id));
create policy whatsapp_inbox_read on public.whatsapp_conversation_audit for select to authenticated using(exists(select 1 from public.whatsapp_conversations c where c.id=conversation_id));
-- Messages stay in the isolated official API store; customer and branch matching never grants marketing consent.
create function public.whatsapp_sync_conversation() returns trigger language plpgsql security definer set search_path='' as $$
declare candidate uuid; location uuid; matching integer; prefix text;
begin
 select country_code into prefix from public.communication_settings where organization_id=new.organization_id;prefix:=coalesce(prefix,'974');
 select count(*),min(c.id::text)::uuid into matching,candidate from public.crm_customers c
 where c.organization_id=new.organization_id and not c.archived and
 (case when length(regexp_replace(coalesce(c.mobile,''),'[^0-9]','','g'))=8 then prefix||regexp_replace(c.mobile,'[^0-9]','','g') else regexp_replace(regexp_replace(coalesce(c.mobile,''),'[^0-9]','','g'),'^00','') end)=new.peer;
 if matching<>1 then candidate:=null;end if;
 if candidate is not null then select branch_id into location from public.crm_customers where id=candidate;end if;
 insert into public.whatsapp_conversations(organization_id,phone_id,peer,customer_id,branch_id,last_message_at,last_preview,created_at)
 values(new.organization_id,new.phone_id,new.peer,candidate,location,new.created_at,left(new.body,200),new.created_at)
 on conflict(organization_id,phone_id,peer) do update set
 last_preview=case when excluded.last_message_at>=public.whatsapp_conversations.last_message_at then excluded.last_preview else public.whatsapp_conversations.last_preview end,
 last_message_at=greatest(excluded.last_message_at,public.whatsapp_conversations.last_message_at),
 status=case when new.direction='incoming' then 'Open' else public.whatsapp_conversations.status end,updated_at=now();
 return new;
end $$;
revoke all on function public.whatsapp_sync_conversation() from public,anon,authenticated;
create trigger whatsapp_sync_conversation after insert on public.whatsapp_test_messages for each row execute function public.whatsapp_sync_conversation();
-- Re-run through the same trigger safely to bring existing test conversations into the shared inbox.
do $$ declare m record;begin
 for m in select distinct on (organization_id,phone_id,peer) * from public.whatsapp_test_messages order by organization_id,phone_id,peer,created_at desc loop
  insert into public.whatsapp_conversations(organization_id,phone_id,peer,last_message_at,last_preview,created_at) values(m.organization_id,m.phone_id,m.peer,m.created_at,left(m.body,200),m.created_at) on conflict do nothing;
 end loop;
end $$;
-- Match existing test chats only when a single active customer has that normalized mobile.
with matches as (
 select w.id,(array_agg(c.id))[1] as customer_id from public.whatsapp_conversations w
 join public.crm_customers c on c.organization_id=w.organization_id and not c.archived and
 (case when length(regexp_replace(coalesce(c.mobile,''),'[^0-9]','','g'))=8 then coalesce((select country_code from public.communication_settings s where s.organization_id=w.organization_id),'974')||regexp_replace(c.mobile,'[^0-9]','','g') else regexp_replace(regexp_replace(coalesce(c.mobile,''),'[^0-9]','','g'),'^00','') end)=w.peer
 where w.customer_id is null group by w.id having count(*)=1
) update public.whatsapp_conversations w set customer_id=m.customer_id,branch_id=c.branch_id from matches m join public.crm_customers c on c.id=m.customer_id where w.id=m.id;
create index whatsapp_inbox_unread_idx on public.whatsapp_test_messages(organization_id,phone_id,peer,updated_at desc) where direction='incoming';
create function public.whatsapp_inbox_list(target_org uuid,search text default '',bucket text default 'all',page_number integer default 0,today date default current_date) returns jsonb
language sql stable security invoker set search_path='' as $$
 with accessible as (
 select c.*,customer.name as customer_name,customer.company,coalesce((select count(*) from public.whatsapp_test_messages m where m.organization_id=c.organization_id and m.phone_id=c.phone_id and m.peer=c.peer and m.direction='incoming' and m.updated_at>coalesce(r.read_at,'epoch'::timestamptz)),0) as unread
 from public.whatsapp_conversations c left join public.crm_customers customer on customer.id=c.customer_id and not customer.archived
 left join public.whatsapp_conversation_reads r on r.conversation_id=c.id and r.user_id=auth.uid()
 where c.organization_id=target_org
 ), filtered as (
 select * from accessible c where
 (coalesce(search,'')='' or c.peer ilike '%'||left(search,100)||'%' or c.customer_name ilike '%'||left(search,100)||'%' or c.company ilike '%'||left(search,100)||'%'
 or exists(select 1 from public.cases a where a.organization_id=target_org and a.customer_id=c.customer_id and a.tracking_reference ilike '%'||left(search,100)||'%')
 or exists(select 1 from public.sales_documents d where d.organization_id=target_org and d.customer_id=c.customer_id and d.document_no ilike '%'||left(search,100)||'%'))
 and case bucket when 'unread' then unread>0 when 'mine' then assigned_to=auth.uid() when 'unassigned' then assigned_to is null when 'followup' then follow_up_date<=today and status<>'Closed' when 'closed' then status='Closed' when 'waiting' then status='Waiting' else status<>'Closed' end
 ), paged as (select * from filtered order by last_message_at desc,id limit 30 offset greatest(0,least(page_number,10000))*30)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)) from paged p),'[]'::jsonb),'total',(select count(*) from filtered),'counts',
 jsonb_build_object('new_leads',(select count(*) from accessible where customer_id is null),'new_week',(select count(*) from accessible where created_at>=now()-interval '7 days'),'all',(select count(*) from accessible where status<>'Closed'),'unread',(select count(*) from accessible where unread>0),'mine',(select count(*) from accessible where assigned_to=auth.uid() and status<>'Closed'),'unassigned',(select count(*) from accessible where assigned_to is null and status<>'Closed'),'followup',(select count(*) from accessible where follow_up_date<=today and status<>'Closed'),'waiting',(select count(*) from accessible where status='Waiting'),'closed',(select count(*) from accessible where status='Closed')));
$$;
-- Shared inbox readers can access messages only for a conversation visible under CRM branch RLS.
grant select on public.whatsapp_test_messages to authenticated;
create policy whatsapp_shared_message_read on public.whatsapp_test_messages for select to authenticated using(exists(select 1 from public.whatsapp_conversations c where c.organization_id=whatsapp_test_messages.organization_id and c.phone_id=whatsapp_test_messages.phone_id and c.peer=whatsapp_test_messages.peer));
revoke all on function public.whatsapp_inbox_list(uuid,text,text,integer,date) from public,anon;
grant execute on function public.whatsapp_inbox_list(uuid,text,text,integer,date) to authenticated,service_role;
create function public.whatsapp_manage_conversation(target_id uuid,actor_id uuid,changes jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare c public.whatsapp_conversations%rowtype;p public.profiles%rowtype;cust public.crm_customers%rowtype;member public.profiles%rowtype;branch uuid;assigned uuid;customer uuid;prefix text;
begin
 select * into c from public.whatsapp_conversations where id=target_id for update;if not found then raise exception 'Conversation unavailable.';end if;
 select * into p from public.profiles where id=actor_id and is_active and (organization_id=c.organization_id or is_platform_super_admin);if not found then raise exception 'Account unavailable.';end if;
 if changes ? 'note' then
  insert into public.whatsapp_conversation_notes(conversation_id,body,created_by) values(c.id,btrim(changes->>'note'),p.id);
  insert into public.whatsapp_conversation_audit(conversation_id,created_by,action) values(c.id,p.id,'Internal note added');return;
 end if;
 if (changes ? 'customer_id' or changes ? 'branch_id') and p.role<>'admin' then raise exception 'Only administrators can link customers or move branches.';end if;
 branch:=case when changes ? 'branch_id' then nullif(changes->>'branch_id','')::uuid else c.branch_id end;
 customer:=case when changes ? 'customer_id' then nullif(changes->>'customer_id','')::uuid else c.customer_id end;
 if changes ? 'customer_id' and customer is not null then
  select * into cust from public.crm_customers where id=customer and organization_id=c.organization_id and not archived;if not found then raise exception 'Customer unavailable.';end if;
  select country_code into prefix from public.communication_settings where organization_id=c.organization_id;prefix:=coalesce(prefix,'974');
  if (case when length(regexp_replace(coalesce(cust.mobile,''),'[^0-9]','','g'))=8 then prefix||regexp_replace(cust.mobile,'[^0-9]','','g') else regexp_replace(regexp_replace(coalesce(cust.mobile,''),'[^0-9]','','g'),'^00','') end)<>c.peer then raise exception 'The customer mobile must match this WhatsApp number.';end if;
  branch:=cust.branch_id;
 end if;
 if branch is not null and not exists(select 1 from public.branches where id=branch and organization_id=c.organization_id) then raise exception 'Branch unavailable.';end if;
 assigned:=case when changes ? 'assigned_to' then nullif(changes->>'assigned_to','')::uuid else c.assigned_to end;
 if assigned is not null then
  select * into member from public.profiles where id=assigned and organization_id=c.organization_id and is_active;
  if not found or (member.role<>'admin' and member.branch_id is distinct from branch) then raise exception 'Choose an active team member in this branch.';end if;
 end if;
 update public.whatsapp_conversations set customer_id=customer,branch_id=branch,assigned_to=assigned,
 status=case when changes ? 'status' then changes->>'status' else status end,
 labels=case when changes ? 'labels' then array(select jsonb_array_elements_text(changes->'labels')) else labels end,
 follow_up_date=case when changes ? 'follow_up_date' then nullif(changes->>'follow_up_date','')::date else follow_up_date end,updated_at=now() where id=c.id;
 insert into public.whatsapp_conversation_audit(conversation_id,created_by,action) values(c.id,p.id,'Conversation updated');
end $$;
revoke all on function public.whatsapp_manage_conversation(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_manage_conversation(uuid,uuid,jsonb) to service_role;
commit;
notify pgrst,'reload schema';
