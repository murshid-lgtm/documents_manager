begin;
-- New checkouts only. Historical cases are never backfilled into financial records.
alter table public.sales_documents add column sale_type text check(sale_type in ('POS','Service','Attestation'));
alter table public.sales_documents alter column sale_type set default 'Service';
alter table public.cases add column invoice_id uuid;
alter table public.cases add constraint cases_invoice_company foreign key(invoice_id,organization_id) references public.sales_documents(id,organization_id);
create unique index cases_invoice_unique on public.cases(invoice_id) where invoice_id is not null;
alter table public.payments add column voided boolean not null default false;
-- A legacy case receipt is a projection of the canonical sales receipt, sharing its UUID.
create function public.connected_case_receipt() returns trigger language plpgsql security invoker set search_path='' as $$
declare c public.cases;receipt public.sales_payments;
begin
 select * into c from public.cases where id=new.case_id;
 if c.invoice_id is null then return new;end if;
 if tg_op='INSERT' then
 select * into receipt from public.sales_payments where id=new.id and document_id=c.invoice_id;
 if receipt.id is null then
 insert into public.sales_payments(id,organization_id,branch_id,document_id,amount,method,reference,notes,received_at,received_by)
 values(new.id,c.organization_id,c.branch_id,c.invoice_id,new.amount,case lower(coalesce(new.payment_method,'cash')) when 'bank transfer' then 'Bank transfer' when 'card' then 'Card' when 'cash' then 'Cash' else 'Other' end,new.payment_reference,new.notes,new.received_at,auth.uid()) returning * into receipt;
 end if;
 new.receipt_no:=receipt.receipt_no;new.voided:=receipt.voided;return new;
 end if;
 select * into receipt from public.sales_payments where id=new.id and document_id=c.invoice_id;new.receipt_no:=receipt.receipt_no;new.voided:=receipt.voided;
 if new.amount is distinct from old.amount or new.payment_method is distinct from old.payment_method or new.payment_reference is distinct from old.payment_reference then raise exception 'This receipt belongs to an invoice. Use Sales > Payments to void it and record the correct payment.';end if;
 return new;
end $$;
revoke all on function public.connected_case_receipt() from public,anon,authenticated;
create trigger aa_connected_case_receipt before insert or update on public.payments for each row execute function public.connected_case_receipt();
create function public.connected_case_receipt_delete() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.cases where id=old.case_id and invoice_id is not null) then raise exception 'Invoice receipts cannot be deleted. Use the administrator void action in Sales > Payments.';end if;return old;
end $$;
revoke all on function public.connected_case_receipt_delete() from public,anon,authenticated;
create trigger connected_case_receipt_delete before delete on public.payments for each row execute function public.connected_case_receipt_delete();
create function public.connected_sales_receipt() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.cases;
begin
 select * into c from public.cases where invoice_id=new.document_id and organization_id=new.organization_id;
 if c.id is null then return new;end if;
 if not public.business_access(c.organization_id,c.branch_id,'sales') then raise exception 'Invoice access denied.';end if;
 if tg_op='INSERT' and not exists(select 1 from public.payments where id=new.id) and pg_trigger_depth()=1 then
 insert into public.payments(id,organization_id,case_id,amount,payment_method,payment_reference,receipt_no,notes,received_by,received_at,voided)
 values(new.id,new.organization_id,c.id,new.amount,new.method,new.reference,new.receipt_no,new.notes,new.received_by,new.received_at,new.voided);
 elsif tg_op='UPDATE' then update public.payments set voided=new.voided where id=new.id;end if;
 update public.cases set advance_paid=0,second_payment=(select coalesce(sum(amount),0) from public.sales_payments where document_id=new.document_id and not voided),balance_payment=greatest(0,total_amount-(select coalesce(sum(amount),0) from public.sales_payments where document_id=new.document_id and not voided)) where id=c.id;
 return new;
