-- Document Operations Platform V4.0.11
-- Persistent logo size/alignment controls for the sidebar and login page.

begin;

alter table public.organization_settings
  add column if not exists sidebar_logo_size integer not null default 100,
  add column if not exists sidebar_logo_alignment text not null default 'center',
  add column if not exists login_logo_size integer not null default 100,
  add column if not exists login_logo_alignment text not null default 'left';

alter table public.organization_settings
  drop constraint if exists organization_settings_sidebar_logo_size_check,
  drop constraint if exists organization_settings_sidebar_logo_alignment_check,
  drop constraint if exists organization_settings_login_logo_size_check,
  drop constraint if exists organization_settings_login_logo_alignment_check;

alter table public.organization_settings
  add constraint organization_settings_sidebar_logo_size_check check(sidebar_logo_size between 50 and 130),
  add constraint organization_settings_sidebar_logo_alignment_check check(sidebar_logo_alignment in ('left','center','right')),
  add constraint organization_settings_login_logo_size_check check(login_logo_size between 50 and 130),
  add constraint organization_settings_login_logo_alignment_check check(login_logo_alignment in ('left','center','right'));

create or replace function public.public_branding(request_host text default null,requested_slug text default null)
returns jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(x) from (
   select s.product_name,s.company_name,s.short_name,s.logo_url,s.favicon_url,s.app_icon_url,
          s.primary_color,s.secondary_color,s.accent_color,s.surface_color,
          s.login_title,s.login_subtitle,s.login_background_url,s.login_kicker,
          s.login_welcome_title,s.login_welcome_subtitle,s.login_button_text,
          s.sidebar_logo_size,s.sidebar_logo_alignment,s.login_logo_size,s.login_logo_alignment,
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
