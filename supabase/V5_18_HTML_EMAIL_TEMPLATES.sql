begin;
alter table public.email_templates add column content_format text not null default 'text' check(content_format in ('text','html'));
alter table public.email_templates drop constraint email_templates_body_check;
alter table public.email_templates add constraint email_templates_body_check check(length(body) between 1 and case when content_format='html' then 100000 else 10000 end);
create or replace function accounting_private.save_workspace_email_template(target_org uuid,input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid:=coalesce(nullif(input->>'id','')::uuid,gen_random_uuid());
begin
 if auth.uid() is null or not public.is_current_session_valid() or not public.is_organization_admin(target_org) then raise exception 'Administrator access required.';end if;
 perform pg_advisory_xact_lock(hashtextextended('email-template:'||target_org::text,0));
 if exists(select 1 from public.email_templates where id=target and organization_id<>target_org) then raise exception 'Template access denied.';end if;
 if coalesce((input->>'is_default')::boolean,false) then update public.email_templates set is_default=false where organization_id=target_org and purpose=input->>'purpose' and id<>target;end if;
 insert into public.email_templates(id,organization_id,name,purpose,subject,body,content_format,button_label,sender_id,is_default,active) values(target,target_org,btrim(input->>'name'),input->>'purpose',input->>'subject',input->>'body',coalesce(input->>'content_format','text'),coalesce(input->>'button_label','Request service'),nullif(input->>'sender_id','')::uuid,coalesce((input->>'is_default')::boolean,false),coalesce((input->>'active')::boolean,true)) on conflict(id) do update set name=excluded.name,purpose=excluded.purpose,subject=excluded.subject,body=excluded.body,content_format=excluded.content_format,button_label=excluded.button_label,sender_id=excluded.sender_id,is_default=excluded.is_default,active=excluded.active,updated_at=now() where public.email_templates.organization_id=target_org;return target;
end $$;

commit;
notify pgrst,'reload schema';
