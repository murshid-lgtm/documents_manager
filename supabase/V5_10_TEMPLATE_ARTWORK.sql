-- Allow embedded logo and letterhead artwork without changing company access rules.
begin;
do $$
declare constraint_row record;
begin
  for constraint_row in
    select conname from pg_constraint
    where conrelid = 'public.named_print_templates'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%octet_length%'
      and pg_get_constraintdef(oid) ilike '%settings%'
  loop
    execute format('alter table public.named_print_templates drop constraint %I', constraint_row.conname);
  end loop;
end $$;
alter table public.named_print_templates
  add constraint named_print_settings_artwork_limit
  check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 8388608);
commit;
notify pgrst,'reload schema';
