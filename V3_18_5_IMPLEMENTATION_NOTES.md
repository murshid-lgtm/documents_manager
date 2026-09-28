# V3.18.5 — Explicit Search By

- Adds an explicit **Search by** selector across operational search screens: Cases, Documents & Stages, Batch Reports, Appointments, Operations, Payments, Custody, Deliveries, Reports and the Courier document picker.
- Default mode is **Tracking No.** so entering a tracking number does not accidentally match a mobile number, bill, note, document or another numeric field.
- Tracking No., Mobile and Bill No. use exact matching.
- Customer Name uses partial name matching.
- **All Fields** remains available when staff intentionally want a broad search.
- Tracking-family/document source references are included in Tracking No. matching.
- No Supabase/database migration is required.
- Existing V3.18.3 responsive behavior is retained.
