begin;
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

commit;
notify pgrst,'reload schema';
