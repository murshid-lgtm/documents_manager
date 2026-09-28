# V3.18.0 — Clean 2026 Import

- Clean-import default cutoff changed to **2026-01-01**.
- Keeps the existing four-source authority model:
  - Kenza Master: Bill No., Reference, customer, finance.
  - Billwise Out: document instances and DD fields.
  - Status Wise: attestation stages.
  - Google Sheet: operational status/date, historical corrections, collection and holder/status context.
- Dry-run review now additionally surfaces DD document rows, Collection rows, and duplicate tracking references.
- Unknown Google status values remain review-only and are not guessed.
- Existing analyze → review → finalize flow remains intact.
- No database migration is required for this build.
