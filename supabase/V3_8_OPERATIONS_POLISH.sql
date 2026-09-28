-- Kenza Tracker V3.8.0 — Operations polish
-- Run once in Supabase SQL Editor BEFORE deploying V3.8.0.

begin;

alter table public.cases
  add column if not exists assigned_to text,
  add column if not exists physical_location text,
  add column if not exists flags text[] not null default '{}'::text[];

create index if not exists cases_assigned_to_idx
  on public.cases(assigned_to);

create index if not exists cases_physical_location_idx
  on public.cases(physical_location);

create index if not exists cases_flags_gin_idx
  on public.cases using gin(flags);

commit;

notify pgrst, 'reload schema';
