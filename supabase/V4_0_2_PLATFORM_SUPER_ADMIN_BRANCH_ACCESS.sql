-- Document Operations Platform V4.0.2
-- Allow a global Platform Super Admin (organization_id is null) to manage
-- company branches selected in Platform Management.

begin;

drop policy if exists platform_super_admin_manage_branches on public.branches;

create policy platform_super_admin_manage_branches
on public.branches
as permissive
for all
to authenticated
using (public.is_platform_super_admin())
with check (public.is_platform_super_admin());

commit;
notify pgrst, 'reload schema';
