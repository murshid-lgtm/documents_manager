-- Kenza Tracker V3.22.1 — branch-aware custody access
-- Run once after V3_22_CUSTODY_TRANSFER_WORKFLOW.sql.

begin;

alter table public.custody_transfers
  add column if not exists from_branch_id uuid references public.branches(id) on delete set null,
  add column if not exists to_branch_id uuid references public.branches(id) on delete set null;

create index if not exists custody_transfers_branches_idx
  on public.custody_transfers(from_branch_id, to_branch_id, status);

update public.custody_transfers t
set from_branch_id=b.id
from public.branches b
where t.from_branch_id is null
  and trim(regexp_replace(lower(t.from_location), '\s+branch$', ''))
      = trim(regexp_replace(lower(b.name), '\s+branch$', ''));

update public.custody_transfers t
set to_branch_id=b.id
from public.branches b
where t.to_branch_id is null
  and trim(regexp_replace(lower(t.to_location), '\s+branch$', ''))
      = trim(regexp_replace(lower(b.name), '\s+branch$', ''));

drop policy if exists "authenticated custody transfers" on public.custody_transfers;
drop policy if exists "custody transfer branch read" on public.custody_transfers;
drop policy if exists "custody transfer branch create" on public.custody_transfers;
drop policy if exists "custody transfer destination update" on public.custody_transfers;
drop policy if exists "custody transfer admin delete" on public.custody_transfers;

create policy "custody transfer branch read" on public.custody_transfers
  for select to authenticated using (
    public.is_kenza_admin()
    or from_branch_id=public.current_profile_branch_id()
    or to_branch_id=public.current_profile_branch_id()
  );

create policy "custody transfer branch create" on public.custody_transfers
  for insert to authenticated with check (
    public.is_kenza_admin()
    or from_branch_id=public.current_profile_branch_id()
  );

create policy "custody transfer destination update" on public.custody_transfers
  for update to authenticated using (
    public.is_kenza_admin()
    or to_branch_id=public.current_profile_branch_id()
  ) with check (
    public.is_kenza_admin()
    or to_branch_id=public.current_profile_branch_id()
  );

create policy "custody transfer admin delete" on public.custody_transfers
  for delete to authenticated using (public.is_kenza_admin());

commit;
notify pgrst, 'reload schema';
