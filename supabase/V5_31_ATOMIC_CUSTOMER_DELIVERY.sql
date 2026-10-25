begin;
-- Additive: existing delivery slips remain readable. New confirmations use one transaction.
alter table public.deliveries add column if not exists request_key uuid;
alter table public.deliveries add column if not exists request_fingerprint text;
alter table public.deliveries add column if not exists payment_id uuid references public.payments(id) on delete set null;
create unique index if not exists delivery_request_unique on public.deliveries(organization_id,request_key) where request_key is not null;
create index if not exists delivery_case_active on public.deliveries(case_id) where status <> 'Cancelled';

-- Revalidate customer access when assigning a customer or changing branch. An
-- unchanged customer link must not block an authorized operational status update.
create or replace function public.business_validate_row() returns trigger language plpgsql security definer set search_path='' as $$
declare linked_branch uuid; linked_org uuid; stage jsonb;
begin
 if tg_op='UPDATE' and new.organization_id<>old.organization_id then raise exception 'A record cannot be moved to another company.';end if;
 if new.branch_id is not null and not exists(select 1 from public.branches b where b.id=new.branch_id and b.organization_id=new.organization_id and (b.is_active or tg_op='UPDATE' and new.branch_id is not distinct from old.branch_id)) then raise exception 'Select an active branch from this company.';end if;
 if new.customer_id is not null then
 select c.branch_id,c.organization_id into linked_branch,linked_org from public.crm_customers c where c.id=new.customer_id;
 if linked_org is distinct from new.organization_id or (auth.uid() is not null and (tg_op='INSERT' or new.customer_id is distinct from old.customer_id or new.branch_id is distinct from old.branch_id) and not public.business_customer_access(linked_org,linked_branch)) then raise exception 'This customer is not available to your account.';end if;
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

create schema if not exists operations_private;
revoke all on schema operations_private from public,anon;
grant usage on schema operations_private to authenticated;

