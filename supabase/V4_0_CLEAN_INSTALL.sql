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




-- V4.0.21: Preserve the existing tenant/branch access model while allowing
-- INSERT RETURNING to evaluate the new row. can_access_case already permits
-- every active admin/staff member to read cases within their own organization.
-- The direct predicate has the same scope for persisted rows; no cross-tenant
-- access, branch reassignment, or revoked-session access is added.

drop policy if exists cases_read on public.cases;
create policy cases_read on public.cases for select to authenticated using (
 public.is_platform_super_admin() or (
 organization_id=public.current_organization_id() and public.is_active_user() and
 (public.current_profile_role() in ('admin','staff') or branch_id=public.current_profile_branch_id() or public.can_read_case(id))
 ));
-- Existing staff inherit company modules until an administrator saves a list.
alter table public.profiles add column if not exists staff_modules text[];
create or replace function public.can_use_module(module_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_platform_super_admin() or exists(
  select 1 from public.profiles p join public.organizations o on o.id=p.organization_id
  left join public.organization_settings s on s.organization_id=p.organization_id
  where p.id=auth.uid() and p.is_active and o.status='Active' and (
   p.role='admin' or exists(
    select 1 from unnest(coalesce(p.staff_modules,array['dashboard','cases','documents','operations','deliveries','custody','appointments','batches','courier','payments','reports'])) m
    where (module_name=m or module_name='case_data')
    and (s.enabled_modules is null or s.enabled_modules ? m)
   )
  )
 );
$$;
revoke all on function public.can_use_module(text) from public,anon;
grant execute on function public.can_use_module(text) to authenticated;
do $$ declare entry record; begin
 for entry in select * from (values
 ('cases','case_data'),('documents','case_data'),('document_stages','case_data'),('case_history','case_data'),('user_favorite_cases','case_data'),
 ('appointments','appointments'),('payments','payments'),('deliveries','deliveries'),
 ('custody_transfers','custody'),('custody_transfer_items','custody'),('custody_movements','custody'),
 ('batch_reports','batches'),('batch_report_items','batches'),('courier_shipments','courier'),('courier_shipment_items','courier')
 ) as v(table_name,module_name) loop
 execute format('drop policy if exists staff_module_access on public.%I',entry.table_name);
 execute format('create policy staff_module_access on public.%I as restrictive for all to authenticated using((select public.can_use_module(%L))) with check((select public.can_use_module(%L)))',entry.table_name,entry.module_name,entry.module_name);
 end loop;
end $$;
-- Restrictive write policies also protect actions reached through another page.
drop policy if exists staff_case_write on public.cases;
create policy staff_case_write on public.cases as restrictive for insert to authenticated
with check(public.can_use_module('cases') or public.can_use_module('operations'));
drop policy if exists staff_case_update on public.cases;
create policy staff_case_update on public.cases as restrictive for update to authenticated
using(public.can_use_module('cases') or public.can_use_module('operations'))
with check(public.can_use_module('cases') or public.can_use_module('operations'));
-- The receipt RPC runs as owner, so check module authorization inside it too.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.confirm_custody_receipt(uuid,jsonb,text)'::regprocedure);
 if position('Module access denied' in definition)=0 then
  definition:=replace(definition,E'begin\n',E'begin\n if not public.can_use_module(''custody'') then raise exception ''Module access denied''; end if;\n');
  execute definition;
 end if;
end $$;
-- Canonical phone suffix supports country codes/spaces without scanning cases.
alter table public.cases add column if not exists mobile_search_key text
 generated always as (right(regexp_replace(coalesce(mobile,''),'[^0-9]','','g'),8)) stored;
create index if not exists cases_org_mobile_search_idx on public.cases(organization_id,mobile_search_key);



-- V5: additive business platform. Existing cases, payments and custody are preserved.

create table if not exists public.platform_subscriptions (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 plan_name text not null default 'Business', seat_limit integer not null default 50 check(seat_limit between 1 and 100000),
 branch_limit integer not null default 20 check(branch_limit between 1 and 10000),
 allowed_modules jsonb not null default '["dashboard","cases","documents","operations","deliveries","custody","appointments","batches","courier","payments","reports","import","crm","sales","services"]',
 updated_at timestamptz not null default now()
);
create or replace function public.business_access(target_org uuid, target_branch uuid, module_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select public.is_current_session_valid() and exists (
 select 1 from public.profiles p left join public.organizations o on o.id=target_org
 left join public.organization_settings s on s.organization_id=target_org
 left join public.platform_subscriptions sub on sub.organization_id=target_org
 where p.id=auth.uid() and p.is_active and (
 p.is_platform_super_admin or (p.organization_id=target_org and o.status='Active'
 and coalesce(s.enabled_modules,'[]'::jsonb) ? module_name
 and (sub.organization_id is null or sub.allowed_modules ? module_name)
 and (p.role='admin' or p.staff_modules is null or module_name=any(p.staff_modules))
 and (p.role<>'branch' or p.branch_id=target_branch))))
$$;
create or replace function public.business_customer_access(target_org uuid,target_branch uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.business_access(target_org,target_branch,'crm') or public.business_access(target_org,target_branch,'sales')
 or public.business_access(target_org,target_branch,'services') or public.business_access(target_org,target_branch,'cases')
$$;
create table if not exists public.crm_customers (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 branch_id uuid references public.branches(id),name text not null check(length(btrim(name)) between 1 and 200),
 mobile text,email text,company text,address text,notes text,email_updates boolean not null default false,
 whatsapp_opt_in boolean not null default false,archived boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,organization_id),
 check(email is null or email='' or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
create table if not exists public.service_catalog (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 name text not null check(length(btrim(name)) between 1 and 200),category text,
 service_type text not null default 'Service' check(service_type in ('Sale','Service','Staged service','Attestation')),
 base_price numeric(14,2) not null default 0 check(base_price>=0),workflow jsonb not null default '[]' check(jsonb_typeof(workflow)='array' and jsonb_array_length(workflow)<=30),
 renewal_months integer check(renewal_months between 1 and 120),is_active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,organization_id),unique(organization_id,name)
);
create table if not exists public.crm_leads (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),branch_id uuid references public.branches(id),
 customer_id uuid,title text not null check(length(btrim(title)) between 1 and 200),contact_name text,mobile text,email text,source text,
 status text not null default 'New' check(status in ('New','Contacted','Qualified','Quoted','Won','Lost')),
 expected_value numeric(14,2) not null default 0 check(expected_value>=0),assigned_to text,next_follow_up date,notes text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,organization_id),
 foreign key(customer_id,organization_id) references public.crm_customers(id,organization_id)
);
create table if not exists public.sales_documents (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),branch_id uuid references public.branches(id),customer_id uuid,
 document_no text not null default ('INV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 kind text not null default 'Invoice' check(kind in ('Quotation','Invoice')),status text not null default 'Draft' check(status in ('Draft','Issued','Accepted','Cancelled')),
 customer_name text not null check(length(btrim(customer_name)) between 1 and 200),customer_mobile text,customer_email text,
 items jsonb not null default '[]' check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 100),
 discount numeric(14,2) not null default 0 check(discount>=0),tax_percent numeric(7,3) not null default 0 check(tax_percent between 0 and 100),
 subtotal numeric(14,2) not null default 0,total numeric(14,2) not null default 0,paid_total numeric(14,2) not null default 0,
 due_date date,notes text,source_quote_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(id,organization_id),unique(organization_id,document_no),unique(source_quote_id),
 foreign key(customer_id,organization_id) references public.crm_customers(id,organization_id),
 foreign key(source_quote_id,organization_id) references public.sales_documents(id,organization_id)
);
create table if not exists public.sales_payments (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),branch_id uuid references public.branches(id),document_id uuid not null,
 amount numeric(14,2) not null check(amount>0),method text not null default 'Cash' check(method in ('Cash','Card','Bank transfer','Other')),
 reference text,notes text,received_at timestamptz not null default now(),received_by uuid default auth.uid() references public.profiles(id),
 voided boolean not null default false,void_reason text,voided_by uuid references public.profiles(id),voided_at timestamptz,
 unique(id,organization_id),foreign key(document_id,organization_id) references public.sales_documents(id,organization_id)
);
create table if not exists public.service_jobs (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),branch_id uuid references public.branches(id),customer_id uuid,service_id uuid,
 job_no text not null default ('JOB-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),title text not null check(length(btrim(title)) between 1 and 200),customer_name text not null,
 status text not null default 'Received' check(status in ('Received','Active','Awaiting approval','Completed','Cancelled')),
 assigned_to text,stages jsonb not null default '[]' check(jsonb_typeof(stages)='array' and jsonb_array_length(stages)<=30),
 due_date date,next_follow_up date,renewal_date date,notes text,invoice_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,organization_id),unique(organization_id,job_no),
 foreign key(customer_id,organization_id) references public.crm_customers(id,organization_id),
 foreign key(service_id,organization_id) references public.service_catalog(id,organization_id),
 foreign key(invoice_id,organization_id) references public.sales_documents(id,organization_id)
);
alter table public.cases add column if not exists customer_id uuid references public.crm_customers(id);
alter table public.cases add column if not exists customer_email text;
alter table public.cases add column if not exists email_updates boolean not null default false;
alter table public.cases add column if not exists whatsapp_opt_in boolean not null default false;
create table if not exists public.business_events (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),branch_id uuid references public.branches(id),
 module text not null,resource_id uuid not null,action text not null,summary text not null,actor_id uuid references public.profiles(id),created_at timestamptz not null default now()
);
create index if not exists business_events_resource_idx on public.business_events(organization_id,module,resource_id,created_at desc);
create or replace function public.business_validate_row() returns trigger language plpgsql security definer set search_path='' as $$
declare linked_branch uuid; linked_org uuid; stage jsonb;
begin
 if tg_op='UPDATE' and new.organization_id<>old.organization_id then raise exception 'A record cannot be moved to another company.';end if;
 if new.branch_id is not null and not exists(select 1 from public.branches b where b.id=new.branch_id and b.organization_id=new.organization_id and (b.is_active or tg_op='UPDATE' and new.branch_id is not distinct from old.branch_id)) then raise exception 'Select an active branch from this company.';end if;
 if new.customer_id is not null then
 select c.branch_id,c.organization_id into linked_branch,linked_org from public.crm_customers c where c.id=new.customer_id;
 if linked_org is distinct from new.organization_id or not public.business_customer_access(linked_org,linked_branch) and auth.uid() is not null then raise exception 'This customer is not available to your account.';end if;
 end if;
 if tg_table_name='cases' then
 if new.customer_email is not null and new.customer_email<>'' and new.customer_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid customer email address.';end if;
 elsif tg_table_name='service_jobs' then
 if new.invoice_id is not null and not exists(select 1 from public.sales_documents d where d.id=new.invoice_id and d.organization_id=new.organization_id and d.branch_id is not distinct from new.branch_id and d.kind='Invoice' and public.business_access(d.organization_id,d.branch_id,'sales')) then raise exception 'Choose an invoice available in this branch.';end if;
 for stage in select value from jsonb_array_elements(new.stages) loop
 if coalesce(stage->>'name','')='' or coalesce(stage->>'status','') not in ('Pending','Processing','Awaiting approval','Completed','Not required') then raise exception 'Every stage needs a name and a valid status.';end if;
 end loop;
 if new.status='Completed' and exists(select 1 from jsonb_array_elements(new.stages) st where st->>'status' not in ('Completed','Not required')) then raise exception 'Complete the stages or mark them not required before completing this job.';end if;
 end if;
 return new;
end $$;
create or replace function public.business_document_totals() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb; quantity numeric; price numeric; amount numeric:=0; payments numeric;source public.sales_documents%rowtype;
begin
 if tg_op='INSERT' and new.kind='Quotation' and new.document_no like 'INV-%' then new.document_no:='QTN-'||substr(new.document_no,5);end if;
 if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.kind<>old.kind or new.source_quote_id is distinct from old.source_quote_id) then raise exception 'The company, document type and source quotation cannot be changed.';end if;
 if new.source_quote_id is not null then
 select * into source from public.sales_documents where id=new.source_quote_id;
 if source.kind<>'Quotation' or source.status='Cancelled' or source.organization_id<>new.organization_id or source.branch_id is distinct from new.branch_id or not public.business_access(source.organization_id,source.branch_id,'sales') then raise exception 'This quotation is not available for conversion.';end if;
 end if;
 for item in select value from jsonb_array_elements(new.items) loop
 if jsonb_typeof(item)<>'object' or length(coalesce(item->>'description','')) not between 1 and 300 then raise exception 'Add a description for every item.';end if;
 quantity:=(item->>'quantity')::numeric;price:=(item->>'unit_price')::numeric;
 if quantity is null or price is null or quantity<=0 or quantity>1000000 or price<0 or price>100000000 or quantity::text in ('NaN','Infinity') or price::text in ('NaN','Infinity') then raise exception 'Enter valid quantities and prices.';end if;
 if nullif(item->>'service_id','') is not null and not exists(select 1 from public.service_catalog s where s.id=(item->>'service_id')::uuid and s.organization_id=new.organization_id) then raise exception 'Select a service from this company.';end if;
 amount:=amount+round(quantity*price,2);
 end loop;
 if new.discount>amount then raise exception 'Discount cannot exceed the subtotal.';end if;
 new.subtotal:=amount;new.total:=round((amount-new.discount)*(1+new.tax_percent/100),2);
 select coalesce(sum(p.amount),0) into payments from public.sales_payments p where p.document_id=new.id and not p.voided;
 if tg_op='UPDATE' and payments>0 and (new.items<>old.items or new.discount<>old.discount or new.tax_percent<>old.tax_percent or new.customer_id is distinct from old.customer_id or new.customer_name<>old.customer_name or new.branch_id is distinct from old.branch_id or new.status in ('Draft','Cancelled')) then raise exception 'An invoice with payments cannot be changed or cancelled. Ask an administrator to void incorrect payments first.';end if;
 new.paid_total:=payments;new.updated_at:=now();return new;
end $$;
create or replace function public.business_payment_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare invoice public.sales_documents%rowtype;paid numeric;
begin
 if tg_op='UPDATE' then
 if current_setting('business.void_payment',true) is distinct from 'yes' or new.document_id<>old.document_id or new.organization_id<>old.organization_id or new.amount<>old.amount or old.voided then raise exception 'Payments are permanent. Use the administrator void action to correct a payment.';end if;
 return new;
 end if;
 select * into invoice from public.sales_documents where id=new.document_id for update;
 if invoice.id is null or invoice.organization_id<>new.organization_id or not public.business_access(invoice.organization_id,invoice.branch_id,'sales') then raise exception 'This invoice is not available to your account.';end if;
 if invoice.kind<>'Invoice' or invoice.status<>'Issued' then raise exception 'Payments can only be recorded against an issued invoice.';end if;
 select coalesce(sum(amount),0) into paid from public.sales_payments where document_id=invoice.id and not voided;
 if new.amount+paid>invoice.total then raise exception 'Payment exceeds the outstanding invoice balance.';end if;
 new.branch_id:=invoice.branch_id;new.received_by:=auth.uid();new.received_at:=now();new.voided:=false;new.void_reason:=null;new.voided_by:=null;new.voided_at:=null;
 return new;
end $$;
create or replace function public.business_payment_total() returns trigger language plpgsql security definer set search_path='' as $$
begin update public.sales_documents set paid_total=paid_total where id=new.document_id;return new;end $$;
create or replace function public.business_log_event() returns trigger language plpgsql security definer set search_path='' as $$
declare m text;label text; r jsonb:=to_jsonb(new);
begin
 m:=case tg_table_name when 'crm_customers' then 'crm' when 'crm_leads' then 'crm' when 'service_jobs' then 'services' else 'sales' end;
 label:=case when tg_table_name='sales_payments' then case when (r->>'voided')::boolean then 'Payment voided' else 'Payment received' end when tg_op='INSERT' then 'Record created' else 'Record updated' end;
 insert into public.business_events(organization_id,branch_id,module,resource_id,action,summary,actor_id) values(new.organization_id,new.branch_id,m,case when tg_table_name='sales_payments' then (r->>'document_id')::uuid else new.id end,tg_op,label,auth.uid());return new;
