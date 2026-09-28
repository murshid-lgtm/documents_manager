-- Kenza Tracker V3.16.0 — Admin / Branch / Staff
-- Branch is a priority/default UI view, not a case-level security boundary.
begin;

do $$
declare r record;
begin
  for r in select conname from pg_constraint
    where conrelid='public.profiles'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop execute format('alter table public.profiles drop constraint %I',r.conname); end loop;
end $$;

update public.profiles
set role=case when lower(coalesce(role,''))='admin' then 'admin' else 'staff' end;

alter table public.profiles alter column role set default 'staff';
alter table public.profiles add constraint profiles_role_check check (role in ('admin','branch','staff'));
alter table public.profiles drop constraint if exists profiles_branch_role_requires_branch;
alter table public.profiles add constraint profiles_branch_role_requires_branch
  check (role <> 'branch' or branch_id is not null);

create or replace function public.is_active_kenza_user()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p
    where p.id=auth.uid() and p.is_active=true and p.role in ('admin','branch','staff'));
$$;

create or replace function public.is_kenza_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p
    where p.id=auth.uid() and p.is_active=true and p.role='admin');
$$;

create or replace function public.current_profile_role()
returns text language sql stable security definer set search_path=public as $$
  select coalesce((select p.role from public.profiles p where p.id=auth.uid() and p.is_active=true),'none');
$$;

create or replace function public.current_profile_branch_id()
returns uuid language sql stable security definer set search_path=public as $$
  select p.branch_id from public.profiles p where p.id=auth.uid() and p.is_active=true;
$$;

revoke all on function public.is_active_kenza_user() from public;
revoke all on function public.is_kenza_admin() from public;
revoke all on function public.current_profile_role() from public;
revoke all on function public.current_profile_branch_id() from public;
grant execute on function public.is_active_kenza_user() to authenticated;
grant execute on function public.is_kenza_admin() to authenticated;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_profile_branch_id() to authenticated;

alter table public.profiles enable row level security;
alter table public.branches enable row level security;

do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='profiles'
  loop execute format('drop policy if exists %I on public.profiles',r.policyname); end loop;
  for r in select policyname from pg_policies where schemaname='public' and tablename='branches'
  loop execute format('drop policy if exists %I on public.branches',r.policyname); end loop;
end $$;

create policy "kenza active users read profiles" on public.profiles
for select to authenticated using (public.is_active_kenza_user());
create policy "kenza admin insert profiles" on public.profiles
for insert to authenticated with check (public.is_kenza_admin());
create policy "kenza admin update profiles" on public.profiles
for update to authenticated using (public.is_kenza_admin()) with check (public.is_kenza_admin());
create policy "kenza admin delete profiles" on public.profiles
for delete to authenticated using (public.is_kenza_admin());

create policy "kenza active users read branches" on public.branches
for select to authenticated using (public.is_active_kenza_user());
create policy "kenza admin manage branches" on public.branches
for all to authenticated using (public.is_kenza_admin()) with check (public.is_kenza_admin());

do $$
declare t text; r record;
tables text[]:=array[
 'cases','documents','document_stages','appointments',
 'batch_reports','batch_report_items','payments','deliveries',
 'delivery_documents','custody_movements','case_flags','case_history'
];
begin
 foreach t in array tables loop
   if to_regclass('public.'||t) is not null then
     execute format('alter table public.%I enable row level security',t);
     for r in select policyname from pg_policies where schemaname='public' and tablename=t
     loop execute format('drop policy if exists %I on public.%I',r.policyname,t); end loop;
     execute format(
       'create policy %I on public.%I for all to authenticated using (public.is_active_kenza_user()) with check (public.is_active_kenza_user())',
       'kenza active operational access',t);
   end if;
 end loop;
end $$;

revoke all on all tables in schema public from anon;
commit;
notify pgrst,'reload schema';

-- EXAMPLES AFTER MIGRATION:
-- Branch login:
-- update public.profiles
-- set role='branch',
--     branch_id=(select id from public.branches where name='Safari Branch' limit 1)
-- where id='<AUTH USER UUID>';
--
-- Common staff:
-- update public.profiles set role='staff',branch_id=null where id='<AUTH USER UUID>';
--
-- IMPORTANT: confirm at least one known account is role='admin' before logging out.
