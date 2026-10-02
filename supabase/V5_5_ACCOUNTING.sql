-- Additive, branch-scoped accounting. Ledger writes are server controlled.
begin;
create schema if not exists accounting_private;
revoke all on schema accounting_private from public,anon;
grant usage on schema accounting_private to authenticated;
create table public.finance_accounts (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 code text not null,name text not null check(length(btrim(name)) between 1 and 120),
 kind text not null check(kind in ('Asset','Liability','Equity','Income','Expense')),is_cash boolean not null default false,
 unique(organization_id,code),unique(id,organization_id)
);
create table public.finance_suppliers (
 id uuid primary key,organization_id uuid not null references public.organizations(id),branch_id uuid not null references public.branches(id),
 name text not null check(length(btrim(name)) between 1 and 200),mobile text,email text,address text,archived boolean not null default false,
 created_at timestamptz not null default now(),unique(id,organization_id)
);
create table public.finance_bills (
 id uuid primary key,organization_id uuid not null references public.organizations(id),branch_id uuid not null references public.branches(id),supplier_id uuid,
 kind text not null check(kind in ('Expense','Purchase')),document_no text not null check(length(btrim(document_no)) between 1 and 80),
 description text not null check(length(btrim(description)) between 1 and 500),category text not null default 'Operating expenses',
 net_amount numeric(14,2) not null check(net_amount>0 and net_amount<100000000),tax_amount numeric(14,2) not null default 0 check(tax_amount>=0 and tax_amount<100000000),
 total numeric(14,2) generated always as(net_amount+tax_amount) stored,
 paid_total numeric(14,2) not null default 0 check(paid_total>=0 and paid_total<=net_amount+tax_amount),
 bill_date date not null default current_date,due_date date,notes text,status text not null default 'Posted' check(status in ('Posted','Voided')),
 void_reason text,created_at timestamptz not null default now(),created_by uuid not null references public.profiles(id),
 unique(id,organization_id),unique(organization_id,document_no),foreign key(supplier_id,organization_id) references public.finance_suppliers(id,organization_id)
);
create table public.finance_payments (
 id uuid primary key,organization_id uuid not null references public.organizations(id),branch_id uuid not null references public.branches(id),bill_id uuid not null,
 account_id uuid not null,amount numeric(14,2) not null check(amount>0 and amount<100000000),reference text,paid_on date not null default current_date,
 created_at timestamptz not null default now(),created_by uuid not null references public.profiles(id),
 unique(id,organization_id),foreign key(bill_id,organization_id) references public.finance_bills(id,organization_id),foreign key(account_id,organization_id) references public.finance_accounts(id,organization_id)
);
create table public.finance_journals (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),branch_id uuid not null references public.branches(id),
 entry_date date not null,source text not null,source_id uuid not null,description text not null,
 snapshot jsonb not null,reversal_of uuid unique,created_at timestamptz not null default now(),created_by uuid references public.profiles(id),
 unique(id,organization_id),foreign key(reversal_of,organization_id) references public.finance_journals(id,organization_id)
);
create table public.finance_lines (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,branch_id uuid not null references public.branches(id),journal_id uuid not null,account_id uuid not null,
 debit numeric(14,2) not null default 0 check(debit>=0 and debit<100000000),credit numeric(14,2) not null default 0 check(credit>=0 and credit<100000000),
 check((debit>0 and credit=0) or(credit>0 and debit=0)),
 foreign key(journal_id,organization_id) references public.finance_journals(id,organization_id),foreign key(account_id,organization_id) references public.finance_accounts(id,organization_id)
);
create index finance_journals_scope on public.finance_journals(organization_id,branch_id,entry_date);
create index finance_journals_source on public.finance_journals(organization_id,source,source_id);
create index finance_lines_journal on public.finance_lines(journal_id);
create index finance_lines_account on public.finance_lines(organization_id,account_id,branch_id);
create index finance_bills_scope on public.finance_bills(organization_id,branch_id,bill_date);
create index finance_suppliers_scope on public.finance_suppliers(organization_id,branch_id);
create index finance_payments_bill on public.finance_payments(bill_id);
do $$declare t text;begin
 foreach t in array array['finance_accounts','finance_suppliers','finance_bills','finance_payments','finance_journals','finance_lines'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy finance_read on public.%I for select to authenticated using(public.business_access(organization_id,%s,''sales''))',t,case when t='finance_accounts' then 'public.current_profile_branch_id()' else 'branch_id' end);
 end loop;
end $$;
-- No direct client inserts/updates: RPCs check the live session, tenant, branch and resource.
create function accounting_private.chart(org uuid) returns void language plpgsql security invoker set search_path='' as $$begin
 insert into public.finance_accounts(organization_id,code,name,kind,is_cash) values
 (org,'1000','Cash','Asset',true),(org,'1010','Bank','Asset',true),(org,'1020','Card clearing','Asset',true),(org,'1090','Other collections','Asset',true),
 (org,'1100','Customer receivables','Asset',false),(org,'1200','Input tax','Asset',false),
 (org,'2000','Supplier payables','Liability',false),(org,'2100','Output tax','Liability',false),(org,'3000','Opening balance equity','Equity',false),
 (org,'4000','Service and sales income','Income',false),(org,'4010','Government fee recovery','Income',false),
 (org,'5000','Operating expenses','Expense',false),(org,'5100','Purchases and service costs','Expense',false)
 on conflict(organization_id,code) do nothing;
end $$;
create function accounting_private.post(org uuid,branch uuid,dated date,src text,sid uuid,label text,entries jsonb,reverse_id uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare jid uuid:=gen_random_uuid();entry jsonb;acc uuid;d numeric;c numeric;net numeric:=0;
begin
 if jsonb_typeof(entries) is distinct from 'array' then raise exception 'Invalid accounting entry.';end if;
 perform accounting_private.chart(org);
 for entry in select jsonb_array_elements(entries) loop
 d:=coalesce((entry->>'debit')::numeric,0);c:=coalesce((entry->>'credit')::numeric,0);
 if d::text in('NaN','Infinity','-Infinity') or c::text in('NaN','Infinity','-Infinity') or d<0 or c<0 or d>=100000000 or c>=100000000 or d<>round(d,2) or c<>round(c,2) then raise exception 'Invalid accounting amount.';end if;
 net:=net+d-c;
 end loop;
 if net<>0 then raise exception 'Accounting entry does not balance.';end if;
 if not exists(select 1 from public.branches where id=branch and organization_id=org) then raise exception 'Choose an active branch in this company.';end if;
 insert into public.finance_journals(id,organization_id,branch_id,entry_date,source,source_id,description,snapshot,reversal_of,created_by)
 values(jid,org,branch,dated,src,sid,label,entries,reverse_id,auth.uid());
 for entry in select jsonb_array_elements(entries) loop
 d:=coalesce((entry->>'debit')::numeric,0);c:=coalesce((entry->>'credit')::numeric,0);if d=0 and c=0 then continue;end if;
 select id into acc from public.finance_accounts where organization_id=org and code=entry->>'code';if acc is null then raise exception 'Choose an available accounting account.';end if;
 insert into public.finance_lines(organization_id,branch_id,journal_id,account_id,debit,credit) values(org,branch,jid,acc,d,c);
 end loop;
 return jid;
end $$;
create function accounting_private.reverse_entry(jid uuid,reason text) returns void language plpgsql security invoker set search_path='' as $$
declare j public.finance_journals;entries jsonb;
begin
 select * into j from public.finance_journals where id=jid for update;if not found or exists(select 1 from public.finance_journals where reversal_of=jid) then return;end if;
 select jsonb_agg(jsonb_build_object('code',x->>'code','debit',coalesce((x->>'credit')::numeric,0),'credit',coalesce((x->>'debit')::numeric,0))) into entries from jsonb_array_elements(j.snapshot) x;
 perform accounting_private.post(j.organization_id,j.branch_id,current_date,'Reversal',j.id,reason,entries,j.id);
end $$;
create function accounting_private.invoice_post(d public.sales_documents) returns void language plpgsql security invoker set search_path='' as $$
declare old_j public.finance_journals;entries jsonb;gov numeric:=0;tax numeric;net numeric;
begin
 if d.kind<>'Invoice' or d.branch_id is null then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('invoice-ledger:'||d.id::text,0));
 select * into old_j from public.finance_journals j where source='Invoice' and source_id=d.id and not exists(select 1 from public.finance_journals r where r.reversal_of=j.id) order by created_at desc limit 1;
 if d.status='Cancelled' or (d.status='Draft' and d.paid_total=0) or d.total=0 then if old_j.id is not null then perform accounting_private.reverse_entry(old_j.id,'Invoice cancelled or replaced');end if;return;end if;
 net:=d.subtotal-d.discount;tax:=d.total-net;
 select coalesce(sum(coalesce((x->>'government_fee')::numeric,0)*(x->>'quantity')::numeric),0) into gov from jsonb_array_elements(d.items) x;
 gov:=case when d.subtotal>0 then round(least(gov,d.subtotal)*net/d.subtotal,2) else 0 end;
 entries:=jsonb_build_array(jsonb_build_object('code','1100','debit',d.total),jsonb_build_object('code','4000','credit',net-gov),jsonb_build_object('code','4010','credit',gov),jsonb_build_object('code','2100','credit',tax));
 if old_j.id is not null and old_j.snapshot=entries then return;end if;
 if old_j.id is not null then perform accounting_private.reverse_entry(old_j.id,'Invoice corrected');end if;
 perform accounting_private.post(d.organization_id,d.branch_id,case when old_j.id is null then d.created_at::date else current_date end,'Invoice',d.id,'Invoice '||d.document_no,entries);
end $$;
create function accounting_private.payment_post(p public.sales_payments) returns void language plpgsql security invoker set search_path='' as $$
declare j uuid;code text;
begin
 perform pg_advisory_xact_lock(hashtextextended('receipt-ledger:'||p.id::text,0));
 select id into j from public.finance_journals x where source='Receipt' and source_id=p.id and not exists(select 1 from public.finance_journals r where r.reversal_of=x.id) limit 1;
 if p.voided then if j is not null then perform accounting_private.reverse_entry(j,'Customer receipt voided');end if;return;end if;
 if j is not null then return;end if;
 code:=case p.method when 'Cash' then '1000' when 'Card' then '1020' when 'Bank transfer' then '1010' else '1090' end;
 perform accounting_private.post(p.organization_id,p.branch_id,p.received_at::date,'Receipt',p.id,'Customer payment',jsonb_build_array(jsonb_build_object('code',code,'debit',p.amount),jsonb_build_object('code','1100','credit',p.amount)));
end $$;
-- Trigger execution is privileged solely to write immutable ledger tables; authorisation is checked explicitly.
create function accounting_private.sales_post_trigger() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='sales_documents' and to_jsonb(new)->>'kind'<>'Invoice' then return new;end if;
 if auth.uid() is not null and not public.business_access(new.organization_id,new.branch_id,'sales') then raise exception 'Accounting access denied.';end if;
 if tg_table_name='sales_documents' then perform accounting_private.invoice_post(new);else perform accounting_private.payment_post(new);end if;
 return new;
end $$;
create trigger zz_invoice_accounting after insert or update on public.sales_documents for each row execute function accounting_private.sales_post_trigger();
create trigger zz_receipt_accounting after insert or update on public.sales_payments for each row execute function accounting_private.sales_post_trigger();
create function accounting_private.invoice_delete_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.finance_journals where source='Invoice' and source_id=old.id) then raise exception 'Posted invoices cannot be deleted. Cancel an unpaid invoice to keep its history.';end if;return old;
end $$;
create trigger invoice_ledger_delete before delete on public.sales_documents for each row execute function accounting_private.invoice_delete_guard();
create function accounting_private.command(action text,input jsonb,request_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=(input->>'organization_id')::uuid;branch uuid:=(input->>'branch_id')::uuid;result uuid;bill public.finance_bills;
 amount numeric;tax numeric;paid numeric;acc public.finance_accounts;supplier public.finance_suppliers;entries jsonb;code text;j uuid;ref text;dated date;dest public.finance_accounts;d public.sales_documents;p public.sales_payments;
begin
 if auth.uid() is null or request_key is null or not public.business_access(org,branch,'sales') then raise exception 'Accounting access denied.';end if;
 if not exists(select 1 from public.branches where id=branch and organization_id=org and is_active) then raise exception 'Choose an active branch in this company.';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||request_key::text,0));
 perform accounting_private.chart(org);
 if action='setup' then return request_key;end if;
 if action='supplier' then
 select id into result from public.finance_suppliers where id=request_key and organization_id=org and branch_id=branch;if result is not null then return result;end if;
 insert into public.finance_suppliers(id,organization_id,branch_id,name,mobile,email,address) values(request_key,org,branch,btrim(input->>'name'),nullif(btrim(input->>'mobile'),''),nullif(btrim(input->>'email'),''),nullif(btrim(input->>'address'),''));return request_key;
 elsif action='supplier_edit' then
 select * into supplier from public.finance_suppliers where id=(input->>'supplier_id')::uuid and organization_id=org and branch_id=branch for update;if not found then raise exception 'Choose a supplier available in this branch.';end if;
 update public.finance_suppliers set name=btrim(input->>'name'),mobile=nullif(btrim(input->>'mobile'),''),email=nullif(btrim(input->>'email'),''),address=nullif(btrim(input->>'address'),''),archived=coalesce((input->>'archived')::boolean,false) where id=supplier.id;return supplier.id;
 elsif action='sync' then
 if not public.is_organization_admin(org) then raise exception 'Only a company administrator can sync accounting records.';end if;
 for d in select * from public.sales_documents where organization_id=org and branch_id=branch and kind='Invoice' order by created_at loop perform accounting_private.invoice_post(d);end loop;
 for p in select * from public.sales_payments where organization_id=org and branch_id=branch order by received_at loop perform accounting_private.payment_post(p);end loop;
 return request_key;
 elsif action='void' then
 if not public.is_organization_admin(org) or length(btrim(coalesce(input->>'reason',''))) not between 5 and 500 then raise exception 'Only a company administrator can void a bill. Enter a reason of at least five characters.';end if;
 select * into bill from public.finance_bills where id=(input->>'bill_id')::uuid and organization_id=org and branch_id=branch for update;
 if not found then raise exception 'Choose a bill available in this branch.';end if;if bill.status='Voided' then return bill.id;end if;
 if bill.paid_total>0 then raise exception 'A paid bill cannot be voided. Record a supplier refund instead.';end if;
 select id into j from public.finance_journals where source=bill.kind and source_id=bill.id and reversal_of is null limit 1;
 perform accounting_private.reverse_entry(j,btrim(input->>'reason'));update public.finance_bills set status='Voided',void_reason=btrim(input->>'reason') where id=bill.id;return bill.id;
 end if;
 -- Every money input is validated server-side, including non-finite JSON strings.
 amount:=round(coalesce((input->>'amount')::numeric,0),2);tax:=round(coalesce((input->>'tax_amount')::numeric,0),2);paid:=round(coalesce((input->>'paid')::numeric,0),2);
 if amount::text in('NaN','Infinity','-Infinity') or tax::text in('NaN','Infinity','-Infinity') or paid::text in('NaN','Infinity','-Infinity') or amount<0 or (amount=0 and action<>'account') or amount>=100000000 or tax<0 or tax>=100000000 or paid<0 or paid>amount+tax then raise exception 'Enter valid amounts and a payment within the bill total.';end if;
 dated:=coalesce(nullif(input->>'date','')::date,current_date);
 if action in('account','transfer') then
 if not public.is_organization_admin(org) then raise exception 'Only a company administrator can manage cash and bank accounts.';end if;
 end if;
 if action='account' then
 select id into result from public.finance_accounts where id=request_key and organization_id=org;if result is not null then return result;end if;
 insert into public.finance_accounts(id,organization_id,code,name,kind,is_cash) values(request_key,org,'BANK-'||request_key::text,btrim(input->>'name'),'Asset',true);
 if amount>0 then perform accounting_private.post(org,branch,dated,'Opening',request_key,'Opening balance',jsonb_build_array(jsonb_build_object('code','BANK-'||request_key::text,'debit',amount),jsonb_build_object('code','3000','credit',amount)));end if;return request_key;
 elsif action='bill' then
 select id into result from public.finance_bills where id=request_key and organization_id=org and branch_id=branch;if result is not null then return result;end if;
 if coalesce(input->>'kind','') not in('Expense','Purchase') then raise exception 'Choose an expense or purchase.';end if;
 if nullif(input->>'supplier_id','') is not null then
 select * into supplier from public.finance_suppliers where id=(input->>'supplier_id')::uuid and organization_id=org and branch_id=branch and not archived;if not found then raise exception 'Choose a supplier available in this branch.';end if;
 elsif input->>'kind'='Purchase' then raise exception 'Choose a supplier for this purchase.';end if;
 ref:=coalesce(nullif(btrim(input->>'document_no'),''),case input->>'kind' when 'Purchase' then 'PUR-' else 'EXP-' end||upper(right(replace(request_key::text,'-',''),12)));
 insert into public.finance_bills(id,organization_id,branch_id,supplier_id,kind,document_no,description,category,net_amount,tax_amount,bill_date,due_date,notes,created_by)
 values(request_key,org,branch,supplier.id,input->>'kind',ref,btrim(input->>'description'),coalesce(nullif(btrim(input->>'category'),''),'Operating expenses'),amount,tax,dated,nullif(input->>'due_date','')::date,input->>'notes',auth.uid());
 code:=case input->>'kind' when 'Purchase' then '5100' else '5000' end;
 perform accounting_private.post(org,branch,dated,input->>'kind',request_key,ref||' · '||btrim(input->>'description'),jsonb_build_array(jsonb_build_object('code',code,'debit',amount),jsonb_build_object('code','1200','debit',tax),jsonb_build_object('code','2000','credit',amount+tax)));
 if paid=0 then return request_key;end if;
 select * into bill from public.finance_bills where id=request_key for update;amount:=paid;
 elsif action='pay' then
 select bill_id into result from public.finance_payments where id=request_key and organization_id=org and branch_id=branch;if result is not null then return result;end if;
 select * into bill from public.finance_bills where id=(input->>'bill_id')::uuid and organization_id=org and branch_id=branch for update;
 if not found or bill.status='Voided' then raise exception 'Choose a bill available in this branch.';end if;
 if amount>bill.total-bill.paid_total then raise exception 'Payment exceeds the outstanding bill balance.';end if;
 elsif action='transfer' then
 select id into result from public.finance_journals where source='Transfer' and source_id=request_key and organization_id=org and branch_id=branch;if result is not null then return result;end if;
 select * into acc from public.finance_accounts where id=(input->>'account_id')::uuid and organization_id=org and is_cash;
 select * into dest from public.finance_accounts where id=(input->>'destination_id')::uuid and organization_id=org and is_cash;
 if acc.id is null or dest.id is null or acc.id=dest.id then raise exception 'Choose two different cash or bank accounts.';end if;
 return accounting_private.post(org,branch,dated,'Transfer',request_key,'Cash / bank transfer',jsonb_build_array(jsonb_build_object('code',dest.code,'debit',amount),jsonb_build_object('code',acc.code,'credit',amount)));
 else raise exception 'Choose an available accounting action.';end if;
 select * into acc from public.finance_accounts where id=(input->>'account_id')::uuid and organization_id=org and is_cash;
 if acc.id is null then raise exception 'Choose an available cash or bank account.';end if;
 insert into public.finance_payments(id,organization_id,branch_id,bill_id,account_id,amount,reference,paid_on,created_by) values(request_key,org,branch,bill.id,acc.id,amount,input->>'reference',dated,auth.uid());
 perform accounting_private.post(org,branch,dated,'Supplier payment',request_key,'Payment for '||bill.document_no,jsonb_build_array(jsonb_build_object('code','2000','debit',amount),jsonb_build_object('code',acc.code,'credit',amount)));
 update public.finance_bills set paid_total=paid_total+amount where id=bill.id;return bill.id;
