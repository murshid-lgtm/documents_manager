-- Kenza Tracker V3.29 — verified custody receiving and branch security
-- Run once in Supabase SQL Editor before deploying the V3.29 web build.

begin;

-- Self-contained role helpers. These are also created by V3_16, but are
-- repeated here so this migration works safely on databases that skipped it.
create or replace function public.is_active_kenza_user()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p
    where p.id=auth.uid() and p.is_active=true
      and lower(coalesce(p.role,'staff')) in ('admin','branch','staff'));
$$;

create or replace function public.is_kenza_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p
    where p.id=auth.uid() and p.is_active=true
      and lower(coalesce(p.role,''))='admin');
$$;

create or replace function public.current_profile_branch_id()
returns uuid language sql stable security definer set search_path=public as $$
  select p.branch_id from public.profiles p
  where p.id=auth.uid() and p.is_active=true;
$$;

revoke all on function public.is_active_kenza_user() from public;
revoke all on function public.is_kenza_admin() from public;
revoke all on function public.current_profile_branch_id() from public;
grant execute on function public.is_active_kenza_user() to authenticated;
grant execute on function public.is_kenza_admin() to authenticated;
grant execute on function public.current_profile_branch_id() to authenticated;

alter table public.custody_transfers
  add column if not exists from_branch_id uuid references public.branches(id) on delete set null,
  add column if not exists to_branch_id uuid references public.branches(id) on delete set null,
  add column if not exists receipt_notes text,
  add column if not exists has_discrepancy boolean not null default false;

-- Backfill branch IDs for transfers created by older builds. Branch-name
-- comparison ignores case and the optional word "Branch".
update public.custody_transfers t
set from_branch_id=b.id
from public.branches b
where t.from_branch_id is null
  and trim(regexp_replace(lower(coalesce(t.from_location,'')),'\s+branch$',''))
      =trim(regexp_replace(lower(coalesce(b.name,'')),'\s+branch$',''));

update public.custody_transfers t
set to_branch_id=b.id
from public.branches b
where t.to_branch_id is null
  and trim(regexp_replace(lower(coalesce(t.to_location,'')),'\s+branch$',''))
      =trim(regexp_replace(lower(coalesce(b.name,'')),'\s+branch$',''));

create index if not exists custody_transfers_branches_idx
  on public.custody_transfers(from_branch_id, to_branch_id, status);

alter table public.custody_transfer_items
  add column if not exists receive_status text not null default 'Pending',
  add column if not exists discrepancy_note text,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists verified_at timestamptz;

do $$ begin
  alter table public.custody_transfer_items
    add constraint custody_transfer_items_receive_status_check
    check (receive_status in ('Pending','Verified','Missing','Damaged'));
exception when duplicate_object then null;
end $$;

create index if not exists custody_transfer_items_receive_status_idx
  on public.custody_transfer_items(transfer_id, receive_status);

create or replace function public.can_access_custody_transfer(target_transfer uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_kenza_admin() or exists (
    select 1 from public.custody_transfers t
    where t.id=target_transfer
      and (t.from_branch_id=public.current_profile_branch_id()
        or t.to_branch_id=public.current_profile_branch_id())
  );
$$;

create or replace function public.can_receive_custody_transfer(target_transfer uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_kenza_admin() or exists (
    select 1 from public.custody_transfers t
    where t.id=target_transfer
      and t.to_branch_id=public.current_profile_branch_id()
  );
$$;

revoke all on function public.can_access_custody_transfer(uuid) from public;
revoke all on function public.can_receive_custody_transfer(uuid) from public;
grant execute on function public.can_access_custody_transfer(uuid) to authenticated;
grant execute on function public.can_receive_custody_transfer(uuid) to authenticated;

alter table public.custody_transfers enable row level security;
alter table public.custody_transfer_items enable row level security;

-- Recreate transfer policies as well as item policies so this migration is
-- sufficient for installations that did not run the earlier security script.
drop policy if exists "authenticated custody transfers" on public.custody_transfers;
drop policy if exists "custody transfers read" on public.custody_transfers;
drop policy if exists "custody transfers create" on public.custody_transfers;
drop policy if exists "custody transfers receive" on public.custody_transfers;
drop policy if exists "custody transfers admin delete" on public.custody_transfers;

create policy "custody transfers read" on public.custody_transfers
  for select to authenticated using (
    public.is_kenza_admin()
    or from_branch_id=public.current_profile_branch_id()
    or to_branch_id=public.current_profile_branch_id()
  );
create policy "custody transfers create" on public.custody_transfers
  for insert to authenticated with check (
    public.is_kenza_admin()
    or from_branch_id=public.current_profile_branch_id()
  );
create policy "custody transfers receive" on public.custody_transfers
  for update to authenticated using (
    public.is_kenza_admin()
    or to_branch_id=public.current_profile_branch_id()
  ) with check (
    public.is_kenza_admin()
    or to_branch_id=public.current_profile_branch_id()
  );
create policy "custody transfers admin delete" on public.custody_transfers
  for delete to authenticated using (public.is_kenza_admin());

drop policy if exists "authenticated custody transfer items" on public.custody_transfer_items;
drop policy if exists "custody transfer items read" on public.custody_transfer_items;
drop policy if exists "custody transfer items create" on public.custody_transfer_items;
drop policy if exists "custody transfer items receive" on public.custody_transfer_items;
drop policy if exists "custody transfer items admin delete" on public.custody_transfer_items;

create policy "custody transfer items read" on public.custody_transfer_items
  for select to authenticated using (public.can_access_custody_transfer(transfer_id));
create policy "custody transfer items create" on public.custody_transfer_items
  for insert to authenticated with check (
    public.is_kenza_admin() or exists (
      select 1 from public.custody_transfers t
      where t.id=transfer_id and t.from_branch_id=public.current_profile_branch_id()
    )
  );
create policy "custody transfer items receive" on public.custody_transfer_items
  for update to authenticated using (public.can_receive_custody_transfer(transfer_id))
  with check (public.can_receive_custody_transfer(transfer_id));
create policy "custody transfer items admin delete" on public.custody_transfer_items
  for delete to authenticated using (public.is_kenza_admin());

commit;
notify pgrst, 'reload schema';
