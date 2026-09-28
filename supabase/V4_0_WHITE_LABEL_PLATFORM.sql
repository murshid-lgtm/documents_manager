-- Tracker Platform V4.0
-- White-label organizations, platform ownership and tenant boundary.
-- Run after V3_29 and V3_32. Back up production before running.
begin;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  legal_name text,
  status text not null default 'Active' check (status in ('Active','Suspended','Archived')),
  deployment_mode text not null default 'Tenant' check (deployment_mode in ('Tenant','Dedicated')),
  contact_email text,
  contact_phone text,
  timezone text not null default 'Asia/Qatar',
  currency_code text not null default 'QAR',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  product_name text not null default 'Document Tracker',
  company_name text not null,
  short_name text,
  logo_url text,
  favicon_url text,
  app_icon_url text,
  primary_domain text,
  primary_color text not null default '#3265DF',
  secondary_color text not null default '#17879A',
  accent_color text not null default '#15A37D',
  surface_color text not null default '#F4F7FC',
  login_title text default 'Document operations, organized.',
  login_subtitle text default 'Secure case, payment, delivery and custody management.',
  login_background_url text,
  login_kicker text default 'LIVE OPERATIONS WORKSPACE',
  login_welcome_title text default 'Welcome back',
  login_welcome_subtitle text default 'Sign in to continue to your operations dashboard.',
  login_button_text text default 'Sign in to workspace',
  tracking_base_url text,
  support_email text,
  support_phone text,
  website_url text,
  address text,
  footer_text text,
  label_width_mm numeric(8,2) not null default 75,
  label_height_mm numeric(8,2) not null default 35,
  enabled_modules jsonb not null default '["dashboard","cases","documents","operations","deliveries","custody","appointments","batches","courier","payments","reports","import"]'::jsonb,
  whatsapp_automation_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.profiles add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.profiles add column if not exists is_platform_super_admin boolean not null default false;
