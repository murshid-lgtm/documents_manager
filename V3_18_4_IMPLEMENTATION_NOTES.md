# V3.18.4 — Smart Exact Search Priority

Search behavior was audited across operational modules.

## Fix
When a search term exactly matches an identifier, identifier matching now takes priority over broad text matching:
1. Tracking reference / tracking family / document source tracking reference
2. Bill number / internal invoice number
3. Mobile number
4. Broad contains search only when there is no exact identifier match

This prevents a tracking search such as `58943` from returning unrelated cases merely because the same digits occur in a mobile number, bill, notes, document text, or another searchable field.

## Updated modules
- Cases
- Documents & Stages
- Operations
- Appointments
- Batch Reports
- Payments / Receivables
- Custody / Handover
- Deliveries
- Reports
- Courier document picker

Existing filters and queue rules remain in place. Search priority only improves result accuracy; no database schema or Supabase migration is required.
