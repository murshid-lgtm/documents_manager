-- Document Operations Platform V4.0 — CLEAN INSTALL
-- For a brand-new Supabase project. Do not run the V3 migrations first.
-- Run this complete file once in Supabase SQL Editor. Security hardening is
-- included in the same transaction; no second install step is required.
begin;
create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  legal_name text, status text not null default 'Active' check(status in ('Active','Suspended','Archived')),
  deployment_mode text not null default 'Tenant' check(deployment_mode in ('Tenant','Dedicated')),
  contact_email text, contact_phone text, timezone text not null default 'Asia/Qatar',
  currency_code text not null default 'QAR', created_at timestamptz not null default now(), created_by uuid
);
create table public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  product_name text not null default 'Document Tracker', company_name text not null, short_name text,
  logo_url text, favicon_url text, app_icon_url text, primary_domain text,
  primary_color text not null default '#3265DF', secondary_color text not null default '#17879A',
  accent_color text not null default '#15A37D', surface_color text not null default '#F4F7FC',
  login_title text default 'Document operations, organized.',
  login_subtitle text default 'Secure case, payment, delivery and custody management.',
  login_background_url text,
  login_kicker text default 'LIVE OPERATIONS WORKSPACE',
  login_welcome_title text default 'Welcome back',
  login_welcome_subtitle text default 'Sign in to continue to your operations dashboard.',
  login_button_text text default 'Sign in to workspace',
  sidebar_logo_visible boolean not null default true,
  sidebar_logo_size integer not null default 100 check(sidebar_logo_size between 50 and 130),
  sidebar_logo_alignment text not null default 'center' check(sidebar_logo_alignment in ('left','center','right')),
  sidebar_logo_background text not null default '#FFFFFF',
  sidebar_logo_radius integer not null default 14 check(sidebar_logo_radius between 0 and 32),
  sidebar_logo_container_width integer not null default 190 check(sidebar_logo_container_width between 80 and 240),
  sidebar_logo_container_height integer not null default 64 check(sidebar_logo_container_height between 44 and 120),
  login_logo_visible boolean not null default true,
  login_logo_size integer not null default 100 check(login_logo_size between 50 and 130),
  login_logo_alignment text not null default 'left' check(login_logo_alignment in ('left','center','right')),
  login_logo_background text not null default '#FFFFFF',
  login_logo_radius integer not null default 14 check(login_logo_radius between 0 and 32),
  login_logo_container_width integer not null default 220 check(login_logo_container_width between 80 and 360),
  login_logo_container_height integer not null default 72 check(login_logo_container_height between 44 and 120),
  login_card_logo_visible boolean not null default true,
  login_card_logo_size integer not null default 100 check(login_card_logo_size between 50 and 130),
  login_card_logo_alignment text not null default 'left' check(login_card_logo_alignment in ('left','center','right')),
  login_card_logo_background text not null default '#FFFFFF',
  login_card_logo_radius integer not null default 14 check(login_card_logo_radius between 0 and 32),
  login_card_logo_container_width integer not null default 220 check(login_card_logo_container_width between 80 and 360),
  login_card_logo_container_height integer not null default 64 check(login_card_logo_container_height between 44 and 120),
  tracking_base_url text, support_email text, support_phone text, website_url text, address text, footer_text text,
  label_width_mm numeric(8,2) not null default 75, label_height_mm numeric(8,2) not null default 35,
  enabled_modules jsonb not null default '["dashboard","cases","documents","operations","deliveries","custody","appointments","batches","courier","payments","reports","import"]'::jsonb,
  whatsapp_automation_enabled boolean not null default false,
  updated_at timestamptz not null default now(), updated_by uuid
);
create table public.branches (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null, address text, phone text, email text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,name)
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete restrict,
  full_name text, role text not null default 'staff' check(role in ('admin','branch','staff')),
  branch_id uuid references public.branches(id) on delete set null, is_active boolean not null default true,
  is_platform_super_admin boolean not null default false, avatar_url text, last_login_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint branch_role_requires_branch check(role<>'branch' or branch_id is not null)
);
alter table public.organizations add constraint organizations_created_by_fkey foreign key(created_by) references public.profiles(id) on delete set null;
alter table public.organization_settings add constraint organization_settings_updated_by_fkey foreign key(updated_by) references public.profiles(id) on delete set null;

