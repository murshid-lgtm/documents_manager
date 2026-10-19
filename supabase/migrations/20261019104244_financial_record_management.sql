begin;
-- Canonical invoices only: legacy case balances remain operational and are never double counted.
create or replace function public.billing_financial_rows(target_org uuid,target_customer uuid default null,target_scope text default 'all',target_branch uuid default null,metric text default 'total',result_offset integer default 0,result_limit integer default 26)
returns table(id uuid,document_no text,customer_name text,document_date date,sale_type text,total numeric,paid numeric,balance numeric)
language sql stable security invoker set search_path='' as $$
 select d.id,d.document_no,d.customer_name,coalesce(d.document_date,d.created_at::date),coalesce(d.sale_type,'Service'),d.total,d.paid_total,greatest(0,d.total-d.paid_total)
 from public.sales_documents d where d.organization_id=target_org and d.kind='Invoice' and d.status='Issued'
 and (target_customer is null or d.customer_id=target_customer) and (target_branch is null or d.branch_id=target_branch)
 and (target_scope='all' or (target_scope='attestations' and d.sale_type='Attestation'))
 and public.business_access(d.organization_id,d.branch_id,'sales')
 and (metric='total' or (metric='paid' and d.paid_total>0) or (metric='balance' and d.total>d.paid_total))
 order by d.document_date desc nulls last,d.created_at desc,d.id
 limit greatest(1,least(coalesce(result_limit,26),51)) offset greatest(0,coalesce(result_offset,0))