-- A narrowly scoped command can update delivery status without granting delivery staff
-- general case-editing rights. Every entry point checks the live actor and case scope.
create or replace function operations_private.confirm_customer_delivery(target_case uuid,input jsonb,request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c public.cases; prior public.deliveries; saved public.deliveries;
 actor uuid:=auth.uid(); invoice uuid; ids uuid[]; items jsonb;
 amount numeric; normalized jsonb; fingerprint text; remaining integer; chosen integer;
 payment uuid; reference text; delivery_status text;
begin
 if actor is null or not public.is_current_session_valid() or not public.can_use_module('deliveries') then
  raise exception 'Delivery access denied.' using errcode='42501';
 end if;
 if target_case is null or request_key is null or jsonb_typeof(input) is distinct from 'object' then raise exception 'A case, delivery details and request key are required.';end if;
 if not public.can_access_case(target_case) then raise exception 'Delivery access denied.' using errcode='42501';end if;
 select * into c from public.cases where id=target_case;
 if c.id is null then raise exception 'Delivery access denied.' using errcode='42501';end if;
 if jsonb_typeof(input->'selected_docs') is distinct from 'array' then raise exception 'Select documents to deliver.';end if;
 select array_agg(x::uuid order by x::uuid) into ids from jsonb_array_elements_text(input->'selected_docs') x;
 chosen:=coalesce(cardinality(ids),0);
 if chosen=0 or chosen>500 or chosen<>(select count(distinct x) from unnest(ids) x) then raise exception 'Select each undelivered document once.';end if;
 amount:=coalesce(nullif(input->>'payment_collected',''),'0')::numeric;
 if amount::text in ('NaN','Infinity','-Infinity') or amount<0 or amount<>round(amount,2) then raise exception 'Enter a valid amount with at most two decimal places.';end if;
 amount:=round(amount,2);
 normalized:=jsonb_build_object('case_id',target_case,'selected_docs',to_jsonb(ids),'payment_collected',amount);
 foreach reference in array array['receiver_name','receiver_mobile','receiver_id_reference','payment_method','payment_reference','assigned_to','notes'] loop
  if length(coalesce(input->>reference,''))>4000 then raise exception 'Delivery details are too long.';end if;
  normalized:=normalized||jsonb_build_object(reference,nullif(btrim(input->>reference),''));
 end loop;
 if normalized->>'receiver_name' is null then raise exception 'Enter the receiver name.';end if;
 fingerprint:=md5(normalized::text);
 -- Same request serializes even when a malformed retry supplies a different case.
 perform pg_advisory_xact_lock(hashtextextended(c.organization_id::text||request_key::text,0));
 invoice:=c.invoice_id;
 -- Match the existing receipt lock order: invoice first, then operational case.
 if invoice is not null then perform 1 from public.sales_documents where id=invoice for update;end if;
 select * into c from public.cases where id=target_case for update;
 if not public.can_access_case(target_case) then raise exception 'Delivery access denied.' using errcode='42501';end if;
 if c.invoice_id is distinct from invoice then raise exception 'The invoice changed. Reopen the delivery and try again.';end if;
 select * into prior from public.deliveries d where d.organization_id=c.organization_id and d.request_key=confirm_customer_delivery.request_key;
 if prior.id is not null then
  if prior.case_id<>target_case or prior.delivered_by is distinct from actor or prior.request_fingerprint is distinct from fingerprint then raise exception 'This request key belongs to another delivery. Reopen the delivery.';end if;
  return to_jsonb(prior);
 end if;
 if c.overall_status<>'Ready for Delivery' then raise exception 'This case is no longer ready for delivery. Refresh the queue.';end if;
 if amount>0 and (not public.can_use_module('payments') or (invoice is not null and not public.business_access(c.organization_id,c.branch_id,'sales'))) then raise exception 'Payment access is required to collect money. Ask an authorized colleague to record the payment.' using errcode='42501';end if;
 if amount>greatest(0,c.balance_payment) then raise exception 'Amount collected exceeds the current outstanding balance. Refresh the case.';end if;
 if amount>0 and coalesce(normalized->>'payment_method','') not in ('Cash','Card','Bank Transfer','Online') then raise exception 'Choose a payment method.';end if;
 perform 1 from public.documents doc where doc.case_id=c.id and doc.organization_id=c.organization_id order by doc.id for update;
 select count(*) into remaining from public.documents doc where doc.case_id=c.id and doc.organization_id=c.organization_id and not exists(
  select 1 from public.deliveries d cross join lateral jsonb_array_elements(d.items) item
  where d.case_id=c.id and d.organization_id=c.organization_id and d.status<>'Cancelled' and item->>'id'=doc.id::text);
 select jsonb_agg(jsonb_build_object('id',doc.id,'name',doc.document_name,'qty',doc.quantity) order by doc.id) into items
 from public.documents doc where doc.id=any(ids) and doc.case_id=c.id and doc.organization_id=c.organization_id and not exists(
  select 1 from public.deliveries d cross join lateral jsonb_array_elements(d.items) item
  where d.case_id=c.id and d.organization_id=c.organization_id and d.status<>'Cancelled' and item->>'id'=doc.id::text);
 if coalesce(jsonb_array_length(items),0)<>chosen then raise exception 'Some documents were already delivered or do not belong to this case. Refresh the queue.';end if;
 delivery_status:=case when chosen=remaining then 'Delivered' else 'Partial' end;
 reference:='DLV-'||upper(replace(gen_random_uuid()::text,'-',''));
 if amount>0 then
  payment:=gen_random_uuid();
  -- Existing receipt triggers also create the linked invoice receipt and accounting entries.
  insert into public.payments(id,organization_id,case_id,amount,payment_method,payment_reference,notes,received_by)
  values(payment,c.organization_id,c.id,amount,normalized->>'payment_method',coalesce(normalized->>'payment_reference',reference),'Collected on '||reference,actor);
 end if;
 insert into public.deliveries(organization_id,case_id,delivery_no,status,receiver_name,receiver_mobile,receiver_id_reference,payment_collected,payment_method,payment_reference,assigned_to,items,audit,delivered_by,delivered_at,notes,request_key,request_fingerprint,payment_id)
 values(c.organization_id,c.id,reference,delivery_status,normalized->>'receiver_name',normalized->>'receiver_mobile',normalized->>'receiver_id_reference',amount,normalized->>'payment_method',normalized->>'payment_reference',normalized->>'assigned_to',items,jsonb_build_array(jsonb_build_object('text','Customer delivery '||lower(delivery_status),'at',now(),'actor_id',actor)),actor,now(),normalized->>'notes',request_key,fingerprint,payment) returning * into saved;
 if invoice is null then
  update public.cases set overall_status=case when delivery_status='Delivered' then 'Delivered' else 'Ready for Delivery' end,
   second_payment=coalesce(second_payment,0)+amount,balance_payment=greatest(0,balance_payment-amount),updated_by=actor where id=c.id;
 else
  -- Linked invoice triggers already synchronized the balance; do not deduct it twice.
  update public.cases set overall_status=case when delivery_status='Delivered' then 'Delivered' else 'Ready for Delivery' end,updated_by=actor where id=c.id;
 end if;
 return to_jsonb(saved);
end $$;
revoke all on function operations_private.confirm_customer_delivery(uuid,jsonb,uuid) from public,anon;
grant execute on function operations_private.confirm_customer_delivery(uuid,jsonb,uuid) to authenticated;
create or replace function public.confirm_customer_delivery(target_case uuid,input jsonb,request_key uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select operations_private.confirm_customer_delivery(target_case,input,request_key);
$$;
revoke all on function public.confirm_customer_delivery(uuid,jsonb,uuid) from public,anon;
grant execute on function public.confirm_customer_delivery(uuid,jsonb,uuid) to authenticated;
commit;
notify pgrst,'reload schema';
