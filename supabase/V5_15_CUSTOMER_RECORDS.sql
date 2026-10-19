-- Optional customer registries, explicit marketing consent and renewal queues.
begin;
alter table public.crm_customers add column customer_type text not null default 'Personal' check(customer_type in ('Personal','Company'));
alter table public.crm_customers add column marketing_opt_in boolean not null default false;
alter table public.crm_customers add column marketing_consent_at timestamptz;
update public.crm_customers set customer_type='Company' where nullif(btrim(company),'') is not null;

create table public.customer_records (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 customer_id uuid not null, record_kind text not null check(record_kind in ('Document','Staff','Vehicle')),
 parent_id uuid, name text not null check(length(btrim(name)) between 1 and 200),
 reference text check(length(reference)<=200), document_type text check(length(document_type)<=120),
 issued_on date, expires_on date, service_id uuid, notes text check(length(notes)<=2000),
 details jsonb not null default '{}' check(jsonb_typeof(details)='object' and octet_length(details::text)<=8000),
 reminder_enabled boolean not null default true, reminder_days integer not null default 30 check(reminder_days between 0 and 365),
 last_contacted_on date, snoozed_until date, archived boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,organization_id,customer_id), unique(id,organization_id),
 foreign key(customer_id,organization_id) references public.crm_customers(id,organization_id),
 foreign key(parent_id,organization_id,customer_id) references public.customer_records(id,organization_id,customer_id),
 foreign key(service_id,organization_id) references public.service_catalog(id,organization_id),
 check(expires_on is null or issued_on is null or expires_on>=issued_on),check(parent_id is null or record_kind='Document')
);
create index customer_records_customer_idx on public.customer_records(organization_id,customer_id,record_kind,name,id);
create index customer_records_parent_idx on public.customer_records(parent_id,organization_id,customer_id) where parent_id is not null;
create index customer_records_service_idx on public.customer_records(service_id,organization_id) where service_id is not null;
create index customer_records_expiry_idx on public.customer_records(organization_id,expires_on,id) where not archived and reminder_enabled;

create table public.customer_record_renewals (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,customer_id uuid not null, record_id uuid not null,
 previous_expiry date, new_expiry date,actor_id uuid references public.profiles(id),created_at timestamptz not null default now(),
 foreign key(record_id,organization_id,customer_id) references public.customer_records(id,organization_id,customer_id)
);
create index customer_record_renewals_record_idx on public.customer_record_renewals(record_id,organization_id,customer_id,created_at desc);
create index customer_record_renewals_actor_idx on public.customer_record_renewals(actor_id);

create function public.customer_record_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare c public.crm_customers;p public.customer_records;
begin
 select * into c from public.crm_customers where id=new.customer_id and organization_id=new.organization_id;
 if c.id is null or c.archived then raise exception 'Choose an available customer.';end if;
 if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.customer_id<>old.customer_id or new.record_kind<>old.record_kind) then raise exception 'The owner and kind of a saved record cannot be changed.';end if;
 if new.record_kind in ('Staff','Vehicle') and c.customer_type<>'Company' then raise exception 'Staff and vehicles belong to company customers.';end if;
 if new.parent_id is not null then
  select * into p from public.customer_records where id=new.parent_id and organization_id=new.organization_id and customer_id=new.customer_id;
  if p.id is null or p.archived and not new.archived or p.record_kind not in ('Staff','Vehicle') then raise exception 'Choose an active staff member or vehicle from this customer.';end if;
 end if;
 new.name:=btrim(new.name);new.updated_at:=now();return new;
end $$;
create trigger customer_record_guard before insert or update on public.customer_records for each row execute function public.customer_record_guard();
create function public.customer_record_archive_children() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.archived and not old.archived then update public.customer_records set archived=true where parent_id=new.id and organization_id=new.organization_id and customer_id=new.customer_id and not archived;end if;return new;
end $$;
create trigger customer_record_archive_children after update on public.customer_records for each row execute function public.customer_record_archive_children();
revoke all on function public.customer_record_archive_children() from public,anon,authenticated;

create function public.customer_consent_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.customer_type='Personal' and old.customer_type='Company' and exists(select 1 from public.customer_records where customer_id=new.id and organization_id=new.organization_id and record_kind in ('Staff','Vehicle') and not archived) then raise exception 'Archive company staff and vehicles before changing this customer to Personal.';end if;
 if tg_op='INSERT' then new.marketing_consent_at:=case when new.marketing_opt_in then now() end;
 elsif new.marketing_opt_in is distinct from old.marketing_opt_in then new.marketing_consent_at:=case when new.marketing_opt_in then now() end;
 else new.marketing_consent_at:=old.marketing_consent_at;end if;
 return new;
end $$;
create trigger customer_consent_guard before insert or update on public.crm_customers for each row execute function public.customer_consent_guard();

