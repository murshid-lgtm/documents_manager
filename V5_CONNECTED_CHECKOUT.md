# Connected checkout

Sales opens with Quick sale: choose configured services, adjust government/service fees and quantities, optionally link a customer, then Pay & print. Blank Paid now means pay the total; enter zero or a partial amount for credit sales. Remember prices explicitly saves branch-specific suggestions without altering existing invoices.

A single authenticated database transaction creates the invoice, payment, customer (when needed), and service jobs with snapshot stages. Simple Sale templates create no job; Service/Staged service templates create linked jobs. Attestations continue through Cases so all existing document, stage, custody, appointment, delivery and tracking workflows remain connected.

New attestation cases calculate totals from document fees. Suggestions match document name and the exact set of stages in the selected branch. Initial payments are recorded in the payment ledger and second_payment (the cumulative recorded-payment field), avoiding duplicated paid amounts. Legacy case finance is unchanged.

CRM customer details display linked attestation cases, invoices and service jobs. Invoices show their linked jobs, and jobs expose invoice printing. Payments remain on the corresponding case/invoice rather than duplicating service-job balances.

Migration: supabase/V5_3_CONNECTED_CHECKOUT.sql (also in the timestamped migration and clean installer). Additive only: no existing records are deleted or repriced.

Verification: npm run test:checkout; npm run security:check. Checkout assertions cover atomic rollback, retry idempotency, permission isolation, paid totals, snapshot prices, linked service jobs and document stages. Local Chromium checks exercised cart/save/receipt at 390, 768 and 1440 pixels with mock data; no live customer transactions were created.

Limitations: no automatic WhatsApp/email activation; existing provider configuration remains unchanged. Workflow templates are maintained through the Service catalogue. This upgrade does not add accounting expense/refund modules.
