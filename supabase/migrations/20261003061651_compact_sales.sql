-- Compact sales: atomic collections, selected accounts and invoice-linked costs.
begin;
alter table public.checkout_prices add column pos_rate numeric(14,2) check(pos_rate>=0 and pos_rate<100000000);
alter table public.finance_accounts add column payment_type text not null default 'Cash' check(payment_type in('Cash','Bank','Petty cash','Card','Credit card','Other'));
update public.finance_accounts set payment_type=case when code='1010' or code like 'BANK-%' then 'Bank' when code='1020' then 'Card' when code='1090' then 'Other' else 'Cash' end;
alter table public.sales_documents add column customer_mobile_search text generated always as(right(regexp_replace(coalesce(customer_mobile,''),'[^0-9]','','g'),8)) stored;
create index billing_mobile_search on public.sales_documents(organization_id,customer_mobile_search,created_at desc);
alter table public.sales_payments add column account_id uuid,add column receipt_no text;
alter table public.sales_payments add constraint sales_payment_account foreign key(account_id,organization_id) references public.finance_accounts(id,organization_id);
create unique index sales_receipt_number on public.sales_payments(organization_id,receipt_no) where receipt_no is not null;
create table public.finance_categories(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),name text not null check(length(btrim(name)) between 1 and 120),kind text not null check(kind in('Expense','Liability')),unique(organization_id,kind,name));
create table public.invoice_costs(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),branch_id uuid not null references public.branches(id),invoice_id uuid,
 description text not null check(length(btrim(description)) between 1 and 500),category text not null default 'Government fees',amount numeric(14,2) not null check(amount>0 and amount<100000000),
 incurred_on date not null default current_date,paid_on date,account_id uuid,status text not null default 'Unpaid' check(status in('Unpaid','Paid','Cancelled')),
 automatic boolean not null default false,created_at timestamptz not null default now(),created_by uuid references public.profiles(id),
 foreign key(invoice_id,organization_id) references public.sales_documents(id,organization_id),foreign key(account_id,organization_id) references public.finance_accounts(id,organization_id),
 check((status='Paid' and paid_on is not null and account_id is not null) or status<>'Paid')
);
create unique index invoice_government_cost on public.invoice_costs(invoice_id) where automatic and status<>'Cancelled';
create index invoice_cost_scope on public.invoice_costs(organization_id,branch_id,incurred_on);
create index invoice_cost_invoice on public.invoice_costs(invoice_id);
do $$declare t text;begin foreach t in array array['finance_categories','invoice_costs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy scoped_read on public.%I for select to authenticated using(public.business_access(organization_id,%s,''sales''))',t,case when t='finance_categories' then 'public.current_profile_branch_id()' else 'branch_id' end);
 end loop;end $$;
alter table public.invoice_costs add column liability_visible boolean generated always as(status='Unpaid' or (status='Paid' and paid_on>incurred_on)) stored;
create index invoice_costs_liability_idx on public.invoice_costs(organization_id,branch_id,incurred_on) where liability_visible;