create table public.cases (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  tracking_reference text not null, public_tracking_token uuid not null default gen_random_uuid(), tracking_family text, legacy_reference text, legacy_status_code text,
  legacy_status_date date, legacy_import_key text, reference_source text,
  bill_no text, internal_invoice_no text, customer_name text not null, mobile text,
  account_name text, account_contact text, account_mobile text,
  branch_id uuid references public.branches(id) on delete set null, intake_source text not null default 'Branch',
  submission_date date, promise_date date, courier_date date, embassy_date date,
  overall_status text not null default 'Received' check(overall_status in ('Received','Under Process','Waiting','Completed','Ready for Delivery','Delivered','Returned','Cancelled')),
  current_milestone text, current_milestone_date date, assigned_to text, physical_location text,
  flags text[] not null default '{}'::text[], direct_to_delhi boolean not null default false, direct_destination text,
  total_amount numeric(14,2) not null default 0, advance_paid numeric(14,2) not null default 0,
  second_payment numeric(14,2) not null default 0, discount_return numeric(14,2) not null default 0,
  balance_payment numeric(14,2) not null default 0, notes text,
  created_by uuid references public.profiles(id) on delete set null, updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,tracking_reference)
);
create table public.documents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  case_id uuid not null references public.cases(id) on delete restrict, document_name text not null, holder_name text,
  source_tracking_reference text, source_service text, occurrence_no integer not null default 1,
  quantity integer not null default 1 check(quantity>0), document_status text not null default 'Pending',
  physical_location text, direct_to_delhi boolean not null default false, direct_destination text,
  current_milestone text, current_milestone_date date, legacy_row_id text, legacy_status_code text,
  legacy_status_date date, legacy_imported boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(case_id,document_name,occurrence_no)
);
create table public.document_stages (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete cascade, stage_name text not null,
  stage_order integer not null default 1, status text not null default 'Pending' check(status in ('Pending','Processing','Completed','Not Required','Cancelled')),
  milestone_date date, is_manual_override boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(document_id,stage_name)
);
create table public.case_history (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  case_id uuid not null references public.cases(id) on delete cascade, user_id uuid references public.profiles(id) on delete set null,
  action text not null, field_name text, old_value text, new_value text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.document_catalog (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null, is_active boolean not null default true, created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), unique(organization_id,name)
);
create table public.appointments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  case_id uuid not null references public.cases(id) on delete restrict, document_id uuid references public.documents(id) on delete set null,
  stage_id uuid references public.document_stages(id) on delete set null, appointment_date date not null, appointment_time time,
  authority text, location text, assigned_to text, status text not null default 'Scheduled' check(status in ('Scheduled','Confirmed','Completed','Cancelled','Missed')),
  notes text, created_by uuid references public.profiles(id) on delete set null, updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.batch_reports (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  report_name text, batch_type text not null, batch_date date not null, session_name text, assigned_to text,
  default_price numeric(14,2) not null default 0, card_reference text, case_status text,
  stage_actions jsonb not null default '[]'::jsonb, notes text,
  created_by uuid references public.profiles(id) on delete set null, updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.batch_report_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  batch_id uuid not null references public.batch_reports(id) on delete cascade, case_id uuid not null references public.cases(id) on delete restrict,
  document_id uuid references public.documents(id) on delete set null, stage_id uuid references public.document_stages(id) on delete set null,
  sort_order integer not null default 1, quantity integer not null default 1, amount numeric(14,2) not null default 0,
  card_reference text, remarks text, manual_tracking text, manual_name text, notes text, created_at timestamptz not null default now()
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  case_id uuid not null references public.cases(id) on delete restrict, receipt_no text, amount numeric(14,2) not null check(amount>0),
  payment_method text, payment_reference text, notes text, received_by uuid references public.profiles(id) on delete set null,
  received_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table public.deliveries (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  case_id uuid not null references public.cases(id) on delete restrict, delivery_no text,
  status text not null default 'Delivered' check(status in ('Delivered','Partial','Cancelled')),
  receiver_name text, receiver_mobile text, receiver_id_reference text,
  payment_collected numeric(14,2) not null default 0, payment_method text, payment_reference text,
  assigned_to text, items jsonb not null default '[]'::jsonb, audit jsonb not null default '[]'::jsonb,
  print_count integer not null default 0, delivered_by uuid references public.profiles(id) on delete set null,
  delivered_at timestamptz, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.custody_movements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  case_id uuid not null references public.cases(id) on delete restrict, document_id uuid references public.documents(id) on delete restrict,
  from_location text, to_location text not null, notes text, handed_by uuid references public.profiles(id) on delete set null,
  moved_at timestamptz not null default now()
);
create table public.custody_transfers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  transfer_no text not null, from_branch_id uuid references public.branches(id) on delete set null,
  to_branch_id uuid references public.branches(id) on delete set null, from_location text, to_location text not null,
  status text not null default 'In Transit' check(status in ('In Transit','Received','Cancelled')),
  requested_by uuid references public.profiles(id) on delete set null, requested_at timestamptz not null default now(),
  received_by uuid references public.profiles(id) on delete set null, received_at timestamptz,
  notes text, receipt_notes text, has_discrepancy boolean not null default false,
  unique(organization_id,transfer_no)
);
create table public.custody_transfer_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  transfer_id uuid not null references public.custody_transfers(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete restrict, document_id uuid references public.documents(id) on delete restrict,
  receive_status text not null default 'Pending' check(receive_status in ('Pending','Verified','Missing','Damaged')),
  discrepancy_note text, verified_by uuid references public.profiles(id) on delete set null, verified_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.courier_shipments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  shipment_no text not null, direction text not null default 'Outbound' check(direction in ('Outbound','Return','Domestic')),
  destination text not null, agent_name text, carrier text, awb_no text, dispatch_date date,
  status text not null default 'Draft' check(status in ('Draft','Prepared','Dispatched','In Transit','Received by Agent','Closed','Cancelled')),
  dispatched_at timestamptz, received_at timestamptz, package_count integer not null default 1,
  bag_reference text, notes text, created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,shipment_no)
);
create table public.courier_shipment_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  shipment_id uuid not null references public.courier_shipments(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete restrict, required_attestation text,
  receipt_status text not null default 'Pending' check(receipt_status in ('Pending','Received','Missing','Exception','Returned')),
  received_at timestamptz, received_by uuid references public.profiles(id) on delete set null,
  exception_note text, created_at timestamptz not null default now(), unique(shipment_id,document_id)
);
create table public.user_favorite_cases (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade, case_id uuid not null references public.cases(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(user_id,case_id)
);
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  case_id uuid references public.cases(id) on delete cascade, event_type text not null, recipient text,
  payload jsonb not null default '{}'::jsonb, status text not null default 'Pending' check(status in ('Pending','Processing','Sent','Failed','Cancelled')),
  attempts integer not null default 0, last_error text, created_at timestamptz not null default now(), processed_at timestamptz
);
create table public.app_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  setting_key text not null, setting_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id) on delete set null,
  primary key(organization_id,setting_key)
);

create index cases_org_status_idx on public.cases(organization_id,overall_status);
create index cases_org_branch_idx on public.cases(organization_id,branch_id);
create index cases_org_tracking_search_idx on public.cases(organization_id,tracking_reference);
create unique index cases_public_tracking_token_uidx on public.cases(public_tracking_token);
create index cases_org_bill_idx on public.cases(organization_id,bill_no);
create index cases_org_mobile_idx on public.cases(organization_id,mobile);
create index cases_created_idx on public.cases(organization_id,created_at desc);
create index documents_case_idx on public.documents(case_id);
create index stages_document_order_idx on public.document_stages(document_id,stage_order);
create index history_case_created_idx on public.case_history(case_id,created_at desc);
create index appointments_date_idx on public.appointments(organization_id,appointment_date,status);
create index payments_received_idx on public.payments(organization_id,received_at desc);
create index custody_transfer_branch_idx on public.custody_transfers(organization_id,from_branch_id,to_branch_id,status);
create index custody_items_transfer_idx on public.custody_transfer_items(transfer_id);
create index courier_status_idx on public.courier_shipments(organization_id,status,dispatch_date);

create or replace function public.current_organization_id() returns uuid language sql stable security definer set search_path=public as $$
 select organization_id from public.profiles where id=auth.uid() and is_active=true;
$$;
create or replace function public.current_profile_branch_id() returns uuid language sql stable security definer set search_path=public as $$
 select branch_id from public.profiles where id=auth.uid() and is_active=true;
$$;
create or replace function public.is_platform_super_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and is_active=true and is_platform_super_admin=true);
$$;
create or replace function public.is_organization_admin(target uuid default public.current_organization_id()) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_platform_super_admin() or exists(select 1 from public.profiles p join public.organizations o on o.id=p.organization_id where p.id=auth.uid() and p.is_active=true and p.organization_id=target and p.role='admin' and o.status='Active');
$$;
create or replace function public.is_active_user() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p join public.organizations o on o.id=p.organization_id where p.id=auth.uid() and p.is_active=true and p.organization_id is not null and o.status='Active');
$$;
create or replace function public.is_kenza_admin() returns boolean language sql stable security definer set search_path=public as $$
 select public.is_organization_admin();
$$;
create or replace function public.is_active_kenza_user() returns boolean language sql stable security definer set search_path=public as $$
 select public.is_active_user();