create function accounting_private.customer_renewal_history() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_current_session_valid() or not exists(select 1 from public.crm_customers c where c.id=new.customer_id and c.organization_id=new.organization_id and public.business_customer_access(c.organization_id,c.branch_id)) then raise exception 'Customer access denied.';end if;
 if new.expires_on is distinct from old.expires_on then
  insert into public.customer_record_renewals(organization_id,customer_id,record_id,previous_expiry,new_expiry,actor_id) values(new.organization_id,new.customer_id,new.id,old.expires_on,new.expires_on,auth.uid());
 end if;return new;
end $$;
create trigger customer_renewal_history after update on public.customer_records for each row execute function accounting_private.customer_renewal_history();
revoke all on function public.customer_record_guard(),public.customer_consent_guard(),accounting_private.customer_renewal_history() from public,anon,authenticated;

alter table public.customer_records enable row level security;
alter table public.customer_record_renewals enable row level security;
create policy customer_records_read on public.customer_records for select to authenticated using(exists(select 1 from public.crm_customers c where c.id=customer_id and c.organization_id=customer_records.organization_id and public.business_customer_access(c.organization_id,c.branch_id)));
create policy customer_records_insert on public.customer_records for insert to authenticated with check(exists(select 1 from public.crm_customers c where c.id=customer_id and c.organization_id=customer_records.organization_id and not c.archived and public.business_customer_access(c.organization_id,c.branch_id)));
create policy customer_records_update on public.customer_records for update to authenticated using(exists(select 1 from public.crm_customers c where c.id=customer_id and c.organization_id=customer_records.organization_id and public.business_customer_access(c.organization_id,c.branch_id))) with check(exists(select 1 from public.crm_customers c where c.id=customer_id and c.organization_id=customer_records.organization_id and not c.archived and public.business_customer_access(c.organization_id,c.branch_id)));
create policy customer_renewals_read on public.customer_record_renewals for select to authenticated using(exists(select 1 from public.customer_records r where r.id=record_id and r.organization_id=customer_record_renewals.organization_id));
revoke all on public.customer_records,public.customer_record_renewals from public,anon,authenticated;
grant select,insert,update on public.customer_records to authenticated;
grant select on public.customer_record_renewals to authenticated;
grant all on public.customer_records,public.customer_record_renewals to service_role;

create or replace function public.quick_add_customer(input jsonb,request_key uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare org uuid:=(input->>'organization_id')::uuid;branch uuid:=(input->>'branch_id')::uuid;result uuid;
begin
 if auth.uid() is null or request_key is null or not public.business_customer_access(org,branch) then raise exception 'Customer creation requires an assigned branch and module access.';end if;
 if not exists(select 1 from public.branches where id=branch and organization_id=org and is_active) then raise exception 'Choose an active branch in this company.';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||request_key::text,0));
 select id into result from public.crm_customers where id=request_key and organization_id=org;if result is not null then return result;end if;
 insert into public.crm_customers(id,organization_id,branch_id,name,mobile,email,customer_type,company)
 values(request_key,org,branch,btrim(input->>'name'),nullif(btrim(input->>'mobile'),''),nullif(btrim(input->>'email'),''),coalesce(nullif(input->>'customer_type',''),'Personal'),case when input->>'customer_type'='Company' then nullif(btrim(input->>'company'),'') end) returning id into result;
 return result;
end $$;
revoke all on function public.quick_add_customer(jsonb,uuid) from public,anon;
grant execute on function public.quick_add_customer(jsonb,uuid) to authenticated;

create function public.customer_renewal_queue(target_org uuid,query_text text default '',record_type text default '',due_filter text default '30',customer_filter uuid default null,result_offset integer default 0,audience_filter text default 'all',channel_filter text default 'email')
returns table(id uuid,customer_id uuid,customer_name text,customer_type text,mobile text,email text,email_updates boolean,whatsapp_opt_in boolean,marketing_opt_in boolean,record_kind text,name text,reference text,document_type text,expires_on date,reminder_days integer,last_contacted_on date,snoozed_until date,service_id uuid,service_name text,parent_name text)
language sql stable security invoker set search_path='' as $$
 select r.id,r.customer_id,c.name,c.customer_type,c.mobile,c.email,c.email_updates,c.whatsapp_opt_in,c.marketing_opt_in,r.record_kind,r.name,r.reference,r.document_type,r.expires_on,r.reminder_days,r.last_contacted_on,r.snoozed_until,r.service_id,s.name,p.name
 from public.customer_records r join public.crm_customers c on c.id=r.customer_id and c.organization_id=r.organization_id
 left join public.service_catalog s on s.id=r.service_id and s.organization_id=r.organization_id
 left join public.customer_records p on p.id=r.parent_id and p.organization_id=r.organization_id
 where r.organization_id=target_org and not r.archived and not c.archived and r.expires_on is not null and r.reminder_enabled
 and (customer_filter is null or r.customer_id=customer_filter)
 and (record_type='' or r.record_kind=record_type)
 and (audience_filter='all' or audience_filter='service' and (channel_filter='email' and c.email_updates and nullif(c.email,'') is not null or channel_filter='whatsapp' and c.whatsapp_opt_in and nullif(c.mobile,'') is not null) or audience_filter='marketing' and c.marketing_opt_in and (channel_filter='email' and c.email_updates and nullif(c.email,'') is not null or channel_filter='whatsapp' and c.whatsapp_opt_in and nullif(c.mobile,'') is not null))
 and (query_text='' or position(lower(left(query_text,200)) in lower(concat_ws(' ',r.name,r.reference,c.name,c.mobile,s.name,p.name)))>0)
 and (due_filter='all' or due_filter='overdue' and r.expires_on<current_date or due_filter in ('7','30','60','90') and r.expires_on<=current_date+case due_filter when '7' then 7 when '60' then 60 when '90' then 90 else 30 end or due_filter='due' and r.expires_on-r.reminder_days<=current_date and coalesce(r.snoozed_until,current_date)<=current_date)
 order by r.expires_on,r.id limit 31 offset greatest(0,least(coalesce(result_offset,0),1000000))
