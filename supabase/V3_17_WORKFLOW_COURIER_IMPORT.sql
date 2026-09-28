-- Kenza Tracker V3.17.0 — workflow, organization, DD/collection and courier batches
-- Additive migration. It does NOT delete current cases.
begin;

create or replace function public.is_active_kenza_user()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p
    where p.id=auth.uid() and p.is_active=true and p.role in ('admin','branch','staff'));
$$;
grant execute on function public.is_active_kenza_user() to authenticated;

do $$ declare r record; begin
  for r in select conname from pg_constraint
    where conrelid='public.cases'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%overall_status%'
  loop execute format('alter table public.cases drop constraint %I',r.conname); end loop;
end $$;
alter table public.cases add constraint cases_overall_status_check
check (overall_status in ('Received','Under Process','Waiting','Completed','Ready for Delivery','Delivered','Returned','Cancelled'));


alter table public.cases
  add column if not exists tracking_family text,
  add column if not exists account_name text,
  add column if not exists account_contact text,
  add column if not exists account_mobile text,
  add column if not exists intake_source text default 'Branch',
  add column if not exists direct_to_delhi boolean default false,
  add column if not exists direct_destination text,
  add column if not exists current_milestone text,
  add column if not exists current_milestone_date date;

update public.cases
set tracking_family=split_part(tracking_reference,'/',1)
where tracking_family is null and tracking_reference is not null;

alter table public.documents
  add column if not exists holder_name text,
  add column if not exists source_tracking_reference text,
  add column if not exists direct_to_delhi boolean default false,
  add column if not exists direct_destination text,
  add column if not exists current_milestone text,
  add column if not exists current_milestone_date date;

alter table public.document_stages
  add column if not exists milestone_date date;

create table if not exists public.courier_shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_no text not null unique,
  direction text not null default 'Outbound',
  destination text not null,
  agent_name text,
  carrier text,
  awb_no text,
  dispatch_date date,
  status text not null default 'Draft',
  dispatched_at timestamptz,
  received_at timestamptz,
  package_count integer not null default 1,
  bag_reference text,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courier_shipments_status_check check (status in ('Draft','Prepared','Dispatched','In Transit','Received by Agent','Closed','Cancelled')),
  constraint courier_shipments_direction_check check (direction in ('Outbound','Return','Domestic'))
);

create table if not exists public.courier_shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.courier_shipments(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete restrict,
  receipt_status text not null default 'Pending',
  received_at timestamptz,
  received_by uuid references public.profiles(id),
  exception_note text,
  created_at timestamptz not null default now(),
  unique(shipment_id,document_id),
  constraint courier_receipt_status_check check (receipt_status in ('Pending','Received','Missing','Exception','Returned'))
);

create index if not exists idx_cases_tracking_family on public.cases(tracking_family);
create index if not exists idx_cases_account_name on public.cases(account_name);
create index if not exists idx_cases_intake_source on public.cases(intake_source);
create index if not exists idx_cases_direct_to_delhi on public.cases(direct_to_delhi);
create index if not exists idx_cases_current_milestone on public.cases(current_milestone);
create index if not exists idx_documents_holder_name on public.documents(holder_name);
create index if not exists idx_documents_source_tracking on public.documents(source_tracking_reference);
create index if not exists idx_documents_direct_to_delhi on public.documents(direct_to_delhi);
create index if not exists idx_documents_current_milestone on public.documents(current_milestone);
create index if not exists idx_courier_shipments_status on public.courier_shipments(status);
create index if not exists idx_courier_shipments_dispatch_date on public.courier_shipments(dispatch_date);
create index if not exists idx_courier_shipment_items_document on public.courier_shipment_items(document_id);

alter table public.courier_shipments enable row level security;
alter table public.courier_shipment_items enable row level security;

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='courier_shipments'
  loop execute format('drop policy if exists %I on public.courier_shipments',r.policyname); end loop;
  for r in select policyname from pg_policies where schemaname='public' and tablename='courier_shipment_items'
  loop execute format('drop policy if exists %I on public.courier_shipment_items',r.policyname); end loop;
end $$;

create policy "kenza active courier shipments" on public.courier_shipments
for all to authenticated using (public.is_active_kenza_user()) with check (public.is_active_kenza_user());
create policy "kenza active courier shipment items" on public.courier_shipment_items
for all to authenticated using (public.is_active_kenza_user()) with check (public.is_active_kenza_user());

revoke all on public.courier_shipments from anon;
revoke all on public.courier_shipment_items from anon;

commit;
notify pgrst,'reload schema';