$$;
revoke all on function public.current_organization_id() from public;
revoke all on function public.current_profile_branch_id() from public;
revoke all on function public.is_platform_super_admin() from public;
revoke all on function public.is_organization_admin(uuid) from public;
revoke all on function public.is_active_user() from public;
grant execute on function public.current_organization_id(),public.current_profile_branch_id(),public.is_platform_super_admin(),public.is_organization_admin(uuid),public.is_active_user(),public.is_kenza_admin(),public.is_active_kenza_user() to authenticated;

create or replace function public.apply_current_organization() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.organization_id is null then new.organization_id:=public.current_organization_id(); end if;
 if not public.is_platform_super_admin() and new.organization_id is distinct from public.current_organization_id() then raise exception 'Organization access denied'; end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['branches','cases','documents','document_stages','case_history','document_catalog','appointments','batch_reports','batch_report_items','payments','deliveries','custody_movements','custody_transfers','custody_transfer_items','courier_shipments','courier_shipment_items','user_favorite_cases','notification_outbox','app_settings'] loop
  execute format('create trigger apply_org before insert or update of organization_id on public.%I for each row execute function public.apply_current_organization()',t);
 end loop;
end $$;
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at:=now();return new;end $$;
do $$ declare t text; begin
 foreach t in array array['organization_settings','branches','profiles','cases','documents','document_stages','appointments','batch_reports','deliveries','courier_shipments'] loop
  execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',t);
 end loop;
end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,full_name,is_active) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),true) on conflict(id) do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

do $$ declare t text; begin
 foreach t in array array['branches','cases','documents','document_stages','case_history','document_catalog','appointments','batch_reports','batch_report_items','payments','deliveries','custody_movements','custody_transfers','custody_transfer_items','courier_shipments','courier_shipment_items','user_favorite_cases','notification_outbox','app_settings'] loop
  execute format('alter table public.%I enable row level security',t);
  if t='branches' then
   execute format('create policy tenant_boundary on public.%I as restrictive for all to authenticated using(public.is_platform_super_admin() or organization_id=public.current_organization_id()) with check(public.is_platform_super_admin() or organization_id=public.current_organization_id())',t);
  else
   execute format('create policy tenant_boundary on public.%I as restrictive for all to authenticated using(organization_id=public.current_organization_id()) with check(organization_id=public.current_organization_id())',t);
  end if;
  execute format('create policy active_operational_access on public.%I for all to authenticated using(public.is_active_user()) with check(public.is_active_user())',t);
 end loop;
end $$;
alter table public.organizations enable row level security;
alter table public.organization_settings enable row level security;
alter table public.profiles enable row level security;
create policy organizations_read on public.organizations for select to authenticated using(public.is_platform_super_admin() or id=public.current_organization_id());
create policy organizations_manage on public.organizations for all to authenticated using(public.is_platform_super_admin()) with check(public.is_platform_super_admin());
create policy settings_read on public.organization_settings for select to authenticated using(public.is_platform_super_admin() or organization_id=public.current_organization_id());
create policy settings_manage on public.organization_settings for all to authenticated using(public.is_platform_super_admin() or public.is_organization_admin(organization_id)) with check(public.is_platform_super_admin() or public.is_organization_admin(organization_id));
create policy profiles_read on public.profiles for select to authenticated using(public.is_platform_super_admin() or organization_id=public.current_organization_id() or id=auth.uid());
create policy profiles_manage on public.profiles for all to authenticated using(public.is_platform_super_admin() or public.is_organization_admin(organization_id)) with check(public.is_platform_super_admin() or public.is_organization_admin(organization_id));

-- A global platform owner has no organization_id. The restrictive branch
-- boundary already validates platform ownership, but this additional
-- permissive policy is required for branch creation and maintenance.
create policy platform_super_admin_manage_branches on public.branches
for all to authenticated
using(public.is_platform_super_admin())
with check(public.is_platform_super_admin());

-- Tighten custody actions in addition to tenant isolation.
drop policy active_operational_access on public.custody_transfers;
drop policy active_operational_access on public.custody_transfer_items;
create policy custody_read on public.custody_transfers for select to authenticated using(public.is_organization_admin() or from_branch_id=public.current_profile_branch_id() or to_branch_id=public.current_profile_branch_id());
create policy custody_create on public.custody_transfers for insert to authenticated with check(public.is_organization_admin() or from_branch_id=public.current_profile_branch_id());
create policy custody_receive on public.custody_transfers for update to authenticated using(public.is_organization_admin() or to_branch_id=public.current_profile_branch_id()) with check(public.is_organization_admin() or to_branch_id=public.current_profile_branch_id());
create policy custody_delete on public.custody_transfers for delete to authenticated using(public.is_organization_admin());
create policy custody_items_read on public.custody_transfer_items for select to authenticated using(exists(select 1 from public.custody_transfers t where t.id=transfer_id and (public.is_organization_admin() or t.from_branch_id=public.current_profile_branch_id() or t.to_branch_id=public.current_profile_branch_id())));
create policy custody_items_create on public.custody_transfer_items for insert to authenticated with check(exists(select 1 from public.custody_transfers t where t.id=transfer_id and (public.is_organization_admin() or t.from_branch_id=public.current_profile_branch_id())));
create policy custody_items_update on public.custody_transfer_items for update to authenticated using(exists(select 1 from public.custody_transfers t where t.id=transfer_id and (public.is_organization_admin() or t.to_branch_id=public.current_profile_branch_id()))) with check(exists(select 1 from public.custody_transfers t where t.id=transfer_id and (public.is_organization_admin() or t.to_branch_id=public.current_profile_branch_id())));
create policy custody_items_delete on public.custody_transfer_items for delete to authenticated using(public.is_organization_admin());

