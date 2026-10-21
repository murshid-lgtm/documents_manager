begin;
-- Isolated official API sandbox. No customer automation reads these tables.
create table public.whatsapp_test_connections (
 organization_id uuid primary key references public.organizations(id),
 phone_id text not null check(phone_id ~ '^[0-9]{5,30}$'),
 business_id text not null check(business_id ~ '^[0-9]{5,30}$'),
 api_version text not null default 'v25.0' check(api_version ~ '^v[0-9]{2}\.0$'),
 recipients text[] not null check(cardinality(recipients) between 1 and 5),
 vault_secret_id uuid not null, enabled boolean not null default false,
 verified_at timestamptz, webhook_at timestamptz, updated_at timestamptz not null default now()
);
create table public.whatsapp_test_messages (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.whatsapp_test_connections(organization_id),
 phone_id text not null, peer text not null check(peer ~ '^[1-9][0-9]{7,14}$'),
 direction text not null check(direction in ('incoming','outgoing')),
 kind text not null check(kind in ('text','template','image','document','audio','video','sticker','location','contacts','interactive','button','unsupported')),
 body text not null check(length(body)<=4096), provider_id text,
 status text not null check(status in ('Processing','Accepted','Sent','Delivered','Read','Failed','Unconfirmed','Received')),
 error_code text, created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(organization_id,provider_id)
);
create index whatsapp_test_history_idx on public.whatsapp_test_messages(organization_id,phone_id,created_at desc);
create index whatsapp_test_window_idx on public.whatsapp_test_messages(organization_id,phone_id,peer,created_at desc) where direction='incoming';
alter table public.whatsapp_test_connections enable row level security;
alter table public.whatsapp_test_messages enable row level security;
revoke all on public.whatsapp_test_connections,public.whatsapp_test_messages from public,anon,authenticated;
grant all on public.whatsapp_test_connections,public.whatsapp_test_messages to service_role;
-- Server-only RPCs. HTTP routes verify active admin session and company portal first.
create function public.save_whatsapp_test_connection(target_org uuid, input jsonb, secret_json jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare sid uuid; phones text[];
begin
 perform 1 from public.organizations where id=target_org and status='Active' for update;
 if not found then raise exception 'Company unavailable.';end if;
 select array_agg(distinct x) into phones from jsonb_array_elements_text(input->'recipients') x;
 if cardinality(phones) not between 1 and 5 or exists(select 1 from unnest(phones) p where p !~ '^[1-9][0-9]{7,14}$') then raise exception 'Invalid test recipients.';end if;
 select vault_secret_id into sid from public.whatsapp_test_connections where organization_id=target_org;
 if secret_json is not null then
  if jsonb_typeof(secret_json)<>'object' or length(secret_json::text)>8192 or length(coalesce(secret_json->>'access_token','')) not between 10 and 4096 or coalesce(secret_json->>'app_secret','') !~ '^[a-fA-F0-9]{32}$' then raise exception 'Invalid credentials.';end if;
  if sid is null then select vault.create_secret(secret_json::text,'whatsapp-test-'||target_org::text) into sid;
  else perform vault.update_secret(sid,secret_json::text);end if;
 end if;
 if sid is null then raise exception 'Test credentials are required.';end if;
 insert into public.whatsapp_test_connections(organization_id,phone_id,business_id,api_version,recipients,vault_secret_id,enabled)
 values(target_org,input->>'phone_id',input->>'business_id',input->>'api_version',phones,sid,coalesce((input->>'enabled')::boolean,false))
 on conflict(organization_id) do update set phone_id=excluded.phone_id,business_id=excluded.business_id,api_version=excluded.api_version,recipients=excluded.recipients,enabled=excluded.enabled,verified_at=null,webhook_at=case when public.whatsapp_test_connections.phone_id=excluded.phone_id and public.whatsapp_test_connections.business_id=excluded.business_id and secret_json is null then public.whatsapp_test_connections.webhook_at else null end,updated_at=now();
end $$;
create function public.whatsapp_test_secret(target_org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare result jsonb;begin select v.decrypted_secret::jsonb into result from public.whatsapp_test_connections c join vault.decrypted_secrets v on v.id=c.vault_secret_id where c.organization_id=target_org;return result;end;
$$;
-- Central monotonic status updates also handle webhook-before-send-response races.
create function public.whatsapp_test_delivery(target_org uuid, sender_id text, message_id text, request_id uuid, new_status text, failure_code text default null) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if new_status not in ('Accepted','Sent','Delivered','Read','Failed','Unconfirmed') then return;end if;
 update public.whatsapp_test_messages m set
 provider_id=coalesce(m.provider_id,nullif(message_id,'')),status=new_status,
 error_code=case when new_status='Failed' then left(failure_code,30) else null end,updated_at=now()
 where m.organization_id=target_org and m.phone_id=sender_id and m.direction='outgoing'
 and (m.provider_id=message_id or (m.id=request_id and (m.provider_id is null or m.provider_id=message_id)))
 and (case new_status when 'Read' then 5 when 'Delivered' then 4 when 'Failed' then 3 when 'Sent' then 2 when 'Accepted' then 1 else 0 end)
 >= (case m.status when 'Read' then 5 when 'Delivered' then 4 when 'Failed' then 3 when 'Sent' then 2 when 'Accepted' then 1 else 0 end);
end $$;
revoke all on function public.save_whatsapp_test_connection(uuid,jsonb,jsonb),public.whatsapp_test_secret(uuid),public.whatsapp_test_delivery(uuid,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_whatsapp_test_connection(uuid,jsonb,jsonb),public.whatsapp_test_secret(uuid),public.whatsapp_test_delivery(uuid,text,text,uuid,text,text) to service_role;
commit;
notify pgrst,'reload schema';
