# Kenza Tracker Web — V3.20.0

## Universal exports

- Added a consistent Export menu to every web application module.
- Export formats: PDF, Excel (`.xlsx`), Word (`.doc`), and CSV.
- Case search and filters are respected in the Cases module.
- Reports exports respect report period, date, branch, status, and search filters.
- Exports include tracking, bill number, customer, mobile, branch, status, milestone, document count, totals, paid amount, balance, and submission date.
- PDF uses the browser print workflow so users can print or save as PDF.

## Expanded Reports

- Executive Summary
- Case status distribution
- Branch workload
- Stage workload and completion
- Finance by payment method
- Receivables summary
- Receivables aging: 0–7, 8–30, 31–60, 61–90, and 90+ days
- Delivery performance and recent delivery activity
- Appointment outcomes and authority workload
- Custody movement and top destinations
- Detailed case report with pagination

## UI upgrades

- Premium export dropdown with clear file-format choices.
- New report library cards for fast access to management reports.
- Expanded report tabs with responsive behavior.
- Export completion feedback uses the V3.19.1 toast system.

## Deployment

- Version: `3.20.0`
- Database migration: **Not required**
- Production build: **Passed**
