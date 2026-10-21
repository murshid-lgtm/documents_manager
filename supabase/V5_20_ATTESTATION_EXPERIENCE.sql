begin;
create or replace function public.create_attestation_checkout(input jsonb,request_key uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare p public.cases;item jsonb;v_case_id uuid;doc_id uuid;qty integer;gov numeric;fee numeric;total numeric:=0;stage text;ordinal integer;canonical text;customer uuid;invoice uuid;lines jsonb;invoice_number text;
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
 invoice_number:=public.next_billing_number(p.organization_id,p.branch_id,'Invoice');
 p.tracking_reference:=coalesce(nullif(btrim(p.tracking_reference),''),invoice_number);
 p.tracking_family:=coalesce(nullif(btrim(p.tracking_family),''),split_part(p.tracking_reference,'/',1));
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
 values(p.organization_id,p.branch_id,customer,p.customer_name,p.mobile,p.customer_email,'Invoice','Issued','Attestation',lines,invoice_number,coalesce(p.submission_date,current_date),p.promise_date,p.tracking_reference,p.notes,request_key) returning id into invoice;
 update public.cases set invoice_id=invoice,bill_no=(select document_no from public.sales_documents where id=invoice) where id=v_case_id;
 if p.advance_paid>0 then perform public.record_sales_payment(jsonb_build_object('document_id',invoice,'amount',p.advance_paid,'method',coalesce(input->'payment'->>'method','Cash'),'account_id',input->'payment'->>'account_id'),request_key);end if;
 insert into public.case_history(organization_id,case_id,user_id,action,metadata) values(p.organization_id,v_case_id,auth.uid(),'Case created',jsonb_build_object('total_amount',total,'paid',p.advance_paid));
 return v_case_id;
end $$;
create or replace function public.communication_event_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=to_jsonb(new);prev jsonb; c public.cases%rowtype;d public.sales_documents%rowtype;cust public.crm_customers%rowtype;b public.organization_settings%rowtype;event_name text;ref text;name text;status text;email text;phone text;email_ok boolean:=false;wa_ok boolean:=false;payload jsonb;event_id text;tracking text;
begin
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

-- Defer the confirmation until checkout has linked its invoice and initial receipt.
create function public.attestation_confirmation_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.cases;d public.sales_documents;b public.organization_settings;payload jsonb;
begin
 if new.checkout_key is null then return null;end if;
 select * into c from public.cases where id=new.id and organization_id=new.organization_id;
 select * into d from public.sales_documents where id=c.invoice_id and organization_id=c.organization_id;
 if d.id is null then return null;end if;
 select * into b from public.organization_settings where organization_id=c.organization_id;
 payload:=jsonb_build_object('company',b.company_name,'name',c.customer_name,'reference',c.tracking_reference,'invoice_no',d.document_no,'status',c.overall_status,'total',d.total,'paid',d.paid_total,'balance',greatest(0,d.total-d.paid_total),'documents',(select string_agg(document_name,', ' order by created_at,id) from public.documents where case_id=c.id),'event','case_created','case_id',c.id,'customer_id',c.customer_id,'tracking_base',b.tracking_base_url,'date',c.submission_date);
 perform public.enqueue_customer_update(c.organization_id,'case_created','cases:'||c.id::text||':created',c.customer_email,c.email_updates,c.mobile,c.whatsapp_opt_in,payload);
 return null;
end $$;
revoke all on function public.attestation_confirmation_trigger() from public,anon,authenticated;
create constraint trigger attestation_confirmation after insert on public.cases deferrable initially deferred for each row execute function public.attestation_confirmation_trigger();

alter table public.service_requests add column request_details jsonb not null default '{}' check(jsonb_typeof(request_details)='object' and octet_length(request_details::text)<=12000);
create function public.submit_customer_service_enquiry(invitation uuid,details jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.service_requests;service uuid;lead uuid;channel text:=coalesce(details->>'contact_method','Email');preferred date;note text:=coalesce(details->>'notes','');
begin
 if jsonb_typeof(details) is distinct from 'object' or length(note)>3000 or channel not in ('Email','Phone','WhatsApp') then raise exception 'Check the enquiry details.';end if;
 select * into r from public.service_requests where id=invitation for update;
 if r.id is null or r.status='Cancelled' or r.expires_at<now() then raise exception 'This request is unavailable.';end if;
 if r.lead_id is not null then return r.lead_id;end if;
 if nullif(details->>'preferred_date','') is not null then preferred:=(details->>'preferred_date')::date;if preferred<current_date or preferred>current_date+365 then raise exception 'Choose a date within the next year.';end if;end if;
 service:=coalesce(nullif(details->>'service_id','')::uuid,r.service_id);
 if service is not null and not exists(select 1 from public.service_catalog where id=service and organization_id=r.organization_id and is_active) then raise exception 'Choose an available service.';end if;
 update public.service_requests set service_id=service,request_details=jsonb_build_object('contact_method',channel,'preferred_date',preferred,'notes',note) where id=r.id;
 lead:=public.submit_customer_service_request(invitation);
 update public.crm_leads set notes='Customer requested a service using their private request link.'||chr(10)||'Preferred contact: '||channel||case when preferred is not null then chr(10)||'Preferred date: '||preferred::text else '' end||case when note<>'' then chr(10)||'Customer note: '||note else '' end where id=lead and organization_id=r.organization_id;
 return lead;
end $$;
revoke all on function public.submit_customer_service_enquiry(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.submit_customer_service_enquiry(uuid,jsonb) to service_role;

commit;
notify pgrst,'reload schema';