create policy favorite_own on public.user_favorite_cases as restrictive for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create or replace function public.confirm_custody_receipt(target_transfer uuid,receipt_items jsonb,receipt_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.custody_transfers%rowtype; item jsonb; has_issue boolean:=false; affected uuid[]; cid uuid;
begin
 select * into t from public.custody_transfers where id=target_transfer and organization_id=public.current_organization_id() for update;
 if not found then raise exception 'Custody transfer not found'; end if;
 if t.status<>'In Transit' then raise exception 'This transfer is no longer awaiting receipt'; end if;
 if not(public.is_organization_admin() or t.to_branch_id=public.current_profile_branch_id()) then raise exception 'Only the receiving branch can confirm this receipt'; end if;
 if jsonb_array_length(coalesce(receipt_items,'[]'::jsonb))<>(select count(*) from public.custody_transfer_items where transfer_id=target_transfer) then raise exception 'Every transfer item must be verified'; end if;
 for item in select * from jsonb_array_elements(coalesce(receipt_items,'[]'::jsonb)) loop
  if coalesce(item->>'status','') not in ('Verified','Missing','Damaged') then raise exception 'Invalid receipt status'; end if;
  if item->>'status' in ('Missing','Damaged') and nullif(trim(item->>'note'),'') is null then raise exception 'A discrepancy note is required'; end if;
  update public.custody_transfer_items set receive_status=item->>'status',discrepancy_note=nullif(trim(item->>'note'),''),verified_by=auth.uid(),verified_at=now() where id=(item->>'id')::uuid and transfer_id=target_transfer;
  if not found then raise exception 'Invalid transfer item'; end if;
  has_issue:=has_issue or (item->>'status') in ('Missing','Damaged');
 end loop;
 insert into public.custody_movements(organization_id,case_id,document_id,from_location,to_location,notes,handed_by,moved_at)
 select t.organization_id,i.case_id,i.document_id,coalesce(d.physical_location,t.from_location),t.to_location,
        concat_ws(' · ',t.transfer_no,nullif(trim(receipt_note),''),nullif(trim(i.discrepancy_note),'')),auth.uid(),now()
 from public.custody_transfer_items i
 left join public.documents d on d.id=i.document_id
 where i.transfer_id=target_transfer and i.receive_status in ('Verified','Damaged');
 update public.documents d set physical_location=t.to_location,updated_at=now() where exists(select 1 from public.custody_transfer_items i where i.transfer_id=target_transfer and i.receive_status in ('Verified','Damaged') and (i.document_id=d.id or (i.document_id is null and i.case_id=d.case_id)));
 select array_agg(distinct case_id) into affected from public.custody_transfer_items where transfer_id=target_transfer;
 foreach cid in array coalesce(affected,array[]::uuid[]) loop
  update public.cases c set physical_location=case when not exists(select 1 from public.documents d where d.case_id=cid) then t.to_location when not exists(select 1 from public.documents d where d.case_id=cid and coalesce(d.physical_location,'')<>coalesce(t.to_location,'')) then t.to_location else 'Mixed locations' end,updated_by=auth.uid() where c.id=cid;
  insert into public.case_history(organization_id,case_id,user_id,action,field_name,new_value,metadata) values(t.organization_id,cid,auth.uid(),'Custody transfer received','physical_location',coalesce(t.from_location,'Unassigned')||' → '||coalesce(t.to_location,'Unassigned')||' · '||t.transfer_no,jsonb_build_object('source','custody','transfer_id',target_transfer));
 end loop;
 update public.custody_transfers set status='Received',received_by=auth.uid(),received_at=now(),receipt_notes=nullif(trim(receipt_note),''),has_discrepancy=has_issue where id=target_transfer;
 return jsonb_build_object('transfer_id',target_transfer,'case_count',coalesce(array_length(affected,1),0),'has_discrepancy',has_issue);
end $$;
revoke all on function public.confirm_custody_receipt(uuid,jsonb,text) from public;
grant execute on function public.confirm_custody_receipt(uuid,jsonb,text) to authenticated;

create or replace function public.public_branding(request_host text default null,requested_slug text default null)
returns jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(x) from (select s.product_name,s.company_name,s.short_name,s.logo_url,s.favicon_url,s.app_icon_url,s.primary_color,s.secondary_color,s.accent_color,s.surface_color,s.login_title,s.login_subtitle,s.login_background_url,s.login_kicker,s.login_welcome_title,s.login_welcome_subtitle,s.login_button_text,s.sidebar_logo_visible,s.sidebar_logo_size,s.sidebar_logo_alignment,s.sidebar_logo_background,s.sidebar_logo_radius,s.sidebar_logo_container_width,s.sidebar_logo_container_height,s.login_logo_visible,s.login_logo_size,s.login_logo_alignment,s.login_logo_background,s.login_logo_radius,s.login_logo_container_width,s.login_logo_container_height,s.login_card_logo_visible,s.login_card_logo_size,s.login_card_logo_alignment,s.login_card_logo_background,s.login_card_logo_radius,s.login_card_logo_container_width,s.login_card_logo_container_height,s.support_email,s.website_url,s.footer_text from public.organization_settings s join public.organizations o on o.id=s.organization_id where o.status='Active' and ((nullif(trim(requested_slug),'') is not null and o.slug=lower(trim(requested_slug))) or (nullif(trim(request_host),'') is not null and lower(s.primary_domain)=lower(split_part(trim(request_host),':',1)))) limit 1) x;
$$;
revoke all on function public.public_branding(text,text) from public;
grant execute on function public.public_branding(text,text) to anon,authenticated;

grant usage on schema public to anon,authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;

-- Create the first Auth user in Supabase Authentication > Users, then replace
-- the email and run this statement separately after this file commits.
-- The platform owner intentionally has no organization or branch. Companies
-- are created later from Platform Management.
-- update public.profiles p
-- set role='admin',is_active=true,is_platform_super_admin=true,organization_id=null,branch_id=null
-- from auth.users u
-- where p.id=u.id and lower(u.email)=lower('OWNER_EMAIL_HERE');

-- BEGIN GENERATED SECURITY HARDENING — generated by scripts/sync-clean-install-security.mjs
-- Document Operations Platform V4.0.20 — SECURITY HARDENING
-- Run once after V4_0_CLEAN_INSTALL.sql on existing installations.
-- This migration removes broad tenant-wide CRUD, enforces branch/resource
-- authorization, protects privileged profile fields and adds opaque public links.



-- JWTs are signed credentials, but a logged-out session must not retain access.
create or replace function public.is_current_session_valid() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and coalesce((auth.jwt()->>'exp')::bigint,0)>extract(epoch from now())
    and coalesce((auth.jwt()->>'exp')::bigint,0)-coalesce((auth.jwt()->>'iat')::bigint,0) between 1 and 86400
    and exists(select 1 from auth.sessions s
      where s.id=nullif(auth.jwt()->>'session_id','')::uuid
        and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function public.is_current_session_valid() from public;
grant execute on function public.is_current_session_valid() to authenticated;

create or replace function public.apply_current_organization() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'='service_role'
     or (auth.uid() is null and session_user in ('postgres','supabase_admin','supabase_auth_admin')) then
    return new;
  end if;
  if new.organization_id is null then new.organization_id:=public.current_organization_id(); end if;
  if not public.is_current_session_valid() or
     (not public.is_platform_super_admin() and new.organization_id is distinct from public.current_organization_id()) then
    raise exception 'Organization access denied';
  end if;
  return new;
end $$;

alter table public.cases
  add column if not exists public_tracking_token uuid not null default gen_random_uuid();
create unique index if not exists cases_public_tracking_token_uidx
  on public.cases(public_tracking_token);

create table if not exists public.api_rate_limits (
  bucket text not null,
  key_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key(bucket,key_hash)
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon,authenticated;

create or replace function public.consume_api_rate_limit(
  p_bucket text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  current_count integer;
begin
  if coalesce(p_bucket,'')='' or coalesce(p_key_hash,'')='' or p_limit<1 or p_window_seconds<1 then
    return false;
  end if;

  insert into public.api_rate_limits(bucket,key_hash,window_start,request_count)
  values(p_bucket,p_key_hash,now(),1)
  on conflict(bucket,key_hash) do update
  set window_start=case
        when public.api_rate_limits.window_start <= now()-make_interval(secs=>p_window_seconds) then now()
        else public.api_rate_limits.window_start
      end,
      request_count=case
        when public.api_rate_limits.window_start <= now()-make_interval(secs=>p_window_seconds) then 1
        else public.api_rate_limits.request_count+1
      end
  returning request_count into current_count;

  return current_count<=p_limit;
end $$;
revoke all on function public.consume_api_rate_limit(text,text,integer,integer) from public;
grant execute on function public.consume_api_rate_limit(text,text,integer,integer) to service_role;

create or replace function public.current_profile_role() returns text
language sql stable security definer set search_path=public as $$
  select role from public.profiles where id=auth.uid() and is_active=true;
$$;

create or replace function public.can_access_case(target_case uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.is_platform_super_admin() or exists(
    select 1
    from public.cases c
    join public.profiles p on p.id=auth.uid() and p.is_active=true
    join public.organizations o on o.id=p.organization_id and o.status='Active'
    where c.id=target_case
      and c.organization_id=p.organization_id
      and (p.role in ('admin','staff') or (p.role='branch' and (
        p.branch_id=c.branch_id or exists(
          select 1 from public.custody_transfers t
          join public.custody_transfer_items i on i.transfer_id=t.id
          join public.branches b on b.id=p.branch_id
          where t.organization_id=p.organization_id and t.to_branch_id=p.branch_id
            and t.status='Received' and i.case_id=c.id and i.receive_status in ('Verified','Damaged')
            and (c.physical_location=b.name or exists(select 1 from public.documents d
              where d.case_id=c.id and d.physical_location=b.name and (i.document_id is null or i.document_id=d.id)))
        )
      )))
  );
$$;

revoke all on function public.current_profile_role() from public;
revoke all on function public.can_access_case(uuid) from public;
grant execute on function public.current_profile_role(),public.can_access_case(uuid) to authenticated;

create or replace function public.protect_profile_privileges() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'='service_role'
     or (auth.uid() is null and session_user in ('postgres','supabase_admin','supabase_auth_admin')) then
    return new;
  end if;
  if tg_op='INSERT' or
     new.organization_id is distinct from old.organization_id or
     new.role is distinct from old.role or
     new.branch_id is distinct from old.branch_id or
     new.is_active is distinct from old.is_active or
     new.is_platform_super_admin is distinct from old.is_platform_super_admin then
    raise exception 'Privileged profile changes must use the protected administration API';
  end if;
  return new;
end $$;

-- Pending recipients may inspect the batch, without permission to edit cases.
create or replace function public.can_read_case(target_case uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.can_access_case(target_case) or exists(
    select 1 from public.custody_transfer_items i
    join public.custody_transfers t on t.id=i.transfer_id
    join public.profiles p on p.id=auth.uid() and p.is_active=true
    join public.organizations o on o.id=p.organization_id and o.status='Active'
    where i.case_id=target_case and t.organization_id=p.organization_id
      and p.branch_id in (t.from_branch_id,t.to_branch_id)
  );
$$;
revoke all on function public.can_read_case(uuid) from public;
grant execute on function public.can_read_case(uuid) to authenticated;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
before insert or update on public.profiles
for each row execute function public.protect_profile_privileges();

create or replace function public.validate_branch_organization() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.branch_id is not null and not exists(
    select 1 from public.branches b
    where b.id=new.branch_id and b.organization_id=new.organization_id
  ) then
    raise exception 'Selected branch does not belong to this organization';
  end if;
  return new;
end $$;

drop trigger if exists validate_profile_branch_organization on public.profiles;
create trigger validate_profile_branch_organization
before insert or update of organization_id,branch_id on public.profiles
for each row execute function public.validate_branch_organization();
drop trigger if exists validate_case_branch_organization on public.cases;
create trigger validate_case_branch_organization
before insert or update of organization_id,branch_id on public.cases
for each row execute function public.validate_branch_organization();

-- Remove the original blanket CRUD policy from every operational table.
do $$ declare t text; begin
  foreach t in array array[
    'branches','cases','documents','document_stages','case_history','document_catalog',
    'appointments','batch_reports','batch_report_items','payments','deliveries',
    'custody_movements','custody_transfers','custody_transfer_items',
    'courier_shipments','courier_shipment_items','user_favorite_cases',
    'notification_outbox','app_settings'
  ] loop
    execute format('drop policy if exists active_operational_access on public.%I',t);
    execute format('drop policy if exists tenant_boundary on public.%I',t);
    execute format(
      'create policy tenant_boundary on public.%I as restrictive for all to authenticated using(public.is_platform_super_admin() or organization_id=public.current_organization_id()) with check(public.is_platform_super_admin() or organization_id=public.current_organization_id())',
      t
    );
  end loop;
end $$;

drop policy if exists profiles_manage on public.profiles;
revoke insert,update,delete on public.profiles from authenticated;

drop policy if exists branches_read on public.branches;
drop policy if exists branches_manage on public.branches;
create policy branches_read on public.branches for select to authenticated
using(public.is_platform_super_admin() or (public.is_active_user() and organization_id=public.current_organization_id()));
create policy branches_manage on public.branches for all to authenticated
using(public.is_platform_super_admin() or public.is_organization_admin(organization_id))
with check(public.is_platform_super_admin() or public.is_organization_admin(organization_id));

drop policy if exists cases_read on public.cases;
drop policy if exists cases_create on public.cases;
drop policy if exists cases_update on public.cases;
drop policy if exists cases_delete on public.cases;
create policy cases_read on public.cases for select to authenticated using(public.can_read_case(id));
create policy cases_create on public.cases for insert to authenticated with check(
  public.is_platform_super_admin() or (
    organization_id=public.current_organization_id() and public.is_active_user() and
    (public.current_profile_role() in ('admin','staff') or branch_id=public.current_profile_branch_id())
  )
);
create policy cases_update on public.cases for update to authenticated
using(public.can_access_case(id)) with check(public.can_access_case(id));
create policy cases_delete on public.cases for delete to authenticated
using(public.is_platform_super_admin() or public.is_organization_admin(organization_id));

drop policy if exists documents_access on public.documents;
drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated using(public.can_read_case(case_id));
create policy documents_access on public.documents for all to authenticated
using(public.can_access_case(case_id)) with check(public.can_access_case(case_id));

drop policy if exists document_stages_access on public.document_stages;
drop policy if exists document_stages_read on public.document_stages;
create policy document_stages_read on public.document_stages for select to authenticated
using(exists(select 1 from public.documents d where d.id=document_id and public.can_read_case(d.case_id)));
create policy document_stages_access on public.document_stages for all to authenticated
using(exists(select 1 from public.documents d where d.id=document_id and public.can_access_case(d.case_id)))
with check(exists(select 1 from public.documents d where d.id=document_id and public.can_access_case(d.case_id)));

drop policy if exists case_history_read on public.case_history;
drop policy if exists case_history_create on public.case_history;
drop policy if exists case_history_delete on public.case_history;
create policy case_history_read on public.case_history for select to authenticated using(public.can_read_case(case_id));
create policy case_history_create on public.case_history for insert to authenticated with check(public.can_access_case(case_id));
create policy case_history_delete on public.case_history for delete to authenticated
using(public.is_platform_super_admin() or public.is_organization_admin(organization_id));

drop policy if exists document_catalog_read on public.document_catalog;
drop policy if exists document_catalog_create on public.document_catalog;
drop policy if exists document_catalog_manage on public.document_catalog;
create policy document_catalog_read on public.document_catalog for select to authenticated using(public.is_platform_super_admin() or public.is_active_user());
create policy document_catalog_create on public.document_catalog for insert to authenticated with check(public.is_platform_super_admin() or public.is_active_user());
create policy document_catalog_manage on public.document_catalog for update to authenticated
using(public.is_organization_admin(organization_id)) with check(public.is_organization_admin(organization_id));

drop policy if exists appointments_access on public.appointments;
create policy appointments_access on public.appointments for all to authenticated
using(public.can_access_case(case_id)) with check(
  public.can_access_case(case_id)
  and (document_id is null or exists(select 1 from public.documents d where d.id=document_id and d.case_id=appointments.case_id))
  and (stage_id is null or exists(select 1 from public.document_stages s join public.documents d on d.id=s.document_id where s.id=stage_id and d.case_id=appointments.case_id and (appointments.document_id is null or d.id=appointments.document_id)))
);

drop policy if exists batch_reports_read on public.batch_reports;
drop policy if exists batch_reports_create on public.batch_reports;
drop policy if exists batch_reports_update on public.batch_reports;
drop policy if exists batch_reports_delete on public.batch_reports;
create policy batch_reports_read on public.batch_reports for select to authenticated using(
  public.is_platform_super_admin() or (public.is_active_user() and
  (public.current_profile_role() in ('admin','staff') or created_by=auth.uid()))
);
create policy batch_reports_create on public.batch_reports for insert to authenticated with check((public.is_platform_super_admin() or public.is_active_user()) and created_by=auth.uid());
create policy batch_reports_update on public.batch_reports for update to authenticated
using(public.is_organization_admin(organization_id) or created_by=auth.uid())
with check(public.is_organization_admin(organization_id) or created_by=auth.uid());
create policy batch_reports_delete on public.batch_reports for delete to authenticated
using(public.is_organization_admin(organization_id) or created_by=auth.uid());

drop policy if exists batch_report_items_access on public.batch_report_items;
create policy batch_report_items_access on public.batch_report_items for all to authenticated
using(
  public.can_access_case(case_id)
  and exists(select 1 from public.batch_reports b where b.id=batch_id and (public.is_organization_admin(b.organization_id) or b.created_by=auth.uid() or public.current_profile_role() in ('admin','staff')))
) with check(
  public.can_access_case(case_id)
  and exists(select 1 from public.batch_reports b where b.id=batch_id and (public.is_organization_admin(b.organization_id) or b.created_by=auth.uid() or public.current_profile_role() in ('admin','staff')))
  and (document_id is null or exists(select 1 from public.documents d where d.id=document_id and d.case_id=batch_report_items.case_id))
  and (stage_id is null or exists(select 1 from public.document_stages s join public.documents d on d.id=s.document_id where s.id=stage_id and d.case_id=batch_report_items.case_id and (batch_report_items.document_id is null or d.id=batch_report_items.document_id)))
);

drop policy if exists payments_access on public.payments;
create policy payments_access on public.payments for all to authenticated
using(public.can_access_case(case_id)) with check(public.can_access_case(case_id));
drop policy if exists deliveries_access on public.deliveries;
create policy deliveries_access on public.deliveries for all to authenticated
using(public.can_access_case(case_id)) with check(public.can_access_case(case_id));
drop policy if exists custody_movements_access on public.custody_movements;
create policy custody_movements_access on public.custody_movements for all to authenticated
using(public.can_access_case(case_id)) with check(
  public.can_access_case(case_id)
  and (document_id is null or exists(select 1 from public.documents d where d.id=document_id and d.case_id=custody_movements.case_id))
);

-- Existing custody transfer policies remain branch-aware. Platform owners must
-- also be permitted to see and administer them.
drop policy if exists platform_custody_transfers on public.custody_transfers;
drop policy if exists platform_custody_transfer_items on public.custody_transfer_items;
create policy platform_custody_transfers on public.custody_transfers for all to authenticated
using(public.is_platform_super_admin()) with check(public.is_platform_super_admin());
create policy platform_custody_transfer_items on public.custody_transfer_items for all to authenticated
using(public.is_platform_super_admin()) with check(public.is_platform_super_admin());
drop policy if exists custody_items_case_access on public.custody_transfer_items;
create policy custody_items_case_access on public.custody_transfer_items as restrictive for insert to authenticated
with check(
  public.can_access_case(case_id)
  and (document_id is null or exists(select 1 from public.documents d where d.id=document_id and d.case_id=custody_transfer_items.case_id))
);

-- Receipt status is written only by the validated, transactional RPC.
revoke update on public.custody_transfers,public.custody_transfer_items from authenticated;

create or replace function public.validate_custody_dispatch() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name='custody_transfers' then
    if new.status<>'In Transit' or new.received_by is not null or new.received_at is not null then
      raise exception 'New transfers must be awaiting receipt';
    end if;
    if new.from_branch_id is null or new.to_branch_id is null or new.from_branch_id=new.to_branch_id then
      raise exception 'Select different sending and receiving branches';
    end if;
    select name into new.from_location from public.branches where id=new.from_branch_id and organization_id=new.organization_id and is_active;
    select name into new.to_location from public.branches where id=new.to_branch_id and organization_id=new.organization_id and is_active;
    if new.from_location is null or new.to_location is null then raise exception 'Select active company branches'; end if;
  else
    if new.receive_status<>'Pending' or new.verified_by is not null or new.verified_at is not null then
      raise exception 'New transfer items must await verification';
    end if;
    if not exists(select 1 from public.custody_transfers t where t.id=new.transfer_id and t.status='In Transit') then
      raise exception 'This transfer is no longer awaiting dispatch';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists validate_custody_dispatch on public.custody_transfers;
create trigger validate_custody_dispatch before insert on public.custody_transfers
for each row execute function public.validate_custody_dispatch();
drop trigger if exists validate_custody_dispatch on public.custody_transfer_items;
create trigger validate_custody_dispatch before insert on public.custody_transfer_items
for each row execute function public.validate_custody_dispatch();
revoke all on function public.validate_custody_dispatch() from public;

drop policy if exists courier_shipments_access on public.courier_shipments;
create policy courier_shipments_access on public.courier_shipments for all to authenticated
using(public.is_platform_super_admin() or (public.is_active_user() and public.current_profile_role() in ('admin','staff')))
with check(public.is_platform_super_admin() or (public.is_active_user() and public.current_profile_role() in ('admin','staff')));
drop policy if exists courier_shipment_items_access on public.courier_shipment_items;
create policy courier_shipment_items_access on public.courier_shipment_items for all to authenticated
using(
  (public.is_platform_super_admin() or public.current_profile_role() in ('admin','staff'))
  and exists(select 1 from public.documents d where d.id=document_id and public.can_access_case(d.case_id))
)
with check(
  (public.is_platform_super_admin() or public.current_profile_role() in ('admin','staff'))
  and exists(select 1 from public.documents d where d.id=document_id and public.can_access_case(d.case_id))
  and exists(select 1 from public.courier_shipments s where s.id=shipment_id and (public.is_platform_super_admin() or s.organization_id=public.current_organization_id()))
);

drop policy if exists favorite_accessible_case on public.user_favorite_cases;
create policy favorite_accessible_case on public.user_favorite_cases for all to authenticated
using(user_id=auth.uid() and public.can_access_case(case_id))
with check(user_id=auth.uid() and public.can_access_case(case_id));

revoke select,insert,update,delete on public.notification_outbox from authenticated;

drop policy if exists app_settings_read on public.app_settings;
drop policy if exists app_settings_manage on public.app_settings;
create policy app_settings_read on public.app_settings for select to authenticated using(public.is_platform_super_admin() or public.is_active_user());
create policy app_settings_manage on public.app_settings for all to authenticated
using(public.is_organization_admin(organization_id)) with check(public.is_organization_admin(organization_id));

-- Parent and child rows must belong to the same tenant. NOT VALID preserves
-- any historic inconsistent rows while enforcing the constraint for new writes.
create unique index if not exists branches_org_id_uidx on public.branches(organization_id,id);
create unique index if not exists cases_org_id_uidx on public.cases(organization_id,id);
create unique index if not exists documents_org_id_uidx on public.documents(organization_id,id);
create unique index if not exists stages_org_id_uidx on public.document_stages(organization_id,id);

do $$ begin
  if not exists(select 1 from pg_constraint where conname='documents_org_case_fkey') then
    alter table public.documents add constraint documents_org_case_fkey
      foreign key(organization_id,case_id) references public.cases(organization_id,id) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='stages_org_document_fkey') then
    alter table public.document_stages add constraint stages_org_document_fkey
      foreign key(organization_id,document_id) references public.documents(organization_id,id) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='history_org_case_fkey') then
    alter table public.case_history add constraint history_org_case_fkey
      foreign key(organization_id,case_id) references public.cases(organization_id,id) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='appointments_org_case_fkey') then
    alter table public.appointments add constraint appointments_org_case_fkey
      foreign key(organization_id,case_id) references public.cases(organization_id,id) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='payments_org_case_fkey') then
    alter table public.payments add constraint payments_org_case_fkey
      foreign key(organization_id,case_id) references public.cases(organization_id,id) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='deliveries_org_case_fkey') then
    alter table public.deliveries add constraint deliveries_org_case_fkey
      foreign key(organization_id,case_id) references public.cases(organization_id,id) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='movements_org_case_fkey') then
    alter table public.custody_movements add constraint movements_org_case_fkey
      foreign key(organization_id,case_id) references public.cases(organization_id,id) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='favorites_org_case_fkey') then
    alter table public.user_favorite_cases add constraint favorites_org_case_fkey
      foreign key(organization_id,case_id) references public.cases(organization_id,id) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='outbox_org_case_fkey') then
    alter table public.notification_outbox add constraint outbox_org_case_fkey
      foreign key(organization_id,case_id) references public.cases(organization_id,id) not valid;
  end if;
