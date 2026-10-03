# Connected billing workspace

This upgrade extends the existing application. It preserves case, delivery, custody and accounting records and the original per-company print settings.

## Changes

Sales includes a Customers tab. Customer search accepts one character and normalized mobile formatting and runs across the permitted dataset. Exact customer duplicates within a branch are blocked with a reuse suggestion; case checkout and counter checkout reuse exact matches. CRM permissions continue to control editing and archiving.

Invoice and quotation creation use a dedicated page with customer search/quick add, manual or series numbering, references, dates, terms, salesperson, subject, service search, bulk selection, editable item descriptions, quantities, government/service fees, item/bill discounts, tax, adjustment, notes, and template selection. Draft invoices remain excluded from accounting. Financial totals are validated in PostgreSQL. Save and payment RPCs protect against retries. Quotation conversion copies the commercial fields and remains idempotent.

The service catalogue retains historical types and suggested stages. New transactions explicitly choose their stages; catalogue types no longer force jobs or exclude catalogue entries from POS. Issued staged invoice items create linked service jobs. Stages on an issued invoice are managed through those jobs rather than rewritten on the bill. Remembering prices is an explicit branch-default action. Bill prices remain snapshots.

Quick sale has a separate counter/cart workflow, Enter-to-add service search, Ctrl/Cmd+Enter checkout, editable quantities/fees, customer/walk-in fields, manual bill numbers, payment method, outstanding/change display, and Pay & Print. Initial print and reprint explicitly use receipt templates. Only the invoice amount is collected into the ledger when tender exceeds the total.

Invoice/quotation lists include global number/customer/mobile search and derived status filters. Selected records appear beside the list on desktop; mobile switches to the selected detail and can return with Close. Details include the same print renderer, payment/activity history, connected jobs, edit/payment/print actions and copyable summaries. No customer messages are sent.

Print templates are named per company and type: invoice, quotation, receipt, delivery and report. Gallery thumbnails, search, edit/create/duplicate/archive/default actions, live preview, A4/A5/58mm/80mm, font, colors, margins, logo dimensions, columns, customer information, notes/terms, footer and signatures. Documents can save a selected template. Legacy settings are copied into named originals and retained. Printing uses browser printer/Save as PDF selection.

Company settings have searchable group names plus numbering, payment terms and default notes/terms. Save a document draft before attaching private files. Attachments accept PDF, PNG/JPG, DOCX and XLSX, up to five files of 10 MB each. Metadata and Storage enforce document company/branch/module access; downloads use short-lived signed URLs.

## Deployment

Apply V5_7_BILLING_WORKSPACE.sql, then V5_8_PRIVATE_BILLING_FILES.sql. CLI-generated migration copies accompany both. The clean-install generator includes the public database upgrade; run the separate Storage migration for a fresh installation, too.

## Validation

The existing security/business/communication/checkout/accounting/print suites and new billing suite pass. New fixtures verify normalized customer search, tenant/branch restrictions, duplicate guards, numbering, server totals, draft accounting exclusion, payment retries/overpayment, quotation conversion, linked stages, balanced journals, named defaults and private Storage access. A separate upgrade fixture confirms existing document fields and original print settings are preserved. Invoice/quotation components render successfully through React SSR; service matching handles reordered names. Production builds and dependency audits pass.

Visual desktop/tablet/mobile and printer checks remain unverified. The local browser runner failed to start; browser installation failed in this environment. No production test transactions or customer messages were created. Attachment uploads have database/policy tests, but have not been exercised against the live Storage API.

## Accounting work still pending

Credit notes/customer refunds; supplier refunds/returns; bank reconciliation; attestation-case payment posting; customer account statements and aging; recurring invoices; consolidated customer/branch reporting; manual journal adjustments; configurable government-fee pass-through treatment and inventory accounting. The existing receivables ledger balance is not a customer statement or reconciliation workflow.
