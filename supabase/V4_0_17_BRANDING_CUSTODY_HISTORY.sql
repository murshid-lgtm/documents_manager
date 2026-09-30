-- Document Operations Platform V4.0.17
-- Independent login logo surfaces, adjustable containers and reliable custody history.

begin;

alter table public.organization_settings
  add column if not exists sidebar_logo_container_width integer not null default 190,
  add column if not exists sidebar_logo_container_height integer not null default 64,
  add column if not exists login_logo_container_width integer not null default 220,
  add column if not exists login_logo_container_height integer not null default 72,
  add column if not exists login_card_logo_visible boolean not null default true,
  add column if not exists login_card_logo_size integer not null default 100,
  add column if not exists login_card_logo_alignment text not null default 'left',
  add column if not exists login_card_logo_background text not null default '#FFFFFF',
  add column if not exists login_card_logo_radius integer not null default 14,
  add column if not exists login_card_logo_container_width integer not null default 220,
  add column if not exists login_card_logo_container_height integer not null default 64;

alter table public.organization_settings
  drop constraint if exists organization_settings_sidebar_logo_container_width_check,
  drop constraint if exists organization_settings_sidebar_logo_container_height_check,
  drop constraint if exists organization_settings_login_logo_container_width_check,
  drop constraint if exists organization_settings_login_logo_container_height_check,
  drop constraint if exists organization_settings_login_card_logo_size_check,
  drop constraint if exists organization_settings_login_card_logo_alignment_check,
  drop constraint if exists organization_settings_login_card_logo_radius_check,
  drop constraint if exists organization_settings_login_card_logo_container_width_check,
  drop constraint if exists organization_settings_login_card_logo_container_height_check;

alter table public.organization_settings
  add constraint organization_settings_sidebar_logo_container_width_check check(sidebar_logo_container_width between 80 and 240),
  add constraint organization_settings_sidebar_logo_container_height_check check(sidebar_logo_container_height between 44 and 120),
  add constraint organization_settings_login_logo_container_width_check check(login_logo_container_width between 80 and 360),
  add constraint organization_settings_login_logo_container_height_check check(login_logo_container_height between 44 and 120),
  add constraint organization_settings_login_card_logo_size_check check(login_card_logo_size between 50 and 130),
  add constraint organization_settings_login_card_logo_alignment_check check(login_card_logo_alignment in ('left','center','right')),
  add constraint organization_settings_login_card_logo_radius_check check(login_card_logo_radius between 0 and 32),
  add constraint organization_settings_login_card_logo_container_width_check check(login_card_logo_container_width between 80 and 360),
  add constraint organization_settings_login_card_logo_container_height_check check(login_card_logo_container_height between 44 and 120);