end $$;

-- Prevent branch staff changing a case's submitted branch to escape scope.
create or replace function public.protect_case_scope() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and public.current_profile_role()='branch' and
    (new.branch_id is distinct from old.branch_id or new.organization_id is distinct from old.organization_id) then
    raise exception 'Only an administrator can change the submitted branch';
  end if;
  return new;
end $$;
drop trigger if exists protect_case_scope on public.cases;
create trigger protect_case_scope before update on public.cases
for each row execute function public.protect_case_scope();

-- Enforce tenant ownership for every parent link, including transfer branches.
create unique index if not exists batches_org_id_uidx on public.batch_reports(organization_id,id);
create unique index if not exists transfers_org_id_uidx on public.custody_transfers(organization_id,id);
create unique index if not exists shipments_org_id_uidx on public.courier_shipments(organization_id,id);
do $$ declare link record; cname text; begin
  for link in select * from (values
    ('cases','branch_id','branches'),('profiles','branch_id','branches'),
    ('appointments','document_id','documents'),('appointments','stage_id','document_stages'),
    ('batch_report_items','batch_id','batch_reports'),('batch_report_items','case_id','cases'),
    ('batch_report_items','document_id','documents'),('batch_report_items','stage_id','document_stages'),
    ('custody_movements','document_id','documents'),
    ('custody_transfers','from_branch_id','branches'),('custody_transfers','to_branch_id','branches'),
    ('custody_transfer_items','transfer_id','custody_transfers'),('custody_transfer_items','case_id','cases'),
    ('custody_transfer_items','document_id','documents'),
    ('courier_shipment_items','shipment_id','courier_shipments'),('courier_shipment_items','document_id','documents')
  ) as links(child,col,parent) loop
    cname:=link.child||'_org_'||link.col||'_fkey';
    if not exists(select 1 from pg_constraint where conname=cname) then
      execute format('alter table public.%I add constraint %I foreign key(organization_id,%I) references public.%I(organization_id,id) not valid',link.child,cname,link.col,link.parent);
    end if;
  end loop;
