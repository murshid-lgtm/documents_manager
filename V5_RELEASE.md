# Business Operations Platform 5.0

This release adds customers/CRM, quotations and invoices, sales collections,
service jobs with optional stages, company plans and an installable mobile PWA.
Existing attestation cases, document stages, payments, customer delivery and
branch custody remain separate and retain their existing workflows.

## Install / upgrade

For an existing V4 database, apply these additive scripts in order before
publishing the frontend:

1. `supabase/V5_0_BUSINESS_PLATFORM.sql`
2. `supabase/V5_1_COMMUNICATIONS.sql`
3. `supabase/V5_2_BACKGROUND_WORKER.sql` (hosted Supabase only)

The CLI-generated `supabase/migrations/*_business_platform_v5.sql` contains the
same upgrade as one transaction. Use either that migration or the three
manual scripts, not both. A brand-new database uses
`supabase/V4_0_CLEAN_INSTALL.sql` (includes security and V5 core) followed by the
background-worker script. Do not run a clean install against an existing database.

No demo customers, sales or jobs are inserted. Cases and historical payments
are not rewritten. New features start empty. Customer email and consent fields
are optional and disabled on existing cases by default.

## How to use

- **CRM:** add customers, manage opportunities, record the next follow-up and
  convert a won lead into a customer. Archived customers remain linked to history.
- **Sales:** build a quotation or invoice using catalogue/custom items. Issue
  an invoice before recording payments. Convert a quotation once; repeated
  conversion opens the same invoice. Print documents/receipts or export the
  current page through the existing export menu.
- **Services:** create simple jobs without stages or choose a staged template.
  Assign the job, set due/follow-up/renewal dates and track stage status/date.
  Complete all stages or mark them not required before completing the job.
  Link an invoice when needed; jobs do not duplicate its payment ledger.
- **Company Management → Plan:** the platform owner sets allowed modules,
  active-account and branch limits. Company admins can view their package.
  Existing staff restrictions still apply. New staff modules can be assigned
  through Access Management.
- **Mobile:** open the dedicated company portal and install it. Android
  browsers show Install; iOS uses Share → Add to Home Screen. Login, branding,
  records and permissions are shared with the web portal. More exposes all
  permitted modules, with Scan retained as a central action.

## Customer updates: external setup still required

Automation is off until enabled in Company Management → Communications.
Credentials are encrypted in Supabase Vault and are not returned to browsers.
`APP_ORIGIN` must be the canonical HTTPS platform address. The existing
server-only Supabase key is required. Optional `COMMUNICATIONS_WORKER_SECRET`
can provide an independent worker secret; changing it requires saving the
communications settings again to refresh the Vault worker token.

**Email (free allowances):** create a Brevo or Resend account, verify the
sender/domain, and enter the provider API key in Communications. Brevo is capped
at 300/day; Resend at 100/day and 3,000/month. Company caps may be lower. The app
never upgrades a provider subscription. These limits count this platform’s
sends; other software on the same provider account can consume its allowance.

**WhatsApp:** register each company’s Meta business account and sending number,
obtain a suitable access token and app secret, and approve a utility template
with four body parameters in this order: customer name, reference, status,
tracking link/support instruction. Save the phone ID, language and template.
Copy the webhook URL/token from Communications into Meta and subscribe to
messages. Meta verification/onboarding and message charges are outside this app.

Customer consent must be recorded on the case or linked customer. Queue entries
are rechecked before sending; withdrawn consent or changed contact details
skip stale messages. Internal notes and custody transfers are not sent.
Renewal notices are queued 30 days before the renewal date.

The background worker uses pg_net for asynchronous wake-ups and pg_cron for
retry checks and renewal notices. Database writes do not wait for providers.
Provider acceptance is labelled **Accepted**, not Delivered. WhatsApp verified
webhooks update Delivered/Read. Email delivery is managed in the provider’s
own dashboard. Interrupted/ambiguous requests become **Unconfirmed** and are
not blindly resent; review provider logs first. Failed rejections can be
retried from Delivery History. Processing leases prevent duplicate workers.

## Security and finance

All new tables use tenant/branch/module RLS. Company admins cannot change their
own subscription entitlements. Totals are calculated in database triggers;
client totals are ignored. Concurrent payments serialize on the invoice and
cannot exceed the balance. Payments cannot be deleted or edited directly.
Company admins can void a payment with a reason while retaining the original
record and audit event. Attestation and sales ledgers are separate.

The service worker caches static assets and a generic offline page only. It
never caches API responses or authenticated HTML. Saving payments, confirming
custody and other mutations requires a live connection.

## Verification

`npm run security:check` runs the original security/tracking suite, business
and messaging checks, production build and production dependency audit.
Messaging tests use stub providers and do not send real messages. Browser
verification uses temporary demo fixtures; these are removed before publishing.
The current business totals/exports are explicitly labelled **Current page**;
no partial-page summary is presented as a company-wide total.
