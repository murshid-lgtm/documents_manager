begin;
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
