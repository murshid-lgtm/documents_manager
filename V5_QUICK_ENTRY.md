# Quick entry release

Sales includes Quick sale (POS) and New invoice (detailed entry), sharing the same invoice, customer, payment and service-job records. Both offer quick-add service/customer dialogs, visible walk-in name/mobile, editable per-service government fees and service charges, and optional manual bill numbering. Existing invoice/quotation editors and service catalogue fields also support component fees. Prints show the component charges on each line.

Staff use their assigned branch only. Company administrators and platform super administrators can choose company branches. Unassigned staff must be assigned a branch in Access Management before entering bills. Existing customer search supports names and mobile numbers. New service/customer requests are idempotent; duplicate bill numbers return a plain-language error. Previous transaction prices are unchanged.

V5_4_QUICK_ENTRY.sql is additive and is included in the clean installer and timestamped migration. No live records are deleted or repriced. Run npm run security:check for isolation, payment totals, idempotency, branch enforcement, service/customer creation and bill-number tests.

Browser verification exercised POS, quick-add service/customer, walk-in fields and responsive widths 390/768/1440 with mock data; no production test invoices or messages were created.

This release improves entry and invoicing. The separate requested accounting expansion (supplier purchasing, expenses, refunds/credit notes, journals, ledgers, trial balance and financial statements) remains pending. It must not be represented as a complete accounting suite.
