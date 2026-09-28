-- Kenza Tracker V3.22 — branch custody transfer requests and receipt confirmation
-- Run once in Supabase SQL Editor before deploying the V3.22 web build.

begin;

alter table public.documents
  add column if not exists physical_location text;

create table if not exists public.custody_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_no text not null unique,
  from_branch_id uuid references public.branches(id) on delete set null,
  to_branch_id uuid references public.branches(id) on delete set null,
  from_location text,
  to_location text not null,
  status text not null default 'In Transit'
    check (status in ('In Transit','Received','Cancelled')),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  received_by uuid references public.profiles(id) on delete set null,
  received_at timestamptz,
  notes text
);

create table if not exists public.custody_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.custody_transfers(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete restrict,
  document_id uuid references public.documents(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (transfer_id, case_id, document_id)
);

create index if not exists custody_transfers_status_idx
  on public.custody_transfers(status, requested_at desc);
create index if not exists custody_transfers_branches_idx
  on public.custody_transfers(from_branch_id, to_branch_id, status);
create index if not exists custody_transfer_items_transfer_idx
  on public.custody_transfer_items(transfer_id);
create index if not exists custody_transfer_items_case_idx
  on public.custody_transfer_items(case_id);
create index if not exists custody_transfer_items_document_idx
  on public.custody_transfer_items(document_id);
create index if not exists documents_physical_location_idx
  on public.documents(physical_location);

alter table public.custody_transfers enable row level security;
alter table public.custody_transfer_items enable row level security;

drop policy if exists "authenticated custody transfers" on public.custody_transfers;
drop policy if exists "custody transfer branch read" on public.custody_transfers;
drop policy if exists "custody transfer branch create" on public.custody_transfers;
drop policy if exists "custody transfer destination update" on public.custody_transfers;
drop policy if exists "custody transfer admin delete" on public.custody_transfers;
create policy "custody transfer branch read" on public.custody_transfers
  for select to authenticated using (
    public.is_kenza_admin()
    or from_branch_id=public.current_profile_branch_id()
    or to_branch_id=public.current_profile_branch_id()
  );
create policy "custody transfer branch create" on public.custody_transfers
  for insert to authenticated with check (
    public.is_kenza_admin()
    or from_branch_id=public.current_profile_branch_id()
  );
create policy "custody transfer destination update" on public.custody_transfers
  for update to authenticated using (
    public.is_kenza_admin()
    or to_branch_id=public.current_profile_branch_id()
  ) with check (
    public.is_kenza_admin()
    or to_branch_id=public.current_profile_branch_id()
  );
create policy "custody transfer admin delete" on public.custody_transfers
  for delete to authenticated using (public.is_kenza_admin());

drop policy if exists "authenticated custody transfer items" on public.custody_transfer_items;
create policy "authenticated custody transfer items" on public.custody_transfer_items
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.custody_transfers to authenticated;
grant select, insert, update, delete on public.custody_transfer_items to authenticated;

commit;

notify pgrst, 'reload schema';
