# SaaS and mobile upgrade

## First release: implemented

- Combined, server-paginated work queue across attestations, service jobs and appointments.
- My work, unassigned, today, overdue and work-type filters. Due dates follow the company timezone.
- Collection aging from canonical issued invoices. Drafts, quotes, cancelled invoices and linked case totals are excluded.
- Append-only collection follow-up history, promised payment dates, next-contact dates and follow-up-due filter.
- Aging PDF report using the existing report template system.
- Customer credit limits managed by company administrators. Staff see existing and projected credit warnings during billing; limits warn rather than block checkout.
- Appointment month, week, day, board and agenda views. Touch date/time/status controls complement drag-and-drop.
- Mobile bottom navigation, larger touch controls, keyboard-safe input sizes, full-screen dialogs, horizontal tab navigation and stacked collection cards.
- Install lifecycle improvements and user-controlled service-worker updates. No financial actions are queued offline.

Verification: production build, existing sales UI and print template checks, existing security suite, new database tests for tenant/branch/module restrictions and append-only collection notes, timezone tests, and synthetic mobile light/dark layout checks. Authenticated live browser testing remains separate from these checks.

## Remaining roadmap

1. Work ownership editing, configurable stage SLAs, escalation rules and resource capacity.
2. Customer portal with separately authorised customer identities, invoices/receipts, document requests, booking and uploads.
3. Automation rules and execution history, consent-aware reminders and scheduled processing.
4. Customer duplicate review, merge and legacy linking with transaction-safe handling of financial and operational references.
5. Operational analytics: service/branch trends, completion times, stage bottlenecks and scheduled reports. Profitability requires verified cost attribution.
6. Appointment duration, availability, conflict prevention, recurrence and online booking.
7. SaaS self-service onboarding, commercial plans, subscription payment provider, renewal/webhook lifecycle, usage metering and billing history.
8. Mobile drafts and scoped offline work with explicit synchronisation states; notification subscription preferences and supported-browser push.
9. Production monitoring, recovery/restore verification, access review and account/session controls.

Provider accounts, commercial pricing and customer notification policies must be configured before enabling paid subscriptions or automatic external sending. Existing operational and accounting records remain the source of truth.
