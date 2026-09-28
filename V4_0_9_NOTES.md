# V4.0.9 — Tracking Families and Friendly Errors

## Tracking-family import

- A root tracking reference such as `58880` is imported as the case.
- Numbered children such as `58880/1` and `58880/2` are imported as documents under `58880` when the root exists in the workbook or company database.
- Each document keeps its exact original slash reference for search and audit.
- A slash reference without a matching root remains a separate case, preventing unintended merges.
- The import review shows how many family rows will be merged.
- Existing standalone child cases are highlighted with safe cleanup instructions; the importer never deletes existing cases automatically.

## Plain-English errors

- Added a shared client error translator for duplicate records, access restrictions, linked records, missing required values, invalid formats, missing database updates, network failures and expired sessions.
- Duplicate tracking now reads: the tracking number already exists, with instructions to open the existing case and add the document there or use a different number.
- Applied to application notifications, Quick View case editing, sign-in/password reset and public tracking.
