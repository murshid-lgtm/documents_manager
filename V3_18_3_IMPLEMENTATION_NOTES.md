# V3.18.3 — Responsive Mobile App

- Keeps V3.18.2 import/family reconciliation logic unchanged.
- Adds a production mobile responsive pass without database/schema changes.
- Mobile navigation becomes a sticky, horizontally scrollable workspace bar.
- Dashboard, cases, filters, operations, payments, custody and report layouts stack for narrow screens.
- Quick View and general modals use the full mobile viewport with touch-friendly controls.
- New Case/invoice-style workspace, Import and Courier layouts collapse to a single-column mobile flow.
- Wide tables remain horizontally scrollable instead of crushing columns.
- Desktop styles are unchanged because the new rules are scoped to <=700px.

No Supabase SQL required.
