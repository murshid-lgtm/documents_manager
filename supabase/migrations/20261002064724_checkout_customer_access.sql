do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='crm_customers' and policyname='checkout_customer_insert') then
  create policy checkout_customer_insert on public.crm_customers for insert to authenticated with check(public.business_customer_access(organization_id,branch_id));
 end if;
end $$;
