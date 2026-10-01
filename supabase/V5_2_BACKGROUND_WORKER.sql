-- Hosted Supabase only. Apply after V5_0 and V5_1. Never includes provider keys.
begin;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
-- Browser roles must not make arbitrary network requests or inspect secret-bearing queues.
revoke all on schema net from public,anon,authenticated;
revoke all on all tables in schema net from public,anon,authenticated;
revoke all on all functions in schema net from public,anon,authenticated;
revoke all on schema cron from public,anon,authenticated;
revoke all on all tables in schema cron from public,anon,authenticated;
revoke all on all functions in schema cron from public,anon,authenticated;
select cron.schedule('workspace-communication-retries-v5','* * * * *',
 $task$select public.wake_communication_worker() where exists(select 1 from public.communication_outbox where (status='Queued' and next_attempt<=now()) or (status='Processing' and updated_at<now()-interval '5 minutes'));$task$);
select cron.schedule('workspace-renewal-reminders-v5','0 8 * * *',$task$select public.queue_customer_renewals();$task$);
commit;
