-- Document Operations Platform V4.0.3
-- Persistent branding studio and customizable public login presentation.

begin;

alter table public.organization_settings
  add column if not exists login_background_url text,
  add column if not exists login_kicker text default 'LIVE OPERATIONS WORKSPACE',
  add column if not exists login_welcome_title text default 'Welcome back',
  add column if not exists login_welcome_subtitle text default 'Sign in to continue to your operations dashboard.',
  add column if not exists login_button_text text default 'Sign in to workspace';

create or replace function public.public_branding(request_host text default null,requested_slug text default null)
returns jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(x) from (
   select s.product_name,s.company_name,s.short_name,s.logo_url,s.favicon_url,s.app_icon_url,
          s.primary_color,s.secondary_color,s.accent_color,s.surface_color,
          s.login_title,s.login_subtitle,s.login_background_url,s.login_kicker,
          s.login_welcome_title,s.login_welcome_subtitle,s.login_button_text,
          s.support_email,s.website_url,s.footer_text
   from public.organization_settings s
   join public.organizations o on o.id=s.organization_id
   where o.status='Active' and (
     (nullif(trim(requested_slug),'') is not null and o.slug=lower(trim(requested_slug))) or
     (nullif(trim(request_host),'') is not null and lower(s.primary_domain)=lower(split_part(trim(request_host),':',1)))
   )
   order by case when o.slug=lower(coalesce(trim(requested_slug),'')) then 0 else 1 end
   limit 1
 ) x;
$$;

revoke all on function public.public_branding(text,text) from public;
grant execute on function public.public_branding(text,text) to anon,authenticated;

commit;
notify pgrst, 'reload schema';