end $$;
revoke all on function public.connected_sales_receipt() from public,anon,authenticated;
create trigger zy_connected_sales_receipt after insert or update on public.sales_payments for each row execute function public.connected_sales_receipt();
-- The invoice is the financial source. Operational edits cannot overwrite its totals.
create function public.connected_case_totals() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.sales_documents;
begin
 if (tg_op='INSERT' or old.invoice_id is null) and new.invoice_id is not null and not exists(select 1 from public.sales_documents where id=new.invoice_id and checkout_key=new.checkout_key and new.checkout_key is not null and reference_no=new.tracking_reference) then raise exception 'Invoice links are assigned by attestation checkout.';end if;
 if tg_op='UPDATE' and old.invoice_id is not null and new.invoice_id is distinct from old.invoice_id then raise exception 'An attestation invoice link cannot be changed.';end if;
 if new.invoice_id is not null then
 select * into d from public.sales_documents where id=new.invoice_id and organization_id=new.organization_id;
 if d.id is null or d.sale_type is distinct from 'Attestation' or d.branch_id is distinct from new.branch_id or d.customer_id is distinct from new.customer_id then raise exception 'Choose the matching attestation invoice in this company and branch.';end if;
 if tg_op='UPDATE' and old.invoice_id is distinct from new.invoice_id and old.invoice_id is not null then raise exception 'An attestation invoice link cannot be changed.';end if;
 new.total_amount:=d.total;new.advance_paid:=0;new.second_payment:=d.paid_total;new.balance_payment:=case when d.status='Cancelled' then 0 else greatest(0,d.total-d.paid_total) end;new.discount_return:=0;new.bill_no:=d.document_no;
 end if;return new;
end $$;
revoke all on function public.connected_case_totals() from public,anon,authenticated;
create trigger zz_connected_case_totals before insert or update on public.cases for each row execute function public.connected_case_totals();
create function public.connected_invoice_totals() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.cases set total_amount=new.total,second_payment=new.paid_total,balance_payment=greatest(0,new.total-new.paid_total),bill_no=new.document_no where invoice_id=new.id and organization_id=new.organization_id;return new;
end $$;
revoke all on function public.connected_invoice_totals() from public,anon,authenticated;
create trigger zz_connected_invoice_totals after update on public.sales_documents for each row execute function public.connected_invoice_totals();
create function public.connected_invoice_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.sale_type='Attestation' and new.items is distinct from old.items then
 if (select jsonb_agg(jsonb_build_object('document_id',value->'document_id','quantity',value->'quantity','government_fee',value->'government_fee','service_fee',value->'service_fee','description',value->'description','unit_price',value->'unit_price') order by value->>'document_id') from jsonb_array_elements(new.items)) is distinct from (select jsonb_agg(jsonb_build_object('document_id',value->'document_id','quantity',value->'quantity','government_fee',value->'government_fee','service_fee',value->'service_fee','description',value->'description','unit_price',value->'unit_price') order by value->>'document_id') from jsonb_array_elements(public.attestation_invoice_items((select id from public.cases where invoice_id=old.id)))) then raise exception 'Edit attestation documents and fees from the linked attestation workspace.';end if;
 end if;
 if old.sale_type='Attestation' and (new.sale_type is distinct from old.sale_type or new.branch_id is distinct from old.branch_id or new.customer_id is distinct from old.customer_id) then raise exception 'The attestation invoice type, branch and customer cannot be changed.';end if;
 return new;
end $$;
revoke all on function public.connected_invoice_guard() from public,anon,authenticated;
create trigger connected_invoice_guard before update on public.sales_documents for each row execute function public.connected_invoice_guard();
create function public.connected_attestation_delete() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.invoice_id is not null then raise exception 'Invoiced attestations must be cancelled rather than deleted. Keep their invoice, receipt and tracking history.';end if;return old;
end $$;
revoke all on function public.connected_attestation_delete() from public,anon,authenticated;
create trigger connected_attestation_delete before delete on public.cases for each row execute function public.connected_attestation_delete();
-- Keep additions, quantities and fee corrections aligned with the attestation invoice.
create function public.attestation_invoice_items(case_key uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('description',d.document_name,'quantity',d.quantity,'government_fee',d.government_fee,'service_fee',d.service_fee,'unit_price',d.government_fee+d.service_fee,'workflow','[]'::jsonb,'document_id',d.id,'required_attestations',(select coalesce(jsonb_agg(stage_name order by stage_order),'[]'::jsonb) from public.document_stages where document_id=d.id)) order by d.created_at,d.id),'[]'::jsonb) from public.documents d where case_id=case_key
$$;
revoke all on function public.attestation_invoice_items(uuid) from public,anon;
grant execute on function public.attestation_invoice_items(uuid) to authenticated;
create function public.attestation_document_billing() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.cases;lines jsonb;case_key uuid;
begin
 case_key:=case when tg_op='DELETE' then old.case_id else new.case_id end;
 select * into c from public.cases where id=case_key;
 if c.invoice_id is null then return null;end if;
 if auth.uid() is null or not public.business_access(c.organization_id,c.branch_id,'cases') or not public.business_access(c.organization_id,c.branch_id,'sales') then raise exception 'Document billing changes require Attestations and Sales access.';end if;
 perform 1 from public.sales_documents where id=c.invoice_id for update;
 lines:=public.attestation_invoice_items(c.id);
 if jsonb_array_length(lines)=0 then raise exception 'Keep at least one document on an invoiced attestation.';end if;
 update public.sales_documents set items=lines where id=c.invoice_id and status='Issued';
 return null;
