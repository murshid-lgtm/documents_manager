-- V5: additive business platform. Existing cases, payments and custody are preserved.
begin;
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
commit;
notify pgrst,'reload schema';
