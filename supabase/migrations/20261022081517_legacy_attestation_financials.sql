begin;
alter table public.cases add column attestation_bundle_total numeric(14,2) check(attestation_bundle_total>=0);
-- Preserve source evidence privately while exposing ordinary invoices and receipts throughout the app.
create table public.attestation_financial_conversions(
 case_id uuid primary key,organization_id uuid not null references public.organizations(id),branch_id uuid not null references public.branches(id),
 invoice_id uuid not null unique,source_snapshot jsonb not null,state text not null default 'Preparing' check(state in('Preparing','Completed')),
 reconstructed_receipt_id uuid,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 foreign key(case_id,organization_id) references public.cases(id,organization_id),foreign key(invoice_id,organization_id) references public.sales_documents(id,organization_id) deferrable initially deferred,unique(case_id,organization_id)
);
alter table public.attestation_financial_conversions enable row level security;
revoke all on public.attestation_financial_conversions from public,anon,authenticated;
grant select on public.attestation_financial_conversions to authenticated;
grant all on public.attestation_financial_conversions to service_role;
create policy conversion_admin_read on public.attestation_financial_conversions for select to authenticated using(public.is_current_session_valid() and public.is_organization_admin(organization_id));
create index attestation_conversion_company on public.attestation_financial_conversions(organization_id,state);
create or replace function public.attestation_invoice_items(case_key uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select case when c.attestation_bundle_total is not null then jsonb_build_array(jsonb_build_object(
 'description',coalesce((select left('Attestation services · '||string_agg(d.document_name,', ' order by d.created_at,d.id),300) from public.documents d where d.case_id=c.id),'Attestation services'),
 'quantity',1,'government_fee',0,'service_fee',c.attestation_bundle_total,'unit_price',c.attestation_bundle_total,'workflow','[]'::jsonb,'attestation_bundle',true,
 'required_attestations',(select coalesce(jsonb_agg(x.stage_name order by x.stage_order,x.stage_name),'[]'::jsonb) from (select distinct s.stage_name,s.stage_order from public.documents d join public.document_stages s on s.document_id=d.id where d.case_id=c.id) x),
 'bundle_documents',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.document_name,'quantity',d.quantity) order by d.created_at,d.id),'[]'::jsonb) from public.documents d where d.case_id=c.id)))
 else (select coalesce(jsonb_agg(jsonb_build_object('description',d.document_name,'quantity',d.quantity,'government_fee',d.government_fee,'service_fee',d.service_fee,'unit_price',d.government_fee+d.service_fee,'workflow','[]'::jsonb,'document_id',d.id,'required_attestations',(select coalesce(jsonb_agg(stage_name order by stage_order),'[]'::jsonb) from public.document_stages where document_id=d.id)) order by d.created_at,d.id),'[]'::jsonb) from public.documents d where d.case_id=c.id) end
 from public.cases c where c.id=case_key
$$;
create function public.attestation_bundle_price_sync() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.attestation_bundle_total is not distinct from old.attestation_bundle_total then return new;end if;
 if auth.uid() is null or not public.business_access(new.organization_id,new.branch_id,'sales') or not public.business_access(new.organization_id,new.branch_id,'cases') then raise exception 'Attestations and Sales access are required to change bundle pricing.';end if;
 if old.attestation_bundle_total is not null and new.attestation_bundle_total is null then raise exception 'Keep the bundle amount until individual document pricing is entered through an accounting correction.';end if;
 if new.invoice_id is not null then
  update public.sales_documents set items=public.attestation_invoice_items(new.id) where id=new.invoice_id and organization_id=new.organization_id;
  insert into public.case_history(organization_id,case_id,user_id,action,metadata) values(new.organization_id,new.id,auth.uid(),'Attestation bundle price updated',jsonb_build_object('before',old.attestation_bundle_total,'after',new.attestation_bundle_total));
 end if;return new;
end $$;
revoke all on function public.attestation_bundle_price_sync() from public,anon,authenticated;
create trigger zz_attestation_bundle_price after update of attestation_bundle_total on public.cases for each row execute function public.attestation_bundle_price_sync();
create function accounting_private.convert_attestation_financials(target_org uuid,preview boolean default true) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.cases;p public.payments;bill uuid;checkout uuid;historical_account uuid;receipt uuid;existing numeric;paid numeric;remaining numeric;dated timestamptz;tz text;
 converted integer:=0;receipts integer:=0;preserved integer:=0;errors jsonb:='[]';reason text;case_count integer;invoice_total_sum numeric:=0;paid_sum numeric:=0;balance_sum numeric:=0;
