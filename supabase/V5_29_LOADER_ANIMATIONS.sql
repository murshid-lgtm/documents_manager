begin;
alter table public.organization_settings add column if not exists loader_animation text not null default 'signature' check(loader_animation in ('signature','contour','horizon','aperture','outline','silk','echo','duet','rhythm','mosaic','spotlight','still'));

-- Retain the existing public-only projection, tenant resolution and grants.
create or replace function public.public_branding(request_host text default null,requested_slug text default null)
returns jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(x) from (
   select s.product_name,s.company_name,s.short_name,s.logo_url,s.favicon_url,s.app_icon_url,
          s.primary_color,s.secondary_color,s.accent_color,s.surface_color,s.loader_animation,
          s.login_title,s.login_subtitle,s.login_background_url,s.login_kicker,
          s.login_welcome_title,s.login_welcome_subtitle,s.login_button_text,
          s.sidebar_logo_visible,s.sidebar_logo_size,s.sidebar_logo_alignment,
          s.sidebar_logo_background,s.sidebar_logo_radius,s.sidebar_logo_container_width,s.sidebar_logo_container_height,
          s.login_logo_visible,s.login_logo_size,s.login_logo_alignment,
          s.login_logo_background,s.login_logo_radius,s.login_logo_container_width,s.login_logo_container_height,
          s.login_card_logo_visible,s.login_card_logo_size,s.login_card_logo_alignment,
          s.login_card_logo_background,s.login_card_logo_radius,s.login_card_logo_container_width,s.login_card_logo_container_height,
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
notify pgrst,'reload schema';