$$;
create or replace function public.billing_financial_snapshot(target_org uuid,target_customer uuid default null,target_scope text default 'all',target_branch uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('invoice_count',count(*),'total',coalesce(sum(d.total),0),'paid',coalesce(sum(d.paid_total),0),'balance',coalesce(sum(greatest(0,d.total-d.paid_total)),0),'credit_limit',(select p.credit_limit from public.customer_credit_policies p where p.organization_id=target_org and p.customer_id=target_customer))
 from public.sales_documents d where d.organization_id=target_org and d.kind='Invoice' and d.status='Issued'
 and (target_customer is null or d.customer_id=target_customer) and (target_branch is null or d.branch_id=target_branch)
 and (target_scope='all' or (target_scope='attestations' and d.sale_type='Attestation')) and public.business_access(d.organization_id,d.branch_id,'sales')
$$;
revoke all on function public.billing_financial_rows(uuid,uuid,text,uuid,text,integer,integer),public.billing_financial_snapshot(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.billing_financial_rows(uuid,uuid,text,uuid,text,integer,integer),public.billing_financial_snapshot(uuid,uuid,text,uuid) to authenticated;
create index if not exists billing_customer_issued_summary on public.sales_documents(organization_id,customer_id,branch_id) where kind='Invoice' and status='Issued';
create table public.financial_record_changes(
 id uuid primary key,organization_id uuid not null references public.organizations(id),branch_id uuid references public.branches(id),
 entity text not null,record_id uuid not null,action text not null check(action in('edit','delete')),reason text not null check(length(btrim(reason)) between 5 and 500),
 before_data jsonb not null,after_data jsonb,result_id uuid not null,created_at timestamptz not null default now(),created_by uuid not null default auth.uid() references public.profiles(id)
);
alter table public.financial_record_changes enable row level security;
revoke all on public.financial_record_changes from public,anon,authenticated;
grant select on public.financial_record_changes to authenticated;
create policy financial_change_read on public.financial_record_changes for select to authenticated using(public.is_current_session_valid() and public.is_organization_admin(organization_id));
create index financial_record_history on public.financial_record_changes(organization_id,entity,record_id,created_at desc);
-- Corrections retain originals, with a compensating entry on the original effective date.
-- The creation timestamp and change record retain when and why the correction was made.
create function accounting_private.reverse_source(target uuid,reason text) returns void language plpgsql security invoker set search_path='' as $$
declare j public.finance_journals;entries jsonb;
begin
 for j in select * from public.finance_journals x where x.source_id=target and x.reversal_of is null and not exists(select 1 from public.finance_journals r where r.reversal_of=x.id) order by x.id for update loop
 select jsonb_agg(jsonb_build_object('code',x->>'code','debit',coalesce((x->>'credit')::numeric,0),'credit',coalesce((x->>'debit')::numeric,0))) into entries from jsonb_array_elements(j.snapshot) x;
 perform accounting_private.post(j.organization_id,j.branch_id,j.entry_date,'Reversal',j.id,reason,entries,j.id);
 end loop;
end $$;
create function accounting_private.restate_cost(target uuid,input jsonb,removing boolean,reason text) returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.invoice_costs;acc public.finance_accounts;dated date;paid_date date;v_amount numeric;paid_now boolean;
begin
 select * into c from public.invoice_costs where id=target for update;
 if c.id is null or auth.uid() is null or not public.is_current_session_valid() or not public.is_organization_admin(c.organization_id) or not public.business_access(c.organization_id,c.branch_id,'sales') then raise exception 'Only a company administrator can correct this record.';end if;
 if c.status='Cancelled' then raise exception 'This record has already been deleted.';end if;
 perform accounting_private.reverse_source(c.id,reason);
 if removing then update public.invoice_costs set status='Cancelled' where id=c.id;return c.id;end if;
 v_amount:=round(coalesce((input->>'amount')::numeric,c.amount),2);dated:=coalesce(nullif(input->>'incurred_on','')::date,c.incurred_on);
 paid_now:=coalesce((input->>'paid_now')::boolean,c.status='Paid');paid_date:=coalesce(nullif(input->>'paid_on','')::date,c.paid_on,dated);
 if paid_now then
 select * into acc from public.finance_accounts where id=coalesce(nullif(input->>'account_id','')::uuid,c.account_id) and organization_id=c.organization_id and is_cash;
 if acc.id is null then raise exception 'Choose an available payment account.';end if;
 if paid_date<dated then raise exception 'Payment date cannot be before the liability date.';end if;
 end if;
 update public.invoice_costs set amount=v_amount,description=coalesce(nullif(btrim(input->>'description'),''),c.description),category=coalesce(nullif(btrim(input->>'category'),''),c.category),incurred_on=dated,paid_on=case when paid_now then paid_date end,account_id=case when paid_now then acc.id end,status=case when paid_now then 'Paid' else 'Unpaid' end where id=c.id returning * into c;
 perform accounting_private.cost_chart(c.organization_id);
 if not paid_now or paid_date>dated then perform accounting_private.accrue_cost(c);end if;
 if paid_now then
 if paid_date=dated then perform accounting_private.post(c.organization_id,c.branch_id,paid_date,'Invoice expense',c.id,c.description,jsonb_build_array(jsonb_build_object('code','5200','debit',c.amount),jsonb_build_object('code',acc.code,'credit',c.amount)));
 else perform accounting_private.post(c.organization_id,c.branch_id,paid_date,'Invoice expense',c.id,c.description,jsonb_build_array(jsonb_build_object('code','2200','debit',c.amount),jsonb_build_object('code',acc.code,'credit',c.amount),jsonb_build_object('code','5200','debit',c.amount),jsonb_build_object('code','1300','credit',c.amount)));end if;
 end if;return c.id;
end $$;
create function accounting_private.manage_record(entity text,action text,input jsonb,request_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=(input->>'organization_id')::uuid;target uuid:=(input->>'id')::uuid;branch uuid;result uuid;row_data jsonb;after_data jsonb;reason text:=btrim(input->>'reason');table_name text;linked_invoice uuid;p public.sales_payments;bill public.finance_bills;old_change public.financial_record_changes;amount numeric;tax numeric;entry_code text;
begin
 if auth.uid() is null or request_key is null or not public.is_current_session_valid() or not public.is_organization_admin(org) then raise exception 'Only a company administrator can correct this record.';end if;
 if action not in('edit','delete') or reason is null or length(reason) not between 5 and 500 then raise exception 'Enter a reason of at least five characters.';end if;
 table_name:=case entity when 'invoice' then 'sales_documents' when 'receipt' then 'sales_payments' when 'cost' then 'invoice_costs' when 'bill' then 'finance_bills' when 'account' then 'finance_accounts' when 'type' then 'finance_categories' when 'supplier' then 'finance_suppliers' when 'customer' then 'crm_customers' when 'service' then 'service_catalog' when 'job' then 'service_jobs' when 'lead' then 'crm_leads' end;
 if table_name is null then raise exception 'Choose an available record type.';end if;
 perform pg_advisory_xact_lock(hashtextextended('record-change:'||org::text||request_key::text,0));
 select * into old_change from public.financial_record_changes where id=request_key;
 if found then if old_change.organization_id<>org or old_change.entity<>entity or old_change.record_id<>target or old_change.action<>action then raise exception 'This request belongs to another correction.';end if;return old_change.result_id;end if;
 -- Invoice first, then receipt/cost: consistent with payment recording and invoice triggers.
 if entity='receipt' then select document_id into linked_invoice from public.sales_payments where id=target and organization_id=org;
 elsif entity='cost' then select invoice_id into linked_invoice from public.invoice_costs where id=target and organization_id=org;end if;
 if linked_invoice is not null then perform 1 from public.sales_documents where id=linked_invoice and organization_id=org for update;end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 and organization_id=$2 for update',table_name) into row_data using target,org;
 if row_data is null then raise exception 'This record is not available to your account.';end if;
 branch:=nullif(row_data->>'branch_id','')::uuid;
 if not public.business_access(org,branch,case entity when 'customer' then 'crm' when 'lead' then 'crm' when 'job' then 'services' else 'sales' end) then raise exception 'Accounting access denied.';end if;
 result:=target;
 if entity='cost' then
 if action='edit' and coalesce((row_data->>'automatic')::boolean,false) and (input->>'amount')::numeric is distinct from (row_data->>'amount')::numeric then raise exception 'Edit government fee amounts on the linked invoice.';end if;
 result:=accounting_private.restate_cost(target,input,action='delete',reason);
 elsif entity='receipt' then
 select * into p from public.sales_payments where id=target;
 if p.voided then raise exception 'This receipt has already been deleted or replaced.';end if;
 perform accounting_private.reverse_source(target,reason);perform public.void_business_payment(target,reason);
 if action='edit' then result:=public.record_sales_payment(jsonb_build_object('document_id',p.document_id,'amount',coalesce(input->'amount',to_jsonb(p.amount)),'account_id',coalesce(input->'account_id',to_jsonb(p.account_id)),'method',coalesce(input->>'method',p.method),'reference',coalesce(input->>'reference',p.reference),'notes',coalesce(input->>'notes',p.notes),'date',coalesce(nullif(input->>'date','')::date,p.received_at::date)),request_key);end if;
 elsif entity='invoice' then
 if action='edit' then
 if (input->'document'->>'id')::uuid is distinct from target or (input->'document'->>'organization_id')::uuid is distinct from org then raise exception 'This document is not available to your account.';end if;
 result:=public.save_billing_with_payment(input->'document',request_key);
 else
 for p in select * from public.sales_payments where document_id=target and organization_id=org and not voided order by id for update loop perform accounting_private.reverse_source(p.id,reason);perform public.void_business_payment(p.id,reason);end loop;
 perform accounting_private.reverse_source(target,reason);
 update public.sales_documents set status='Cancelled' where id=target;
 update public.cases set overall_status='Cancelled' where invoice_id=target and organization_id=org;
 end if;
 elsif entity='bill' then
 select * into bill from public.finance_bills where id=target;
 if bill.status='Voided' then raise exception 'This bill has already been deleted.';end if;
 if action='delete' then
 -- Paid supplier bills require a real refund, not a fictitious cash reversal.
 if bill.paid_total>0 then raise exception 'This supplier bill has payments. Record the supplier refund before deleting it.';end if;
 perform accounting_private.reverse_source(target,reason);update public.finance_bills set status='Voided',void_reason=reason where id=target;
 else
 amount:=round(coalesce((input->>'amount')::numeric,bill.net_amount),2);tax:=round(coalesce((input->>'tax_amount')::numeric,bill.tax_amount),2);
 if amount+tax<bill.paid_total then raise exception 'The total cannot be less than payments already received.';end if;
 perform accounting_private.reverse_source(target,reason);
 update public.finance_bills set net_amount=amount,tax_amount=tax,description=coalesce(nullif(btrim(input->>'description'),''),description),document_no=coalesce(nullif(btrim(input->>'document_no'),''),document_no),category=coalesce(nullif(btrim(input->>'category'),''),category),bill_date=coalesce(nullif(input->>'date','')::date,bill_date),due_date=nullif(input->>'due_date','')::date,notes=input->>'notes' where id=target returning * into bill;
 entry_code:=case bill.kind when 'Purchase' then '5100' else '5000' end;
 perform accounting_private.post(org,branch,bill.bill_date,bill.kind,bill.id,bill.document_no||' · '||bill.description,jsonb_build_array(jsonb_build_object('code',entry_code,'debit',bill.net_amount),jsonb_build_object('code','1200','debit',bill.tax_amount),jsonb_build_object('code','2000','credit',bill.total)));
 end if;
 elsif entity='account' then
 if action='delete' then
 if exists(select 1 from public.finance_lines where account_id=target) or exists(select 1 from public.sales_payments where account_id=target) or exists(select 1 from public.invoice_costs where account_id=target) or exists(select 1 from public.finance_payments where account_id=target) then raise exception 'This account has financial history. Keep it and rename it if needed.';end if;
 delete from public.finance_accounts where id=target and code like 'BANK-%';if not found then raise exception 'System accounts cannot be deleted.';end if;
 else update public.finance_accounts set name=btrim(input->>'name'),payment_type=coalesce(input->>'payment_type',payment_type) where id=target;end if;
 elsif entity='type' then
 if action='delete' then delete from public.finance_categories where id=target;
 else update public.finance_categories set name=btrim(input->>'name') where id=target;end if;
 elsif entity in('supplier','customer','service') then
 if action<>'delete' then raise exception 'Use the record editor to update these details.';end if;
 execute format('update public.%I set %I=$1 where id=$2',table_name,case when entity='service' then 'is_active' else 'archived' end) using entity<>'service',target;
 elsif entity='job' then
 if action<>'delete' then raise exception 'Use the job editor to update these details.';end if;update public.service_jobs set status='Cancelled' where id=target;
 elsif entity='lead' then
 if action<>'delete' then raise exception 'Use the lead editor to update these details.';end if;update public.crm_leads set status='Lost' where id=target;
 end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 and organization_id=$2',table_name) into after_data using result,org;
 insert into public.financial_record_changes(id,organization_id,branch_id,entity,record_id,action,reason,before_data,after_data,result_id) values(request_key,org,branch,entity,target,action,reason,row_data,after_data,result);
 return result;
end $$;
create function public.manage_financial_record(entity text,action text,input jsonb,request_key uuid) returns uuid language sql security invoker set search_path='' as $$select accounting_private.manage_record(entity,action,input,request_key)$$;
revoke all on function accounting_private.reverse_source(uuid,text),accounting_private.restate_cost(uuid,jsonb,boolean,text),accounting_private.manage_record(text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function accounting_private.manage_record(text,text,jsonb,uuid) to authenticated;
revoke all on function public.manage_financial_record(text,text,jsonb,uuid) from public,anon;
grant execute on function public.manage_financial_record(text,text,jsonb,uuid) to authenticated;
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
 if tg_op='UPDATE' and payments>0 and not (public.is_current_session_valid() and public.is_organization_admin(new.organization_id)) and (new.items<>old.items or new.discount<>old.discount or new.adjustment<>old.adjustment or new.tax_percent<>old.tax_percent or new.customer_id is distinct from old.customer_id or new.customer_name<>old.customer_name or new.branch_id is distinct from old.branch_id or new.status in ('Draft','Cancelled')) then raise exception 'An invoice with payments cannot be changed or cancelled. Ask an administrator to void incorrect payments first.';end if;
 if new.subtotal-new.discount+new.adjustment<0 or new.total<0 or new.total::text in ('NaN','Infinity','-Infinity') then raise exception 'The total must be a valid positive amount.';end if;
 if payments>new.total then raise exception 'The total cannot be less than payments already received.';end if;
 if tg_op='UPDATE' and payments>0 and (new.branch_id is distinct from old.branch_id or new.customer_id is distinct from old.customer_id or new.status in('Draft','Cancelled')) then raise exception 'Delete or correct the receipts before changing the invoice branch, customer or status.';end if;
 new.paid_total:=payments;new.updated_at:=now();return new;
end $$;
create or replace function accounting_private.invoice_cost_sync() returns trigger language plpgsql security definer set search_path='' as $$
declare amount numeric;c public.invoice_costs;j uuid;
begin
 if new.kind<>'Invoice' then return new;end if;
 if auth.uid() is not null and not public.business_access(new.organization_id,new.branch_id,'sales') then raise exception 'Accounting access denied.';end if;
 select * into c from public.invoice_costs where invoice_id=new.id and automatic and status<>'Cancelled' for update;
 -- Historical invoices are not backfilled by unrelated edits or receipt updates.
 if c.id is null and tg_op='UPDATE' and old.status='Issued' then return new;end if;
 if exists(select 1 from jsonb_array_elements(new.items) x where coalesce((x->>'government_fee')::numeric,0)<0 or coalesce((x->>'government_fee')::numeric,0)::text in('NaN','Infinity','-Infinity')) then raise exception 'Enter a valid government fee.';end if;
 select round(coalesce(sum(coalesce((x->>'government_fee')::numeric,0)*(x->>'quantity')::numeric),0),2) into amount from jsonb_array_elements(new.items) x;
 if new.status<>'Issued' then amount:=0;end if;
 if c.id is not null then
 if c.status='Paid' and new.status='Cancelled' then return new;end if;
 if c.status='Paid' and (amount<>c.amount or new.branch_id<>c.branch_id) then
 if new.branch_id<>c.branch_id or not public.is_organization_admin(new.organization_id) then raise exception 'Government fees have already been paid. Ask an administrator to correct the linked invoice.';end if;
 if amount<=0 then raise exception 'Remove the paid government expense before removing all government fees.';end if;
 perform accounting_private.restate_cost(c.id,jsonb_build_object('amount',amount),false,'Government fee corrected on invoice');return new;end if;
 if c.amount=amount and c.branch_id=new.branch_id then return new;end if;
 for j in select id from public.finance_journals x where source='Invoice liability' and source_id=c.id and not exists(select 1 from public.finance_journals y where y.reversal_of=x.id) loop perform accounting_private.reverse_entry(j,'Invoice cost corrected');end loop;
 update public.invoice_costs set status='Cancelled' where id=c.id;
 end if;
 if amount>0 then
 insert into public.invoice_costs(organization_id,branch_id,invoice_id,description,amount,incurred_on,automatic,created_by) values(new.organization_id,new.branch_id,new.id,'Government fees · '||new.document_no,amount,coalesce(new.document_date,current_date),true,auth.uid()) returning * into c;
 perform accounting_private.accrue_cost(c);
 end if;return new;
end $$;
revoke all on function public.business_document_totals(),accounting_private.invoice_cost_sync() from public,anon,authenticated;
create or replace function public.business_payment_guard_v57() returns trigger language plpgsql security definer set search_path='' as $$
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
 new.branch_id:=invoice.branch_id;new.received_by:=auth.uid();new.received_at:=coalesce(new.received_at,now());new.voided:=false;new.void_reason:=null;new.voided_by:=null;new.voided_at:=null;
 return new;
end $$;
revoke all on function public.business_payment_guard_v57() from public,anon,authenticated;
create or replace function public.guard_invoice_number() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.document_no:=btrim(new.document_no);
 if length(new.document_no) not between 1 and 80 or new.document_no ~ '[[:cntrl:]]' then raise exception 'Enter a bill number between 1 and 80 characters.';end if;
 if tg_op='UPDATE' and old.document_no is distinct from new.document_no and exists(select 1 from public.sales_payments where document_id=old.id) and not(public.is_current_session_valid() and public.is_organization_admin(new.organization_id)) then raise exception 'Invoices with payments cannot be renumbered. Use a credit note or correction instead.';end if;
 return new;
end $$;
revoke all on function public.guard_invoice_number() from public,anon,authenticated;
commit;