begin
 if auth.uid() is null or not public.is_current_session_valid() or not public.is_organization_admin(target_org) or not public.business_access(target_org,null,'cases') or not public.business_access(target_org,null,'sales') or not public.business_access(target_org,null,'payments') then raise exception 'Only company administrators with Attestations, Sales and Payments access can connect legacy financials.';end if;
 perform pg_advisory_xact_lock(hashtextextended('attestation-financial-conversion:'||target_org::text,0));
 select timezone into tz from public.organizations where id=target_org and status='Active';if not found then raise exception 'Company unavailable.';end if;tz:=coalesce(tz,'Asia/Qatar');
 for c in select * from public.cases where organization_id=target_org and invoice_id is null order by id for update loop
  reason:=null;paid:=c.advance_paid+c.second_payment-c.discount_return;
  select coalesce(sum(amount),0) into existing from public.payments where case_id=c.id and organization_id=target_org and not voided;
  if c.customer_id is null or c.branch_id is null then reason:='Link a customer and branch first.';
  elsif not exists(select 1 from public.branches where id=c.branch_id and organization_id=target_org and is_active) then reason:='Review the inactive branch before conversion.';
  elsif c.submission_date is null then reason:='A submission date is required.';
  elsif c.submission_date>current_date then reason:='Review the future submission date.';
  elsif c.total_amount<0 or paid<0 or paid>c.total_amount or c.balance_payment<>c.total_amount-paid or existing>paid then reason:='The total, paid amount, receipts and balance do not reconcile.';
  elsif c.discount_return<>0 then reason:='Review the historical discount or refund before conversion.';
  elsif exists(select 1 from public.sales_documents where organization_id=target_org and document_no=c.tracking_reference) then reason:='The tracking number is already used by a sales document.';
  elsif exists(select 1 from public.documents where case_id=c.id and (government_fee<>0 or service_fee<>0)) then reason:='Individual document rates already exist; review their allocation.';
  elsif length(btrim(c.tracking_reference)) not between 1 and 80 or c.tracking_reference ~ '[[:cntrl:]]' then reason:='The tracking number is not a valid invoice number.';
  end if;
  if reason is not null then errors:=errors||jsonb_build_array(jsonb_build_object('tracking_reference',c.tracking_reference,'reason',reason));continue;end if;
  converted:=converted+1;invoice_total_sum:=invoice_total_sum+c.total_amount;paid_sum:=paid_sum+paid;balance_sum:=balance_sum+c.balance_payment;
  select count(*) into case_count from public.payments where case_id=c.id and organization_id=target_org and not voided;preserved:=preserved+case_count;
  if paid>existing then receipts:=receipts+1;end if;
  if preview then continue;end if;
  if historical_account is null then
   insert into public.finance_accounts(organization_id,code,name,kind,is_cash,payment_type) values(target_org,'HISTORICAL-RECEIPTS','Historical receipts clearing','Asset',true,'Other') on conflict(organization_id,code) do nothing;
   select id into historical_account from public.finance_accounts where organization_id=target_org and code='HISTORICAL-RECEIPTS' and is_cash and kind='Asset' and payment_type='Other';if historical_account is null then raise exception 'The historical clearing account needs review.';end if;
  end if;
  bill:=gen_random_uuid();checkout:=coalesce(c.checkout_key,gen_random_uuid());receipt:=case when paid>existing then gen_random_uuid() end;
  dated:=(c.submission_date+time '12:00') at time zone tz;
  insert into public.attestation_financial_conversions(case_id,organization_id,branch_id,invoice_id,source_snapshot,reconstructed_receipt_id,created_by)
  values(c.id,target_org,c.branch_id,bill,jsonb_build_object('case',to_jsonb(c),'receipts',(select coalesce(jsonb_agg(to_jsonb(source_receipt) order by source_receipt.id),'[]'::jsonb) from public.payments source_receipt where source_receipt.case_id=c.id),'documents',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]'::jsonb) from public.documents d where d.case_id=c.id),'payment_date_basis','Submission date; reconstructed receipt date is estimated','pricing_basis','One attestation service bundle; government/service split unavailable'),receipt,auth.uid());
  update public.cases set checkout_key=checkout,attestation_bundle_total=c.total_amount where id=c.id;
  insert into public.sales_documents(id,organization_id,branch_id,customer_id,customer_name,customer_mobile,customer_email,kind,status,sale_type,items,document_no,document_date,due_date,reference_no,notes,checkout_key,created_at)
  values(bill,target_org,c.branch_id,c.customer_id,c.customer_name,c.mobile,c.customer_email,'Invoice','Draft','Attestation',public.attestation_invoice_items(c.id),c.tracking_reference,c.submission_date,c.promise_date,c.tracking_reference,c.notes,checkout,dated);
  update public.cases set invoice_id=bill where id=c.id;
  update public.sales_documents set status='Issued' where id=bill;
  for p in select * from public.payments where case_id=c.id and organization_id=target_org and not voided order by received_at,id loop
   insert into public.sales_payments(id,organization_id,branch_id,document_id,amount,method,reference,notes,request_key,account_id,received_at)
   values(p.id,target_org,c.branch_id,bill,p.amount,case lower(coalesce(p.payment_method,'')) when 'cash' then 'Cash' when 'card' then 'Card' when 'bank transfer' then 'Bank transfer' else 'Other' end,p.payment_reference,p.notes,p.id,historical_account,p.received_at);
   update public.payments set receipt_no=(select receipt_no from public.sales_payments where id=p.id) where id=p.id;
  end loop;
  if receipt is not null then
   insert into public.sales_payments(id,organization_id,branch_id,document_id,amount,method,reference,request_key,account_id,received_at)
   values(receipt,target_org,c.branch_id,bill,paid-existing,'Other',c.tracking_reference,receipt,historical_account,dated);
  end if;
  if (select total<>c.total_amount or paid_total<>paid from public.sales_documents where id=bill) or (select balance_payment<>c.balance_payment from public.cases where id=c.id) then raise exception 'Financial reconciliation failed for tracking %.',c.tracking_reference;end if;
  update public.attestation_financial_conversions set state='Completed' where case_id=c.id;
  insert into public.case_history(organization_id,case_id,user_id,action,metadata) values(target_org,c.id,auth.uid(),'Invoice and receipts connected',jsonb_build_object('invoice_id',bill,'total',c.total_amount,'paid',paid,'balance',c.balance_payment,'receipt_date_basis','Submission date (estimated for reconstructed payments)','source_snapshot','attestation_financial_conversions'));
 end loop;
 return jsonb_build_object('preview',preview,'invoices',converted,'new_receipts',receipts,'preserved_receipts',preserved,'total',invoice_total_sum,'paid',paid_sum,'balance',balance_sum,'needs_review',errors);
end $$;
revoke all on function accounting_private.convert_attestation_financials(uuid,boolean) from public,anon;
grant execute on function accounting_private.convert_attestation_financials(uuid,boolean) to authenticated;
create function public.connect_attestation_financials(target_org uuid,preview boolean default true) returns jsonb language sql security invoker set search_path='' as $$select accounting_private.convert_attestation_financials(target_org,preview)$$;
revoke all on function public.connect_attestation_financials(uuid,boolean) from public,anon;
grant execute on function public.connect_attestation_financials(uuid,boolean) to authenticated;

create or replace function public.communication_event_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=to_jsonb(new);prev jsonb; c public.cases%rowtype;d public.sales_documents%rowtype;cust public.crm_customers%rowtype;b public.organization_settings%rowtype;event_name text;ref text;name text;status text;email text;phone text;email_ok boolean:=false;wa_ok boolean:=false;payload jsonb;event_id text;tracking text;
begin
 if exists(select 1 from public.attestation_financial_conversions f where f.organization_id=new.organization_id and f.state='Preparing' and (f.case_id=nullif(r->>'case_id','')::uuid or f.invoice_id=nullif(r->>'document_id','')::uuid or f.invoice_id=nullif(r->>'id','')::uuid or f.case_id=nullif(r->>'id','')::uuid)) then return new;end if;
 if tg_table_name='payments' and exists(select 1 from public.cases where id=(r->>'case_id')::uuid and invoice_id is not null) then return new;end if;
 if tg_op='UPDATE' then prev:=to_jsonb(old);end if;
 if tg_table_name='cases' then
 if tg_op='INSERT' and new.checkout_key is not null then return new;end if;
 if tg_op='UPDATE' and r->>'overall_status'=prev->>'overall_status' then return new;end if;
 c:=new;event_name:=case when tg_op='INSERT' then 'case_created' else 'case_status' end;
 elsif tg_table_name in ('payments','appointments','deliveries') then
 if tg_op='UPDATE' and tg_table_name='appointments' and r->>'status'=prev->>'status' and r->>'appointment_date'=prev->>'appointment_date' and r->>'appointment_time'=prev->>'appointment_time' then return new;end if;
 if tg_op='UPDATE' and tg_table_name='deliveries' then return new;end if;
 select * into c from public.cases where id=(r->>'case_id')::uuid;event_name:=case tg_table_name when 'payments' then 'payment' when 'appointments' then 'appointment' else 'delivery' end;
 elsif tg_table_name='sales_documents' then
 if new.status<>'Issued' or tg_op='UPDATE' and r->>'status'=prev->>'status' then return new;end if;
 if tg_op='INSERT' and new.sale_type='Attestation' and new.checkout_key is not null and exists(select 1 from public.cases x where x.organization_id=new.organization_id and x.checkout_key=new.checkout_key) then return new;end if;
 d:=new;event_name:='invoice_issued';
 elsif tg_table_name='sales_payments' then
 if new.voided then return new;end if;
 if exists(select 1 from public.cases x join public.sales_documents inv on inv.id=x.invoice_id and inv.organization_id=x.organization_id where x.organization_id=new.organization_id and inv.id=new.document_id and new.request_key=x.checkout_key) then return new;end if;
 select * into d from public.sales_documents where id=new.document_id;event_name:='payment';
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