create or replace function public.public_branding(request_host text default null,requested_slug text default null)
returns jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(x) from (
   select s.product_name,s.company_name,s.short_name,s.logo_url,s.favicon_url,s.app_icon_url,
          s.primary_color,s.secondary_color,s.accent_color,s.surface_color,
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

-- Restore visible history for receipts completed before this release. The transfer
-- route is authoritative; per-document origins fall back to the recorded route.
-- SQL Editor has no tenant auth context, so pause the normal organization trigger
-- only for this explicit, organization-scoped maintenance insert.
alter table public.custody_movements disable trigger user;
insert into public.custody_movements(organization_id,case_id,document_id,from_location,to_location,notes,handed_by,moved_at)
select t.organization_id,i.case_id,i.document_id,t.from_location,t.to_location,
       t.transfer_no||' · Historical receipt restored by V4.0.17',coalesce(t.received_by,t.requested_by),coalesce(t.received_at,t.requested_at,now())
from public.custody_transfers t
join public.custody_transfer_items i on i.transfer_id=t.id
where t.status='Received' and i.receive_status in ('Verified','Damaged')
  and not exists (
    select 1 from public.custody_movements m
    where m.organization_id=t.organization_id and m.case_id=i.case_id
      and m.document_id is not distinct from i.document_id
      and m.to_location=t.to_location
      and coalesce(m.notes,'') like t.transfer_no||'%'
  );
alter table public.custody_movements enable trigger user;

create or replace function public.confirm_custody_receipt(target_transfer uuid,receipt_items jsonb,receipt_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.custody_transfers%rowtype; item jsonb; has_issue boolean:=false; affected uuid[]; cid uuid;
begin
 select * into t from public.custody_transfers where id=target_transfer and organization_id=public.current_organization_id() for update;
 if not found then raise exception 'Custody transfer not found'; end if;
 if t.status<>'In Transit' then raise exception 'This transfer is no longer awaiting receipt'; end if;
 if not(public.is_organization_admin() or t.to_branch_id=public.current_profile_branch_id()) then raise exception 'Only the receiving branch can confirm this receipt'; end if;
 if jsonb_array_length(coalesce(receipt_items,'[]'::jsonb))<>(select count(*) from public.custody_transfer_items where transfer_id=target_transfer) then raise exception 'Every transfer item must be verified'; end if;
 for item in select * from jsonb_array_elements(coalesce(receipt_items,'[]'::jsonb)) loop
  if coalesce(item->>'status','') not in ('Verified','Missing','Damaged') then raise exception 'Invalid receipt status'; end if;
  if item->>'status' in ('Missing','Damaged') and nullif(trim(item->>'note'),'') is null then raise exception 'A discrepancy note is required'; end if;
  update public.custody_transfer_items set receive_status=item->>'status',discrepancy_note=nullif(trim(item->>'note'),''),verified_by=auth.uid(),verified_at=now() where id=(item->>'id')::uuid and transfer_id=target_transfer;
  if not found then raise exception 'Invalid transfer item'; end if;
  has_issue:=has_issue or (item->>'status') in ('Missing','Damaged');
 end loop;

 insert into public.custody_movements(organization_id,case_id,document_id,from_location,to_location,notes,handed_by,moved_at)
 select t.organization_id,i.case_id,i.document_id,coalesce(d.physical_location,t.from_location),t.to_location,
        concat_ws(' · ',t.transfer_no,nullif(trim(receipt_note),''),nullif(trim(i.discrepancy_note),'')),auth.uid(),now()
 from public.custody_transfer_items i
 left join public.documents d on d.id=i.document_id
 where i.transfer_id=target_transfer and i.receive_status in ('Verified','Damaged');

 update public.documents d set physical_location=t.to_location,updated_at=now()
 where exists(select 1 from public.custody_transfer_items i where i.transfer_id=target_transfer and i.receive_status in ('Verified','Damaged') and (i.document_id=d.id or (i.document_id is null and i.case_id=d.case_id)));
 select array_agg(distinct case_id) into affected from public.custody_transfer_items where transfer_id=target_transfer;
 foreach cid in array coalesce(affected,array[]::uuid[]) loop
  update public.cases c set physical_location=case
    when not exists(select 1 from public.documents d where d.case_id=cid) then t.to_location
    when not exists(select 1 from public.documents d where d.case_id=cid and coalesce(d.physical_location,'')<>coalesce(t.to_location,'')) then t.to_location
    else 'Mixed locations' end,updated_by=auth.uid() where c.id=cid;
  insert into public.case_history(organization_id,case_id,user_id,action,field_name,new_value,metadata)
  values(t.organization_id,cid,auth.uid(),'Custody transfer received','physical_location',coalesce(t.from_location,'Unassigned')||' → '||coalesce(t.to_location,'Unassigned')||' · '||t.transfer_no,jsonb_build_object('source','custody','transfer_id',target_transfer));
 end loop;
 update public.custody_transfers set status='Received',received_by=auth.uid(),received_at=now(),receipt_notes=nullif(trim(receipt_note),''),has_discrepancy=has_issue where id=target_transfer;
 return jsonb_build_object('transfer_id',target_transfer,'case_count',coalesce(array_length(affected,1),0),'movement_count',(select count(*) from public.custody_transfer_items where transfer_id=target_transfer and receive_status in ('Verified','Damaged')),'has_discrepancy',has_issue);
end $$;
revoke all on function public.confirm_custody_receipt(uuid,jsonb,text) from public;
grant execute on function public.confirm_custody_receipt(uuid,jsonb,text) to authenticated;

commit;
notify pgrst, 'reload schema';
