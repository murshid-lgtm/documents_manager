begin;
-- Candidates are scoped by the caller's conversation and customer row policies.
create function public.whatsapp_customer_matches(target_conversation uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare c public.whatsapp_conversations;prefix text;result jsonb;
begin
 select * into c from public.whatsapp_conversations where id=target_conversation;
 if c.id is null or not public.is_current_session_valid() or not public.is_organization_admin(c.organization_id) then raise exception 'Only company administrators can manage customer links.';end if;
 select country_code into prefix from public.communication_settings where organization_id=c.organization_id;prefix:=coalesce(prefix,'974');
 select coalesce(jsonb_agg(to_jsonb(m) order by lower(m.name),m.id),'[]'::jsonb) into result from (
  select u.id,u.name,u.mobile,u.email,u.customer_type,u.company,u.branch_id,b.name branch_name
  from public.crm_customers u left join public.branches b on b.id=u.branch_id and b.organization_id=u.organization_id
  where u.organization_id=c.organization_id and not u.archived and
  (case when length(regexp_replace(coalesce(u.mobile,''),'[^0-9]','','g'))=8 then prefix||regexp_replace(u.mobile,'[^0-9]','','g') else regexp_replace(regexp_replace(coalesce(u.mobile,''),'[^0-9]','','g'),'^00','') end)=c.peer
 ) m;
 return jsonb_build_object('matches',result,'peer',c.peer);
end $$;
revoke all on function public.whatsapp_customer_matches(uuid) from public,anon;
grant execute on function public.whatsapp_customer_matches(uuid) to authenticated;
create schema if not exists whatsapp_private;
revoke all on schema whatsapp_private from public,anon;
grant usage on schema whatsapp_private to authenticated,service_role;
create function whatsapp_private.create_customer_from_chat(target_conversation uuid,input jsonb,request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.whatsapp_conversations;p public.profiles;branch uuid;prefix text;customer uuid;assigned uuid;
begin
 select * into p from public.profiles where id=auth.uid() and is_active;
 if p.id is null or p.role<>'admin' or not public.is_current_session_valid() then raise exception 'Only company administrators can add customers from WhatsApp.';end if;
 select * into c from public.whatsapp_conversations where id=target_conversation for update;
 if c.id is null or not public.is_organization_admin(c.organization_id) or not public.whatsapp_inbox_access(c.organization_id,c.branch_id) then raise exception 'Conversation unavailable.';end if;
 if request_key is null or jsonb_typeof(input) is distinct from 'object' then raise exception 'Choose valid customer details.';end if;
 -- Serialize intake across sender numbers using the same customer phone.
 perform pg_advisory_xact_lock(hashtextextended('whatsapp-customer:'||c.organization_id::text||':'||c.peer,0));
 if c.customer_id is not null then
  if c.customer_id=request_key and exists(select 1 from public.crm_customers where id=request_key and organization_id=c.organization_id and not archived) then return jsonb_build_object('customer_id',request_key,'created',false);end if;
  raise exception 'This conversation is already linked. Refresh the customer details.';
 end if;
 if exists(select 1 from public.crm_customers where id=request_key) then raise exception 'This request has already been used. Refresh the customer details.';end if;
 branch:=coalesce(nullif(input->>'branch_id','')::uuid,c.branch_id);
 if branch is null or not exists(select 1 from public.branches where id=branch and organization_id=c.organization_id and is_active) then raise exception 'Choose an active branch in this company.';end if;
 if coalesce(length(btrim(input->>'name')),0) not between 1 and 200 then raise exception 'Enter a customer name of up to 200 characters.';end if;
 if coalesce(input->>'customer_type','Personal') not in('Personal','Company') then raise exception 'Choose Personal or Company.';end if;
 if length(coalesce(input->>'email',''))>320 or (nullif(btrim(input->>'email'),'') is not null and btrim(input->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Enter a valid email address.';end if;
 if length(coalesce(input->>'company',''))>200 then raise exception 'Keep the company name within 200 characters.';end if;
 select country_code into prefix from public.communication_settings where organization_id=c.organization_id;prefix:=coalesce(prefix,'974');
 if exists(select 1 from public.crm_customers u where u.organization_id=c.organization_id and not u.archived and
  (case when length(regexp_replace(coalesce(u.mobile,''),'[^0-9]','','g'))=8 then prefix||regexp_replace(u.mobile,'[^0-9]','','g') else regexp_replace(regexp_replace(coalesce(u.mobile,''),'[^0-9]','','g'),'^00','') end)=c.peer)
 then raise exception 'A customer already uses this WhatsApp number. Choose an existing match.';end if;
 customer:=public.quick_add_customer(jsonb_build_object('organization_id',c.organization_id,'branch_id',branch,'name',btrim(input->>'name'),'mobile','+'||c.peer,'email',nullif(btrim(input->>'email'),''),'customer_type',coalesce(input->>'customer_type','Personal'),'company',input->>'company'),request_key);
 assigned:=c.assigned_to;
 if assigned is not null and not exists(select 1 from public.profiles where id=assigned and is_active and organization_id=c.organization_id and (role='admin' or branch_id=branch)) then assigned:=null;end if;
 update public.whatsapp_conversations set customer_id=customer,branch_id=branch,assigned_to=assigned,updated_at=now() where id=c.id;
 insert into public.whatsapp_conversation_audit(conversation_id,created_by,action) values(c.id,p.id,'Customer created and linked');
 return jsonb_build_object('customer_id',customer,'created',true);
end $$;
revoke all on function whatsapp_private.create_customer_from_chat(uuid,jsonb,uuid) from public,anon;
grant execute on function whatsapp_private.create_customer_from_chat(uuid,jsonb,uuid) to authenticated;
create function public.create_whatsapp_customer(target_conversation uuid,input jsonb,request_key uuid) returns jsonb language sql security invoker set search_path='' as $$select whatsapp_private.create_customer_from_chat(target_conversation,input,request_key)$$;
revoke all on function public.create_whatsapp_customer(uuid,jsonb,uuid) from public,anon;
grant execute on function public.create_whatsapp_customer(uuid,jsonb,uuid) to authenticated;
commit;
notify pgrst,'reload schema';