alter table public.cases add column if not exists legacy_reference text;
alter table public.cases add column if not exists legacy_status_code text;
alter table public.cases add column if not exists legacy_status_date date;
alter table public.cases add column if not exists legacy_import_key text;
alter table public.documents add column if not exists legacy_row_id text;
alter table public.documents add column if not exists legacy_status_code text;
alter table public.documents add column if not exists legacy_status_date date;
alter table public.documents add column if not exists legacy_imported boolean not null default false;
alter table public.documents add column if not exists created_by uuid references public.profiles(id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array[
    'branches','cases','documents','document_stages','case_history','document_catalog',
    'appointments','batch_reports','batch_report_items','payments','deliveries',
    'custody_movements','custody_transfers','custody_transfer_items',
    'courier_shipments','courier_shipment_items','user_favorite_cases','notification_outbox'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I add column if not exists organization_id uuid references public.organizations(id) on delete restrict',t);
      execute format('create index if not exists %I on public.%I(organization_id)',t||'_organization_idx',t);
    end if;
  end loop;
end $$;

-- References must be unique inside a company, not across every reseller tenant.
do $$ declare r record; begin
  for r in select conname from pg_constraint where conrelid='public.cases'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (tracking_reference)'
  loop execute format('alter table public.cases drop constraint %I',r.conname); end loop;
  if to_regclass('public.courier_shipments') is not null then
    for r in select conname from pg_constraint where conrelid='public.courier_shipments'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (shipment_no)'
    loop execute format('alter table public.courier_shipments drop constraint %I',r.conname); end loop;
  end if;
  if to_regclass('public.custody_transfers') is not null then
    for r in select conname from pg_constraint where conrelid='public.custody_transfers'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (transfer_no)'
    loop execute format('alter table public.custody_transfers drop constraint %I',r.conname); end loop;
  end if;
end $$;
create unique index if not exists cases_org_tracking_unique on public.cases(organization_id,tracking_reference);
create unique index if not exists courier_org_shipment_unique on public.courier_shipments(organization_id,shipment_no);
create unique index if not exists custody_org_transfer_unique on public.custody_transfers(organization_id,transfer_no);

insert into public.organizations(name,slug,legal_name,status,deployment_mode,timezone,currency_code)
values ('Kenza Services','kenza-services','Kenza Services','Active','Dedicated','Asia/Qatar','QAR')
on conflict (slug) do update set name=excluded.name
returning id;

do $$
declare org uuid;
begin
  select id into org from public.organizations where slug='kenza-services';
  update public.profiles set organization_id=org where organization_id is null;
  update public.branches set organization_id=org where organization_id is null;
  update public.cases set organization_id=org where organization_id is null;
  update public.documents d set organization_id=c.organization_id from public.cases c where d.case_id=c.id and d.organization_id is null;
  update public.document_stages s set organization_id=d.organization_id from public.documents d where s.document_id=d.id and s.organization_id is null;
  update public.case_history h set organization_id=c.organization_id from public.cases c where h.case_id=c.id and h.organization_id is null;
  update public.appointments a set organization_id=c.organization_id from public.cases c where a.case_id=c.id and a.organization_id is null;
  update public.payments p set organization_id=c.organization_id from public.cases c where p.case_id=c.id and p.organization_id is null;
  update public.deliveries d set organization_id=c.organization_id from public.cases c where d.case_id=c.id and d.organization_id is null;
  update public.user_favorite_cases f set organization_id=c.organization_id from public.cases c where f.case_id=c.id and f.organization_id is null;
  update public.notification_outbox n set organization_id=c.organization_id from public.cases c where n.case_id=c.id and n.organization_id is null;
  if to_regclass('public.batch_reports') is not null then update public.batch_reports set organization_id=org where organization_id is null; end if;
  if to_regclass('public.batch_report_items') is not null then update public.batch_report_items i set organization_id=r.organization_id from public.batch_reports r where i.batch_id=r.id and i.organization_id is null; end if;
  if to_regclass('public.custody_movements') is not null then update public.custody_movements set organization_id=org where organization_id is null; end if;
  if to_regclass('public.custody_transfers') is not null then update public.custody_transfers set organization_id=org where organization_id is null; end if;
  if to_regclass('public.custody_transfer_items') is not null then update public.custody_transfer_items i set organization_id=t.organization_id from public.custody_transfers t where i.transfer_id=t.id and i.organization_id is null; end if;
  if to_regclass('public.courier_shipments') is not null then update public.courier_shipments set organization_id=org where organization_id is null; end if;
  if to_regclass('public.courier_shipment_items') is not null then update public.courier_shipment_items i set organization_id=s.organization_id from public.courier_shipments s where i.shipment_id=s.id and i.organization_id is null; end if;
  if to_regclass('public.document_catalog') is not null then update public.document_catalog set organization_id=org where organization_id is null; end if;
  insert into public.organization_settings(organization_id,product_name,company_name,short_name,tracking_base_url,support_email,website_url,footer_text)
  values(org,'Kenza Tracker','Kenza Services','Kenza','https://mellodeals.com/track/','info@kenzaservices.com','https://www.kenzaservices.com','Kenza Services · Attestation Operations')
  on conflict (organization_id) do nothing;
end $$;

create or replace function public.current_organization_id()
returns uuid language sql stable security definer set search_path=public as $$
  select organization_id from public.profiles where id=auth.uid() and is_active=true;
$$;
create or replace function public.is_platform_super_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and is_active=true and is_platform_super_admin=true);
$$;
create or replace function public.is_organization_admin(target uuid default public.current_organization_id())
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_platform_super_admin() or exists(
    select 1 from public.profiles where id=auth.uid() and is_active=true
      and organization_id=target and lower(coalesce(role,''))='admin'
  );
$$;
revoke all on function public.current_organization_id() from public;
revoke all on function public.is_platform_super_admin() from public;
revoke all on function public.is_organization_admin(uuid) from public;
grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.is_platform_super_admin() to authenticated;
grant execute on function public.is_organization_admin(uuid) to authenticated;

-- Automatically supply organization_id for authenticated client inserts.
create or replace function public.apply_current_organization()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.organization_id is null then new.organization_id:=public.current_organization_id(); end if;
  if not public.is_platform_super_admin() and new.organization_id is distinct from public.current_organization_id() then
    raise exception 'Organization access denied';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'branches','cases','documents','document_stages','case_history','document_catalog',
    'appointments','batch_reports','batch_report_items','payments','deliveries',
    'custody_movements','custody_transfers','custody_transfer_items','courier_shipments',
    'courier_shipment_items','user_favorite_cases','notification_outbox'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists apply_current_organization_trigger on public.%I',t);
      execute format('create trigger apply_current_organization_trigger before insert or update of organization_id on public.%I for each row execute function public.apply_current_organization()',t);
      execute format('alter table public.%I enable row level security',t);
      execute format('drop policy if exists tenant_boundary on public.%I',t);
      if t='branches' then
        execute format('create policy tenant_boundary on public.%I as restrictive for all to authenticated using (public.is_platform_super_admin() or organization_id=public.current_organization_id()) with check (public.is_platform_super_admin() or organization_id=public.current_organization_id())',t);
      else
        -- Platform ownership does not automatically expose customer operational records.
        -- The platform owner works inside their own assigned company for day-to-day operations.
        execute format('create policy tenant_boundary on public.%I as restrictive for all to authenticated using (organization_id=public.current_organization_id()) with check (organization_id=public.current_organization_id())',t);
      end if;
    end if;
  end loop;
end $$;

alter table public.organizations enable row level security;
alter table public.organization_settings enable row level security;
alter table public.profiles enable row level security;
drop policy if exists organizations_read on public.organizations;
drop policy if exists organizations_manage on public.organizations;
drop policy if exists organization_settings_read on public.organization_settings;
drop policy if exists organization_settings_manage on public.organization_settings;
create policy organizations_read on public.organizations for select to authenticated
  using (public.is_platform_super_admin() or id=public.current_organization_id());
create policy organizations_manage on public.organizations for all to authenticated
  using (public.is_platform_super_admin()) with check (public.is_platform_super_admin());
create policy organization_settings_read on public.organization_settings for select to authenticated
  using (public.is_platform_super_admin() or organization_id=public.current_organization_id());
create policy organization_settings_manage on public.organization_settings for all to authenticated
  using (public.is_platform_super_admin() or public.is_organization_admin(organization_id))
  with check (public.is_platform_super_admin() or public.is_organization_admin(organization_id));

drop policy if exists tenant_profiles_boundary on public.profiles;
create policy tenant_profiles_boundary on public.profiles as restrictive for all to authenticated
  using (public.is_platform_super_admin() or organization_id=public.current_organization_id())
  with check (public.is_platform_super_admin() or organization_id=public.current_organization_id());

grant select,insert,update,delete on public.organizations to authenticated;
grant select,insert,update,delete on public.organization_settings to authenticated;

-- Login branding can be read before authentication. Only presentation fields are exposed.
create or replace function public.public_branding(request_host text default null, requested_slug text default null)
returns jsonb language sql stable security definer set search_path=public as $$
  select to_jsonb(x) from (
    select s.product_name,s.company_name,s.short_name,s.logo_url,s.favicon_url,s.app_icon_url,s.primary_color,s.secondary_color,
           s.accent_color,s.surface_color,s.login_title,s.login_subtitle,s.login_background_url,s.login_kicker,
           s.login_welcome_title,s.login_welcome_subtitle,s.login_button_text,s.support_email,s.website_url,s.footer_text
    from public.organization_settings s join public.organizations o on o.id=s.organization_id
    where o.status='Active' and (
      (nullif(trim(requested_slug),'') is not null and o.slug=lower(trim(requested_slug))) or
      (nullif(trim(request_host),'') is not null and lower(s.primary_domain)=lower(split_part(trim(request_host),':',1))) or
      (nullif(trim(requested_slug),'') is null and nullif(trim(request_host),'') is null and o.slug='kenza-services')
    ) order by case when o.slug=lower(coalesce(trim(requested_slug),'')) then 0 else 1 end limit 1
  ) x;
$$;
revoke all on function public.public_branding(text,text) from public;
grant execute on function public.public_branding(text,text) to anon,authenticated;

-- Run this once with your own login email after the migration:
-- update public.profiles set is_platform_super_admin=true, role='admin'
-- where id=(select id from auth.users where lower(email)=lower('YOUR-EMAIL@example.com'));

commit;
notify pgrst, 'reload schema';
