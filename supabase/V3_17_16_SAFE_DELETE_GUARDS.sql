-- Kenza Tracker V3.17.16
-- Safe deletion guards.
-- Operational records must be removed/modified explicitly before a case can be deleted.
-- This intentionally REVERSES the V3.17.15 courier cascade behavior.

begin;

-- Courier shipment membership is protected. A document must first be removed
-- from its shipment in the Courier module.
alter table if exists public.courier_shipment_items
  drop constraint if exists courier_shipment_items_document_id_fkey;

alter table if exists public.courier_shipment_items
  add constraint courier_shipment_items_document_id_fkey
  foreign key (document_id)
  references public.documents(id)
  on delete restrict;

-- Protect operational case relationships. We keep the case's own internal
-- documents/stages/history behavior unchanged, but external workflow records
-- must not silently disappear when a case is deleted.
do $$
declare
  t text;
  r record;
  cname text;
begin
  foreach t in array array['appointments','batch_report_items','deliveries','payments','custody_movements']
  loop
    if to_regclass('public.'||t) is null then
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=t and column_name='case_id'
    ) then
      continue;
    end if;

    -- Remove any existing FK on case_id that points to public.cases.
    for r in
      select c.conname
      from pg_constraint c
      join pg_class rel on rel.oid=c.conrelid
      join pg_namespace n on n.oid=rel.relnamespace
      where c.contype='f'
        and n.nspname='public'
        and rel.relname=t
        and c.confrelid='public.cases'::regclass
        and pg_get_constraintdef(c.oid) ilike '%(case_id)%'
    loop
      execute format('alter table public.%I drop constraint %I',t,r.conname);
    end loop;

    cname:=t||'_case_id_safe_delete_fkey';
    execute format(
      'alter table public.%I add constraint %I foreign key (case_id) references public.cases(id) on delete restrict',
      t,cname
    );
  end loop;
end $$;

commit;
notify pgrst,'reload schema';
