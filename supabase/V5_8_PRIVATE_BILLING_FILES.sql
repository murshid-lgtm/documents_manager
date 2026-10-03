begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('billing-files','billing-files',false,10485760,array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do nothing;
create policy billing_file_read on storage.objects for select to authenticated using(bucket_id='billing-files' and exists(select 1 from public.billing_attachments a where a.object_path=storage.objects.name and public.business_access(a.organization_id,a.branch_id,'sales')));
create policy billing_file_insert on storage.objects for insert to authenticated with check(bucket_id='billing-files' and exists(select 1 from public.billing_attachments a where a.object_path=storage.objects.name and public.business_access(a.organization_id,a.branch_id,'sales')));
create policy billing_file_delete on storage.objects for delete to authenticated using(bucket_id='billing-files' and exists(select 1 from public.billing_attachments a where a.object_path=storage.objects.name and public.business_access(a.organization_id,a.branch_id,'sales')));
commit;