end $$;
create function public.finance_command(action text,input jsonb,request_key uuid) returns uuid language sql security invoker set search_path='' as $$select accounting_private.command(action,input,request_key)$$;
revoke all on all functions in schema accounting_private from public,anon,authenticated;
grant execute on function accounting_private.command(text,jsonb,uuid) to authenticated;
revoke all on function public.finance_command(text,jsonb,uuid) from public,anon;
grant execute on function public.finance_command(text,jsonb,uuid) to authenticated;
create function public.finance_report(org uuid,branch uuid,from_date date,to_date date)
returns table(account_id uuid,code text,name text,kind text,is_cash boolean,debit numeric,credit numeric,opening numeric,closing numeric)
language sql stable security invoker set search_path='' as $$
 select a.id,a.code,a.name,a.kind,a.is_cash,
 coalesce(sum(l.debit) filter(where j.entry_date between from_date and to_date),0),
 coalesce(sum(l.credit) filter(where j.entry_date between from_date and to_date),0),
 coalesce(sum(l.debit-l.credit) filter(where j.entry_date<from_date),0),coalesce(sum(l.debit-l.credit) filter(where j.id is not null),0)
 from public.finance_accounts a left join public.finance_lines l on l.account_id=a.id and l.organization_id=org and(branch is null or l.branch_id=branch)
 left join public.finance_journals j on j.id=l.journal_id and j.entry_date<=to_date
 where a.organization_id=org
 group by a.id,a.code,a.name,a.kind,a.is_cash order by a.code
$$;
revoke all on function public.finance_report(uuid,uuid,date,date) from public,anon;
grant execute on function public.finance_report(uuid,uuid,date,date) to authenticated;
commit;
notify pgrst,'reload schema';
