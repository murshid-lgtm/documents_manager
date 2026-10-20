begin;
create table public.email_contacts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 email text not null check(length(email)<=254 and email ~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$' and email=lower(email)),
 name text not null default '' check(length(name)<=120),email_updates boolean not null default false,marketing_opt_in boolean not null default false,
 consent_at timestamptz,archived boolean not null default false,created_at timestamptz not null default now(),unique(organization_id,email)
);
alter table public.email_contacts enable row level security;
revoke all on public.email_contacts from anon,authenticated;
grant select on public.email_contacts to authenticated;
grant all on public.email_contacts to service_role;
create policy email_contacts_admin_read on public.email_contacts for select to authenticated using(public.is_current_session_valid() and public.is_organization_admin(organization_id));
alter table public.email_templates drop constraint email_templates_purpose_check;
alter table public.email_templates add constraint email_templates_purpose_check check(purpose in ('general','case_created','case_status','payment','appointment','delivery','job_status','invoice_issued','renewal','invoice','receipt','quotation','ledger','statement','report','marketing','new_service'));
alter function public.communication_recipient_allowed(uuid) rename to communication_recipient_allowed_v518;
create function public.communication_recipient_allowed(message_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare m public.communication_outbox;c public.email_contacts;
begin
 select * into m from public.communication_outbox where id=message_id;
 if nullif(m.payload->>'contact_id','') is null then return public.communication_recipient_allowed_v518(message_id);end if;
 if m.channel<>'email' or m.payload->>'manual' is distinct from 'true' or nullif(m.payload->>'customer_id','') is not null then return false;end if;
 select * into c from public.email_contacts where id=(m.payload->>'contact_id')::uuid and organization_id=m.organization_id;
 return c.id is not null and not c.archived and c.email_updates and lower(m.recipient)=c.email and (m.event_type not in ('marketing','new_service') or c.marketing_opt_in);
end $$;
revoke all on function public.communication_recipient_allowed(uuid) from public,anon,authenticated;
grant execute on function public.communication_recipient_allowed(uuid) to service_role;
commit;
notify pgrst,'reload schema';
