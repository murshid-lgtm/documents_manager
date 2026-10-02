begin;
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
commit;
notify pgrst,'reload schema';
