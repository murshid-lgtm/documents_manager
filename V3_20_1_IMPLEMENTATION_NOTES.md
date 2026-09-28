# Kenza Tracker Web — V3.20.1

## Corrected module-specific exports

Exports no longer reuse the same generic case columns throughout the application.

- **Cases:** customer, tracking, branch, status, milestone and finance details.
- **Documents & Stages:** document holder, quantity, status, milestone, stage counts and full stage details.
- **Appointments:** date, time, tracking, customer, authority, location, assignee, status and notes.
- **Batch Reports:** batch identity, type, date, session, tracking, customer, quantity, amount, card reference and remarks.
- **Operations:** selected queue, assignment, physical location, age, active stages, balance and exception flags.
- **Payments:** transaction-specific fields when Transactions is selected; receivable and balance fields when Receivables is selected.
- **Custody:** current-location fields for Current Custody; movement route, scope, staff and notes for Movement History.
- **Deliveries:** receiver, handover status, document list, delivery date, balance and amount collected.
- **Courier Shipments:** shipment, direction, destination, agent, carrier, AWB, status and receipt counts.
- **Reports:** the exported columns now change with Executive Summary, Stage Workload, Finance, Delivery, Appointments, Custody or Case Detail.

## Export behavior

- Export uses all records matching the current module search and filters, not only the visible pagination page.
- PDF/Print Current now prints the selected report rather than a generic case list.
- Excel, Word, PDF and CSV use the same module-specific dataset.
- Export filenames and headings match the active module, queue or report.

## Deployment

- Version: `3.20.1`
- Database migration: **Not required**
- Production build: **Passed**