end $$;
create or replace function public.convert_business_quote(quote_id uuid) returns uuid language plpgsql set search_path='' as $$
declare q public.sales_documents%rowtype; result uuid;
begin select * into q from public.sales_documents where id=quote_id for update;
 if q.id is null or q.kind<>'Quotation' or q.status not in ('Issued','Accepted') then raise exception 'Select an issued quotation you can access.';end if;
 select id into result from public.sales_documents where source_quote_id=q.id;if result is not null then return result;end if;
 insert into public.sales_documents(organization_id,branch_id,customer_id,customer_name,customer_mobile,customer_email,kind,status,items,discount,tax_percent,due_date,notes,source_quote_id)
 values(q.organization_id,q.branch_id,q.customer_id,q.customer_name,q.customer_mobile,q.customer_email,'Invoice','Issued',q.items,q.discount,q.tax_percent,q.due_date,q.notes,q.id) returning id into result;
 update public.sales_documents set status='Accepted' where id=q.id;return result;end $$;
create or replace function public.void_business_payment(payment_id uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare p public.sales_payments%rowtype;
begin select * into p from public.sales_payments where id=payment_id for update;
 if p.id is null or not public.business_access(p.organization_id,p.branch_id,'sales') or not public.is_organization_admin(p.organization_id) then raise exception 'Only a company administrator can void this payment.';end if;
 if length(btrim(coalesce(reason,''))) not between 5 and 500 then raise exception 'Enter a reason of at least five characters.';end if;
 perform set_config('business.void_payment','yes',true);
 update public.sales_payments set voided=true,void_reason=btrim(reason),voided_by=auth.uid(),voided_at=now() where id=p.id;
 perform set_config('business.void_payment','no',true);end $$;
create or replace function public.convert_business_lead(lead_id uuid) returns uuid language plpgsql set search_path='' as $$
declare lead public.crm_leads%rowtype;result uuid;
begin select * into lead from public.crm_leads where id=lead_id for update;
 if lead.id is null or lead.status='Lost' then raise exception 'Select an active lead you can access.';end if;
 if lead.customer_id is not null then result:=lead.customer_id;else
 insert into public.crm_customers(organization_id,branch_id,name,mobile,email) values(lead.organization_id,lead.branch_id,coalesce(nullif(lead.contact_name,''),lead.title),lead.mobile,lead.email) returning id into result;end if;
 update public.crm_leads set customer_id=result,status='Won',updated_at=now() where id=lead.id;return result;end $$;
revoke all on function public.convert_business_lead(uuid) from public,anon;
grant execute on function public.convert_business_lead(uuid) to authenticated,service_role;
-- Restrict tenant and branch scope at the database, including direct REST requests.
do $$ declare t text; m text;begin
 foreach t in array array['crm_customers','crm_leads','sales_documents','service_jobs'] loop
 m:=case t when 'crm_customers' then 'crm' when 'crm_leads' then 'crm' when 'sales_documents' then 'sales' else 'services' end;
 execute format('alter table public.%I enable row level security',t);
 execute format('drop policy if exists business_read on public.%I',t);
 execute format('drop policy if exists business_write on public.%I',t);
 execute format('create policy business_read on public.%I for select to authenticated using (%s)',t,case when t='crm_customers' then 'public.business_customer_access(organization_id,branch_id)' else format('public.business_access(organization_id,branch_id,%L)',m) end);
 execute format('create policy business_write on public.%I for all to authenticated using (public.business_access(organization_id,branch_id,%L)) with check (public.business_access(organization_id,branch_id,%L))',t,m,m);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('drop trigger if exists business_org on public.%I',t);
 execute format('create trigger business_org before insert or update on public.%I for each row execute function public.apply_current_organization()',t);
 if t<>'crm_customers' then
 execute format('drop trigger if exists business_validate on public.%I',t);
 execute format('create trigger business_validate before insert or update on public.%I for each row execute function public.business_validate_row()',t);
 else
 execute format('drop trigger if exists business_branch on public.%I',t);
 execute format('create trigger business_branch before insert or update on public.%I for each row execute function public.validate_branch_organization()',t);
 end if;
 execute format('drop trigger if exists business_event on public.%I',t);
 execute format('create trigger business_event after insert or update on public.%I for each row execute function public.business_log_event()',t);
 execute format('create index if not exists %I on public.%I(organization_id,branch_id,created_at desc)',t||'_scope_idx',t);
 end loop;
end $$;
drop trigger if exists business_totals on public.sales_documents;
create trigger business_totals before insert or update on public.sales_documents for each row execute function public.business_document_totals();
drop trigger if exists business_case_customer on public.cases;
create trigger business_case_customer before insert or update on public.cases for each row execute function public.business_validate_row();
alter table public.sales_payments enable row level security;
drop policy if exists business_read on public.sales_payments;
create policy business_read on public.sales_payments for select to authenticated using(public.business_access(organization_id,branch_id,'sales'));
drop policy if exists business_insert on public.sales_payments;
create policy business_insert on public.sales_payments for insert to authenticated with check(public.business_access(organization_id,branch_id,'sales'));
revoke all on public.sales_payments from anon,authenticated;grant select,insert on public.sales_payments to authenticated;grant all on public.sales_payments to service_role;
drop trigger if exists business_payment_guard on public.sales_payments;create trigger business_payment_guard before insert or update on public.sales_payments for each row execute function public.business_payment_guard();
drop trigger if exists business_payment_total on public.sales_payments;create trigger business_payment_total after insert or update on public.sales_payments for each row execute function public.business_payment_total();
drop trigger if exists business_payment_event on public.sales_payments;create trigger business_payment_event after insert or update on public.sales_payments for each row execute function public.business_log_event();
create index if not exists sales_payments_document_idx on public.sales_payments(document_id) where not voided;
alter table public.business_events enable row level security;drop policy if exists business_read on public.business_events;
create policy business_read on public.business_events for select to authenticated using(public.business_access(organization_id,branch_id,module));
revoke all on public.business_events from anon,authenticated;grant select on public.business_events to authenticated;grant all on public.business_events to service_role;
alter table public.service_catalog enable row level security;drop policy if exists catalog_read on public.service_catalog;drop policy if exists catalog_write on public.service_catalog;
create policy catalog_read on public.service_catalog for select to authenticated using(public.business_access(organization_id,public.current_profile_branch_id(),'sales') or public.business_access(organization_id,public.current_profile_branch_id(),'services'));
create policy catalog_write on public.service_catalog for all to authenticated using(public.is_organization_admin(organization_id) and public.is_current_session_valid()) with check(public.is_organization_admin(organization_id) and public.is_current_session_valid());
revoke all on public.service_catalog from anon,authenticated;grant select,insert,update on public.service_catalog to authenticated;grant all on public.service_catalog to service_role;
drop trigger if exists business_org on public.service_catalog;create trigger business_org before insert or update on public.service_catalog for each row execute function public.apply_current_organization();
alter table public.platform_subscriptions enable row level security;drop policy if exists subscription_read on public.platform_subscriptions;drop policy if exists subscription_write on public.platform_subscriptions;
create policy subscription_read on public.platform_subscriptions for select to authenticated using(public.is_current_session_valid() and (public.is_organization_admin(organization_id) or organization_id=public.current_organization_id()));
create policy subscription_write on public.platform_subscriptions for all to authenticated using(public.is_platform_super_admin() and public.is_current_session_valid()) with check(public.is_platform_super_admin() and public.is_current_session_valid());
revoke all on public.platform_subscriptions from anon,authenticated;grant select,insert,update on public.platform_subscriptions to authenticated;grant all on public.platform_subscriptions to service_role;
create or replace function public.business_limit_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare limit_count integer;used integer;
begin
 if new.organization_id is null then return new;end if;
 -- Serialize capacity checks for simultaneous admin requests.
 perform 1 from public.organizations where id=new.organization_id for update;
 if tg_table_name='profiles' and new.is_active then
 select seat_limit into limit_count from public.platform_subscriptions where organization_id=new.organization_id;
 select count(*) into used from public.profiles where organization_id=new.organization_id and is_active and id<>new.id;
 elsif tg_table_name='branches' and new.is_active then
 select branch_limit into limit_count from public.platform_subscriptions where organization_id=new.organization_id;
 select count(*) into used from public.branches where organization_id=new.organization_id and is_active and id<>new.id;
 end if;
 if limit_count is not null and used>=limit_count then raise exception 'The company plan limit has been reached. Contact the platform owner to increase the limit.';end if;return new;end $$;
drop trigger if exists business_limit on public.profiles;create trigger business_limit before insert or update on public.profiles for each row execute function public.business_limit_guard();
drop trigger if exists business_limit on public.branches;create trigger business_limit before insert or update on public.branches for each row execute function public.business_limit_guard();
alter table public.organization_settings alter column enabled_modules set default '["dashboard","cases","documents","operations","deliveries","custody","appointments","batches","courier","payments","reports","import","crm","sales","services"]'::jsonb;
update public.organization_settings set enabled_modules=enabled_modules||'["crm","sales","services"]'::jsonb where not enabled_modules ? 'crm';
-- A CRM-only staff account must not inherit attestation data access.
create or replace function public.can_use_module(module_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_current_session_valid() and (public.is_platform_super_admin() or exists(
 select 1 from public.profiles p join public.organizations o on o.id=p.organization_id
 left join public.organization_settings s on s.organization_id=p.organization_id
 left join public.platform_subscriptions sub on sub.organization_id=p.organization_id
 where p.id=auth.uid() and p.is_active and o.status='Active' and (
 p.role='admin' and (sub.organization_id is null or sub.allowed_modules ? module_name or module_name='case_data' and exists(select 1 from jsonb_array_elements_text(sub.allowed_modules) m where m=any(array['dashboard','cases','documents','operations','deliveries','custody','appointments','batches','courier','payments','reports'])))
 or exists(select 1 from unnest(coalesce(p.staff_modules,array['dashboard','cases','documents','operations','deliveries','custody','appointments','batches','courier','payments','reports'])) m
 where (module_name=m or module_name='case_data' and m=any(array['dashboard','cases','documents','operations','deliveries','custody','appointments','batches','courier','payments','reports']))
 and (s.enabled_modules is null or s.enabled_modules ? m) and (sub.organization_id is null or sub.allowed_modules ? m)))));
$$;
revoke all on function public.can_use_module(text) from public,anon;
grant execute on function public.can_use_module(text) to authenticated;
-- Trigger functions are not callable through REST. Only the explicit authorization helpers/RPCs are exposed.
do $$ declare f text;begin foreach f in array array['business_validate_row()','business_document_totals()','business_payment_guard()','business_payment_total()','business_log_event()','business_limit_guard()'] loop execute 'revoke all on function public.'||f||' from public,anon,authenticated';end loop;end $$;
revoke all on function public.business_access(uuid,uuid,text),public.business_customer_access(uuid,uuid),public.convert_business_quote(uuid),public.void_business_payment(uuid,text) from public,anon;
grant execute on function public.business_access(uuid,uuid,text),public.business_customer_access(uuid,uuid),public.convert_business_quote(uuid),public.void_business_payment(uuid,text) to authenticated,service_role;



-- Provider accounts are disabled by default. Secrets are stored in Supabase Vault, not client-readable settings.

create table if not exists public.communication_settings (
 organization_id uuid primary key references public.organizations(id),email_enabled boolean not null default false,
 email_provider text not null default 'brevo' check(email_provider in ('brevo','resend')),sender_name text,sender_email text,reply_to text,
 email_daily_limit integer not null default 100 check(email_daily_limit between 1 and 300),email_monthly_limit integer not null default 3000 check(email_monthly_limit between 1 and 100000),
 whatsapp_enabled boolean not null default false,whatsapp_phone_id text,whatsapp_business_id text,whatsapp_template text,whatsapp_language text not null default 'en',
 whatsapp_api_version text not null default 'v25.0',whatsapp_daily_limit integer not null default 100 check(whatsapp_daily_limit between 1 and 10000),country_code text not null default '974',
 event_types jsonb not null default '["case_created","case_status","payment","appointment","delivery","job_status","invoice_issued","renewal"]',
 updated_at timestamptz not null default now()
);
create table if not exists public.integration_credentials (
 organization_id uuid not null references public.organizations(id),kind text not null check(kind in ('email','whatsapp')),
 vault_secret_id uuid not null,updated_at timestamptz not null default now(),primary key(organization_id,kind)
);
create table if not exists public.communication_outbox (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),channel text not null check(channel in ('email','whatsapp')),
 event_type text not null,event_key text not null,recipient text not null,payload jsonb not null,
 status text not null default 'Queued' check(status in ('Queued','Processing','Accepted','Delivered','Read','Failed','Unconfirmed','Skipped')),
 attempts integer not null default 0,provider_message_id text,last_error text,next_attempt timestamptz not null default now(),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,channel,event_key)
);
create index if not exists communication_queue_idx on public.communication_outbox(next_attempt) where status='Queued';
create index if not exists communication_company_idx on public.communication_outbox(organization_id,created_at desc);
create index if not exists communication_provider_idx on public.communication_outbox(organization_id,provider_message_id);
create table if not exists public.communication_usage (
 key_hash text not null,period text not null,used integer not null default 0,primary key(key_hash,period)
);
create table if not exists public.communication_runtime (
 singleton boolean primary key default true check(singleton),worker_url text not null,token_secret_id uuid not null,updated_at timestamptz not null default now()
);
do $$ declare t text;begin foreach t in array array['communication_settings','integration_credentials','communication_outbox','communication_usage','communication_runtime'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
end loop;end $$;
drop policy if exists communications_read on public.communication_settings;create policy communications_read on public.communication_settings for select to authenticated using(public.is_current_session_valid() and public.is_organization_admin(organization_id));
drop policy if exists communications_read on public.communication_outbox;create policy communications_read on public.communication_outbox for select to authenticated using(public.is_current_session_valid() and public.is_organization_admin(organization_id));
grant select on public.communication_settings,public.communication_outbox to authenticated;
create or replace function public.save_communication_credentials(target_org uuid,credential_kind text,secret_json jsonb) returns void language plpgsql security definer set search_path='' as $$
declare secret_id uuid;
begin
 if credential_kind not in ('email','whatsapp') or jsonb_typeof(secret_json)<>'object' or length(secret_json::text)>16384 then raise exception 'Invalid integration credentials.';end if;
 perform 1 from public.organizations where id=target_org for update;if not found then raise exception 'Company not found.';end if;
 select vault_secret_id into secret_id from public.integration_credentials where organization_id=target_org and kind=credential_kind;
 if secret_id is null then select vault.create_secret(secret_json::text,'workspace-'||target_org::text||'-'||credential_kind) into secret_id;
 else perform vault.update_secret(secret_id,secret_json::text);end if;
 insert into public.integration_credentials(organization_id,kind,vault_secret_id) values(target_org,credential_kind,secret_id) on conflict(organization_id,kind) do update set updated_at=now();end $$;
create or replace function public.get_communication_credentials(target_org uuid,credential_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin select v.decrypted_secret::jsonb into result from public.integration_credentials c join vault.decrypted_secrets v on v.id=c.vault_secret_id where c.organization_id=target_org and c.kind=credential_kind;return result;end $$;
create or replace function public.configure_communication_worker(worker_url text,worker_token text) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin if worker_url !~ '^https://[a-zA-Z0-9.-]+/api/communications/worker$' or length(worker_token)<32 then raise exception 'Invalid worker configuration.';end if;
 select token_secret_id into sid from public.communication_runtime where singleton for update;
 if sid is null then select vault.create_secret(worker_token,'workspace-communications-worker') into sid;else perform vault.update_secret(sid,worker_token);end if;
 insert into public.communication_runtime(singleton,worker_url,token_secret_id) values(true,worker_url,sid) on conflict(singleton) do update set worker_url=excluded.worker_url,updated_at=now();end $$;
create or replace function public.wake_communication_worker() returns void language plpgsql security definer set search_path='' as $$
declare endpoint text;token text;
begin
 if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return;end if;
 select r.worker_url,v.decrypted_secret into endpoint,token from public.communication_runtime r join vault.decrypted_secrets v on v.id=r.token_secret_id where r.singleton;
 if endpoint is not null then execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)' using endpoint,'{}'::jsonb,jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token);end if;
 exception when others then raise warning 'Communication wake-up deferred.';
end $$;
create or replace function public.communication_wake_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.wake_communication_worker();return null;end $$;
drop trigger if exists communication_wake on public.communication_outbox;
create trigger communication_wake after insert on public.communication_outbox for each statement execute function public.communication_wake_trigger();
create or replace function public.communication_recipient_allowed(message_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare msg public.communication_outbox%rowtype;c public.cases%rowtype;customer public.crm_customers%rowtype;cfg public.communication_settings%rowtype;phone text;consent boolean;email text;
begin
 select * into msg from public.communication_outbox where id=message_id;
 if msg.id is null then return false;end if;
 select * into cfg from public.communication_settings where organization_id=msg.organization_id;
 if nullif(msg.payload->>'case_id','') is not null then
 select * into c from public.cases where id=(msg.payload->>'case_id')::uuid and organization_id=msg.organization_id;
 if c.id is null then return false;end if;
 consent:=case when msg.channel='email' then c.email_updates else c.whatsapp_opt_in end;email:=c.customer_email;phone:=c.mobile;
 if c.customer_id is not null then select * into customer from public.crm_customers where id=c.customer_id and organization_id=msg.organization_id;consent:=consent and not customer.archived and case when msg.channel='email' then customer.email_updates else customer.whatsapp_opt_in end;end if;
 elsif nullif(msg.payload->>'customer_id','') is not null then
 select * into customer from public.crm_customers where id=(msg.payload->>'customer_id')::uuid and organization_id=msg.organization_id;
 if customer.id is null or customer.archived then return false;end if;
 consent:=case when msg.channel='email' then customer.email_updates else customer.whatsapp_opt_in end;email:=customer.email;phone:=customer.mobile;
 else return false;end if;
 if not coalesce(consent,false) then return false;end if;
 if msg.channel='email' then return lower(email)=msg.recipient;end if;
 phone:=regexp_replace(coalesce(phone,''),'[^0-9]','','g');if length(phone)=8 then phone:=cfg.country_code||phone;end if;return phone=msg.recipient;
end $$;
create or replace function public.claim_communications(target_org uuid default null) returns setof public.communication_outbox language plpgsql security definer set search_path='' as $$
begin
 -- An interrupted request may already have reached the provider. Never blindly resend it.
 update public.communication_outbox set status='Unconfirmed',last_error='Delivery outcome requires review.',updated_at=now() where status='Processing' and updated_at<now()-interval '5 minutes';
 return query with picked as (select id from public.communication_outbox where status='Queued' and next_attempt<=now() and attempts<5 and (target_org is null or organization_id=target_org) order by created_at for update skip locked limit 3)
 update public.communication_outbox o set status='Processing',attempts=o.attempts+1,updated_at=now() from picked where o.id=picked.id returning o.*;
end $$;
create or replace function public.reserve_communication_quota(account_hash text,company_hash text,daily_cap integer,monthly_cap integer,company_daily_cap integer,company_monthly_cap integer) returns boolean language plpgsql security definer set search_path='' as $$
declare day_key text:=to_char(now() at time zone 'UTC','YYYY-MM-DD');month_key text:=to_char(now() at time zone 'UTC','YYYY-MM');entry record;n integer;
begin
 if account_hash !~ '^[a-f0-9]{64}$' or company_hash !~ '^[a-f0-9]{64}$' or least(daily_cap,monthly_cap,company_daily_cap,company_monthly_cap)<1 then raise exception 'Invalid quota configuration.';end if;
 -- Stable lock ordering makes shared-provider account limits safe across companies and concurrent workers.
 for entry in select * from (values(account_hash,day_key,daily_cap),(account_hash,month_key,monthly_cap),(company_hash,day_key,company_daily_cap),(company_hash,month_key,company_monthly_cap)) q(key,period,cap) order by key,period loop
 insert into public.communication_usage(key_hash,period) values(entry.key,entry.period) on conflict do nothing;
 select used into n from public.communication_usage where key_hash=entry.key and period=entry.period for update;
 if n>=entry.cap then return false;end if;
 end loop;
 update public.communication_usage set used=used+1 where (key_hash=account_hash or key_hash=company_hash) and period in(day_key,month_key);return true;
end $$;
create or replace function public.enqueue_customer_update(target_org uuid,event_name text,event_id text,email_address text,email_agreed boolean,phone_number text,whatsapp_agreed boolean,message_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare cfg public.communication_settings%rowtype;phone text;
begin
 select * into cfg from public.communication_settings where organization_id=target_org;
 if cfg.organization_id is null or not cfg.event_types ? event_name or not exists(select 1 from public.organizations where id=target_org and status='Active') then return;end if;
 if cfg.email_enabled and email_agreed and email_address ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then insert into public.communication_outbox(organization_id,channel,event_type,event_key,recipient,payload) values(target_org,'email',event_name,event_id,lower(email_address),message_payload) on conflict do nothing;end if;
 phone:=regexp_replace(coalesce(phone_number,''),'[^0-9]','','g');if length(phone)=8 then phone:=cfg.country_code||phone;end if;
 if cfg.whatsapp_enabled and whatsapp_agreed and phone ~ '^[1-9][0-9]{7,14}$' then insert into public.communication_outbox(organization_id,channel,event_type,event_key,recipient,payload) values(target_org,'whatsapp',event_name,event_id,phone,message_payload) on conflict do nothing;end if;
end $$;
create or replace function public.communication_event_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=to_jsonb(new);prev jsonb; c public.cases%rowtype;d public.sales_documents%rowtype;cust public.crm_customers%rowtype;b public.organization_settings%rowtype;event_name text;ref text;name text;status text;email text;phone text;email_ok boolean:=false;wa_ok boolean:=false;payload jsonb;event_id text;tracking text;
begin
 if tg_op='UPDATE' then prev:=to_jsonb(old);end if;
 if tg_table_name='cases' then
 if tg_op='UPDATE' and r->>'overall_status'=prev->>'overall_status' then return new;end if;
 c:=new;event_name:=case when tg_op='INSERT' then 'case_created' else 'case_status' end;
 elsif tg_table_name in ('payments','appointments','deliveries') then
 if tg_op='UPDATE' and tg_table_name='appointments' and r->>'status'=prev->>'status' and r->>'appointment_date'=prev->>'appointment_date' and r->>'appointment_time'=prev->>'appointment_time' then return new;end if;
 if tg_op='UPDATE' and tg_table_name='deliveries' then return new;end if;
 select * into c from public.cases where id=(r->>'case_id')::uuid;event_name:=case tg_table_name when 'payments' then 'payment' when 'appointments' then 'appointment' else 'delivery' end;
 elsif tg_table_name='sales_documents' then
 if new.status<>'Issued' or tg_op='UPDATE' and r->>'status'=prev->>'status' then return new;end if;
 d:=new;event_name:='invoice_issued';
 elsif tg_table_name='sales_payments' then
 if new.voided then return new;end if;select * into d from public.sales_documents where id=new.document_id;event_name:='payment';
 elsif tg_table_name='service_jobs' then
 if tg_op='UPDATE' and r->>'status'=prev->>'status' then return new;end if;
 event_name:='job_status';select * into cust from public.crm_customers where id=new.customer_id;
 end if;
 select * into b from public.organization_settings where organization_id=new.organization_id;
 if c.id is not null then ref:=c.tracking_reference;name:=c.customer_name;status:=coalesce(r->>'status',c.overall_status);email:=c.customer_email;phone:=c.mobile;email_ok:=c.email_updates;wa_ok:=c.whatsapp_opt_in;
 elsif d.id is not null then select * into cust from public.crm_customers where id=d.customer_id;ref:=d.document_no;name:=d.customer_name;status:=d.status;email:=coalesce(nullif(d.customer_email,''),cust.email);phone:=coalesce(nullif(d.customer_mobile,''),cust.mobile);email_ok:=coalesce(cust.email_updates,false);wa_ok:=coalesce(cust.whatsapp_opt_in,false);
 else ref:=r->>'job_no';name:=r->>'customer_name';status:=r->>'status';email:=cust.email;phone:=cust.mobile;email_ok:=coalesce(cust.email_updates,false);wa_ok:=coalesce(cust.whatsapp_opt_in,false);end if;
 -- Only customer-facing fields leave the database. Internal notes/custody are excluded.
 payload:=jsonb_build_object('company',b.company_name,'name',name,'reference',ref,'status',status,'amount',r->>'amount','date',coalesce(r->>'appointment_date',r->>'delivered_at',r->>'received_at'),'tracking_base',case when c.id is not null then b.tracking_base_url else null end,'event',event_name,'case_id',c.id,'customer_id',cust.id);
 event_id:=tg_table_name||':'||(r->>'id')||':'||case when tg_op='INSERT' then 'created' else coalesce(r->>'updated_at',now()::text) end;
 perform public.enqueue_customer_update(new.organization_id,event_name,event_id,email,email_ok,phone,wa_ok,payload);return new;
end $$;
do $$ declare t text;begin foreach t in array array['cases','appointments','sales_documents','service_jobs'] loop
 execute format('drop trigger if exists communication_event on public.%I',t);execute format('create trigger communication_event after insert or update on public.%I for each row execute function public.communication_event_trigger()',t);
end loop;
foreach t in array array['payments','deliveries','sales_payments'] loop execute format('drop trigger if exists communication_event on public.%I',t);execute format('create trigger communication_event after insert on public.%I for each row execute function public.communication_event_trigger()',t);end loop;end $$;
create or replace function public.queue_customer_renewals() returns void language plpgsql security definer set search_path='' as $$
declare j record;b public.organization_settings%rowtype;
begin for j in select job.organization_id,job.id,job.job_no,job.title,job.customer_name,job.renewal_date,job.customer_id,c.email,c.mobile,c.email_updates,c.whatsapp_opt_in from public.service_jobs job join public.crm_customers c on c.id=job.customer_id where job.status<>'Cancelled' and job.renewal_date=current_date+30 loop
 select * into b from public.organization_settings where organization_id=j.organization_id;
 perform public.enqueue_customer_update(j.organization_id,'renewal','renewal:'||j.id::text||':'||j.renewal_date::text,j.email,j.email_updates,j.mobile,j.whatsapp_opt_in,jsonb_build_object('company',b.company_name,'name',j.customer_name,'reference',j.job_no,'status','Renewal due on '||j.renewal_date::text,'event','renewal','customer_id',j.customer_id));
 end loop;end $$;
-- Service-role-only administration/dispatch; browser roles cannot forge messages or read provider secrets.
do $$ declare f text;begin foreach f in array array['save_communication_credentials(uuid,text,jsonb)','get_communication_credentials(uuid,text)','configure_communication_worker(text,text)','wake_communication_worker()','claim_communications(uuid)','communication_recipient_allowed(uuid)','reserve_communication_quota(text,text,integer,integer,integer,integer)','queue_customer_renewals()'] loop execute 'revoke all on function public.'||f||' from public,anon,authenticated';execute 'grant execute on function public.'||f||' to service_role';end loop;
foreach f in array array['communication_wake_trigger()','communication_event_trigger()','enqueue_customer_update(uuid,text,text,text,boolean,text,boolean,jsonb)'] loop execute 'revoke all on function public.'||f||' from public,anon,authenticated';end loop;end $$;




alter table public.sales_documents add column if not exists checkout_key uuid;
create unique index if not exists sales_checkout_key on public.sales_documents(organization_id,checkout_key) where checkout_key is not null;
create table if not exists public.checkout_prices (
 organization_id uuid not null references public.organizations(id),branch_id uuid not null references public.branches(id),
 service_id uuid not null,government_fee numeric(14,2) not null check(government_fee>=0),service_fee numeric(14,2) not null check(service_fee>=0),
 updated_at timestamptz not null default now(),primary key(organization_id,branch_id,service_id),
 foreign key(service_id,organization_id) references public.service_catalog(id,organization_id)
);
alter table public.checkout_prices enable row level security;
create policy checkout_prices_scope on public.checkout_prices for all to authenticated
 using(public.business_access(organization_id,branch_id,'sales')) with check(public.business_access(organization_id,branch_id,'sales') and exists(select 1 from public.branches b where b.id=branch_id and b.organization_id=checkout_prices.organization_id));
revoke all on public.checkout_prices from anon;
grant select,insert,update on public.checkout_prices to authenticated;
create policy checkout_customer_insert on public.crm_customers for insert to authenticated with check(public.business_customer_access(organization_id,branch_id));
create or replace function public.checkout_sale(input jsonb,request_key uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare org uuid:=(input->>'organization_id')::uuid;branch uuid:=(input->>'branch_id')::uuid;
 customer uuid:=nullif(input->>'customer_id','')::uuid; invoice uuid; item jsonb; lines jsonb:='[]';
 svc public.service_catalog; gov numeric; fee numeric; qty numeric; paid numeric:=coalesce((input->>'paid')::numeric,0);
 saved public.sales_documents; stages jsonb; cname text:=coalesce(nullif(btrim(input->>'customer_name'),''),'Walk-in customer');
begin
 if auth.uid() is null or request_key is null or not public.business_access(org,branch,'sales') then raise exception 'Checkout is not available to your account.';end if;
 if not exists(select 1 from public.branches b where b.id=branch and b.organization_id=org and b.is_active) then raise exception 'Choose an active branch in this company.';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||request_key::text,0));
 select id into invoice from public.sales_documents where organization_id=org and checkout_key=request_key;
 if invoice is not null then return invoice;end if;
 if jsonb_typeof(input->'items') is distinct from 'array' or jsonb_array_length(input->'items') not between 1 and 100 then raise exception 'Add at least one service before checkout.';end if;
 if customer is not null then
  select name into cname from public.crm_customers where id=customer and organization_id=org and not archived;
  if not found then raise exception 'This customer is not available to your account.';end if;
 elsif cname<>'Walk-in customer' then
  insert into public.crm_customers(organization_id,branch_id,name,mobile,email) values(org,branch,cname,nullif(input->>'customer_mobile',''),nullif(input->>'customer_email','')) returning id into customer;
 end if;
 for item in select value from jsonb_array_elements(input->'items') loop
  select * into svc from public.service_catalog where id=(item->>'service_id')::uuid and organization_id=org and is_active;
  if not found or svc.service_type='Attestation' then raise exception 'Choose an available service. Use Cases for attestation documents.';end if;
  gov:=round((item->>'government_fee')::numeric,2);fee:=round((item->>'service_fee')::numeric,2);qty:=(item->>'quantity')::numeric;
  if gov is null or fee is null or qty is null or gov<0 or fee<0 or qty<=0 or qty>10000 then raise exception 'Enter valid quantities and fees.';end if;
  if (svc.service_type<>'Sale' or jsonb_array_length(svc.workflow)>0) and not public.business_access(org,branch,'services') then raise exception 'Service jobs require access to the Services module.';end if;
  lines:=lines||jsonb_build_array(jsonb_build_object('service_id',svc.id,'description',svc.name,'quantity',qty,'government_fee',gov,'service_fee',fee,'unit_price',gov+fee,'workflow',svc.workflow));
  if coalesce((item->>'remember')::boolean,false) then
   insert into public.checkout_prices(organization_id,branch_id,service_id,government_fee,service_fee) values(org,branch,svc.id,gov,fee)
   on conflict(organization_id,branch_id,service_id) do update set government_fee=excluded.government_fee,service_fee=excluded.service_fee,updated_at=now();
  end if;
 end loop;
 insert into public.sales_documents(organization_id,branch_id,customer_id,customer_name,customer_mobile,customer_email,kind,status,items,discount,notes,checkout_key)
 values(org,branch,customer,cname,nullif(input->>'customer_mobile',''),nullif(input->>'customer_email',''),'Invoice','Issued',lines,coalesce((input->>'discount')::numeric,0),nullif(input->>'notes',''),request_key) returning * into saved;
 invoice:=saved.id;
 if paid<0 or paid>saved.total then raise exception 'Payment cannot exceed the invoice total.';end if;
 if paid>0 then insert into public.sales_payments(organization_id,branch_id,document_id,amount,method,received_by) values(org,branch,invoice,paid,coalesce(input->>'method','Cash'),auth.uid());end if;
 for item in select value from jsonb_array_elements(lines) loop
  select * into svc from public.service_catalog where id=(item->>'service_id')::uuid and organization_id=org;
  if svc.service_type<>'Sale' or jsonb_array_length(svc.workflow)>0 then
   select coalesce(jsonb_agg(jsonb_build_object('name',case when jsonb_typeof(value)='string' then value#>>'{}' else value->>'name' end,'status','Pending','date','')),'[]') into stages from jsonb_array_elements(svc.workflow);
   insert into public.service_jobs(organization_id,branch_id,customer_id,service_id,title,customer_name,stages,invoice_id,renewal_date)
   values(org,branch,customer,svc.id,svc.name,cname,stages,invoice,case when svc.renewal_months is not null then (current_date+make_interval(months=>svc.renewal_months))::date end);
  end if;
 end loop;
 return invoice;
end $$;
revoke all on function public.checkout_sale(jsonb,uuid) from public,anon;
grant execute on function public.checkout_sale(jsonb,uuid) to authenticated;
alter table public.documents add column if not exists government_fee numeric(14,2) not null default 0 check(government_fee>=0);
alter table public.documents add column if not exists service_fee numeric(14,2) not null default 0 check(service_fee>=0);
alter table public.cases add column if not exists checkout_key uuid;
create unique index if not exists case_checkout_key on public.cases(organization_id,checkout_key) where checkout_key is not null;
create table if not exists public.document_prices (
 organization_id uuid not null references public.organizations(id),branch_id uuid not null references public.branches(id),
 price_key text not null,document_name text not null,stages jsonb not null,government_fee numeric(14,2) not null check(government_fee>=0),service_fee numeric(14,2) not null check(service_fee>=0),
 primary key(organization_id,branch_id,price_key),check(jsonb_typeof(stages)='array')
);
alter table public.document_prices enable row level security;
create policy document_prices_scope on public.document_prices for all to authenticated
 using(public.business_access(organization_id,branch_id,'cases')) with check(public.business_access(organization_id,branch_id,'cases') and exists(select 1 from public.branches b where b.id=branch_id and b.organization_id=document_prices.organization_id));
revoke all on public.document_prices from anon;
grant select,insert,update on public.document_prices to authenticated;
create or replace function public.create_attestation_checkout(input jsonb,request_key uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare p public.cases;item jsonb;v_case_id uuid;doc_id uuid;qty integer;gov numeric;fee numeric;total numeric:=0;stage text;ordinal integer;canonical text;customer uuid;
begin
 p:=jsonb_populate_record(null::public.cases,input->'case');
 if auth.uid() is null or request_key is null or not public.business_access(p.organization_id,p.branch_id,'cases') then raise exception 'Checkout is not available to your account.';end if;
 if not exists(select 1 from public.branches b where b.id=p.branch_id and b.organization_id=p.organization_id and b.is_active) then raise exception 'Choose an active branch in this company.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p.organization_id::text||request_key::text,0));
 select id into v_case_id from public.cases where organization_id=p.organization_id and checkout_key=request_key;
 if v_case_id is not null then return v_case_id;end if;
 if jsonb_typeof(input->'documents') is distinct from 'array' or jsonb_array_length(input->'documents') not between 1 and 100 then raise exception 'Add at least one document before checkout.';end if;
 for item in select value from jsonb_array_elements(input->'documents') loop
  qty:=(item->>'quantity')::integer;gov:=round((item->>'government_fee')::numeric,2);fee:=round((item->>'service_fee')::numeric,2);
  if qty is null or qty not between 1 and 10000 or gov is null or fee is null or gov<0 or fee<0 or length(btrim(item->>'document_name')) not between 1 and 200 or jsonb_typeof(item->'stages') is distinct from 'array' or jsonb_array_length(item->'stages') not between 1 and 30 then raise exception 'Enter valid document names, quantities, fees and stages.';end if;
  total:=total+qty*(gov+fee);
 end loop;
 p.advance_paid:=coalesce(p.advance_paid,0);
 if p.advance_paid<0 or p.advance_paid>total then raise exception 'Payment cannot exceed the case total.';end if;
 if p.advance_paid>0 and not public.business_access(p.organization_id,p.branch_id,'payments') then raise exception 'Recording a payment requires access to Payments.';end if;
 customer:=p.customer_id;
 if customer is null then
  insert into public.crm_customers(organization_id,branch_id,name,mobile,email,email_updates,whatsapp_opt_in) values(p.organization_id,p.branch_id,p.customer_name,p.mobile,p.customer_email,coalesce(p.email_updates,false),coalesce(p.whatsapp_opt_in,false)) returning id into customer;
 elsif not exists(select 1 from public.crm_customers where id=customer and organization_id=p.organization_id and not archived) then raise exception 'This customer is not available to your account.';end if;
 insert into public.cases(organization_id,tracking_reference,tracking_family,customer_name,mobile,customer_id,customer_email,email_updates,whatsapp_opt_in,bill_no,internal_invoice_no,branch_id,submission_date,promise_date,overall_status,total_amount,advance_paid,second_payment,balance_payment,notes,account_name,account_contact,account_mobile,intake_source,current_milestone,current_milestone_date,created_by,updated_by,checkout_key)
 values(p.organization_id,btrim(p.tracking_reference),p.tracking_family,btrim(p.customer_name),p.mobile,customer,p.customer_email,coalesce(p.email_updates,false),coalesce(p.whatsapp_opt_in,false),p.bill_no,p.internal_invoice_no,p.branch_id,p.submission_date,p.promise_date,coalesce(p.overall_status,'Received'),total,0,p.advance_paid,total-p.advance_paid,p.notes,p.account_name,p.account_contact,p.account_mobile,coalesce(p.intake_source,'Branch'),coalesce(p.current_milestone,'Submitted'),p.current_milestone_date,auth.uid(),auth.uid(),request_key) returning id into v_case_id;
 for item in select value from jsonb_array_elements(input->'documents') loop
  insert into public.documents(organization_id,case_id,document_name,holder_name,source_tracking_reference,occurrence_no,quantity,document_status,direct_to_delhi,direct_destination,government_fee,service_fee)
  values(p.organization_id,v_case_id,btrim(item->>'document_name'),coalesce(nullif(item->>'holder_name',''),p.customer_name),p.tracking_reference,(select count(*)+1 from public.documents d where d.case_id=v_case_id and lower(d.document_name)=lower(btrim(item->>'document_name'))),(item->>'quantity')::integer,'Pending',coalesce((item->>'direct_to_delhi')::boolean,false),nullif(item->>'direct_destination',''),(item->>'government_fee')::numeric,(item->>'service_fee')::numeric) returning id into doc_id;
  ordinal:=0;
  for stage in select jsonb_array_elements_text(item->'stages') loop
   if length(btrim(stage)) not between 1 and 200 then raise exception 'Enter a valid stage name.';end if;
   ordinal:=ordinal+1;insert into public.document_stages(organization_id,document_id,stage_name,stage_order,status) values(p.organization_id,doc_id,btrim(stage),ordinal,'Pending');
  end loop;
  if coalesce((item->>'remember')::boolean,false) then
   select lower(btrim(item->>'document_name'))||'|'||string_agg(lower(btrim(value)),'|' order by lower(btrim(value))) into canonical from jsonb_array_elements_text(item->'stages');
   insert into public.document_prices(organization_id,branch_id,price_key,document_name,stages,government_fee,service_fee) values(p.organization_id,p.branch_id,canonical,btrim(item->>'document_name'),item->'stages',(item->>'government_fee')::numeric,(item->>'service_fee')::numeric)
   on conflict(organization_id,branch_id,price_key) do update set stages=excluded.stages,government_fee=excluded.government_fee,service_fee=excluded.service_fee;
  end if;
 end loop;
 if p.advance_paid>0 then insert into public.payments(organization_id,case_id,amount,payment_method,received_by) values(p.organization_id,v_case_id,p.advance_paid,'Cash',auth.uid());end if;
 insert into public.case_history(organization_id,case_id,user_id,action,metadata) values(p.organization_id,v_case_id,auth.uid(),'Case created',jsonb_build_object('total_amount',total,'paid',p.advance_paid));
 return v_case_id;
end $$;
revoke all on function public.create_attestation_checkout(jsonb,uuid) from public,anon;
grant execute on function public.create_attestation_checkout(jsonb,uuid) to authenticated;




alter table public.service_catalog add column if not exists government_fee numeric(14,2) check(government_fee>=0);
alter table public.service_catalog add column if not exists service_charge numeric(14,2) check(service_charge>=0);
alter table public.documents add constraint document_fees_finite check(government_fee<100000000 and service_fee<100000000);
alter table public.document_prices add constraint document_price_fees_finite check(government_fee<100000000 and service_fee<100000000);
alter table public.checkout_prices add constraint checkout_price_fees_finite check(government_fee<100000000 and service_fee<100000000);
-- Company administrators choose a branch; other staff require an assigned branch.
create or replace function public.business_access(target_org uuid,target_branch uuid,module_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select public.is_current_session_valid() and exists (
 select 1 from public.profiles p left join public.organizations o on o.id=target_org
 left join public.organization_settings s on s.organization_id=target_org
 left join public.platform_subscriptions sub on sub.organization_id=target_org
 where p.id=auth.uid() and p.is_active and (p.is_platform_super_admin or (p.organization_id=target_org and o.status='Active'
 and coalesce(s.enabled_modules,'[]'::jsonb) ? module_name and (sub.organization_id is null or sub.allowed_modules ? module_name)
 and (p.role='admin' or p.staff_modules is null or module_name=any(p.staff_modules))
 and (p.role='admin' or (p.branch_id is not null and p.branch_id=target_branch)))))
$$;
create policy catalog_quick_insert on public.service_catalog for insert to authenticated
 with check(public.business_access(organization_id,public.current_profile_branch_id(),'sales') or public.business_access(organization_id,public.current_profile_branch_id(),'services'));
create or replace function public.quick_add_service(input jsonb,request_key uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare org uuid:=(input->>'organization_id')::uuid;result uuid;gov numeric:=round((input->>'government_fee')::numeric,2);charge numeric:=round((input->>'service_charge')::numeric,2);workflow jsonb:=coalesce(input->'workflow','[]');n text:=btrim(input->>'name');stage text;
begin
 if auth.uid() is null or request_key is null or not(public.business_access(org,public.current_profile_branch_id(),'sales') or public.business_access(org,public.current_profile_branch_id(),'services')) then raise exception 'Service creation is not available to your account. Ask your administrator to assign a branch.';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||request_key::text,0));
 select id into result from public.service_catalog where id=request_key and organization_id=org;if result is not null then return result;end if;
 if n is null or length(n) not between 1 and 200 or gov is null or charge is null or gov::text in ('NaN','Infinity','-Infinity') or charge::text in ('NaN','Infinity','-Infinity') or gov<0 or charge<0 or jsonb_typeof(workflow) is distinct from 'array' or jsonb_array_length(workflow)>30 then raise exception 'Enter a service name and valid government and service fees.';end if;
 for stage in select jsonb_array_elements_text(workflow) loop if length(btrim(stage)) not between 1 and 200 then raise exception 'Enter a valid stage name.';end if;end loop;
 insert into public.service_catalog(id,organization_id,name,category,service_type,government_fee,service_charge,base_price,workflow)
 values(request_key,org,n,nullif(btrim(input->>'category'),''),coalesce(input->>'service_type','Sale'),gov,charge,gov+charge,workflow) returning id into result;
 return result;
end $$;
revoke all on function public.quick_add_service(jsonb,uuid) from public,anon;
grant execute on function public.quick_add_service(jsonb,uuid) to authenticated;
create or replace function public.quick_add_customer(input jsonb,request_key uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare org uuid:=(input->>'organization_id')::uuid;branch uuid:=(input->>'branch_id')::uuid;result uuid;
begin
 if auth.uid() is null or request_key is null or not public.business_customer_access(org,branch) then raise exception 'Customer creation requires an assigned branch and module access.';end if;
 if not exists(select 1 from public.branches where id=branch and organization_id=org and is_active) then raise exception 'Choose an active branch in this company.';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||request_key::text,0));
 select id into result from public.crm_customers where id=request_key and organization_id=org;if result is not null then return result;end if;
 insert into public.crm_customers(id,organization_id,branch_id,name,mobile,email) values(request_key,org,branch,btrim(input->>'name'),nullif(btrim(input->>'mobile'),''),nullif(btrim(input->>'email'),'')) returning id into result;
 return result;
end $$;
revoke all on function public.quick_add_customer(jsonb,uuid) from public,anon;
grant execute on function public.quick_add_customer(jsonb,uuid) to authenticated;
create or replace function public.guard_invoice_number() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.document_no:=btrim(new.document_no);
 if length(new.document_no) not between 1 and 80 or new.document_no ~ '[[:cntrl:]]' then raise exception 'Enter a bill number between 1 and 80 characters.';end if;
 if tg_op='UPDATE' and old.document_no is distinct from new.document_no and exists(select 1 from public.sales_payments where document_id=old.id) then raise exception 'Invoices with payments cannot be renumbered. Use a credit note or correction instead.';end if;
 return new;
end $$;
create trigger guard_invoice_number before insert or update on public.sales_documents for each row execute function public.guard_invoice_number();
-- Always preserve caller RLS when recalculating unit prices from optional component fees.
create or replace function public.invoice_line_fees() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb;lines jsonb:='[]';gov numeric;charge numeric;
begin
 if tg_op='UPDATE' and new.items is not distinct from old.items then return new;end if;
 for item in select value from jsonb_array_elements(new.items) loop
  if item ? 'government_fee' or item ? 'service_fee' then
   gov:=coalesce((item->>'government_fee')::numeric,0);charge:=coalesce((item->>'service_fee')::numeric,0);
   if gov::text in ('NaN','Infinity','-Infinity') or charge::text in ('NaN','Infinity','-Infinity') or gov<0 or charge<0 then raise exception 'Enter valid quantities and fees.';end if;
   item:=item||jsonb_build_object('government_fee',round(gov,2),'service_fee',round(charge,2),'unit_price',round(gov,2)+round(charge,2));
  end if;
  lines:=lines||jsonb_build_array(item);
 end loop;
 new.items:=lines;return new;
end $$;
create trigger a_invoice_line_fees before insert or update on public.sales_documents for each row execute function public.invoice_line_fees();
revoke all on function public.guard_invoice_number(),public.invoice_line_fees() from public,anon,authenticated;
create or replace function public.checkout_sale(input jsonb,request_key uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare org uuid:=(input->>'organization_id')::uuid;branch uuid:=(input->>'branch_id')::uuid;
 customer uuid:=nullif(input->>'customer_id','')::uuid; invoice uuid; item jsonb; lines jsonb:='[]';
 svc public.service_catalog; gov numeric; fee numeric; qty numeric; paid numeric:=coalesce((input->>'paid')::numeric,0);
 saved public.sales_documents; stages jsonb; cname text:=coalesce(nullif(btrim(input->>'customer_name'),''),'Walk-in customer');
begin
 if auth.uid() is null or request_key is null or not public.business_access(org,branch,'sales') then raise exception 'Checkout is not available to your account.';end if;
 if not exists(select 1 from public.branches b where b.id=branch and b.organization_id=org and b.is_active) then raise exception 'Choose an active branch in this company.';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||request_key::text,0));
 select id into invoice from public.sales_documents where organization_id=org and checkout_key=request_key;
 if invoice is not null then return invoice;end if;
 if jsonb_typeof(input->'items') is distinct from 'array' or jsonb_array_length(input->'items') not between 1 and 100 then raise exception 'Add at least one service before checkout.';end if;
 if customer is not null then
  select name into cname from public.crm_customers where id=customer and organization_id=org and not archived;
  if not found then raise exception 'This customer is not available to your account.';end if;
 elsif cname<>'Walk-in customer' then
  insert into public.crm_customers(organization_id,branch_id,name,mobile,email) values(org,branch,cname,nullif(input->>'customer_mobile',''),nullif(input->>'customer_email','')) returning id into customer;
 end if;
 for item in select value from jsonb_array_elements(input->'items') loop
  select * into svc from public.service_catalog where id=(item->>'service_id')::uuid and organization_id=org and is_active;
  if not found or svc.service_type='Attestation' then raise exception 'Choose an available service. Use Cases for attestation documents.';end if;
  gov:=round((item->>'government_fee')::numeric,2);fee:=round((item->>'service_fee')::numeric,2);qty:=(item->>'quantity')::numeric;
  if gov is null or fee is null or qty is null or gov<0 or fee<0 or qty<=0 or qty>10000 then raise exception 'Enter valid quantities and fees.';end if;
  if (svc.service_type<>'Sale' or jsonb_array_length(svc.workflow)>0) and not public.business_access(org,branch,'services') then raise exception 'Service jobs require access to the Services module.';end if;
  lines:=lines||jsonb_build_array(jsonb_build_object('service_id',svc.id,'description',svc.name,'quantity',qty,'government_fee',gov,'service_fee',fee,'unit_price',gov+fee,'workflow',svc.workflow));
  if coalesce((item->>'remember')::boolean,false) then
   insert into public.checkout_prices(organization_id,branch_id,service_id,government_fee,service_fee) values(org,branch,svc.id,gov,fee)
   on conflict(organization_id,branch_id,service_id) do update set government_fee=excluded.government_fee,service_fee=excluded.service_fee,updated_at=now();
  end if;
 end loop;
 insert into public.sales_documents(organization_id,branch_id,customer_id,customer_name,customer_mobile,customer_email,kind,status,items,discount,notes,checkout_key,document_no)
 values(org,branch,customer,cname,nullif(input->>'customer_mobile',''),nullif(input->>'customer_email',''),'Invoice','Issued',lines,coalesce((input->>'discount')::numeric,0),nullif(input->>'notes',''),request_key,coalesce(nullif(btrim(input->>'document_no'),''),'INV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)))) returning * into saved;
 invoice:=saved.id;
 if paid<0 or paid>saved.total then raise exception 'Payment cannot exceed the invoice total.';end if;
 if paid>0 then insert into public.sales_payments(organization_id,branch_id,document_id,amount,method,received_by) values(org,branch,invoice,paid,coalesce(input->>'method','Cash'),auth.uid());end if;
 for item in select value from jsonb_array_elements(lines) loop
  select * into svc from public.service_catalog where id=(item->>'service_id')::uuid and organization_id=org;
  if svc.service_type<>'Sale' or jsonb_array_length(svc.workflow)>0 then
   select coalesce(jsonb_agg(jsonb_build_object('name',case when jsonb_typeof(value)='string' then value#>>'{}' else value->>'name' end,'status','Pending','date','')),'[]') into stages from jsonb_array_elements(svc.workflow);
   insert into public.service_jobs(organization_id,branch_id,customer_id,service_id,title,customer_name,stages,invoice_id,renewal_date)
   values(org,branch,customer,svc.id,svc.name,cname,stages,invoice,case when svc.renewal_months is not null then (current_date+make_interval(months=>svc.renewal_months))::date end);
  end if;
 end loop;
 return invoice;
end $$;
revoke all on function public.checkout_sale(jsonb,uuid) from public,anon;
grant execute on function public.checkout_sale(jsonb,uuid) to authenticated;




-- Additive, branch-scoped accounting. Ledger writes are server controlled.

create schema if not exists accounting_private;
revoke all on schema accounting_private from public,anon;
grant usage on schema accounting_private to authenticated;
create table public.finance_accounts (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 code text not null,name text not null check(length(btrim(name)) between 1 and 120),
 kind text not null check(kind in ('Asset','Liability','Equity','Income','Expense')),is_cash boolean not null default false,
 unique(organization_id,code),unique(id,organization_id)
);
create table public.finance_suppliers (
 id uuid primary key,organization_id uuid not null references public.organizations(id),branch_id uuid not null references public.branches(id),
 name text not null check(length(btrim(name)) between 1 and 200),mobile text,email text,address text,archived boolean not null default false,
 created_at timestamptz not null default now(),unique(id,organization_id)
);
create table public.finance_bills (
 id uuid primary key,organization_id uuid not null references public.organizations(id),branch_id uuid not null references public.branches(id),supplier_id uuid,
 kind text not null check(kind in ('Expense','Purchase')),document_no text not null check(length(btrim(document_no)) between 1 and 80),
 description text not null check(length(btrim(description)) between 1 and 500),category text not null default 'Operating expenses',
 net_amount numeric(14,2) not null check(net_amount>0 and net_amount<100000000),tax_amount numeric(14,2) not null default 0 check(tax_amount>=0 and tax_amount<100000000),
 total numeric(14,2) generated always as(net_amount+tax_amount) stored,
 paid_total numeric(14,2) not null default 0 check(paid_total>=0 and paid_total<=net_amount+tax_amount),
 bill_date date not null default current_date,due_date date,notes text,status text not null default 'Posted' check(status in ('Posted','Voided')),
 void_reason text,created_at timestamptz not null default now(),created_by uuid not null references public.profiles(id),
 unique(id,organization_id),unique(organization_id,document_no),foreign key(supplier_id,organization_id) references public.finance_suppliers(id,organization_id)
);
create table public.finance_payments (
 id uuid primary key,organization_id uuid not null references public.organizations(id),branch_id uuid not null references public.branches(id),bill_id uuid not null,
 account_id uuid not null,amount numeric(14,2) not null check(amount>0 and amount<100000000),reference text,paid_on date not null default current_date,
 created_at timestamptz not null default now(),created_by uuid not null references public.profiles(id),
 unique(id,organization_id),foreign key(bill_id,organization_id) references public.finance_bills(id,organization_id),foreign key(account_id,organization_id) references public.finance_accounts(id,organization_id)
);
create table public.finance_journals (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),branch_id uuid not null references public.branches(id),
 entry_date date not null,source text not null,source_id uuid not null,description text not null,
 snapshot jsonb not null,reversal_of uuid unique,created_at timestamptz not null default now(),created_by uuid references public.profiles(id),
 unique(id,organization_id),foreign key(reversal_of,organization_id) references public.finance_journals(id,organization_id)
);
create table public.finance_lines (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,branch_id uuid not null references public.branches(id),journal_id uuid not null,account_id uuid not null,
 debit numeric(14,2) not null default 0 check(debit>=0 and debit<100000000),credit numeric(14,2) not null default 0 check(credit>=0 and credit<100000000),
 check((debit>0 and credit=0) or(credit>0 and debit=0)),
 foreign key(journal_id,organization_id) references public.finance_journals(id,organization_id),foreign key(account_id,organization_id) references public.finance_accounts(id,organization_id)
);
create index finance_journals_scope on public.finance_journals(organization_id,branch_id,entry_date);
create index finance_journals_source on public.finance_journals(organization_id,source,source_id);
create index finance_lines_journal on public.finance_lines(journal_id);
create index finance_lines_account on public.finance_lines(organization_id,account_id,branch_id);
create index finance_bills_scope on public.finance_bills(organization_id,branch_id,bill_date);
create index finance_suppliers_scope on public.finance_suppliers(organization_id,branch_id);
create index finance_payments_bill on public.finance_payments(bill_id);
do $$declare t text;begin
 foreach t in array array['finance_accounts','finance_suppliers','finance_bills','finance_payments','finance_journals','finance_lines'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy finance_read on public.%I for select to authenticated using(public.business_access(organization_id,%s,''sales''))',t,case when t='finance_accounts' then 'public.current_profile_branch_id()' else 'branch_id' end);
 end loop;
end $$;
-- No direct client inserts/updates: RPCs check the live session, tenant, branch and resource.
create function accounting_private.chart(org uuid) returns void language plpgsql security invoker set search_path='' as $$begin
 insert into public.finance_accounts(organization_id,code,name,kind,is_cash) values
 (org,'1000','Cash','Asset',true),(org,'1010','Bank','Asset',true),(org,'1020','Card clearing','Asset',true),(org,'1090','Other collections','Asset',true),
 (org,'1100','Customer receivables','Asset',false),(org,'1200','Input tax','Asset',false),
 (org,'2000','Supplier payables','Liability',false),(org,'2100','Output tax','Liability',false),(org,'3000','Opening balance equity','Equity',false),
 (org,'4000','Service and sales income','Income',false),(org,'4010','Government fee recovery','Income',false),
 (org,'5000','Operating expenses','Expense',false),(org,'5100','Purchases and service costs','Expense',false)
 on conflict(organization_id,code) do nothing;
end $$;
create function accounting_private.post(org uuid,branch uuid,dated date,src text,sid uuid,label text,entries jsonb,reverse_id uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare jid uuid:=gen_random_uuid();entry jsonb;acc uuid;d numeric;c numeric;net numeric:=0;
begin
 if jsonb_typeof(entries) is distinct from 'array' then raise exception 'Invalid accounting entry.';end if;
 perform accounting_private.chart(org);
 for entry in select jsonb_array_elements(entries) loop
 d:=coalesce((entry->>'debit')::numeric,0);c:=coalesce((entry->>'credit')::numeric,0);
 if d::text in('NaN','Infinity','-Infinity') or c::text in('NaN','Infinity','-Infinity') or d<0 or c<0 or d>=100000000 or c>=100000000 or d<>round(d,2) or c<>round(c,2) then raise exception 'Invalid accounting amount.';end if;
 net:=net+d-c;
 end loop;
 if net<>0 then raise exception 'Accounting entry does not balance.';end if;
 if not exists(select 1 from public.branches where id=branch and organization_id=org) then raise exception 'Choose an active branch in this company.';end if;
 insert into public.finance_journals(id,organization_id,branch_id,entry_date,source,source_id,description,snapshot,reversal_of,created_by)
 values(jid,org,branch,dated,src,sid,label,entries,reverse_id,auth.uid());
 for entry in select jsonb_array_elements(entries) loop
 d:=coalesce((entry->>'debit')::numeric,0);c:=coalesce((entry->>'credit')::numeric,0);if d=0 and c=0 then continue;end if;
 select id into acc from public.finance_accounts where organization_id=org and code=entry->>'code';if acc is null then raise exception 'Choose an available accounting account.';end if;
 insert into public.finance_lines(organization_id,branch_id,journal_id,account_id,debit,credit) values(org,branch,jid,acc,d,c);
 end loop;
 return jid;
end $$;
create function accounting_private.reverse_entry(jid uuid,reason text) returns void language plpgsql security invoker set search_path='' as $$
declare j public.finance_journals;entries jsonb;
begin
 select * into j from public.finance_journals where id=jid for update;if not found or exists(select 1 from public.finance_journals where reversal_of=jid) then return;end if;
 select jsonb_agg(jsonb_build_object('code',x->>'code','debit',coalesce((x->>'credit')::numeric,0),'credit',coalesce((x->>'debit')::numeric,0))) into entries from jsonb_array_elements(j.snapshot) x;
 perform accounting_private.post(j.organization_id,j.branch_id,current_date,'Reversal',j.id,reason,entries,j.id);
end $$;
create function accounting_private.invoice_post(d public.sales_documents) returns void language plpgsql security invoker set search_path='' as $$
declare old_j public.finance_journals;entries jsonb;gov numeric:=0;tax numeric;net numeric;
begin
 if d.kind<>'Invoice' or d.branch_id is null then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('invoice-ledger:'||d.id::text,0));
 select * into old_j from public.finance_journals j where source='Invoice' and source_id=d.id and not exists(select 1 from public.finance_journals r where r.reversal_of=j.id) order by created_at desc limit 1;
 if d.status='Cancelled' or (d.status='Draft' and d.paid_total=0) or d.total=0 then if old_j.id is not null then perform accounting_private.reverse_entry(old_j.id,'Invoice cancelled or replaced');end if;return;end if;
 net:=d.subtotal-d.discount;tax:=d.total-net;
 select coalesce(sum(coalesce((x->>'government_fee')::numeric,0)*(x->>'quantity')::numeric),0) into gov from jsonb_array_elements(d.items) x;
 gov:=case when d.subtotal>0 then round(least(gov,d.subtotal)*net/d.subtotal,2) else 0 end;
 entries:=jsonb_build_array(jsonb_build_object('code','1100','debit',d.total),jsonb_build_object('code','4000','credit',net-gov),jsonb_build_object('code','4010','credit',gov),jsonb_build_object('code','2100','credit',tax));
 if old_j.id is not null and old_j.snapshot=entries then return;end if;
 if old_j.id is not null then perform accounting_private.reverse_entry(old_j.id,'Invoice corrected');end if;
 perform accounting_private.post(d.organization_id,d.branch_id,case when old_j.id is null then d.created_at::date else current_date end,'Invoice',d.id,'Invoice '||d.document_no,entries);
end $$;
create function accounting_private.payment_post(p public.sales_payments) returns void language plpgsql security invoker set search_path='' as $$
declare j uuid;code text;
begin
 perform pg_advisory_xact_lock(hashtextextended('receipt-ledger:'||p.id::text,0));
 select id into j from public.finance_journals x where source='Receipt' and source_id=p.id and not exists(select 1 from public.finance_journals r where r.reversal_of=x.id) limit 1;
 if p.voided then if j is not null then perform accounting_private.reverse_entry(j,'Customer receipt voided');end if;return;end if;
 if j is not null then return;end if;
 code:=case p.method when 'Cash' then '1000' when 'Card' then '1020' when 'Bank transfer' then '1010' else '1090' end;
 perform accounting_private.post(p.organization_id,p.branch_id,p.received_at::date,'Receipt',p.id,'Customer payment',jsonb_build_array(jsonb_build_object('code',code,'debit',p.amount),jsonb_build_object('code','1100','credit',p.amount)));
end $$;
-- Trigger execution is privileged solely to write immutable ledger tables; authorisation is checked explicitly.
create function accounting_private.sales_post_trigger() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='sales_documents' and to_jsonb(new)->>'kind'<>'Invoice' then return new;end if;
 if auth.uid() is not null and not public.business_access(new.organization_id,new.branch_id,'sales') then raise exception 'Accounting access denied.';end if;
 if tg_table_name='sales_documents' then perform accounting_private.invoice_post(new);else perform accounting_private.payment_post(new);end if;
 return new;
end $$;
create trigger zz_invoice_accounting after insert or update on public.sales_documents for each row execute function accounting_private.sales_post_trigger();
create trigger zz_receipt_accounting after insert or update on public.sales_payments for each row execute function accounting_private.sales_post_trigger();
create function accounting_private.invoice_delete_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.finance_journals where source='Invoice' and source_id=old.id) then raise exception 'Posted invoices cannot be deleted. Cancel an unpaid invoice to keep its history.';end if;return old;
end $$;
create trigger invoice_ledger_delete before delete on public.sales_documents for each row execute function accounting_private.invoice_delete_guard();
create function accounting_private.command(action text,input jsonb,request_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=(input->>'organization_id')::uuid;branch uuid:=(input->>'branch_id')::uuid;result uuid;bill public.finance_bills;
 amount numeric;tax numeric;paid numeric;acc public.finance_accounts;supplier public.finance_suppliers;entries jsonb;code text;j uuid;ref text;dated date;dest public.finance_accounts;d public.sales_documents;p public.sales_payments;
begin
 if auth.uid() is null or request_key is null or not public.business_access(org,branch,'sales') then raise exception 'Accounting access denied.';end if;
 if not exists(select 1 from public.branches where id=branch and organization_id=org and is_active) then raise exception 'Choose an active branch in this company.';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||request_key::text,0));
 perform accounting_private.chart(org);
 if action='setup' then return request_key;end if;
 if action='supplier' then
 select id into result from public.finance_suppliers where id=request_key and organization_id=org and branch_id=branch;if result is not null then return result;end if;
 insert into public.finance_suppliers(id,organization_id,branch_id,name,mobile,email,address) values(request_key,org,branch,btrim(input->>'name'),nullif(btrim(input->>'mobile'),''),nullif(btrim(input->>'email'),''),nullif(btrim(input->>'address'),''));return request_key;
 elsif action='supplier_edit' then
 select * into supplier from public.finance_suppliers where id=(input->>'supplier_id')::uuid and organization_id=org and branch_id=branch for update;if not found then raise exception 'Choose a supplier available in this branch.';end if;
 update public.finance_suppliers set name=btrim(input->>'name'),mobile=nullif(btrim(input->>'mobile'),''),email=nullif(btrim(input->>'email'),''),address=nullif(btrim(input->>'address'),''),archived=coalesce((input->>'archived')::boolean,false) where id=supplier.id;return supplier.id;
 elsif action='sync' then
 if not public.is_organization_admin(org) then raise exception 'Only a company administrator can sync accounting records.';end if;
 for d in select * from public.sales_documents where organization_id=org and branch_id=branch and kind='Invoice' order by created_at loop perform accounting_private.invoice_post(d);end loop;
 for p in select * from public.sales_payments where organization_id=org and branch_id=branch order by received_at loop perform accounting_private.payment_post(p);end loop;
 return request_key;
 elsif action='void' then
 if not public.is_organization_admin(org) or length(btrim(coalesce(input->>'reason',''))) not between 5 and 500 then raise exception 'Only a company administrator can void a bill. Enter a reason of at least five characters.';end if;
 select * into bill from public.finance_bills where id=(input->>'bill_id')::uuid and organization_id=org and branch_id=branch for update;
 if not found then raise exception 'Choose a bill available in this branch.';end if;if bill.status='Voided' then return bill.id;end if;
 if bill.paid_total>0 then raise exception 'A paid bill cannot be voided. Record a supplier refund instead.';end if;
 select id into j from public.finance_journals where source=bill.kind and source_id=bill.id and reversal_of is null limit 1;
 perform accounting_private.reverse_entry(j,btrim(input->>'reason'));update public.finance_bills set status='Voided',void_reason=btrim(input->>'reason') where id=bill.id;return bill.id;
 end if;
 -- Every money input is validated server-side, including non-finite JSON strings.
 amount:=round(coalesce((input->>'amount')::numeric,0),2);tax:=round(coalesce((input->>'tax_amount')::numeric,0),2);paid:=round(coalesce((input->>'paid')::numeric,0),2);
 if amount::text in('NaN','Infinity','-Infinity') or tax::text in('NaN','Infinity','-Infinity') or paid::text in('NaN','Infinity','-Infinity') or amount<0 or (amount=0 and action<>'account') or amount>=100000000 or tax<0 or tax>=100000000 or paid<0 or paid>amount+tax then raise exception 'Enter valid amounts and a payment within the bill total.';end if;
 dated:=coalesce(nullif(input->>'date','')::date,current_date);
 if action in('account','transfer') then
 if not public.is_organization_admin(org) then raise exception 'Only a company administrator can manage cash and bank accounts.';end if;
 end if;
 if action='account' then
 select id into result from public.finance_accounts where id=request_key and organization_id=org;if result is not null then return result;end if;
 insert into public.finance_accounts(id,organization_id,code,name,kind,is_cash) values(request_key,org,'BANK-'||request_key::text,btrim(input->>'name'),'Asset',true);
 if amount>0 then perform accounting_private.post(org,branch,dated,'Opening',request_key,'Opening balance',jsonb_build_array(jsonb_build_object('code','BANK-'||request_key::text,'debit',amount),jsonb_build_object('code','3000','credit',amount)));end if;return request_key;
 elsif action='bill' then
 select id into result from public.finance_bills where id=request_key and organization_id=org and branch_id=branch;if result is not null then return result;end if;
 if coalesce(input->>'kind','') not in('Expense','Purchase') then raise exception 'Choose an expense or purchase.';end if;
 if nullif(input->>'supplier_id','') is not null then
 select * into supplier from public.finance_suppliers where id=(input->>'supplier_id')::uuid and organization_id=org and branch_id=branch and not archived;if not found then raise exception 'Choose a supplier available in this branch.';end if;
 elsif input->>'kind'='Purchase' then raise exception 'Choose a supplier for this purchase.';end if;
 ref:=coalesce(nullif(btrim(input->>'document_no'),''),case input->>'kind' when 'Purchase' then 'PUR-' else 'EXP-' end||upper(right(replace(request_key::text,'-',''),12)));
 insert into public.finance_bills(id,organization_id,branch_id,supplier_id,kind,document_no,description,category,net_amount,tax_amount,bill_date,due_date,notes,created_by)
 values(request_key,org,branch,supplier.id,input->>'kind',ref,btrim(input->>'description'),coalesce(nullif(btrim(input->>'category'),''),'Operating expenses'),amount,tax,dated,nullif(input->>'due_date','')::date,input->>'notes',auth.uid());
 code:=case input->>'kind' when 'Purchase' then '5100' else '5000' end;
 perform accounting_private.post(org,branch,dated,input->>'kind',request_key,ref||' · '||btrim(input->>'description'),jsonb_build_array(jsonb_build_object('code',code,'debit',amount),jsonb_build_object('code','1200','debit',tax),jsonb_build_object('code','2000','credit',amount+tax)));
 if paid=0 then return request_key;end if;
 select * into bill from public.finance_bills where id=request_key for update;amount:=paid;
 elsif action='pay' then
 select bill_id into result from public.finance_payments where id=request_key and organization_id=org and branch_id=branch;if result is not null then return result;end if;
 select * into bill from public.finance_bills where id=(input->>'bill_id')::uuid and organization_id=org and branch_id=branch for update;
 if not found or bill.status='Voided' then raise exception 'Choose a bill available in this branch.';end if;
 if amount>bill.total-bill.paid_total then raise exception 'Payment exceeds the outstanding bill balance.';end if;
 elsif action='transfer' then
 select id into result from public.finance_journals where source='Transfer' and source_id=request_key and organization_id=org and branch_id=branch;if result is not null then return result;end if;
 select * into acc from public.finance_accounts where id=(input->>'account_id')::uuid and organization_id=org and is_cash;
 select * into dest from public.finance_accounts where id=(input->>'destination_id')::uuid and organization_id=org and is_cash;
 if acc.id is null or dest.id is null or acc.id=dest.id then raise exception 'Choose two different cash or bank accounts.';end if;
 return accounting_private.post(org,branch,dated,'Transfer',request_key,'Cash / bank transfer',jsonb_build_array(jsonb_build_object('code',dest.code,'debit',amount),jsonb_build_object('code',acc.code,'credit',amount)));
 else raise exception 'Choose an available accounting action.';end if;
 select * into acc from public.finance_accounts where id=(input->>'account_id')::uuid and organization_id=org and is_cash;
 if acc.id is null then raise exception 'Choose an available cash or bank account.';end if;
 insert into public.finance_payments(id,organization_id,branch_id,bill_id,account_id,amount,reference,paid_on,created_by) values(request_key,org,branch,bill.id,acc.id,amount,input->>'reference',dated,auth.uid());
 perform accounting_private.post(org,branch,dated,'Supplier payment',request_key,'Payment for '||bill.document_no,jsonb_build_array(jsonb_build_object('code','2000','debit',amount),jsonb_build_object('code',acc.code,'credit',amount)));
 update public.finance_bills set paid_total=paid_total+amount where id=bill.id;return bill.id;
end $$;
create function public.finance_command(action text,input jsonb,request_key uuid) returns uuid language sql security invoker set search_path='' as $$select accounting_private.command(action,input,request_key)$$;
revoke all on all functions in schema accounting_private from public,anon,authenticated;
grant execute on function accounting_private.command(text,jsonb,uuid) to authenticated;
revoke all on function public.finance_command(text,jsonb,uuid) from public,anon;
grant execute on function public.finance_command(text,jsonb,uuid) to authenticated;
create function public.finance_report(org uuid,branch uuid,from_date date,to_date date)
returns table(account_id uuid,code text,name text,kind text,is_cash boolean,debit numeric,credit numeric,opening numeric,closing numeric)
language sql stable security invoker set search_path='' as $$
 select a.id,a.code,a.name,a.kind,a.is_cash,
 coalesce(sum(l.debit) filter(where j.entry_date between from_date and to_date),0),
 coalesce(sum(l.credit) filter(where j.entry_date between from_date and to_date),0),
 coalesce(sum(l.debit-l.credit) filter(where j.entry_date<from_date),0),coalesce(sum(l.debit-l.credit) filter(where j.id is not null),0)
 from public.finance_accounts a left join public.finance_lines l on l.account_id=a.id and l.organization_id=org and(branch is null or l.branch_id=branch)
 left join public.finance_journals j on j.id=l.journal_id and j.entry_date<=to_date
 where a.organization_id=org
 group by a.id,a.code,a.name,a.kind,a.is_cash order by a.code
$$;
revoke all on function public.finance_report(uuid,uuid,date,date) from public,anon;
grant execute on function public.finance_report(uuid,uuid,date,date) to authenticated;




create table public.organization_print_settings(
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 templates jsonb not null default '{}' check(jsonb_typeof(templates)='object' and octet_length(templates::text)<=16000),
 updated_at timestamptz not null default now()
);
alter table public.organization_print_settings enable row level security;
revoke all on public.organization_print_settings from public,anon,authenticated;
grant select,insert,update on public.organization_print_settings to authenticated;
create policy print_templates_read on public.organization_print_settings for select to authenticated
 using(public.business_access(organization_id,public.current_profile_branch_id(),'sales') or public.business_access(organization_id,public.current_profile_branch_id(),'cases') or public.business_access(organization_id,public.current_profile_branch_id(),'payments') or public.business_access(organization_id,public.current_profile_branch_id(),'deliveries') or(public.is_current_session_valid() and public.is_organization_admin(organization_id)));
create policy print_templates_insert on public.organization_print_settings for insert to authenticated
 with check(public.is_current_session_valid() and public.is_organization_admin(organization_id));
create policy print_templates_update on public.organization_print_settings for update to authenticated
 using(public.is_current_session_valid() and public.is_organization_admin(organization_id))
 with check(public.is_current_session_valid() and public.is_organization_admin(organization_id));
create function public.validate_print_templates() returns trigger language plpgsql security invoker set search_path='' as $$
declare k text;t jsonb;f text;
begin
 for k,t in select * from jsonb_each(new.templates) loop
 if k not in('invoice','receipt','delivery','report') or jsonb_typeof(t) is distinct from 'object' then raise exception 'Choose a valid document template.';end if;
 if t?'paper' and t->>'paper' not in('A4','A5','58mm','80mm') or t?'style' and t->>'style' not in('Modern','Classic','Minimal') then raise exception 'Choose a supported paper size and template style.';end if;
 if t?'font_size' and ((t->>'font_size')::numeric not between 8 and 16) or t?'margin' and ((t->>'margin')::numeric not between 0 and 20) then raise exception 'Choose a font size from 8 to 16 and a margin from 0 to 20 mm.';end if;
 foreach f in array array['title','footer','terms'] loop if t?f and length(t->>f)>(case when f='title' then 100 else 2000 end) then raise exception 'Template text is too long.';end if;end loop;
 end loop;
 new.updated_at:=now();return new;
end $$;
revoke all on function public.validate_print_templates() from public,anon,authenticated;
create trigger print_template_validation before insert or update on public.organization_print_settings for each row execute function public.validate_print_templates();




-- Search runs as the caller: existing tenant, branch and module RLS remains authoritative.
create function public.search_business_customers(target_org uuid,query_text text,result_limit integer default 12,result_offset integer default 0)
returns setof public.crm_customers language sql stable security invoker set search_path='' as $$
 select c.* from public.crm_customers c
 where c.organization_id=target_org and not c.archived and (
 btrim(query_text)='' or position(lower(btrim(query_text)) in lower(c.name))>0 or
 (regexp_replace(query_text,'[^0-9]','','g')<>'' and position(regexp_replace(query_text,'[^0-9]','','g') in regexp_replace(coalesce(c.mobile,''),'[^0-9]','','g'))>0))
 order by case when lower(c.name)=lower(btrim(query_text)) then 0 when lower(c.name) like lower(btrim(query_text))||'%' then 1 else 2 end,c.name,c.id
 limit least(greatest(result_limit,1),100) offset greatest(result_offset,0)
$$;
revoke all on function public.search_business_customers(uuid,text,integer,integer) from public,anon;
grant execute on function public.search_business_customers(uuid,text,integer,integer) to authenticated;
create index crm_customer_phone_search on public.crm_customers(organization_id,(regexp_replace(coalesce(mobile,''),'[^0-9]','','g')));

alter table public.sales_documents
 add column document_date date,
 add column reference_no text,
 add column subject text,
 add column salesperson text,
 add column payment_terms text,
 add column customer_notes text,
 add column terms text,
 add column adjustment numeric(14,2) not null default 0 check(adjustment between -100000000 and 100000000),
 add column template_id uuid;
alter table public.sales_documents alter column document_date set default current_date;
alter table public.sales_payments add column request_key uuid;
create unique index sales_payment_request on public.sales_payments(organization_id,request_key) where request_key is not null;
create function public.record_sales_payment(input jsonb,request_key uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare d public.sales_documents;result uuid;
begin
 select * into d from public.sales_documents where id=(input->>'document_id')::uuid for update;
 if auth.uid() is null or record_sales_payment.request_key is null or d.id is null or not public.business_access(d.organization_id,d.branch_id,'sales') then raise exception 'This invoice is not available to your account.';end if;
 perform pg_advisory_xact_lock(hashtextextended(d.organization_id::text||request_key::text,0));
 select id into result from public.sales_payments p where p.organization_id=d.organization_id and p.request_key=record_sales_payment.request_key;
 if result is not null then return result;end if;
 insert into public.sales_payments(organization_id,branch_id,document_id,amount,method,reference,notes,request_key)
 values(d.organization_id,d.branch_id,d.id,(input->>'amount')::numeric,coalesce(input->>'method','Cash'),input->>'reference',input->>'notes',request_key) returning id into result;
 return result;
end $$;
revoke all on function public.record_sales_payment(jsonb,uuid) from public,anon;
grant execute on function public.record_sales_payment(jsonb,uuid) to authenticated;

create table public.named_print_templates(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 kind text not null check(kind in('invoice','quotation','receipt','delivery','report')),
 name text not null check(length(btrim(name)) between 1 and 100),settings jsonb not null default '{}' check(jsonb_typeof(settings)='object' and octet_length(settings::text)<=16000),
 is_default boolean not null default false,archived boolean not null default false,updated_at timestamptz not null default now(),unique(id,organization_id),check(not(archived and is_default))
);
create unique index named_print_default on public.named_print_templates(organization_id,kind) where is_default;
alter table public.named_print_templates enable row level security;
grant select,insert,update on public.named_print_templates to authenticated;
revoke all on public.named_print_templates from public,anon;
create policy named_print_read on public.named_print_templates for select to authenticated using(
 public.business_access(organization_id,public.current_profile_branch_id(),'sales') or public.business_access(organization_id,public.current_profile_branch_id(),'cases') or public.business_access(organization_id,public.current_profile_branch_id(),'payments') or public.business_access(organization_id,public.current_profile_branch_id(),'deliveries') or(public.is_current_session_valid() and public.is_organization_admin(organization_id)));
create policy named_print_write on public.named_print_templates for all to authenticated
 using(public.is_current_session_valid() and public.is_organization_admin(organization_id)) with check(public.is_current_session_valid() and public.is_organization_admin(organization_id));
alter table public.sales_documents add constraint sales_template_company foreign key(template_id,organization_id) references public.named_print_templates(id,organization_id);
-- Copy only configuration; preserve the legacy settings for older clients and layouts.
insert into public.named_print_templates(organization_id,kind,name,settings,is_default)
 select p.organization_id,k,'Original '||k,case when k='quotation' then coalesce(p.templates->'invoice','{}')||'{"title":"Quotation"}'::jsonb else coalesce(p.templates->k,'{}') end,true
 from public.organization_print_settings p cross join unnest(array['invoice','quotation','receipt','delivery','report']) k;
create function public.set_default_print_template(template uuid) returns void language plpgsql security invoker set search_path='' as $$
declare t public.named_print_templates;
begin
 select * into t from public.named_print_templates where id=template;
 if t.id is null or t.archived or not(public.is_current_session_valid() and public.is_organization_admin(t.organization_id)) then raise exception 'Choose an active template in your company.';end if;
 perform pg_advisory_xact_lock(hashtextextended(t.organization_id::text||t.kind,0));
 update public.named_print_templates set is_default=false where organization_id=t.organization_id and kind=t.kind and is_default;
 update public.named_print_templates set is_default=true where id=t.id;
end $$;
revoke all on function public.set_default_print_template(uuid) from public,anon;
grant execute on function public.set_default_print_template(uuid) to authenticated;
create or replace function public.business_document_totals() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb; quantity numeric; price numeric; amount numeric:=0; payments numeric;line_discount numeric;source public.sales_documents%rowtype;
begin
 if tg_op='INSERT' and new.kind='Quotation' and new.document_no like 'INV-%' then new.document_no:='QTN-'||substr(new.document_no,5);end if;
 if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.kind<>old.kind or new.source_quote_id is distinct from old.source_quote_id) then raise exception 'The company, document type and source quotation cannot be changed.';end if;
 if new.source_quote_id is not null then
 select * into source from public.sales_documents where id=new.source_quote_id;
 if source.kind<>'Quotation' or source.status='Cancelled' or source.organization_id<>new.organization_id or source.branch_id is distinct from new.branch_id or not public.business_access(source.organization_id,source.branch_id,'sales') then raise exception 'This quotation is not available for conversion.';end if;
 end if;
 for item in select value from jsonb_array_elements(new.items) loop
 if jsonb_typeof(item)<>'object' or length(coalesce(item->>'description','')) not between 1 and 300 then raise exception 'Add a description for every item.';end if;
 quantity:=(item->>'quantity')::numeric;price:=(item->>'unit_price')::numeric;
 if quantity is null or price is null or quantity<=0 or quantity>1000000 or price<0 or price>100000000 or quantity::text in ('NaN','Infinity') or price::text in ('NaN','Infinity') then raise exception 'Enter valid quantities and prices.';end if;
 if nullif(item->>'service_id','') is not null and not exists(select 1 from public.service_catalog s where s.id=(item->>'service_id')::uuid and s.organization_id=new.organization_id) then raise exception 'Select a service from this company.';end if;
 line_discount:=coalesce((item->>'discount')::numeric,0);
 if line_discount<0 or line_discount>round(quantity*price,2) or line_discount::text in ('NaN','Infinity','-Infinity') then raise exception 'Item discount cannot exceed the item amount.';end if;
 amount:=amount+round(quantity*price,2)-round(line_discount,2);
 end loop;
 if new.discount>amount then raise exception 'Discount cannot exceed the subtotal.';end if;
 new.subtotal:=amount;new.total:=round((amount-new.discount)*(1+new.tax_percent/100)+new.adjustment,2);
 select coalesce(sum(p.amount),0) into payments from public.sales_payments p where p.document_id=new.id and not p.voided;
 if tg_op='UPDATE' and payments>0 and (new.items<>old.items or new.discount<>old.discount or new.adjustment<>old.adjustment or new.tax_percent<>old.tax_percent or new.customer_id is distinct from old.customer_id or new.customer_name<>old.customer_name or new.branch_id is distinct from old.branch_id or new.status in ('Draft','Cancelled')) then raise exception 'An invoice with payments cannot be changed or cancelled. Ask an administrator to void incorrect payments first.';end if;
 if new.subtotal-new.discount+new.adjustment<0 or new.total<0 or new.total::text in ('NaN','Infinity','-Infinity') then raise exception 'The total must be a valid positive amount.';end if;
 new.paid_total:=payments;new.updated_at:=now();return new;
end $$;
create or replace function public.checkout_sale(input jsonb,request_key uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare org uuid:=(input->>'organization_id')::uuid;branch uuid:=(input->>'branch_id')::uuid;
 customer uuid:=nullif(input->>'customer_id','')::uuid; invoice uuid; item jsonb; lines jsonb:='[]';
 svc public.service_catalog; gov numeric; fee numeric; qty numeric; paid numeric:=coalesce((input->>'paid')::numeric,0);
 saved public.sales_documents; stages jsonb; cname text:=coalesce(nullif(btrim(input->>'customer_name'),''),'Walk-in customer');
begin
 if auth.uid() is null or request_key is null or not public.business_access(org,branch,'sales') then raise exception 'Checkout is not available to your account.';end if;
 if not exists(select 1 from public.branches b where b.id=branch and b.organization_id=org and b.is_active) then raise exception 'Choose an active branch in this company.';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||request_key::text,0));
 select id into invoice from public.sales_documents where organization_id=org and checkout_key=request_key;
 if invoice is not null then return invoice;end if;
 if jsonb_typeof(input->'items') is distinct from 'array' or jsonb_array_length(input->'items') not between 1 and 100 then raise exception 'Add at least one service before checkout.';end if;
 if customer is not null then
  select name into cname from public.crm_customers where id=customer and organization_id=org and not archived;
  if not found then raise exception 'This customer is not available to your account.';end if;
 elsif cname<>'Walk-in customer' then
  select id into customer from public.crm_customers c where c.organization_id=org and c.branch_id=branch and not c.archived and lower(btrim(c.name))=lower(cname) and regexp_replace(coalesce(c.mobile,''),'[^0-9]','','g')=regexp_replace(coalesce(input->>'customer_mobile',''),'[^0-9]','','g') limit 1;
  if customer is null then insert into public.crm_customers(organization_id,branch_id,name,mobile,email) values(org,branch,cname,nullif(input->>'customer_mobile',''),nullif(input->>'customer_email','')) returning id into customer;end if;
 end if;
 for item in select value from jsonb_array_elements(input->'items') loop
  select * into svc from public.service_catalog where id=(item->>'service_id')::uuid and organization_id=org and is_active;
  if not found then raise exception 'Choose an available service. Use Cases for attestation documents.';end if;
  gov:=round((item->>'government_fee')::numeric,2);fee:=round((item->>'service_fee')::numeric,2);qty:=(item->>'quantity')::numeric;
  if gov is null or fee is null or qty is null or gov::text in ('NaN','Infinity','-Infinity') or fee::text in ('NaN','Infinity','-Infinity') or qty::text in ('NaN','Infinity','-Infinity') or gov<0 or fee<0 or qty<=0 or qty>10000 then raise exception 'Enter valid quantities and fees.';end if;
  stages:=case when item ? 'workflow' then item->'workflow' else svc.workflow end;
  if jsonb_typeof(stages) is distinct from 'array' or jsonb_array_length(stages)>30 then raise exception 'Choose up to 30 valid stages.';end if;
  if jsonb_array_length(stages)>0 and not public.business_access(org,branch,'services') then raise exception 'Service jobs require access to the Services module.';end if;
  lines:=lines||jsonb_build_array(jsonb_build_object('service_id',svc.id,'description',svc.name,'quantity',qty,'government_fee',gov,'service_fee',fee,'unit_price',gov+fee,'workflow',stages));
  if coalesce((item->>'remember')::boolean,false) then
   insert into public.checkout_prices(organization_id,branch_id,service_id,government_fee,service_fee) values(org,branch,svc.id,gov,fee)
   on conflict(organization_id,branch_id,service_id) do update set government_fee=excluded.government_fee,service_fee=excluded.service_fee,updated_at=now();
  end if;
 end loop;
 insert into public.sales_documents(organization_id,branch_id,customer_id,customer_name,customer_mobile,customer_email,kind,status,items,discount,notes,checkout_key,document_no)
 values(org,branch,customer,cname,nullif(input->>'customer_mobile',''),nullif(input->>'customer_email',''),'Invoice','Issued',lines,coalesce((input->>'discount')::numeric,0),nullif(input->>'notes',''),request_key,coalesce(nullif(btrim(input->>'document_no'),''),public.next_billing_number(org,branch,'Invoice'))) returning * into saved;
 invoice:=saved.id;
 if paid<0 or paid>saved.total then raise exception 'Payment cannot exceed the invoice total.';end if;
 if paid>0 then insert into public.sales_payments(organization_id,branch_id,document_id,amount,method,received_by) values(org,branch,invoice,paid,coalesce(input->>'method','Cash'),auth.uid());end if;
 return invoice;
end $$;
revoke all on function public.checkout_sale(jsonb,uuid) from public,anon;
grant execute on function public.checkout_sale(jsonb,uuid) to authenticated;
create table public.billing_preferences(
 organization_id uuid primary key references public.organizations(id),invoice_prefix text not null default 'INV-',quotation_prefix text not null default 'QTN-',
 invoice_next bigint not null default 1 check(invoice_next>0),quotation_next bigint not null default 1 check(quotation_next>0),
 payment_terms text not null default 'Due on receipt',customer_notes text not null default '',terms text not null default '',
 check(length(invoice_prefix) between 1 and 30 and length(quotation_prefix) between 1 and 30 and length(payment_terms)<=200 and length(customer_notes)<=2000 and length(terms)<=2000)
);
alter table public.billing_preferences enable row level security;
revoke all on public.billing_preferences from public,anon;
grant select,insert,update on public.billing_preferences to authenticated;
create policy billing_preferences_read on public.billing_preferences for select to authenticated using(public.business_access(organization_id,public.current_profile_branch_id(),'sales') or(public.is_current_session_valid() and public.is_organization_admin(organization_id)));
create policy billing_preferences_write on public.billing_preferences for all to authenticated using(public.is_current_session_valid() and public.is_organization_admin(organization_id)) with check(public.is_current_session_valid() and public.is_organization_admin(organization_id));
-- Staff cannot update settings; this guarded function only allocates numbers while saving a permitted document.
create function public.next_billing_number(org uuid,branch uuid,doc_kind text) returns text
language plpgsql security definer set search_path='' as $$
declare settings public.billing_preferences;n bigint;prefix text;candidate text;
begin
 if auth.uid() is null or not public.business_access(org,branch,'sales') or doc_kind not in ('Invoice','Quotation') then raise exception 'Billing is not available to your account.';end if;
 insert into public.billing_preferences(organization_id) values(org) on conflict do nothing;
 select * into settings from public.billing_preferences where organization_id=org for update;
 n:=case when doc_kind='Invoice' then settings.invoice_next else settings.quotation_next end;
 prefix:=case when doc_kind='Invoice' then settings.invoice_prefix else settings.quotation_prefix end;
 loop
 candidate:=prefix||lpad(n::text,greatest(6,length(n::text)),'0');
 exit when not exists(select 1 from public.sales_documents where organization_id=org and document_no=candidate);
 n:=n+1;
 end loop;
 if doc_kind='Invoice' then update public.billing_preferences set invoice_next=n+1 where organization_id=org;
 else update public.billing_preferences set quotation_next=n+1 where organization_id=org;end if;
 return candidate;
end $$;
revoke all on function public.next_billing_number(uuid,uuid,text) from public,anon;
grant execute on function public.next_billing_number(uuid,uuid,text) to authenticated;
create function public.save_billing_document(input jsonb,request_key uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare d public.sales_documents;existing public.sales_documents;result uuid;item jsonb;clean_items jsonb:='[]';
begin
 d:=jsonb_populate_record(null::public.sales_documents,input);
 if auth.uid() is null or request_key is null or not public.business_access(d.organization_id,d.branch_id,'sales') then raise exception 'Billing is not available to your account.';end if;
 perform pg_advisory_xact_lock(hashtextextended(d.organization_id::text||request_key::text,0));
 select * into existing from public.sales_documents where organization_id=d.organization_id and checkout_key=request_key;
 if existing.id is not null then return existing.id;end if;
 if jsonb_typeof(d.items) is distinct from 'array' then raise exception 'Add at least one service before checkout.';end if;
 for item in select value from jsonb_array_elements(d.items) loop
 if coalesce((item->>'remember')::boolean,false) and nullif(item->>'service_id','') is not null then
 insert into public.checkout_prices(organization_id,branch_id,service_id,government_fee,service_fee) values(d.organization_id,d.branch_id,(item->>'service_id')::uuid,coalesce((item->>'government_fee')::numeric,0),coalesce((item->>'service_fee')::numeric,0))
 on conflict(organization_id,branch_id,service_id) do update set government_fee=excluded.government_fee,service_fee=excluded.service_fee,updated_at=now();
 end if;
 clean_items:=clean_items||jsonb_build_array(item-'remember');
 end loop;
 d.items:=clean_items;
 if d.id is not null then
 select * into existing from public.sales_documents where id=d.id and organization_id=d.organization_id for update;
 if existing.id is null then raise exception 'This document is not available to your account.';end if;
 update public.sales_documents set customer_id=d.customer_id,branch_id=d.branch_id,customer_name=d.customer_name,customer_mobile=d.customer_mobile,customer_email=d.customer_email,
 document_no=coalesce(nullif(btrim(d.document_no),''),existing.document_no),status=d.status,items=d.items,discount=coalesce(d.discount,0),tax_percent=coalesce(d.tax_percent,0),adjustment=coalesce(d.adjustment,0),
 document_date=coalesce(d.document_date,current_date),due_date=d.due_date,reference_no=d.reference_no,subject=d.subject,salesperson=d.salesperson,payment_terms=d.payment_terms,customer_notes=d.customer_notes,terms=d.terms,template_id=d.template_id,notes=d.notes where id=d.id returning id into result;
 else
 insert into public.sales_documents(organization_id,branch_id,customer_id,customer_name,customer_mobile,customer_email,document_no,kind,status,items,discount,tax_percent,adjustment,document_date,due_date,reference_no,subject,salesperson,payment_terms,customer_notes,terms,template_id,notes,checkout_key)
 values(d.organization_id,d.branch_id,d.customer_id,d.customer_name,d.customer_mobile,d.customer_email,coalesce(nullif(btrim(d.document_no),''),public.next_billing_number(d.organization_id,d.branch_id,d.kind)),d.kind,d.status,d.items,coalesce(d.discount,0),coalesce(d.tax_percent,0),coalesce(d.adjustment,0),coalesce(d.document_date,current_date),d.due_date,d.reference_no,d.subject,d.salesperson,d.payment_terms,d.customer_notes,d.terms,d.template_id,d.notes,request_key) returning id into result;
 end if;
 return result;
end $$;
revoke all on function public.save_billing_document(jsonb,uuid) from public,anon;
grant execute on function public.save_billing_document(jsonb,uuid) to authenticated;
alter table public.service_jobs add column invoice_line integer;
create unique index service_job_invoice_line on public.service_jobs(invoice_id,invoice_line) where invoice_line is not null;
create function public.billing_item_jobs() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb;stages jsonb;line_no integer:=0;stage jsonb;
begin
 if new.kind<>'Invoice' or new.status<>'Issued' then return new;end if;
 if tg_op='UPDATE' and old.status='Issued' then
 if (select coalesce(jsonb_agg(value->'workflow'),'[]') from jsonb_array_elements(new.items) where jsonb_typeof(value->'workflow')='array' and jsonb_array_length(value->'workflow')>0) is distinct from (select coalesce(jsonb_agg(value->'workflow'),'[]') from jsonb_array_elements(old.items) where jsonb_typeof(value->'workflow')='array' and jsonb_array_length(value->'workflow')>0) then raise exception 'Stages on issued invoices cannot be changed. Update the linked service job instead.';end if;
 return new;end if;
 for item in select value from jsonb_array_elements(new.items) loop
 line_no:=line_no+1;
 if item?'workflow' then
 if jsonb_typeof(item->'workflow') is distinct from 'array' or jsonb_array_length(item->'workflow')>30 then raise exception 'Choose up to 30 valid stages.';end if;
 if jsonb_array_length(item->'workflow')>0 then
 if not public.business_access(new.organization_id,new.branch_id,'services') then raise exception 'Service jobs require access to the Services module.';end if;
 for stage in select value from jsonb_array_elements(item->'workflow') loop
 if length(btrim(case when jsonb_typeof(stage)='string' then stage#>>'{}' else stage->>'name' end)) not between 1 and 200 then raise exception 'Enter a valid stage name.';end if;
 end loop;
 select jsonb_agg(jsonb_build_object('name',case when jsonb_typeof(value)='string' then value#>>'{}' else value->>'name' end,'status','Pending','date','')) into stages from jsonb_array_elements(item->'workflow');
 insert into public.service_jobs(organization_id,branch_id,customer_id,service_id,title,customer_name,stages,invoice_id,invoice_line)
 values(new.organization_id,new.branch_id,new.customer_id,nullif(item->>'service_id','')::uuid,left(item->>'description',200),new.customer_name,stages,new.id,line_no)
 on conflict(invoice_id,invoice_line) where invoice_line is not null do nothing;
 end if;end if;
 end loop;
 return new;
end $$;
revoke all on function public.billing_item_jobs() from public,anon,authenticated;
create trigger billing_item_jobs after insert or update on public.sales_documents for each row execute function public.billing_item_jobs();
create or replace function public.convert_business_quote(quote_id uuid) returns uuid language plpgsql set search_path='' as $$
declare q public.sales_documents%rowtype; result uuid;
begin select * into q from public.sales_documents where id=quote_id for update;
 if q.id is null or q.kind<>'Quotation' or q.status not in ('Issued','Accepted') then raise exception 'Select an issued quotation you can access.';end if;
 select id into result from public.sales_documents where source_quote_id=q.id;if result is not null then return result;end if;
 insert into public.sales_documents(organization_id,branch_id,customer_id,customer_name,customer_mobile,customer_email,kind,status,items,discount,tax_percent,due_date,notes,source_quote_id,reference_no,subject,salesperson,payment_terms,customer_notes,terms,adjustment,template_id)
 values(q.organization_id,q.branch_id,q.customer_id,q.customer_name,q.customer_mobile,q.customer_email,'Invoice','Issued',q.items,q.discount,q.tax_percent,q.due_date,q.notes,q.id,q.reference_no,q.subject,q.salesperson,q.payment_terms,q.customer_notes,q.terms,q.adjustment,null) returning id into result;
 update public.sales_documents set status='Accepted' where id=q.id;return result;end $$;
create function public.customer_duplicate_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare phone text:=regexp_replace(coalesce(new.mobile,''),'[^0-9]','','g');normalized_name text:=lower(btrim(new.name));
begin
 if tg_op='UPDATE' and new.name is not distinct from old.name and new.mobile is not distinct from old.mobile and new.branch_id is not distinct from old.branch_id and new.archived is not distinct from old.archived then return new;end if;
 if new.archived then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||coalesce(new.branch_id::text,'')||normalized_name||phone,0));
 if exists(select 1 from public.crm_customers c where c.organization_id=new.organization_id and c.branch_id is not distinct from new.branch_id and not c.archived and c.id<>new.id and lower(btrim(c.name))=normalized_name and regexp_replace(coalesce(c.mobile,''),'[^0-9]','','g')=phone) then raise exception 'This customer already exists. Search by name or mobile and select the existing customer.';end if;
 return new;
end $$;
revoke all on function public.customer_duplicate_guard() from public,anon,authenticated;
create trigger customer_duplicate_guard before insert or update on public.crm_customers for each row execute function public.customer_duplicate_guard();
create or replace function accounting_private.invoice_post(d public.sales_documents) returns void language plpgsql security invoker set search_path='' as $$
declare old_j public.finance_journals;entries jsonb;gov numeric:=0;tax numeric;net numeric;
begin
 if d.kind<>'Invoice' or d.branch_id is null then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('invoice-ledger:'||d.id::text,0));
 select * into old_j from public.finance_journals j where source='Invoice' and source_id=d.id and not exists(select 1 from public.finance_journals r where r.reversal_of=j.id) order by created_at desc limit 1;
 if d.status='Cancelled' or (d.status='Draft' and d.paid_total=0) or d.total=0 then if old_j.id is not null then perform accounting_private.reverse_entry(old_j.id,'Invoice cancelled or replaced');end if;return;end if;
 net:=d.subtotal-d.discount+d.adjustment;tax:=d.total-net;
 select coalesce(sum(coalesce((x->>'government_fee')::numeric,0)*(x->>'quantity')::numeric * case when round((x->>'unit_price')::numeric*(x->>'quantity')::numeric,2)>0 then (round((x->>'unit_price')::numeric*(x->>'quantity')::numeric,2)-coalesce((x->>'discount')::numeric,0))/round((x->>'unit_price')::numeric*(x->>'quantity')::numeric,2) else 0 end),0) into gov from jsonb_array_elements(d.items) x;
 gov:=case when d.subtotal>0 then round(least(gov,d.subtotal)*net/d.subtotal,2) else 0 end;
 entries:=jsonb_build_array(jsonb_build_object('code','1100','debit',d.total),jsonb_build_object('code','4000','credit',net-gov),jsonb_build_object('code','4010','credit',gov),jsonb_build_object('code','2100','credit',tax));
 if old_j.id is not null and old_j.snapshot=entries then return;end if;
 if old_j.id is not null then perform accounting_private.reverse_entry(old_j.id,'Invoice corrected');end if;
 perform accounting_private.post(d.organization_id,d.branch_id,case when old_j.id is null then coalesce(d.document_date,d.created_at::date) else current_date end,'Invoice',d.id,'Invoice '||d.document_no,entries);
end $$;
create function public.list_billing_documents(target_org uuid,doc_kind text,query_text text default '',status_filter text default '')
returns setof public.sales_documents language sql stable security invoker set search_path='' as $$
 select d.* from public.sales_documents d
 where d.organization_id=target_org and d.kind=doc_kind
 and (query_text='' or position(lower(query_text) in lower(d.customer_name))>0 or position(lower(query_text) in lower(d.document_no))>0 or (regexp_replace(query_text,'[^0-9]','','g')<>'' and position(regexp_replace(query_text,'[^0-9]','','g') in regexp_replace(coalesce(d.customer_mobile,''),'[^0-9]','','g'))>0))
 and (status_filter='' or case when d.status<>'Issued' then d.status when d.kind='Invoice' and d.paid_total>=d.total then 'Paid' when d.kind='Invoice' and d.due_date<current_date then 'Overdue' when d.kind='Quotation' and d.due_date<current_date then 'Expired' when d.kind='Invoice' and d.paid_total>0 then 'Partially paid' else d.status end=status_filter)
 order by case when query_text<>'' and lower(d.document_no)=lower(query_text) then 0 when query_text<>'' and lower(d.document_no) like lower(query_text)||'%' then 1 else 2 end,d.created_at desc,d.id
$$;
revoke all on function public.list_billing_documents(uuid,text,text,text) from public,anon;
grant execute on function public.list_billing_documents(uuid,text,text,text) to authenticated;
create or replace function public.create_attestation_checkout(input jsonb,request_key uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare p public.cases;item jsonb;v_case_id uuid;doc_id uuid;qty integer;gov numeric;fee numeric;total numeric:=0;stage text;ordinal integer;canonical text;customer uuid;
begin
 p:=jsonb_populate_record(null::public.cases,input->'case');
 if auth.uid() is null or request_key is null or not public.business_access(p.organization_id,p.branch_id,'cases') then raise exception 'Checkout is not available to your account.';end if;
 if not exists(select 1 from public.branches b where b.id=p.branch_id and b.organization_id=p.organization_id and b.is_active) then raise exception 'Choose an active branch in this company.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p.organization_id::text||request_key::text,0));
 select id into v_case_id from public.cases where organization_id=p.organization_id and checkout_key=request_key;
 if v_case_id is not null then return v_case_id;end if;
 if jsonb_typeof(input->'documents') is distinct from 'array' or jsonb_array_length(input->'documents') not between 1 and 100 then raise exception 'Add at least one document before checkout.';end if;
 for item in select value from jsonb_array_elements(input->'documents') loop
  qty:=(item->>'quantity')::integer;gov:=round((item->>'government_fee')::numeric,2);fee:=round((item->>'service_fee')::numeric,2);
  if qty is null or qty not between 1 and 10000 or gov is null or fee is null or gov<0 or fee<0 or length(btrim(item->>'document_name')) not between 1 and 200 or jsonb_typeof(item->'stages') is distinct from 'array' or jsonb_array_length(item->'stages') not between 1 and 30 then raise exception 'Enter valid document names, quantities, fees and stages.';end if;
  total:=total+qty*(gov+fee);
 end loop;
 p.advance_paid:=coalesce(p.advance_paid,0);
 if p.advance_paid<0 or p.advance_paid>total then raise exception 'Payment cannot exceed the case total.';end if;
 if p.advance_paid>0 and not public.business_access(p.organization_id,p.branch_id,'payments') then raise exception 'Recording a payment requires access to Payments.';end if;
 customer:=p.customer_id;
 if customer is null then
  select c.id into customer from public.crm_customers c where c.organization_id=p.organization_id and c.branch_id=p.branch_id and not c.archived and lower(btrim(c.name))=lower(btrim(p.customer_name)) and regexp_replace(coalesce(c.mobile,''),'[^0-9]','','g')=regexp_replace(coalesce(p.mobile,''),'[^0-9]','','g') limit 1;
  if customer is null then insert into public.crm_customers(organization_id,branch_id,name,mobile,email,email_updates,whatsapp_opt_in) values(p.organization_id,p.branch_id,p.customer_name,p.mobile,p.customer_email,coalesce(p.email_updates,false),coalesce(p.whatsapp_opt_in,false)) returning id into customer;end if;
 elsif not exists(select 1 from public.crm_customers where id=customer and organization_id=p.organization_id and not archived) then raise exception 'This customer is not available to your account.';end if;
 insert into public.cases(organization_id,tracking_reference,tracking_family,customer_name,mobile,customer_id,customer_email,email_updates,whatsapp_opt_in,bill_no,internal_invoice_no,branch_id,submission_date,promise_date,overall_status,total_amount,advance_paid,second_payment,balance_payment,notes,account_name,account_contact,account_mobile,intake_source,current_milestone,current_milestone_date,created_by,updated_by,checkout_key)
 values(p.organization_id,btrim(p.tracking_reference),p.tracking_family,btrim(p.customer_name),p.mobile,customer,p.customer_email,coalesce(p.email_updates,false),coalesce(p.whatsapp_opt_in,false),p.bill_no,p.internal_invoice_no,p.branch_id,p.submission_date,p.promise_date,coalesce(p.overall_status,'Received'),total,0,p.advance_paid,total-p.advance_paid,p.notes,p.account_name,p.account_contact,p.account_mobile,coalesce(p.intake_source,'Branch'),coalesce(p.current_milestone,'Submitted'),p.current_milestone_date,auth.uid(),auth.uid(),request_key) returning id into v_case_id;
 for item in select value from jsonb_array_elements(input->'documents') loop
  insert into public.documents(organization_id,case_id,document_name,holder_name,source_tracking_reference,occurrence_no,quantity,document_status,direct_to_delhi,direct_destination,government_fee,service_fee)
  values(p.organization_id,v_case_id,btrim(item->>'document_name'),coalesce(nullif(item->>'holder_name',''),p.customer_name),p.tracking_reference,(select count(*)+1 from public.documents d where d.case_id=v_case_id and lower(d.document_name)=lower(btrim(item->>'document_name'))),(item->>'quantity')::integer,'Pending',coalesce((item->>'direct_to_delhi')::boolean,false),nullif(item->>'direct_destination',''),(item->>'government_fee')::numeric,(item->>'service_fee')::numeric) returning id into doc_id;
  ordinal:=0;
  for stage in select jsonb_array_elements_text(item->'stages') loop
   if length(btrim(stage)) not between 1 and 200 then raise exception 'Enter a valid stage name.';end if;
   ordinal:=ordinal+1;insert into public.document_stages(organization_id,document_id,stage_name,stage_order,status) values(p.organization_id,doc_id,btrim(stage),ordinal,'Pending');
  end loop;
  if coalesce((item->>'remember')::boolean,false) then
   select lower(btrim(item->>'document_name'))||'|'||string_agg(lower(btrim(value)),'|' order by lower(btrim(value))) into canonical from jsonb_array_elements_text(item->'stages');
   insert into public.document_prices(organization_id,branch_id,price_key,document_name,stages,government_fee,service_fee) values(p.organization_id,p.branch_id,canonical,btrim(item->>'document_name'),item->'stages',(item->>'government_fee')::numeric,(item->>'service_fee')::numeric)
   on conflict(organization_id,branch_id,price_key) do update set stages=excluded.stages,government_fee=excluded.government_fee,service_fee=excluded.service_fee;
  end if;
 end loop;
 if p.advance_paid>0 then insert into public.payments(organization_id,case_id,amount,payment_method,received_by) values(p.organization_id,v_case_id,p.advance_paid,'Cash',auth.uid());end if;
 insert into public.case_history(organization_id,case_id,user_id,action,metadata) values(p.organization_id,v_case_id,auth.uid(),'Case created',jsonb_build_object('total_amount',total,'paid',p.advance_paid));
 return v_case_id;
end $$;
revoke all on function public.create_attestation_checkout(jsonb,uuid) from public,anon;
grant execute on function public.create_attestation_checkout(jsonb,uuid) to authenticated;create table public.billing_attachments(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 document_id uuid not null,branch_id uuid not null references public.branches(id),name text not null check(length(name) between 1 and 200),
 object_path text not null unique,size_bytes bigint not null check(size_bytes between 1 and 10485760),content_type text not null,
 created_at timestamptz not null default now(),foreign key(document_id,organization_id) references public.sales_documents(id,organization_id),
 check(content_type in('application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
 check(object_path=organization_id::text||'/'||document_id::text||'/'||id::text)
);
alter table public.billing_attachments enable row level security;
revoke all on public.billing_attachments from public,anon;
grant select,insert,delete on public.billing_attachments to authenticated;
create policy billing_attachments_read on public.billing_attachments for select to authenticated using(public.business_access(organization_id,branch_id,'sales') and exists(select 1 from public.sales_documents d where d.id=document_id and d.organization_id=billing_attachments.organization_id and d.branch_id=billing_attachments.branch_id));
create policy billing_attachments_write on public.billing_attachments for insert to authenticated with check(public.business_access(organization_id,branch_id,'sales') and exists(select 1 from public.sales_documents d where d.id=document_id and d.organization_id=billing_attachments.organization_id and d.branch_id=billing_attachments.branch_id));
create policy billing_attachments_delete on public.billing_attachments for delete to authenticated using(public.business_access(organization_id,branch_id,'sales'));
create function public.billing_attachment_limit() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.sales_documents where id=new.document_id and organization_id=new.organization_id for update;
 if not found then raise exception 'This document is not available to your account.';end if;
 if(select count(*) from public.billing_attachments where document_id=new.document_id)>=5 then raise exception 'Attach up to five files to this document.';end if;
 return new;
end $$;
revoke all on function public.billing_attachment_limit() from public,anon,authenticated;
create trigger billing_attachment_limit before insert on public.billing_attachments for each row execute function public.billing_attachment_limit();




commit;
notify pgrst,'reload schema';
