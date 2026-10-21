begin;
-- Display names are separate from object paths, so renaming never breaks sent email URLs.
create table public.email_image_assets(
 organization_id uuid not null references public.organizations(id),object_name text not null,
 name text not null check(length(btrim(name)) between 1 and 120),size_bytes integer not null default 0,
 created_at timestamptz not null default now(),primary key(organization_id,object_name),
 check(object_name !~ '[/\\]' and object_name ~ '^[a-f0-9-]{36}.*\.png$')
);
alter table public.email_image_assets enable row level security;
revoke all on public.email_image_assets from public,anon,authenticated;
grant select on public.email_image_assets to authenticated;
grant all on public.email_image_assets to service_role;
create policy email_image_admin_read on public.email_image_assets for select to authenticated using(public.is_organization_admin(organization_id));
create index email_image_assets_org_created on public.email_image_assets(organization_id,created_at desc,object_name);
do $$ begin
 if to_regclass('storage.objects') is not null then
  insert into public.email_image_assets(organization_id,object_name,name,size_bytes,created_at)
  select o.id,split_part(s.name,'/',3),left(coalesce(nullif(regexp_replace(split_part(s.name,'/',3),'^[a-f0-9-]{36}-?|\.png$','','gi'),''),'Email image'),120),coalesce((to_jsonb(s)->'metadata'->>'size')::integer,0),coalesce((to_jsonb(s)->>'created_at')::timestamptz,now())
  from storage.objects s join public.organizations o on o.id::text=split_part(s.name,'/',1)
  where s.bucket_id='branding-assets' and split_part(s.name,'/',2)='email' and split_part(s.name,'/',3) ~ '^[a-f0-9-]{36}.*\.png$' and split_part(s.name,'/',4)=''
  on conflict do nothing;
 end if;
end $$;
commit;
notify pgrst,'reload schema';
