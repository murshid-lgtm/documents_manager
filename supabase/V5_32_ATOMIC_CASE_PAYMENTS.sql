begin;
-- Durable request results also make deletion retries safe after a lost response.
create table if not exists operations_private.payment_commands(
 organization_id uuid not null references public.organizations(id) on delete cascade,
 request_key uuid not null,actor_id uuid not null,case_id uuid not null,
 fingerprint text not null,result jsonb not null,created_at timestamptz not null default now(),
 primary key(organization_id,request_key)
);
alter table operations_private.payment_commands enable row level security;
revoke all on operations_private.payment_commands from public,anon,authenticated;

create or replace function operations_private.save_case_payment(target_case uuid,input jsonb,request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c public.cases;old_payment public.payments;saved public.payments;prior operations_private.payment_commands;
 actor uuid:=auth.uid();invoice uuid;op text;new_amount numeric;delta numeric;payment uuid;linked_deliveries uuid[];
 fingerprint text;result jsonb;reference text;
begin
 if actor is null or not public.is_current_session_valid() or not public.can_use_module('payments') or not public.can_access_case(target_case) then raise exception 'Payment access denied.' using errcode='42501';end if;
 if request_key is null or jsonb_typeof(input) is distinct from 'object' then raise exception 'Payment details and a request key are required.';end if;
 op:=coalesce(input->>'operation','create');
 if op not in ('create','update','delete') then raise exception 'Choose a valid payment action.';end if;
 select * into c from public.cases where id=target_case;
 if c.id is null then raise exception 'Payment access denied.' using errcode='42501';end if;
 if op<>'create' and not public.is_organization_admin(c.organization_id) then raise exception 'Only an administrator can correct or delete a payment.' using errcode='42501';end if;
 fingerprint:=md5(jsonb_build_object('case_id',target_case,'input',input)::text);
 perform pg_advisory_xact_lock(hashtextextended(c.organization_id::text||request_key::text,0));
 invoice:=c.invoice_id;
 if invoice is not null then perform 1 from public.sales_documents where id=invoice for update;end if;
 select * into c from public.cases where id=target_case for update;
 if not public.can_access_case(target_case) then raise exception 'Payment access denied.' using errcode='42501';end if;
 if c.invoice_id is distinct from invoice then raise exception 'The invoice changed. Reopen the payment and try again.';end if;
 select * into prior from operations_private.payment_commands cmd where cmd.organization_id=c.organization_id and cmd.request_key=save_case_payment.request_key;
 if prior.request_key is not null then
  if prior.actor_id<>actor or prior.case_id<>target_case or prior.fingerprint<>fingerprint then raise exception 'This request key belongs to another payment. Reopen the payment.';end if;
  return prior.result;
 end if;
 if invoice is not null and (op<>'create' or not public.business_access(c.organization_id,c.branch_id,'sales')) then
  raise exception 'Use Sales > Payments to manage this invoice receipt, with the required sales access.' using errcode='42501';
 end if;
 if op<>'create' then
  select * into old_payment from public.payments p where p.id=(input->>'payment_id')::uuid and p.case_id=c.id and p.organization_id=c.organization_id for update;
  if old_payment.id is null or old_payment.voided then raise exception 'This payment is no longer available. Refresh the list.';end if;
  select array_agg(d.id) into linked_deliveries from public.deliveries d where d.payment_id=old_payment.id and d.organization_id=c.organization_id and d.case_id=c.id;
  if not(input ? 'expected') or (input#>>'{expected,amount}')::numeric is distinct from old_payment.amount
   or coalesce(input#>>'{expected,payment_method}','') is distinct from coalesce(old_payment.payment_method,'')
   or coalesce(input#>>'{expected,payment_reference}','') is distinct from coalesce(old_payment.payment_reference,'')
   or coalesce(input#>>'{expected,notes}','') is distinct from coalesce(old_payment.notes,'') then
   raise exception 'This payment changed since you opened it. Refresh before correcting it.';
  end if;
 end if;
 if op<>'delete' then
  new_amount:=(input->>'amount')::numeric;
  if new_amount is null or new_amount::text in ('NaN','Infinity','-Infinity') or new_amount<=0 or new_amount<>round(new_amount,2) then raise exception 'Enter a payment greater than zero with at most two decimal places.';end if;
  if coalesce(input->>'payment_method','') not in ('Cash','Card','Bank Transfer','Online') then raise exception 'Choose a payment method.';end if;
  if length(coalesce(input->>'payment_reference',''))>4000 or length(coalesce(input->>'notes',''))>4000 then raise exception 'Payment details are too long.';end if;
 end if;
 delta:=case op when 'create' then new_amount when 'update' then new_amount-old_payment.amount else -old_payment.amount end;
 if delta>greatest(0,c.balance_payment) then raise exception 'Payment exceeds the current outstanding balance. Refresh the case.';end if;
 if invoice is null and coalesce(c.second_payment,0)+delta<0 then raise exception 'The recorded payments and case totals need review before this correction.';end if;
 if op='create' then
  payment:=gen_random_uuid();reference:='RCT-'||upper(replace(payment::text,'-',''));
  insert into public.payments(id,organization_id,case_id,receipt_no,amount,payment_method,payment_reference,notes,received_by)
  values(payment,c.organization_id,c.id,reference,new_amount,input->>'payment_method',nullif(btrim(input->>'payment_reference'),''),nullif(btrim(input->>'notes'),''),actor) returning * into saved;
 elsif op='update' then
  update public.payments set amount=new_amount,payment_method=input->>'payment_method',payment_reference=nullif(btrim(input->>'payment_reference'),''),notes=nullif(btrim(input->>'notes'),'') where id=old_payment.id returning * into saved;
 else
  saved:=old_payment;
  delete from public.payments where id=old_payment.id;
 end if;
 if invoice is null then
  update public.cases set second_payment=coalesce(second_payment,0)+delta,balance_payment=greatest(0,balance_payment-delta),updated_by=actor where id=c.id returning * into c;
 else
  select * into c from public.cases where id=c.id;
 end if;
 -- Keep a legacy handover's collection snapshot consistent with administrator corrections.
 if op<>'create' then
  update public.deliveries set payment_collected=case when op='delete' then 0 else saved.amount end,
   payment_method=case when op='delete' then null else saved.payment_method end,
   payment_reference=case when op='delete' then null else saved.payment_reference end,
   audit=audit||jsonb_build_array(jsonb_build_object('text','Linked payment '||case when op='delete' then 'deleted' else 'corrected' end,'at',now(),'actor_id',actor))
  where organization_id=c.organization_id and case_id=c.id and id=any(linked_deliveries);
 end if;
 insert into public.case_history(organization_id,case_id,user_id,action,field_name,new_value,metadata)
 values(c.organization_id,c.id,actor,case op when 'create' then 'Payment recorded' when 'update' then 'Payment edited' else 'Payment deleted' end,'payment',saved.payment_method||' · '||saved.amount::text,jsonb_build_object('source','payments','payment_id',saved.id,'request_key',request_key));
 result:=jsonb_build_object('payment',to_jsonb(saved),'deleted',op='delete','case',jsonb_build_object('id',c.id,'total_amount',c.total_amount,'advance_paid',c.advance_paid,'second_payment',c.second_payment,'discount_return',c.discount_return,'balance_payment',c.balance_payment));
 insert into operations_private.payment_commands(organization_id,request_key,actor_id,case_id,fingerprint,result) values(c.organization_id,request_key,actor,c.id,fingerprint,result);
 return result;
end $$;
revoke all on function operations_private.save_case_payment(uuid,jsonb,uuid) from public,anon;
grant execute on function operations_private.save_case_payment(uuid,jsonb,uuid) to authenticated;
create or replace function public.save_case_payment(target_case uuid,input jsonb,request_key uuid)
returns jsonb language sql security invoker set search_path='' as $$select operations_private.save_case_payment(target_case,input,request_key);$$;
revoke all on function public.save_case_payment(uuid,jsonb,uuid) from public,anon;
grant execute on function public.save_case_payment(uuid,jsonb,uuid) to authenticated;
commit;
notify pgrst,'reload schema';
