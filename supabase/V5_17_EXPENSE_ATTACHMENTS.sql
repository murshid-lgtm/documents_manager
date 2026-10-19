begin;
alter table public.invoice_costs add constraint invoice_cost_attachment_scope unique(id,organization_id,branch_id);
alter table public.finance_bills add constraint finance_bill_attachment_scope unique(id,organization_id,branch_id);
create table public.expense_attachments(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),branch_id uuid not null,
 cost_id uuid,bill_id uuid,name text not null check(length(name) between 1 and 200),object_path text not null unique,
 size_bytes integer not null check(size_bytes between 1 and 10485760),content_type text not null check(content_type in('application/pdf','image/jpeg','image/png')),
 created_at timestamptz not null default now(),created_by uuid not null default auth.uid() references public.profiles(id),
 foreign key(cost_id,organization_id,branch_id) references public.invoice_costs(id,organization_id,branch_id),
 foreign key(bill_id,organization_id,branch_id) references public.finance_bills(id,organization_id,branch_id),
 check(num_nonnulls(cost_id,bill_id)=1),check(object_path=organization_id::text||'/'||case when cost_id is not null then 'cost/'||cost_id::text else 'bill/'||bill_id::text end||'/'||id::text)
);
create index expense_attachment_cost on public.expense_attachments(cost_id,organization_id,branch_id) where cost_id is not null;
create index expense_attachment_bill on public.expense_attachments(bill_id,organization_id,branch_id) where bill_id is not null;
alter table public.expense_attachments enable row level security;
revoke all on public.expense_attachments from public,anon,authenticated;
grant select,insert,delete on public.expense_attachments to authenticated;
grant all on public.expense_attachments to service_role;
create policy expense_attachment_read on public.expense_attachments for select to authenticated using(public.business_access(organization_id,branch_id,'sales'));
create policy expense_attachment_insert on public.expense_attachments for insert to authenticated with check(public.business_access(organization_id,branch_id,'sales') and created_by=auth.uid() and (cost_id is not null and exists(select 1 from public.invoice_costs c where c.id=cost_id and c.organization_id=expense_attachments.organization_id and c.branch_id=expense_attachments.branch_id and c.status<>'Cancelled') or bill_id is not null and exists(select 1 from public.finance_bills b where b.id=bill_id and b.organization_id=expense_attachments.organization_id and b.branch_id=expense_attachments.branch_id and b.status<>'Voided')));
create policy expense_attachment_delete on public.expense_attachments for delete to authenticated using(public.is_current_session_valid() and (public.is_organization_admin(organization_id) or created_by=auth.uid() and public.business_access(organization_id,branch_id,'sales')));
-- Prevent concurrent uploads exceeding the limit; scope metadata is immutable.
create function accounting_private.guard_expense_attachment() returns trigger language plpgsql security invoker set search_path='' as $$begin
 perform pg_advisory_xact_lock(hashtextextended('expense-files:'||coalesce(new.cost_id,new.bill_id)::text,0));
 if (select count(*) from public.expense_attachments where organization_id=new.organization_id and coalesce(cost_id,bill_id)=coalesce(new.cost_id,new.bill_id))>=5 then raise exception 'Attach up to five files to this record.';end if;return new;
end $$;
revoke all on function accounting_private.guard_expense_attachment() from public,anon,authenticated;
create trigger expense_file_limit before insert on public.expense_attachments for each row execute function accounting_private.guard_expense_attachment();
do $storage$ begin if to_regclass('storage.buckets') is not null then
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('expense-files','expense-files',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;
 execute 'create policy expense_file_read on storage.objects for select to authenticated using(bucket_id=''expense-files'' and exists(select 1 from public.expense_attachments f where f.object_path=storage.objects.name))';
 execute 'create policy expense_file_insert on storage.objects for insert to authenticated with check(bucket_id=''expense-files'' and exists(select 1 from public.expense_attachments f where f.object_path=storage.objects.name and (exists(select 1 from public.invoice_costs c where c.id=f.cost_id and c.status<>''Cancelled'') or exists(select 1 from public.finance_bills b where b.id=f.bill_id and b.status<>''Voided''))))';
 execute 'create policy expense_file_delete on storage.objects for delete to authenticated using(bucket_id=''expense-files'' and exists(select 1 from public.expense_attachments f where f.object_path=storage.objects.name and (public.is_organization_admin(f.organization_id) or f.created_by=auth.uid())))';
end if;end $storage$;
-- One authenticated round trip validates live access and reserves a fixed render quota.
create function accounting_private.document_render_access() returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles;domain text;
begin
 if auth.uid() is null or not public.is_current_session_valid() then return jsonb_build_object('allowed',false,'status',401,'error','Your session has expired. Please sign in again.');end if;
 select * into p from public.profiles where id=auth.uid();
 if p.id is null or not p.is_active or not p.is_platform_super_admin and not exists(select 1 from public.organizations where id=p.organization_id and status='Active') then return jsonb_build_object('allowed',false,'status',403,'error','This account is unavailable.');end if;
 select primary_domain into domain from public.organization_settings where organization_id=p.organization_id;
 if not public.consume_api_rate_limit('document-pdf',md5(p.id::text)||md5('document-pdf:'||p.id::text),30,60) then return jsonb_build_object('allowed',false,'status',429,'error','Please wait a moment before preparing another PDF.');end if;
 return jsonb_build_object('allowed',true,'id',p.id,'organization_id',p.organization_id,'is_platform_super_admin',p.is_platform_super_admin,'company_domain',domain);
end $$;
revoke all on function accounting_private.document_render_access() from public,anon,authenticated;
grant execute on function accounting_private.document_render_access() to authenticated;
create function public.document_render_access() returns jsonb language sql security invoker set search_path='' as $$select accounting_private.document_render_access()$$;
revoke all on function public.document_render_access() from public,anon;
grant execute on function public.document_render_access() to authenticated;
commit;
notify pgrst,'reload schema';