$$;
revoke all on function public.customer_renewal_queue(uuid,text,text,text,uuid,integer,text,text) from public,anon;
grant execute on function public.customer_renewal_queue(uuid,text,text,text,uuid,integer,text,text) to authenticated;

create table public.customer_record_files (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,customer_id uuid not null,record_id uuid not null,
 name text not null check(length(name) between 1 and 200),object_path text not null unique,
 size_bytes integer not null check(size_bytes between 1 and 10485760),content_type text not null check(content_type in ('application/pdf','image/jpeg','image/png')),
 created_at timestamptz not null default now(),
 foreign key(record_id,organization_id,customer_id) references public.customer_records(id,organization_id,customer_id),
 check(object_path=organization_id::text||'/'||customer_id::text||'/'||record_id::text||'/'||id::text)
);
create index customer_record_files_record_idx on public.customer_record_files(record_id,organization_id,customer_id);
alter table public.customer_record_files enable row level security;
create policy customer_files_read on public.customer_record_files for select to authenticated using(exists(select 1 from public.customer_records r where r.id=record_id and r.organization_id=customer_record_files.organization_id));
create policy customer_files_insert on public.customer_record_files for insert to authenticated with check(exists(select 1 from public.customer_records r where r.id=record_id and r.organization_id=customer_record_files.organization_id and not r.archived));
create policy customer_files_delete on public.customer_record_files for delete to authenticated using(exists(select 1 from public.customer_records r where r.id=record_id and r.organization_id=customer_record_files.organization_id));
revoke all on public.customer_record_files from public,anon,authenticated;
grant select,insert,delete on public.customer_record_files to authenticated;
grant all on public.customer_record_files to service_role;
-- Clean-install test databases do not include Storage. Hosted installs do.
do $storage$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('customer-records','customer-records',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;
  execute 'create policy customer_record_file_read on storage.objects for select to authenticated using(bucket_id=''customer-records'' and exists(select 1 from public.customer_record_files f where f.object_path=storage.objects.name))';
  execute 'create policy customer_record_file_insert on storage.objects for insert to authenticated with check(bucket_id=''customer-records'' and exists(select 1 from public.customer_record_files f join public.customer_records r on r.id=f.record_id and r.organization_id=f.organization_id where f.object_path=storage.objects.name and not r.archived))';
  execute 'create policy customer_record_file_delete on storage.objects for delete to authenticated using(bucket_id=''customer-records'' and exists(select 1 from public.customer_record_files f where f.object_path=storage.objects.name))';
 end if;
end $storage$;

-- Actual paid costs may differ from the fees billed to the customer.
alter table public.invoice_costs add column amount_override boolean not null default false;
create or replace function accounting_private.manage_record(entity text,action text,input jsonb,request_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
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
 if action='edit' and input ? 'amount' and (coalesce((input->>'amount')::numeric,0)<=0 or (input->>'amount')::numeric>=100000000 or (input->>'amount')::text in ('NaN','Infinity','-Infinity')) then raise exception 'Enter a valid expense amount.';end if;
 if action='edit' and input ? 'amount' and coalesce((row_data->>'automatic')::boolean,false) and (input->>'amount')::numeric is distinct from (row_data->>'amount')::numeric then
 if not coalesce((input->>'actual_cost_override')::boolean,false) then raise exception 'Confirm actual cost correction before changing a government fee expense.';end if;
 update public.invoice_costs set amount_override=true where id=target;
 end if;
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
 if c.amount_override and new.status='Issued' then
 if c.branch_id<>new.branch_id then raise exception 'Correct the actual cost before moving this invoice to another branch.';end if;return new;end if;
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
revoke all on function accounting_private.manage_record(text,text,jsonb,uuid),accounting_private.invoice_cost_sync() from public,anon,authenticated;
grant execute on function accounting_private.manage_record(text,text,jsonb,uuid) to authenticated;
commit;
notify pgrst,'reload schema';
