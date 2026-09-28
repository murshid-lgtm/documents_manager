-- Kenza Tracker V3.7 Operations parity migration
-- Safe to run after V3.5.4. Adds fields required by exact batch report + delivery workflows.
begin;
alter table public.batch_reports add column if not exists report_name text;
alter table public.batch_reports add column if not exists case_status text;
alter table public.batch_reports add column if not exists stage_actions jsonb not null default '[]'::jsonb;
alter table public.batch_report_items add column if not exists card_reference text;
alter table public.batch_report_items add column if not exists remarks text;
alter table public.batch_report_items add column if not exists manual_tracking text;
alter table public.batch_report_items add column if not exists manual_name text;

create table if not exists public.deliveries (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.cases(id) on delete cascade,
 delivery_no text, status text not null default 'Delivered', receiver_name text, receiver_mobile text,
 receiver_id_reference text, payment_collected numeric(12,2) not null default 0, payment_method text,
 payment_reference text, assigned_to text, items jsonb not null default '[]'::jsonb, audit jsonb not null default '[]'::jsonb,
 print_count int not null default 0, delivered_by uuid references auth.users(id), delivered_at timestamptz,
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.deliveries add column if not exists delivery_no text;
alter table public.deliveries add column if not exists status text default 'Delivered';
alter table public.deliveries add column if not exists assigned_to text;
alter table public.deliveries add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.deliveries add column if not exists audit jsonb not null default '[]'::jsonb;
alter table public.deliveries add column if not exists print_count int not null default 0;
-- Allow full and partial handovers even if an older deliveries table had a restrictive status check.
do $$
declare r record;
begin
 for r in select conname from pg_constraint where conrelid='public.deliveries'::regclass and contype='c' loop
   if pg_get_constraintdef((select oid from pg_constraint where conname=r.conname and conrelid='public.deliveries'::regclass)) ilike '%status%' then
     execute format('alter table public.deliveries drop constraint %I',r.conname);
   end if;
 end loop;
end $$;
alter table public.deliveries add constraint deliveries_status_check check (status in ('Delivered','Partial','Cancelled'));
alter table public.deliveries enable row level security;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='deliveries' and policyname='authenticated deliveries') then create policy "authenticated deliveries" on public.deliveries for all to authenticated using (true) with check (true); end if;
end $$;
create index if not exists deliveries_case_idx on public.deliveries(case_id);
create index if not exists deliveries_status_idx on public.deliveries(status,delivered_at);
commit;
notify pgrst, 'reload schema';
