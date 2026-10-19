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

## Mobile navigation follow-up

Replaced the mobile desktop-sidebar fallback with a body-level mobile menu. Module search, permission-filtered tiles, profile/logout sheet, create sheet, mobile top bar, bottom navigation and quick-create button now have dedicated touch layouts. The app behind the menu is inert while it is open; browser Back and Escape dismiss it. Sales/customer tables use stacked mobile record cards. Desktop navigation retains its existing layout.

Verified with a real React interaction fixture covering taps on every module, search, create actions, profile/logout callbacks, notifications, scan, browser Back, Escape, permissions, desktop resize, light/dark and narrow-screen overflow. This fixture uses synthetic data and performs no production transactions.

## Mobile dialogs follow-up

Attestation quick view uses a full-screen phone layout with separate Workflow, Financials, Details and Activity sections. Secondary actions open a bottom sheet. Short payment and quick-add forms use sheets; longer forms, record details and PDF previews use the available screen height. Shared portal layering prevents transformed pages and desktop headers from covering dialogs. A single focus/scroll/history stack keeps nested dialogs above their parent and returns to the underlying record when dismissed. Visual viewport sizing responds to the phone keyboard.

Synthetic React browser checks cover real quick view/stage components, nested customer and edit forms, bulk services, PDF controls, browser Back/Escape, restored drafts, 320–430px widths, Fern/Studio light/dark modes and retained desktop chrome. No production financial transactions are submitted by these tests.

## Compact records and financial corrections

Mobile attestation cards have a compact header, readable phone number, quick-view action and touch shortcuts. Desktop attestation cards retain their layout. Customer, service and document searches use compact left-aligned results. Mobile select controls have explicit height/padding to prevent clipped text.

Issued invoice totals, payments and receivables have compact cards and paginated drill-downs in Sales, Attestations and customer entry. Totals use all accessible canonical issued invoices, independent of the current list page. Legacy cases without invoices are not converted or double counted.

Company administrators can correct receipts, expenses, liabilities, supplier bills, accounts and accounting types. Invoice edits use the invoice editor and require a correction reason. Receipts are replaced atomically; originals remain voided. Invoice deletion cancels the invoice, reverses receipts and cancels linked attestation tracking. Paid real expenses remain expenses; paid supplier bills require a refund rather than a fictitious reversal. Accounts with financial history cannot be removed. All admin corrections retain a reason, before/after history and idempotency key.

The invoice Journal entries tab is removed. Expense/liability actions maintain the background ledger automatically. Reports retain the ledger and daybook. Admin correction tests cover tenant/role checks, retries, connected receipt balances, paid invoice limits, expense dates and balanced postings. UI tests cover real mobile invoice-number typing, compact lists, cards, stage status text and drill-down dialogs.
