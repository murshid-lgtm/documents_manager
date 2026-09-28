-- V3.17.11: persistent searchable document catalog for manual case entry.
create table if not exists public.document_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.document_catalog enable row level security;

drop policy if exists "document_catalog_select_active_users" on public.document_catalog;
create policy "document_catalog_select_active_users"
on public.document_catalog for select
to authenticated
using (true);

drop policy if exists "document_catalog_insert_active_users" on public.document_catalog;
create policy "document_catalog_insert_active_users"
on public.document_catalog for insert
to authenticated
with check (true);

drop policy if exists "document_catalog_update_active_users" on public.document_catalog;
create policy "document_catalog_update_active_users"
on public.document_catalog for update
to authenticated
using (true)
with check (true);

-- Seed the catalog from document names already used in Kenza Tracker.
insert into public.document_catalog (name)
select distinct trim(document_name)
from public.documents
where nullif(trim(document_name),'') is not null
on conflict (name) do nothing;
