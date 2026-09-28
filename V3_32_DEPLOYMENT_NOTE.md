# Kenza Tracker V3.32.0 — Production Finalization

Run `supabase/V3_32_PRODUCTION_FINALIZATION.sql` in the Supabase SQL Editor before deploying this build.

It adds:

- Admin-managed global customer tracking settings.
- Cross-device, per-user favorite cases.
- One atomic custody receipt function that replaces multiple browser requests.
- A customer notification outbox for case creation and status changes.
- A secure WhatsApp Business notification processor at `/api/notifications/process`.

The web UI safely falls back to local tracking settings, local favorites and the previous custody save flow until the SQL migration is applied.

## Optional WhatsApp Business activation

Add the following server-only variables in Vercel:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_TEMPLATE_NAME`
- `WHATSAPP_TEMPLATE_LANGUAGE`
- `NOTIFICATION_PROCESS_SECRET`

The approved Meta template must accept four body variables in this order: customer name, tracking number, status and customer tracking link. Call `/api/notifications/process` periodically with `Authorization: Bearer <NOTIFICATION_PROCESS_SECRET>` from Vercel Cron, Supabase Cron or another trusted scheduler.
