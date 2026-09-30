-- V4.0.21: Preserve the existing tenant/branch access model while allowing
-- INSERT RETURNING to evaluate the new row. can_access_case already permits
-- every active admin/staff member to read cases within their own organization.
-- The direct predicate has the same scope for persisted rows; no cross-tenant
-- access, branch reassignment, or revoked-session access is added.
begin;
drop policy if exists cases_read on public.cases;
create policy cases_read on public.cases for select to authenticated using (
 public.is_platform_super_admin() or (
 organization_id=public.current_organization_id() and public.is_active_user() and
 (public.current_profile_role() in ('admin','staff') or branch_id=public.current_profile_branch_id() or public.can_read_case(id))
 ));
-- Existing staff inherit company modules until an administrator saves a list.
alter table public.profiles add column if not exists staff_modules text[];
create or replace function public.can_use_module(module_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_platform_super_admin() or exists(
  select 1 from public.profiles p join public.organizations o on o.id=p.organization_id
  left join public.organization_settings s on s.organization_id=p.organization_id
  where p.id=auth.uid() and p.is_active and o.status='Active' and (
   p.role='admin' or exists(
    select 1 from unnest(coalesce(p.staff_modules,array['dashboard','cases','documents','operations','deliveries','custody','appointments','batches','courier','payments','reports'])) m
    where (module_name=m or module_name='case_data')
    and (s.enabled_modules is null or s.enabled_modules ? m)
   )
  )
 );
$$;
revoke all on function public.can_use_module(text) from public,anon;
grant execute on function public.can_use_module(text) to authenticated;
do $$ declare entry record; begin
 for entry in select * from (values
 ('cases','case_data'),('documents','case_data'),('document_stages','case_data'),('case_history','case_data'),('user_favorite_cases','case_data'),
 ('appointments','appointments'),('payments','payments'),('deliveries','deliveries'),
 ('custody_transfers','custody'),('custody_transfer_items','custody'),('custody_movements','custody'),
 ('batch_reports','batches'),('batch_report_items','batches'),('courier_shipments','courier'),('courier_shipment_items','courier')
 ) as v(table_name,module_name) loop
 execute format('drop policy if exists staff_module_access on public.%I',entry.table_name);
 execute format('create policy staff_module_access on public.%I as restrictive for all to authenticated using((select public.can_use_module(%L))) with check((select public.can_use_module(%L)))',entry.table_name,entry.module_name,entry.module_name);
 end loop;
end $$;
-- Restrictive write policies also protect actions reached through another page.
drop policy if exists staff_case_write on public.cases;
create policy staff_case_write on public.cases as restrictive for insert to authenticated
with check(public.can_use_module('cases') or public.can_use_module('operations'));
drop policy if exists staff_case_update on public.cases;
create policy staff_case_update on public.cases as restrictive for update to authenticated
using(public.can_use_module('cases') or public.can_use_module('operations'))
with check(public.can_use_module('cases') or public.can_use_module('operations'));
-- The receipt RPC runs as owner, so check module authorization inside it too.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.confirm_custody_receipt(uuid,jsonb,text)'::regprocedure);
 if position('Module access denied' in definition)=0 then
  definition:=replace(definition,E'begin\n',E'begin\n if not public.can_use_module(''custody'') then raise exception ''Module access denied''; end if;\n');
  execute definition;
 end if;
end $$;
-- Canonical phone suffix supports country codes/spaces without scanning cases.
alter table public.cases add column if not exists mobile_search_key text
 generated always as (right(regexp_replace(coalesce(mobile,''),'[^0-9]','','g'),8)) stored;
create index if not exists cases_org_mobile_search_idx on public.cases(organization_id,mobile_search_key);
commit;
notify pgrst,'reload schema';
