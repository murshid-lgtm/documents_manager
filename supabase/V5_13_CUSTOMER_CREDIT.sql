begin;
create table if not exists public.customer_credit_policies(
 organization_id uuid not null,customer_id uuid not null,credit_limit numeric(14,2) check(credit_limit>=0),
 updated_at timestamptz not null default now(),updated_by uuid not null default auth.uid(),
 primary key(organization_id,customer_id),foreign key(customer_id,organization_id) references public.crm_customers(id,organization_id)
);
alter table public.customer_credit_policies enable row level security;
revoke all on public.customer_credit_policies from anon,authenticated;
grant select,insert,update on public.customer_credit_policies to authenticated;
do $policy$ begin if not exists(select 1 from pg_policies where schemaname='public' and tablename='customer_credit_policies' and policyname='credit_read') then
 create policy credit_read on public.customer_credit_policies for select to authenticated using(exists(select 1 from public.crm_customers c where c.id=customer_id and c.organization_id=customer_credit_policies.organization_id and public.business_access(c.organization_id,c.branch_id,'sales')));
 end if;end $policy$;
do $policy$ begin if not exists(select 1 from pg_policies where schemaname='public' and tablename='customer_credit_policies' and policyname='credit_insert') then
 create policy credit_insert on public.customer_credit_policies for insert to authenticated with check(updated_by=auth.uid() and public.is_current_session_valid() and public.is_organization_admin(organization_id) and exists(select 1 from public.crm_customers c where c.id=customer_id and c.organization_id=customer_credit_policies.organization_id and public.business_access(c.organization_id,c.branch_id,'sales')));
 end if;end $policy$;
do $policy$ begin if not exists(select 1 from pg_policies where schemaname='public' and tablename='customer_credit_policies' and policyname='credit_update') then
 create policy credit_update on public.customer_credit_policies for update to authenticated using(public.is_current_session_valid() and public.is_organization_admin(organization_id)) with check(updated_by=auth.uid() and public.is_current_session_valid() and public.is_organization_admin(organization_id) and exists(select 1 from public.crm_customers c where c.id=customer_id and c.organization_id=customer_credit_policies.organization_id and public.business_access(c.organization_id,c.branch_id,'sales')));
 end if;end $policy$;
create or replace function public.customer_credit_snapshot(target_org uuid,target_customer uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 with balance as (select coalesce(sum(total),0) total,coalesce(sum(paid_total),0) paid,coalesce(sum(greatest(0,total-paid_total)),0) balance from public.sales_documents where organization_id=target_org and customer_id=target_customer and kind='Invoice' and status='Issued' and public.business_access(organization_id,branch_id,'sales')),
 policy as (select credit_limit from public.customer_credit_policies where organization_id=target_org and customer_id=target_customer)
 select to_jsonb(b)||jsonb_build_object('credit_limit',(select credit_limit from policy)) from balance b
 where exists(select 1 from public.crm_customers c where c.id=target_customer and c.organization_id=target_org and public.business_access(c.organization_id,c.branch_id,'sales'))
$$;
revoke all on function public.customer_credit_snapshot(uuid,uuid) from public,anon;
grant execute on function public.customer_credit_snapshot(uuid,uuid) to authenticated;
commit;