create function public.customer_receivables(target_org uuid,target_customer uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('total',coalesce(sum(total),0),'paid',coalesce(sum(paid_total),0),'balance',coalesce(sum(total-paid_total),0)) from public.sales_documents where organization_id=target_org and customer_id=target_customer and kind='Invoice' and status='Issued'
$$;
revoke all on function public.customer_receivables(uuid,uuid) from public,anon;
grant execute on function public.customer_receivables(uuid,uuid) to authenticated;
create function accounting_private.cost_chart(org uuid) returns void language sql security invoker set search_path='' as $$
 insert into public.finance_accounts(organization_id,code,name,kind) values(org,'1300','Unpaid service costs','Asset'),(org,'2200','Invoice cost liabilities','Liability'),(org,'5200','Government fees and invoice expenses','Expense') on conflict(organization_id,code) do nothing
$$;
create function accounting_private.accrue_cost(c public.invoice_costs) returns void language plpgsql security invoker set search_path='' as $$begin
 perform accounting_private.cost_chart(c.organization_id);
 perform accounting_private.post(c.organization_id,c.branch_id,c.incurred_on,'Invoice liability',c.id,c.description,jsonb_build_array(jsonb_build_object('code','1300','debit',c.amount),jsonb_build_object('code','2200','credit',c.amount)));
end $$;
create function accounting_private.invoice_cost_sync() returns trigger language plpgsql security definer set search_path='' as $$
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
 if c.status='Paid' and (amount<>c.amount or new.branch_id<>c.branch_id) then raise exception 'Government fees have already been paid. Use an accounting correction before changing them.';end if;
 if c.amount=amount and c.branch_id=new.branch_id then return new;end if;
 for j in select id from public.finance_journals x where source='Invoice liability' and source_id=c.id and not exists(select 1 from public.finance_journals y where y.reversal_of=x.id) loop perform accounting_private.reverse_entry(j,'Invoice cost corrected');end loop;
 update public.invoice_costs set status='Cancelled' where id=c.id;
 end if;
 if amount>0 then
 insert into public.invoice_costs(organization_id,branch_id,invoice_id,description,amount,incurred_on,automatic,created_by) values(new.organization_id,new.branch_id,new.id,'Government fees · '||new.document_no,amount,coalesce(new.document_date,current_date),true,auth.uid()) returning * into c;
 perform accounting_private.accrue_cost(c);
 end if;return new;
end $$;
create trigger zz_invoice_costs after insert or update on public.sales_documents for each row execute function accounting_private.invoice_cost_sync();
create function accounting_private.cost_command(action text,input jsonb,request_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=(input->>'organization_id')::uuid;branch uuid:=(input->>'branch_id')::uuid;c public.invoice_costs;d public.sales_documents;acc public.finance_accounts;amount numeric;dated date;j uuid;result uuid;
begin
 if auth.uid() is null or request_key is null or not public.business_access(org,branch,'sales') then raise exception 'Accounting access denied.';end if;
 if not exists(select 1 from public.branches where id=branch and organization_id=org and is_active) then raise exception 'Choose an active branch.';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||request_key::text,0));
 if action='category' then
 if not public.is_organization_admin(org) then raise exception 'Only administrators can manage accounting types.';end if;
 if input->>'kind' not in('Expense','Liability') then raise exception 'Choose expense or liability.';end if;
 insert into public.finance_categories(id,organization_id,name,kind) values(request_key,org,btrim(input->>'name'),input->>'kind') on conflict(id) do nothing;return request_key;
 elsif action='cost' then
 select * into c from public.invoice_costs where id=request_key and organization_id=org and branch_id=branch;if found then return c.id;end if;
 if nullif(input->>'invoice_id','') is not null then select * into d from public.sales_documents where id=(input->>'invoice_id')::uuid and organization_id=org and branch_id=branch and kind='Invoice' and status='Issued' for update;if not found then raise exception 'Choose an issued invoice in this branch.';end if;end if;
 amount:=round((input->>'amount')::numeric,2);if amount is null or amount::text in('NaN','Infinity','-Infinity') or amount<=0 or amount>=100000000 then raise exception 'Enter a valid expense amount.';end if;
 insert into public.invoice_costs(id,organization_id,branch_id,invoice_id,description,category,amount,incurred_on,created_by) values(request_key,org,branch,d.id,btrim(input->>'description'),coalesce(nullif(input->>'category',''),'Government fees'),amount,coalesce(nullif(input->>'date','')::date,current_date),auth.uid()) returning * into c;
 perform accounting_private.accrue_cost(c);
 if not coalesce((input->>'paid_now')::boolean,false) then return c.id;end if;
 elsif action='cost_pay' then
 select * into c from public.invoice_costs where id=(input->>'cost_id')::uuid and organization_id=org and branch_id=branch for update;if not found then raise exception 'Choose an available liability.';end if;
 if c.status='Paid' then return c.id;end if;if c.status<>'Unpaid' then raise exception 'This liability is no longer payable.';end if;
 else raise exception 'Choose an available cost action.';end if;
 select * into acc from public.finance_accounts where id=(input->>'account_id')::uuid and organization_id=org and is_cash;if not found then raise exception 'Choose an available payment account.';end if;
 dated:=coalesce(nullif(input->>'paid_on','')::date,nullif(input->>'date','')::date,current_date);if dated<c.incurred_on then raise exception 'Payment date cannot be before the liability date.';end if;
 perform accounting_private.cost_chart(org);
 if dated=c.incurred_on then
 for j in select id from public.finance_journals x where source='Invoice liability' and source_id=c.id and not exists(select 1 from public.finance_journals y where y.reversal_of=x.id) loop
 -- Same-day reclassification retains the audit trail and nets out the accrued liability.
 perform accounting_private.post(org,branch,dated,'Reversal',j,'Same-day invoice expense', (select jsonb_agg(jsonb_build_object('code',x->>'code','debit',coalesce((x->>'credit')::numeric,0),'credit',coalesce((x->>'debit')::numeric,0))) from public.finance_journals jj cross join jsonb_array_elements(jj.snapshot) x where jj.id=j),j);
 end loop;
 perform accounting_private.post(org,branch,dated,'Invoice expense',c.id,c.description,jsonb_build_array(jsonb_build_object('code','5200','debit',c.amount),jsonb_build_object('code',acc.code,'credit',c.amount)));
 else
 perform accounting_private.post(org,branch,dated,'Invoice expense',c.id,c.description,jsonb_build_array(jsonb_build_object('code','2200','debit',c.amount),jsonb_build_object('code',acc.code,'credit',c.amount),jsonb_build_object('code','5200','debit',c.amount),jsonb_build_object('code','1300','credit',c.amount)));
 end if;
 update public.invoice_costs set status='Paid',paid_on=dated,account_id=acc.id where id=c.id;return c.id;