end $$;

-- Audit attribution cannot be impersonated by submitting another staff ID.
create or replace function public.set_actor_attribution() returns trigger
language plpgsql security definer set search_path=public as $$
declare payload jsonb; field text;
begin
  if auth.uid() is null then return new; end if;
  payload:=to_jsonb(new);
  if tg_op='INSERT' then
    foreach field in array array['created_by','user_id','received_by','delivered_by','handed_by','requested_by'] loop
      if payload ? field and not(tg_table_name='custody_transfers' and field='received_by') then
        payload:=jsonb_set(payload,array[field],to_jsonb(auth.uid()));
      end if;
    end loop;
  end if;
  if payload ? 'updated_by' then payload:=jsonb_set(payload,array['updated_by'],to_jsonb(auth.uid())); end if;
  new:=jsonb_populate_record(new,payload);
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['cases','documents','document_stages','case_history','document_catalog','appointments','batch_reports','payments','deliveries','custody_movements','custody_transfers','courier_shipments','organization_settings','app_settings'] loop
    execute format('drop trigger if exists actor_attribution on public.%I',t);
    execute format('create trigger actor_attribution before insert or update on public.%I for each row execute function public.set_actor_attribution()',t);
  end loop;
end $$;

-- All authenticated table access requires a still-live session, including
-- tenants/settings/profile policies originally installed by V4.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' and tablename<>'api_rate_limits' loop
    execute format('alter table public.%I enable row level security',t.tablename);
    execute format('drop policy if exists live_session on public.%I',t.tablename);
    execute format('create policy live_session on public.%I as restrictive for all to authenticated using((select public.is_current_session_valid())) with check((select public.is_current_session_valid()))',t.tablename);
  end loop;
