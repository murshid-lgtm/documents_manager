-- Document Operations Platform V4.0 — CLEAN INSTALL
-- For a brand-new Supabase project. Do not run the V3 migrations first.
-- Run this complete file once in Supabase SQL Editor.
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
  sidebar_logo_size integer not null default 100 check(sidebar_logo_size between 50 and 130),
  sidebar_logo_alignment text not null default 'center' check(sidebar_logo_alignment in ('left','center','right')),
  login_logo_size integer not null default 100 check(login_logo_size between 50 and 130),
  login_logo_alignment text not null default 'left' check(login_logo_alignment in ('left','center','right')),
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
  tracking_reference text not null, tracking_family text, legacy_reference text, legacy_status_code text,
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
 update public.documents d set physical_location=t.to_location,updated_at=now() where exists(select 1 from public.custody_transfer_items i where i.transfer_id=target_transfer and i.receive_status in ('Verified','Damaged') and (i.document_id=d.id or (i.document_id is null and i.case_id=d.case_id)));
 select array_agg(distinct case_id) into affected from public.custody_transfer_items where transfer_id=target_transfer;
 foreach cid in array coalesce(affected,array[]::uuid[]) loop
  update public.cases c set physical_location=case when exists(select 1 from public.documents d where d.case_id=cid) and not exists(select 1 from public.documents d where d.case_id=cid and coalesce(d.physical_location,'')<>coalesce(t.to_location,'')) then t.to_location else 'Mixed locations' end,updated_by=auth.uid() where c.id=cid;
  insert into public.case_history(organization_id,case_id,user_id,action,field_name,new_value,metadata) values(t.organization_id,cid,auth.uid(),'Custody transfer received','physical_location',coalesce(t.from_location,'Unassigned')||' → '||coalesce(t.to_location,'Unassigned')||' · '||t.transfer_no,jsonb_build_object('source','custody','transfer_id',target_transfer));
 end loop;
 update public.custody_transfers set status='Received',received_by=auth.uid(),received_at=now(),receipt_notes=nullif(trim(receipt_note),''),has_discrepancy=has_issue where id=target_transfer;
 return jsonb_build_object('transfer_id',target_transfer,'case_count',coalesce(array_length(affected,1),0),'has_discrepancy',has_issue);
end $$;
revoke all on function public.confirm_custody_receipt(uuid,jsonb,text) from public;
grant execute on function public.confirm_custody_receipt(uuid,jsonb,text) to authenticated;

create or replace function public.public_branding(request_host text default null,requested_slug text default null)
returns jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(x) from (select s.product_name,s.company_name,s.short_name,s.logo_url,s.favicon_url,s.app_icon_url,s.primary_color,s.secondary_color,s.accent_color,s.surface_color,s.login_title,s.login_subtitle,s.login_background_url,s.login_kicker,s.login_welcome_title,s.login_welcome_subtitle,s.login_button_text,s.sidebar_logo_size,s.sidebar_logo_alignment,s.login_logo_size,s.login_logo_alignment,s.support_email,s.website_url,s.footer_text from public.organization_settings s join public.organizations o on o.id=s.organization_id where o.status='Active' and ((nullif(trim(requested_slug),'') is not null and o.slug=lower(trim(requested_slug))) or (nullif(trim(request_host),'') is not null and lower(s.primary_domain)=lower(split_part(trim(request_host),':',1)))) limit 1) x;
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

commit;
notify pgrst,'reload schema';