end $$;
create function public.invoice_cost_command(action text,input jsonb,request_key uuid) returns uuid language sql security invoker set search_path='' as $$select accounting_private.cost_command(action,input,request_key)$$;
revoke all on function accounting_private.cost_chart(uuid),accounting_private.accrue_cost(public.invoice_costs),accounting_private.invoice_cost_sync(),accounting_private.cost_command(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function accounting_private.cost_command(text,jsonb,uuid) to authenticated;
revoke all on function public.invoice_cost_command(text,jsonb,uuid) from public,anon;
grant execute on function public.invoice_cost_command(text,jsonb,uuid) to authenticated;
alter function public.business_payment_guard() rename to business_payment_guard_v57;
create function public.business_payment_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.account_id is not null and not exists(select 1 from public.finance_accounts where id=new.account_id and organization_id=new.organization_id and is_cash) then raise exception 'Choose an available payment account.';end if;
 if tg_op='INSERT' then new.receipt_no:='RCT-'||upper(replace(new.id::text,'-',''));end if;
 return new;
end $$;
create trigger aa_payment_account before insert or update on public.sales_payments for each row execute function public.business_payment_guard();
revoke all on function public.business_payment_guard() from public,anon,authenticated;
create or replace function accounting_private.payment_post(p public.sales_payments) returns void language plpgsql security invoker set search_path='' as $$
declare j uuid;code text;
begin
 perform pg_advisory_xact_lock(hashtextextended('receipt-ledger:'||p.id::text,0));
 select id into j from public.finance_journals x where source='Receipt' and source_id=p.id and not exists(select 1 from public.finance_journals r where r.reversal_of=x.id) limit 1;
 if p.voided then if j is not null then perform accounting_private.reverse_entry(j,'Customer receipt voided');end if;return;end if;
 if j is not null then return;end if;
 if p.account_id is not null then select a.code into code from public.finance_accounts a where a.id=p.account_id and a.organization_id=p.organization_id and a.is_cash;else code:=case p.method when 'Cash' then '1000' when 'Card' then '1020' when 'Bank transfer' then '1010' else '1090' end;end if;
 if code is null then raise exception 'Choose an available payment account.';end if;
 perform accounting_private.post(p.organization_id,p.branch_id,p.received_at::date,'Receipt',p.id,coalesce(p.receipt_no,'Customer payment'),jsonb_build_array(jsonb_build_object('code',code,'debit',p.amount),jsonb_build_object('code','1100','credit',p.amount)));
end $$;
create or replace function public.record_sales_payment(input jsonb,request_key uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare d public.sales_documents;result uuid;
begin
 select * into d from public.sales_documents where id=(input->>'document_id')::uuid for update;
 if auth.uid() is null or record_sales_payment.request_key is null or d.id is null or not public.business_access(d.organization_id,d.branch_id,'sales') then raise exception 'This invoice is not available to your account.';end if;
 perform pg_advisory_xact_lock(hashtextextended(d.organization_id::text||request_key::text,0));
 select id into result from public.sales_payments p where p.organization_id=d.organization_id and p.request_key=record_sales_payment.request_key;
 if result is not null then return result;end if;
 insert into public.sales_payments(organization_id,branch_id,document_id,amount,method,reference,notes,request_key,account_id,received_at)
 values(d.organization_id,d.branch_id,d.id,(input->>'amount')::numeric,coalesce(input->>'method','Cash'),input->>'reference',input->>'notes',request_key,nullif(input->>'account_id','')::uuid,coalesce(nullif(input->>'date','')::date,current_date)::timestamptz) returning id into result;
 return result;
end $$;
create function public.save_billing_with_payment(input jsonb,request_key uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;p jsonb;
begin
 result:=public.save_billing_document(input,request_key);p:=input->'payment';
 if p is not null and p<>'null'::jsonb then
 if input->>'kind'<>'Invoice' or input->>'status'<>'Issued' then raise exception 'Receive payments only against issued invoices.';end if;
 perform public.record_sales_payment(p||jsonb_build_object('document_id',result),request_key);
 end if;return result;
end $$;
revoke all on function public.save_billing_with_payment(jsonb,uuid) from public,anon;
grant execute on function public.save_billing_with_payment(jsonb,uuid) to authenticated;
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
  gov:=case when coalesce((input->>'pos_mode')::boolean,false) then 0 else round((item->>'government_fee')::numeric,2) end;fee:=round((item->>'service_fee')::numeric,2);qty:=(item->>'quantity')::numeric;
  if gov is null or fee is null or qty is null or gov::text in ('NaN','Infinity','-Infinity') or fee::text in ('NaN','Infinity','-Infinity') or qty::text in ('NaN','Infinity','-Infinity') or gov<0 or fee<0 or qty<=0 or qty>10000 then raise exception 'Enter valid quantities and fees.';end if;
  stages:=case when item ? 'workflow' then item->'workflow' else svc.workflow end;
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
 insert into public.sales_documents(organization_id,branch_id,customer_id,customer_name,customer_mobile,customer_email,kind,status,items,discount,notes,checkout_key,document_no)
 values(org,branch,customer,cname,nullif(input->>'customer_mobile',''),nullif(input->>'customer_email',''),'Invoice','Issued',lines,coalesce((input->>'discount')::numeric,0),nullif(input->>'notes',''),request_key,coalesce(nullif(btrim(input->>'document_no'),''),public.next_billing_number(org,branch,'Invoice'))) returning * into saved;
 invoice:=saved.id;
 if nullif(input->>'template_id','') is not null then update public.sales_documents set template_id=(input->>'template_id')::uuid where id=invoice;end if;
 if paid<0 or paid>saved.total then raise exception 'Payment cannot exceed the invoice total.';end if;
 if paid>0 then insert into public.sales_payments(organization_id,branch_id,document_id,amount,method,received_by,account_id) values(org,branch,invoice,paid,coalesce(input->>'method','Cash'),auth.uid(),nullif(input->>'account_id','')::uuid);end if;
 return invoice;
end $$;
alter function accounting_private.command(text,jsonb,uuid) rename to command_v57;
create function accounting_private.command(action text,input jsonb,request_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;org uuid:=(input->>'organization_id')::uuid;branch uuid:=(input->>'branch_id')::uuid;typ text:=coalesce(input->>'payment_type','Bank');
begin
 if auth.uid() is null or not public.business_access(org,branch,'sales') then raise exception 'Accounting access denied.';end if;
 if action='category' then return accounting_private.cost_command(action,input,request_key);end if;
 if action='account' then
 if not public.is_organization_admin(org) or typ not in('Cash','Bank','Petty cash','Card','Credit card','Other') then raise exception 'Choose a valid payment account type.';end if;
 -- Explicit credit cards are liability accounts; card clearing is an asset.
 if typ='Credit card' then
 perform pg_advisory_xact_lock(hashtextextended(org::text||request_key::text,0));
 select id into result from public.finance_accounts where id=request_key and organization_id=org;if result is not null then return result;end if;
 if coalesce((input->>'amount')::numeric,0)::text in('NaN','Infinity','-Infinity') or coalesce((input->>'amount')::numeric,0)<0 or coalesce((input->>'amount')::numeric,0)>=100000000 then raise exception 'Enter a valid opening balance.';end if;
 insert into public.finance_accounts(id,organization_id,code,name,kind,is_cash,payment_type) values(request_key,org,'CARD-'||request_key::text,btrim(input->>'name'),'Liability',true,typ);
 if coalesce((input->>'amount')::numeric,0)>0 then perform accounting_private.post(org,branch,coalesce(nullif(input->>'date','')::date,current_date),'Opening',request_key,'Credit card opening balance',jsonb_build_array(jsonb_build_object('code','3000','debit',round((input->>'amount')::numeric,2)),jsonb_build_object('code','CARD-'||request_key::text,'credit',round((input->>'amount')::numeric,2))));end if;return request_key;
 end if;
 end if;
 result:=accounting_private.command_v57(action,input,request_key);
 if action='account' then update public.finance_accounts set payment_type=typ where id=result and organization_id=org;end if;
 if action='setup' then update public.finance_accounts set payment_type=case code when '1010' then 'Bank' when '1020' then 'Card' when '1090' then 'Other' else payment_type end where organization_id=org and code in('1010','1020','1090');end if;
 return result;
end $$;
revoke all on function accounting_private.command(text,jsonb,uuid),accounting_private.command_v57(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function accounting_private.command(text,jsonb,uuid) to authenticated;
create or replace function public.finance_command(action text,input jsonb,request_key uuid) returns uuid language sql security invoker set search_path='' as $$select accounting_private.command(action,input,request_key)$$;

alter table public.service_jobs add column public_tracking_token uuid not null default gen_random_uuid(),add column customer_result text not null default '' check(length(customer_result)<=2000);
create unique index service_job_public_token on public.service_jobs(public_tracking_token);
create or replace function public.billing_item_jobs() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb;stages jsonb;line_no integer:=0;stage jsonb;
begin
 if new.kind<>'Invoice' or new.status<>'Issued' then return new;end if;
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
create function public.service_name_key(value text) returns text language sql immutable strict set search_path='' as $$
 select coalesce(string_agg(word,' ' order by word),'') from unnest(regexp_split_to_array(lower(btrim(value)),'[^[:alnum:]]+')) word where word<>'' and word not in('of','the','for')
$$;
create index service_normalized_lookup on public.service_catalog(organization_id,public.service_name_key(name));
create function public.service_duplicate_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op='UPDATE' and new.name=old.name and new.organization_id=old.organization_id then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||public.service_name_key(new.name),0));
 if exists(select 1 from public.service_catalog where organization_id=new.organization_id and id<>new.id and public.service_name_key(name)=public.service_name_key(new.name)) then raise exception 'A matching service already exists. Select the existing service from the dropdown.';end if;return new;
end $$;
revoke all on function public.service_duplicate_guard() from public,anon,authenticated;
revoke all on function public.service_name_key(text) from public,anon;
grant execute on function public.service_name_key(text) to authenticated;
create trigger service_duplicate_guard before insert or update on public.service_catalog for each row execute function public.service_duplicate_guard();
create function public.business_dashboard(target_org uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('invoices',(select count(*) from public.sales_documents where organization_id=target_org and kind='Invoice' and status='Issued' and coalesce(document_date,created_at::date)=current_date),'sales',(select coalesce(sum(total),0) from public.sales_documents where organization_id=target_org and kind='Invoice' and status='Issued' and coalesce(document_date,created_at::date)=current_date),'receivables',(select coalesce(sum(total-paid_total),0) from public.sales_documents where organization_id=target_org and kind='Invoice' and status='Issued'),'jobs',(select count(*) from public.service_jobs where organization_id=target_org and status not in('Completed','Cancelled')))
$$;
revoke all on function public.business_dashboard(uuid) from public,anon;
grant execute on function public.business_dashboard(uuid) to authenticated;
commit;
notify pgrst,'reload schema';
