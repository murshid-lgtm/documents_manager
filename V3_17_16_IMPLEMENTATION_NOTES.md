# V3.17.16 — Safe Delete Review

Case deletion is now dependency-aware and non-destructive.

- Delete Case first performs a safety check.
- If the case is linked to a courier shipment, appointment, batch report, delivery, payment, or custody movement, deletion is blocked.
- The review modal shows the exact linked record and the action required to resolve it.
- No linked operational record is automatically removed during case deletion.
- Courier shipment membership is restored to `ON DELETE RESTRICT` (reversing the V3.17.15 cascade behavior).
- Known operational `case_id` foreign keys are changed to `ON DELETE RESTRICT` so the database also protects against accidental cascade deletion.
- The case can only be permanently deleted after the dependency check returns clear.

Run `supabase/V3_17_16_SAFE_DELETE_GUARDS.sql` once in Supabase SQL Editor before using the new delete flow.
