-- Kenza Tracker V3.5: run once in Supabase SQL Editor
create table if not exists public.appointments (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.cases(id) on delete cascade,
 document_id uuid references public.documents(id) on delete set null, stage_id uuid references public.document_stages(id) on delete set null,
 appointment_date date not null, appointment_time time, authority text, location text, assigned_to text,
 status text not null default 'Scheduled' check (status in ('Scheduled','Confirmed','Completed','Cancelled','Missed')),
 notes text, created_by uuid references auth.users(id), updated_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.batch_reports (
 id uuid primary key default gen_random_uuid(), batch_type text not null, batch_date date not null, session_name text,
 assigned_to text, default_price numeric(12,2) not null default 0, card_reference text, notes text,
 created_by uuid references auth.users(id), updated_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.batch_report_items (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.batch_reports(id) on delete cascade,
 case_id uuid not null references public.cases(id) on delete cascade, document_id uuid references public.documents(id) on delete set null,
 stage_id uuid references public.document_stages(id) on delete set null, sort_order int not null default 1, quantity int not null default 1,
 amount numeric(12,2) not null default 0, notes text, created_at timestamptz not null default now(), unique(batch_id,case_id,document_id,stage_id)
);
create index if not exists appointments_case_idx on public.appointments(case_id);
create index if not exists appointments_date_idx on public.appointments(appointment_date,status);
create index if not exists batch_reports_date_idx on public.batch_reports(batch_date);
create index if not exists batch_items_batch_idx on public.batch_report_items(batch_id);
alter table public.appointments enable row level security;
alter table public.batch_reports enable row level security;
alter table public.batch_report_items enable row level security;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='appointments' and policyname='authenticated appointments') then create policy "authenticated appointments" on public.appointments for all to authenticated using (true) with check (true); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='batch_reports' and policyname='authenticated batches') then create policy "authenticated batches" on public.batch_reports for all to authenticated using (true) with check (true); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='batch_report_items' and policyname='authenticated batch items') then create policy "authenticated batch items" on public.batch_report_items for all to authenticated using (true) with check (true); end if;
end $$;