end $$;
revoke all on function public.attestation_document_billing() from public,anon,authenticated;
create trigger zz_attestation_document_billing after insert or delete or update of document_name,quantity,government_fee,service_fee on public.documents for each row execute function public.attestation_document_billing();
create or replace function public.create_attestation_checkout(input jsonb,request_key uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare p public.cases;item jsonb;v_case_id uuid;doc_id uuid;qty integer;gov numeric;fee numeric;total numeric:=0;stage text;ordinal integer;canonical text;customer uuid;invoice uuid;lines jsonb;
begin
 p:=jsonb_populate_record(null::public.cases,input->'case');
 if auth.uid() is null or request_key is null or not public.business_access(p.organization_id,p.branch_id,'cases') then raise exception 'Checkout is not available to your account.';end if;
 if not public.business_access(p.organization_id,p.branch_id,'sales') then raise exception 'Creating an attestation invoice requires access to Sales. Ask your administrator to enable Sales for your role.';end if;
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
 select jsonb_agg(jsonb_build_object('description',d.document_name,'quantity',d.quantity,'government_fee',d.government_fee,'service_fee',d.service_fee,'unit_price',d.government_fee+d.service_fee,'workflow','[]'::jsonb,'required_attestations',(select jsonb_agg(s.stage_name order by s.stage_order) from public.document_stages s where s.document_id=d.id),'document_id',d.id) order by d.created_at,d.id) into lines from public.documents d where d.case_id=v_case_id;
 insert into public.sales_documents(organization_id,branch_id,customer_id,customer_name,customer_mobile,customer_email,kind,status,sale_type,items,document_no,document_date,due_date,reference_no,notes,checkout_key)
 values(p.organization_id,p.branch_id,customer,p.customer_name,p.mobile,p.customer_email,'Invoice','Issued','Attestation',lines,public.next_billing_number(p.organization_id,p.branch_id,'Invoice'),coalesce(p.submission_date,current_date),p.promise_date,p.tracking_reference,p.notes,request_key) returning id into invoice;
 update public.cases set invoice_id=invoice,bill_no=(select document_no from public.sales_documents where id=invoice) where id=v_case_id;
 if p.advance_paid>0 then perform public.record_sales_payment(jsonb_build_object('document_id',invoice,'amount',p.advance_paid,'method',coalesce(input->'payment'->>'method','Cash'),'account_id',input->'payment'->>'account_id'),request_key);end if;
 insert into public.case_history(organization_id,case_id,user_id,action,metadata) values(p.organization_id,v_case_id,auth.uid(),'Case created',jsonb_build_object('total_amount',total,'paid',p.advance_paid));
 return v_case_id;
end $$;
revoke all on function public.create_attestation_checkout(jsonb,uuid) from public,anon;
grant execute on function public.create_attestation_checkout(jsonb,uuid) to authenticated;create or replace function public.checkout_sale(input jsonb,request_key uuid) returns uuid
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
  gov:=case when coalesce((input->>'pos_mode')::boolean,false) then 0 else round((item->>'government_fee')::numeric,2) end;fee:=round((item->>'service_fee')::numeric,2);qty:=(item->>'quantity')::numeric;
  if gov is null or fee is null or qty is null or gov::text in ('NaN','Infinity','-Infinity') or fee::text in ('NaN','Infinity','-Infinity') or qty::text in ('NaN','Infinity','-Infinity') or gov<0 or fee<0 or qty<=0 or qty>10000 then raise exception 'Enter valid quantities and fees.';end if;
  stages:=case when coalesce((input->>'pos_mode')::boolean,false) then '[]'::jsonb when item ? 'workflow' then item->'workflow' else svc.workflow end;
  if jsonb_typeof(stages) is distinct from 'array' or jsonb_array_length(stages)>30 then raise exception 'Choose up to 30 valid stages.';end if;
  if jsonb_array_length(stages)>0 and not public.business_access(org,branch,'services') then raise exception 'Service jobs require access to the Services module.';end if;
  lines:=lines||jsonb_build_array(jsonb_build_object('service_id',svc.id,'description',svc.name,'quantity',qty,'government_fee',gov,'service_fee',fee,'unit_price',gov+fee,'workflow',stages));
  if coalesce((item->>'remember')::boolean,false) then
   if coalesce((input->>'pos_mode')::boolean,false) then
    insert into public.checkout_prices(organization_id,branch_id,service_id,government_fee,service_fee,pos_rate) values(org,branch,svc.id,coalesce(svc.government_fee,0),coalesce(svc.service_charge,svc.base_price),fee) on conflict(organization_id,branch_id,service_id) do update set pos_rate=excluded.pos_rate,updated_at=now();
   else
   insert into public.checkout_prices(organization_id,branch_id,service_id,government_fee,service_fee) values(org,branch,svc.id,gov,fee)
   on conflict(organization_id,branch_id,service_id) do update set government_fee=excluded.government_fee,service_fee=excluded.service_fee,updated_at=now();
   end if;
  end if;
 end loop;
 insert into public.sales_documents(organization_id,branch_id,customer_id,customer_name,customer_mobile,customer_email,kind,status,items,discount,notes,checkout_key,document_no,sale_type)
 values(org,branch,customer,cname,nullif(input->>'customer_mobile',''),nullif(input->>'customer_email',''),'Invoice','Issued',lines,coalesce((input->>'discount')::numeric,0),nullif(input->>'notes',''),request_key,coalesce(nullif(btrim(input->>'document_no'),''),public.next_billing_number(org,branch,'Invoice')),case when coalesce((input->>'pos_mode')::boolean,false) then 'POS' else 'Service' end) returning * into saved;
 invoice:=saved.id;
 if nullif(input->>'template_id','') is not null then update public.sales_documents set template_id=(input->>'template_id')::uuid where id=invoice;end if;
 if paid<0 or paid>saved.total then raise exception 'Payment cannot exceed the invoice total.';end if;
 if paid>0 then insert into public.sales_payments(organization_id,branch_id,document_id,amount,method,received_by,account_id) values(org,branch,invoice,paid,coalesce(input->>'method','Cash'),auth.uid(),nullif(input->>'account_id','')::uuid);end if;
 return invoice;
end $$;
create or replace function public.billing_item_jobs() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb;stages jsonb;line_no integer:=0;stage jsonb;
begin
 if new.kind<>'Invoice' or new.status<>'Issued' or new.sale_type is distinct from 'Service' then return new;end if;
 if auth.uid() is null or not public.business_access(new.organization_id,new.branch_id,'sales') then raise exception 'Sales access denied.';end if;
 if tg_op='UPDATE' and old.status='Issued' then
 if (select coalesce(jsonb_agg(value->'workflow'),'[]') from jsonb_array_elements(new.items) where jsonb_typeof(value->'workflow')='array' and jsonb_array_length(value->'workflow')>0) is distinct from (select coalesce(jsonb_agg(value->'workflow'),'[]') from jsonb_array_elements(old.items) where jsonb_typeof(value->'workflow')='array' and jsonb_array_length(value->'workflow')>0) then raise exception 'Stages on issued invoices cannot be changed. Update the linked service job instead.';end if;
 return new;end if;
 for item in select value from jsonb_array_elements(new.items) loop
 line_no:=line_no+1;stages:='[]';
 if item?'workflow' then
 if jsonb_typeof(item->'workflow') is distinct from 'array' or jsonb_array_length(item->'workflow')>30 then raise exception 'Choose up to 30 valid stages.';end if;
 for stage in select value from jsonb_array_elements(item->'workflow') loop
 if length(btrim(case when jsonb_typeof(stage)='string' then stage#>>'{}' else stage->>'name' end)) not between 1 and 200 then raise exception 'Enter a valid stage name.';end if;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('name',case when jsonb_typeof(value)='string' then value#>>'{}' else value->>'name' end,'status','Pending','date','')),'[]') into stages from jsonb_array_elements(item->'workflow');end if;
 insert into public.service_jobs(organization_id,branch_id,customer_id,service_id,title,customer_name,stages,invoice_id,invoice_line)
 values(new.organization_id,new.branch_id,new.customer_id,nullif(item->>'service_id','')::uuid,left(item->>'description',200),new.customer_name,stages,new.id,line_no)
 on conflict(invoice_id,invoice_line) where invoice_line is not null do nothing;
 end loop;return new;
end $$;
revoke all on function public.billing_item_jobs() from public,anon,authenticated;
create or replace function public.communication_event_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=to_jsonb(new);prev jsonb; c public.cases%rowtype;d public.sales_documents%rowtype;cust public.crm_customers%rowtype;b public.organization_settings%rowtype;event_name text;ref text;name text;status text;email text;phone text;email_ok boolean:=false;wa_ok boolean:=false;payload jsonb;event_id text;tracking text;
begin
 if tg_table_name='payments' and exists(select 1 from public.cases where id=(r->>'case_id')::uuid and invoice_id is not null) then return new;end if;
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

commit;
notify pgrst,'reload schema';