end $$;
revoke all on function public.protect_profile_privileges(),public.validate_branch_organization(),public.apply_current_organization(),public.protect_case_scope(),public.set_actor_attribution() from public;
revoke all on function public.is_kenza_admin(),public.is_active_kenza_user(),public.handle_new_user() from public;
grant execute on function public.is_kenza_admin(),public.is_active_kenza_user() to authenticated;

-- Hosted projects may have explicit default grants, in addition to PUBLIC.
revoke all on function public.consume_api_rate_limit(text,text,integer,integer) from anon,authenticated;
revoke all on function public.protect_profile_privileges(),public.validate_branch_organization(),public.apply_current_organization(),public.protect_case_scope(),public.set_actor_attribution(),public.validate_custody_dispatch(),public.handle_new_user() from anon,authenticated;
revoke all on function public.is_current_session_valid(),public.current_profile_role(),public.can_access_case(uuid),public.can_read_case(uuid),public.current_organization_id(),public.current_profile_branch_id(),public.is_platform_super_admin(),public.is_organization_admin(uuid),public.is_active_user(),public.is_kenza_admin(),public.is_active_kenza_user(),public.confirm_custody_receipt(uuid,jsonb,text) from anon;
alter function public.touch_updated_at() set search_path='';
revoke all on function public.touch_updated_at() from public,anon,authenticated;

