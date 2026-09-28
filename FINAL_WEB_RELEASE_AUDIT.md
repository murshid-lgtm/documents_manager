# Kenza Tracker Web — Final Release Audit

## Completed

- Premium responsive SaaS shell, login, collapsible navigation and operational modals.
- Branch-aware custody workflow with dispatch, receiving, discrepancies and current physical location.
- Atomic server-side custody confirmation with compatibility fallback.
- Cases, documents, stages, appointments, deliveries, payments, batch reports, courier shipments, operations and reports.
- Ranked partial search, pagination/load controls and module exports.
- Pinned cases, cross-device favorites, recently viewed cases and compact customer contact actions.
- Combined case activity timeline across case edits, payments, appointments, deliveries and custody.
- Premium customer tracking receipt, QR code, editable WhatsApp text and configurable tracking URL.
- Centralized administrator settings and notification outbox.
- Optional WhatsApp Business template processor.

## Deployment order

1. Back up the Supabase database.
2. Run `supabase/V3_29_CUSTODY_RECEIVING_SECURITY.sql` if it has not already completed successfully.
3. Run `supabase/V3_32_PRODUCTION_FINALIZATION.sql`.
4. Deploy the V3.32 web build.
5. Sign in as Admin, Safari Branch, Al Khor Branch and Corporate Office and perform the smoke tests below.

## Required smoke tests

- Create a case and share its WhatsApp tracking receipt.
- Open the public tracking link and confirm only customer-safe information is shown.
- Pin the case, sign in on another browser and confirm the favorite syncs.
- Dispatch a 20+ document custody transfer and confirm it at the destination branch.
- Mark one document Missing and one Damaged and verify locations and discrepancy notes.
- Confirm the source branch cannot receive a destination transfer.
- Record a payment, appointment and customer delivery and confirm all appear in Quick View Activity.
- Test PDF, Excel, Word and CSV export from each operational module.
- Test desktop, tablet and mobile layouts.

## External setup required only for automatic WhatsApp delivery

- Meta WhatsApp Business account and approved message template.
- Vercel environment variables listed in `V3_32_DEPLOYMENT_NOTE.md`.
- A trusted scheduler calling `/api/notifications/process` with its bearer secret.

Manual WhatsApp receipt sharing works without the Business API.

## Mobile parity audit

Pending the final native mobile build. Compare authentication, roles, case fields, status values, branch filtering, custody receipt rules, delivery semantics, payment fields, public tracking URLs and activity naming before declaring both products release-equivalent.
