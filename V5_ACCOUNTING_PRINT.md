# Sales accounting and print templates

This additive release introduces Sales → Accounting and Company Management → Print. Existing attestation cases, documents, custody and case payments are preserved.

## Accounting

- Branch-scoped supplier creation, editing and archiving; supplier bill view.
- Expenses and purchases with separate input tax, payment, due date and references.
- Supplier payments with outstanding-balance checks and idempotent retries.
- Administrator cash/bank accounts, opening balances and transfers within a branch.
- Server-controlled double-entry journals; immutable entries and explicit reversal history.
- Issued sales invoices, sales receipts and receipt voids post automatically. Unpaid draft invoices are excluded until issued.
- Trial balance, profit/loss, balance sheet and ledger; date and branch filters. Aggregates cover all accessible entries rather than just the visible page.
- Existing invoices/receipts can be included with **Sync existing sales** per branch; repeating the sync does not duplicate entries.
- Government-fee recovery is shown separately from service income. This release uses an income account for recoveries; configurable pass-through treatment is pending.
- Case/attestation payments keep their existing workflow and are not included in this sales ledger yet.

## Printing

Per-company, separately saved Invoice, Receipt/POS, Delivery note and Financial report templates. A4/A5 sheets and 58/80 mm thermal widths; Modern/Classic/Minimal layouts; colors, font sizes, margins, logo dimensions, visible information, headings, footer, terms and signature lines. Live preview, sample print and template reset. Settings persist in Supabase and are readable by authorized staff; only administrators can change them.

Quick sale uses receipt defaults. New invoices use invoice defaults. Payment receipts and customer delivery notes use the shared renderer. Quotations keep a distinct heading. Browser printer selection and operating-system paper/driver settings control the destination printer; silent/direct printer routing is not included. PDF output uses the browser Save as PDF destination.

Custody manifests, batch reports, courier manifests and label sheets retain their existing specialized print layouts.

## Access and data

Financial actions use the existing Sales permission plus company/branch enforcement. Staff need an assigned branch; administrators can choose a company branch. Journal tables have SELECT-only client grants; authenticated, live-session RPCs enforce resource access before posting. Unpaid expense/purchase voids are administrator-only. Paid bills cannot be voided without a refund workflow. No historical records are altered by the migrations.

Existing deployments: apply V5_5_ACCOUNTING.sql then V5_6_PRINT_TEMPLATES.sql. Fresh installations: V4_0_CLEAN_INSTALL.sql includes both. CLI-generated migration files are committed with the release.

## Validation and pending work

Automated database tests cover scope isolation, client-write denial, duplicate retries, overpayment, invalid amounts, invoice/receipt reversals, synchronized historical sales and balanced journals. Browser verification uses mocked data at 390, 768 and 1440 pixels; no production test purchases, expenses or messages are created.

Remaining accounting work includes customer credit notes/refunds, supplier returns/refunds, reconciliation, manual journal adjustments, configurable government-fee accounting, consolidated multi-branch statements, inventory valuation, and integration of attestation-case finances. The release provides sales bookkeeping; it is not yet a complete replacement for all accounting software.