create or replace function public.confirm_custody_receipt(target_transfer uuid,receipt_items jsonb,receipt_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.custody_transfers%rowtype; item jsonb; has_issue boolean:=false; affected uuid[]; cid uuid;
begin
 if not public.is_current_session_valid() then raise exception 'Your session has expired'; end if;
 if jsonb_typeof(receipt_items) is distinct from 'array' then raise exception 'Every transfer item must be verified'; end if;
 select * into t from public.custody_transfers where id=target_transfer and (organization_id=public.current_organization_id() or public.is_platform_super_admin()) for update;
 if not found then raise exception 'Custody transfer not found'; end if;
 if t.status<>'In Transit' then raise exception 'This transfer is no longer awaiting receipt'; end if;
 if not(public.is_organization_admin() or t.to_branch_id=public.current_profile_branch_id()) then raise exception 'Only the receiving branch can confirm this receipt'; end if;
 if jsonb_array_length(receipt_items)=0 or (select count(distinct x->>'id') from jsonb_array_elements(receipt_items) x)<>jsonb_array_length(receipt_items) then raise exception 'Verify each transfer item exactly once'; end if;
 if jsonb_array_length(coalesce(receipt_items,'[]'::jsonb))<>(select count(*) from public.custody_transfer_items where transfer_id=target_transfer) then raise exception 'Every transfer item must be verified'; end if;
 for item in select * from jsonb_array_elements(coalesce(receipt_items,'[]'::jsonb)) loop
  if coalesce(item->>'status','') not in ('Verified','Missing','Damaged') then raise exception 'Invalid receipt status'; end if;
  if item->>'status' in ('Missing','Damaged') and nullif(trim(item->>'note'),'') is null then raise exception 'A discrepancy note is required'; end if;
  update public.custody_transfer_items set receive_status=item->>'status',discrepancy_note=nullif(trim(item->>'note'),''),verified_by=auth.uid(),verified_at=now() where id=(item->>'id')::uuid and transfer_id=target_transfer;
  if not found then raise exception 'Invalid transfer item'; end if;
  has_issue:=has_issue or (item->>'status') in ('Missing','Damaged');
 end loop;
 insert into public.custody_movements(organization_id,case_id,document_id,from_location,to_location,notes,handed_by,moved_at)
 select t.organization_id,i.case_id,i.document_id,coalesce(d.physical_location,t.from_location),t.to_location,
        concat_ws(' · ',t.transfer_no,nullif(trim(receipt_note),''),nullif(trim(i.discrepancy_note),'')),auth.uid(),now()
 from public.custody_transfer_items i
 left join public.documents d on d.id=i.document_id
 where i.transfer_id=target_transfer and i.receive_status in ('Verified','Damaged');
 update public.documents d set physical_location=t.to_location,updated_at=now() where exists(select 1 from public.custody_transfer_items i where i.transfer_id=target_transfer and i.receive_status in ('Verified','Damaged') and (i.document_id=d.id or (i.document_id is null and i.case_id=d.case_id)));
 select array_agg(distinct case_id) into affected from public.custody_transfer_items where transfer_id=target_transfer;
 foreach cid in array coalesce(affected,array[]::uuid[]) loop
  update public.cases c set physical_location=case when not exists(select 1 from public.documents d where d.case_id=cid) then t.to_location when not exists(select 1 from public.documents d where d.case_id=cid and coalesce(d.physical_location,'')<>coalesce(t.to_location,'')) then t.to_location else 'Mixed locations' end,updated_by=auth.uid() where c.id=cid;
  insert into public.case_history(organization_id,case_id,user_id,action,field_name,new_value,metadata) values(t.organization_id,cid,auth.uid(),'Custody transfer received','physical_location',coalesce(t.from_location,'Unassigned')||' → '||coalesce(t.to_location,'Unassigned')||' · '||t.transfer_no,jsonb_build_object('source','custody','transfer_id',target_transfer));
 end loop;
 update public.custody_transfers set status='Received',received_by=auth.uid(),received_at=now(),receipt_notes=nullif(trim(receipt_note),''),has_discrepancy=has_issue where id=target_transfer;
 return jsonb_build_object('transfer_id',target_transfer,'case_count',coalesce(array_length(affected,1),0),'has_discrepancy',has_issue);
end $$;
revoke all on function public.confirm_custody_receipt(uuid,jsonb,text) from public;
grant execute on function public.confirm_custody_receipt(uuid,jsonb,text) to authenticated;




commit;
notify pgrst,'reload schema';
