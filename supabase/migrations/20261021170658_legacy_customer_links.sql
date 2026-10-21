begin;
-- Contact normalization does not infer consent or merge different names sharing a phone.
create function public.legacy_customer_phone(value text,prefix text default '974') returns text
language sql immutable security invoker set search_path='' as $$
 select case when length(p)=8 then prefix||p else p end from (select regexp_replace(regexp_replace(coalesce(value,''),'[^0-9]','','g'),'^00','') p) x;
$$;
revoke all on function public.legacy_customer_phone(text,text) from public,anon;
grant execute on function public.legacy_customer_phone(text,text) to authenticated,service_role;
create function public.link_legacy_case_customers(target_org uuid,preview boolean default true) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r record;candidate uuid;matches integer;prefix text;new_profiles integer:=0;reused integer:=0;linked integer:=0;ambiguous integer:=0;invalid integer:=0;remaining integer;group_count integer:=0;
begin
 if current_user not in ('postgres','service_role') and (not public.is_organization_admin(target_org) or not public.business_access(target_org,null,'crm') or not public.business_access(target_org,null,'cases')) then raise exception 'Only company administrators with Customers and Attestations access can link legacy customers.';end if;
 if not exists(select 1 from public.organizations where id=target_org and status='Active') then raise exception 'Company unavailable.';end if;
 perform pg_advisory_xact_lock(hashtextextended('legacy-customer-links:'||target_org::text,0));
 if not preview then perform id from public.cases where organization_id=target_org and customer_id is null and invoice_id is null order by id for update;end if;
 select country_code into prefix from public.communication_settings where organization_id=target_org;prefix:=coalesce(prefix,'974');
 for r in
  select branch_id,lower(regexp_replace(btrim(customer_name),'\s+',' ','g')) name_key,
   public.legacy_customer_phone(mobile,prefix) phone,min(btrim(customer_name)) name,
   case when count(distinct lower(nullif(btrim(customer_email),'')))=1 then min(lower(nullif(btrim(customer_email),''))) end email,
   array_agg(id order by id) case_ids,count(*) n
  from public.cases where organization_id=target_org and customer_id is null and invoice_id is null
  group by branch_id,lower(regexp_replace(btrim(customer_name),'\s+',' ','g')),public.legacy_customer_phone(mobile,prefix)
  order by branch_id,name_key,phone
 loop
  group_count:=group_count+1;
  if r.phone !~ '^[1-9][0-9]{7,14}$' or coalesce(r.name_key,'')='' then invalid:=invalid+r.n;continue;end if;
  select count(*),min(c.id::text)::uuid into matches,candidate from public.crm_customers c
   where c.organization_id=target_org and not c.archived and c.branch_id is not distinct from r.branch_id
   and lower(regexp_replace(btrim(c.name),'\s+',' ','g'))=r.name_key and public.legacy_customer_phone(c.mobile,prefix)=r.phone;
  if matches>1 then ambiguous:=ambiguous+r.n;continue;end if;
  if matches=0 then
   new_profiles:=new_profiles+1;
   if not preview then
    insert into public.crm_customers(organization_id,branch_id,name,mobile,email,email_updates,whatsapp_opt_in,marketing_opt_in)
    values(target_org,r.branch_id,r.name,r.phone,r.email,false,false,false) returning id into candidate;
   end if;
  else reused:=reused+1;end if;
  linked:=linked+r.n;
  if not preview then update public.cases set customer_id=candidate where organization_id=target_org and id=any(r.case_ids) and customer_id is null and invoice_id is null;end if;
 end loop;
 select count(*) into remaining from public.cases where organization_id=target_org and customer_id is null;
 return jsonb_build_object('preview',preview,'new_customers',new_profiles,'reused_customers',reused,'linked_cases',linked,'ambiguous_cases',ambiguous,'invalid_cases',invalid,'remaining_unlinked',case when preview then remaining-linked else remaining end);
end $$;
revoke all on function public.link_legacy_case_customers(uuid,boolean) from public,anon;
grant execute on function public.link_legacy_case_customers(uuid,boolean) to authenticated,service_role;
commit;
notify pgrst,'reload schema';
