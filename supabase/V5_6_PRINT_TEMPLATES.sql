begin;
create table public.organization_print_settings(
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 templates jsonb not null default '{}' check(jsonb_typeof(templates)='object' and octet_length(templates::text)<=16000),
 updated_at timestamptz not null default now()
);
alter table public.organization_print_settings enable row level security;
revoke all on public.organization_print_settings from public,anon,authenticated;
grant select,insert,update on public.organization_print_settings to authenticated;
create policy print_templates_read on public.organization_print_settings for select to authenticated
 using(public.business_access(organization_id,public.current_profile_branch_id(),'sales') or public.business_access(organization_id,public.current_profile_branch_id(),'cases') or public.business_access(organization_id,public.current_profile_branch_id(),'payments') or public.business_access(organization_id,public.current_profile_branch_id(),'deliveries') or(public.is_current_session_valid() and public.is_organization_admin(organization_id)));
create policy print_templates_insert on public.organization_print_settings for insert to authenticated
 with check(public.is_current_session_valid() and public.is_organization_admin(organization_id));
create policy print_templates_update on public.organization_print_settings for update to authenticated
 using(public.is_current_session_valid() and public.is_organization_admin(organization_id))
 with check(public.is_current_session_valid() and public.is_organization_admin(organization_id));
create function public.validate_print_templates() returns trigger language plpgsql security invoker set search_path='' as $$
declare k text;t jsonb;f text;
begin
 for k,t in select * from jsonb_each(new.templates) loop
 if k not in('invoice','receipt','delivery','report') or jsonb_typeof(t) is distinct from 'object' then raise exception 'Choose a valid document template.';end if;
 if t?'paper' and t->>'paper' not in('A4','A5','58mm','80mm') or t?'style' and t->>'style' not in('Modern','Classic','Minimal') then raise exception 'Choose a supported paper size and template style.';end if;
 if t?'font_size' and ((t->>'font_size')::numeric not between 8 and 16) or t?'margin' and ((t->>'margin')::numeric not between 0 and 20) then raise exception 'Choose a font size from 8 to 16 and a margin from 0 to 20 mm.';end if;
 foreach f in array array['title','footer','terms'] loop if t?f and length(t->>f)>(case when f='title' then 100 else 2000 end) then raise exception 'Template text is too long.';end if;end loop;
 end loop;
 new.updated_at:=now();return new;
end $$;
revoke all on function public.validate_print_templates() from public,anon,authenticated;
create trigger print_template_validation before insert or update on public.organization_print_settings for each row execute function public.validate_print_templates();
commit;
notify pgrst,'reload schema';
