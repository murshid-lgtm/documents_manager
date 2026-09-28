-- Kenza Tracker V3.32 — centralized settings, synced favorites,
-- atomic custody receipt and notification outbox.
begin;

create or replace function public.is_kenza_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid()
    and p.is_active=true and lower(coalesce(p.role,''))='admin');
$$;

create or replace function public.current_profile_branch_id()
returns uuid language sql stable security definer set search_path=public as $$
  select p.branch_id from public.profiles p where p.id=auth.uid() and p.is_active=true;
$$;
revoke all on function public.is_kenza_admin() from public;
revoke all on function public.current_profile_branch_id() from public;
grant execute on function public.is_kenza_admin() to authenticated;
grant execute on function public.current_profile_branch_id() to authenticated;

create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.app_settings enable row level security;
drop policy if exists "authenticated read app settings" on public.app_settings;
drop policy if exists "admin manage app settings" on public.app_settings;
create policy "authenticated read app settings" on public.app_settings for select to authenticated using (true);
create policy "admin manage app settings" on public.app_settings for all to authenticated
  using (public.is_kenza_admin()) with check (public.is_kenza_admin());
insert into public.app_settings(setting_key,setting_value)
values ('customer_tracking','{"base_url":"https://mellodeals.com/track/"}'::jsonb)
on conflict (setting_key) do nothing;

create table if not exists public.user_favorite_cases (
  user_id uuid not null references public.profiles(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,case_id)
);
create index if not exists user_favorite_cases_case_idx on public.user_favorite_cases(case_id);
alter table public.user_favorite_cases enable row level security;
drop policy if exists "users manage own favorites" on public.user_favorite_cases;
create policy "users manage own favorites" on public.user_favorite_cases for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases(id) on delete cascade,
  event_type text not null,
  recipient text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'Pending' check(status in ('Pending','Processing','Sent','Failed','Cancelled')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists notification_outbox_status_idx on public.notification_outbox(status,created_at);
alter table public.notification_outbox enable row level security;
drop policy if exists "admin read notification outbox" on public.notification_outbox;
create policy "admin read notification outbox" on public.notification_outbox for select to authenticated using (public.is_kenza_admin());

create or replace function public.queue_case_customer_notification()
returns trigger language plpgsql security definer set search_path=public as $$
declare event_name text;
begin
  if tg_op='INSERT' then event_name:='case_created';
  elsif new.overall_status is distinct from old.overall_status then
    event_name:=case when new.overall_status='Ready for Delivery' then 'ready_for_delivery' else 'status_changed' end;
  else return new;
  end if;
  if nullif(regexp_replace(coalesce(new.mobile,''),'\D','','g'),'') is not null then
    insert into public.notification_outbox(case_id,event_type,recipient,payload)
    values(new.id,event_name,new.mobile,jsonb_build_object('tracking_reference',new.tracking_reference,'customer_name',new.customer_name,'status',new.overall_status));
  end if;
  return new;
end $$;
drop trigger if exists queue_case_customer_notification_trigger on public.cases;
create trigger queue_case_customer_notification_trigger after insert or update of overall_status on public.cases
for each row execute function public.queue_case_customer_notification();

-- One secure transaction replaces dozens of client round trips during receipt.
create or replace function public.confirm_custody_receipt(
  target_transfer uuid,
  receipt_items jsonb,
  receipt_note text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.custody_transfers%rowtype; item jsonb; has_issue boolean:=false; affected uuid[]; cid uuid;
begin
  select * into t from public.custody_transfers where id=target_transfer for update;
  if not found then raise exception 'Custody transfer not found'; end if;
  if t.status<>'In Transit' then raise exception 'This transfer is no longer awaiting receipt'; end if;
  if not (public.is_kenza_admin() or t.to_branch_id=public.current_profile_branch_id()) then
    raise exception 'Only the receiving branch can confirm this receipt';
  end if;
  if jsonb_array_length(coalesce(receipt_items,'[]'::jsonb)) <>
     (select count(*) from public.custody_transfer_items where transfer_id=target_transfer) then
    raise exception 'Every transfer item must be verified';
  end if;

  for item in select * from jsonb_array_elements(coalesce(receipt_items,'[]'::jsonb)) loop
    if coalesce(item->>'status','') not in ('Verified','Missing','Damaged') then raise exception 'Invalid receipt status'; end if;
    if item->>'status' in ('Missing','Damaged') and nullif(trim(item->>'note'),'') is null then raise exception 'A discrepancy note is required'; end if;
    update public.custody_transfer_items
      set receive_status=item->>'status', discrepancy_note=nullif(trim(item->>'note'),''),
          verified_by=auth.uid(), verified_at=now()
      where id=(item->>'id')::uuid and transfer_id=target_transfer;
    if not found then raise exception 'Invalid transfer item'; end if;
    has_issue:=has_issue or (item->>'status') in ('Missing','Damaged');
  end loop;

  update public.documents d set physical_location=t.to_location
  where exists(select 1 from public.custody_transfer_items i
    where i.transfer_id=target_transfer and i.receive_status in ('Verified','Damaged')
      and ((i.document_id=d.id) or (i.document_id is null and i.case_id=d.case_id)));

  select array_agg(distinct i.case_id) into affected from public.custody_transfer_items i where i.transfer_id=target_transfer;
  foreach cid in array coalesce(affected,array[]::uuid[]) loop
    update public.cases c set physical_location=case
      when exists(select 1 from public.documents d where d.case_id=cid)
       and not exists(select 1 from public.documents d where d.case_id=cid and coalesce(d.physical_location,'')<>coalesce(t.to_location,''))
      then t.to_location else 'Mixed locations' end, updated_by=auth.uid()
    where c.id=cid;
    insert into public.case_history(case_id,user_id,action,field_name,new_value,metadata)
    values(cid,auth.uid(),'Custody transfer received','physical_location',
      coalesce(t.from_location,'Unassigned')||' → '||coalesce(t.to_location,'Unassigned')||' · '||t.transfer_no,
      jsonb_build_object('source','custody','transfer_id',target_transfer));
  end loop;

  update public.custody_transfers set status='Received',received_by=auth.uid(),received_at=now(),
    receipt_notes=nullif(trim(receipt_note),''),has_discrepancy=has_issue where id=target_transfer;
  return jsonb_build_object('transfer_id',target_transfer,'case_count',coalesce(array_length(affected,1),0),'has_discrepancy',has_issue);
end $$;
revoke all on function public.confirm_custody_receipt(uuid,jsonb,text) from public;
grant execute on function public.confirm_custody_receipt(uuid,jsonb,text) to authenticated;

commit;
notify pgrst, 'reload schema';
