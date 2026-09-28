# V3.17.3 — Courier Picker UI + Search Fix

- Courier shipment fields now reuse the app's standard `form-grid` styling.
- Search box now matches the app search/input styling.
- Courier document search now searches all non-cancelled cases/documents, not only records already tagged with a courier-ready milestone.
- With no search, courier-ready documents are prioritized; on legacy data without courier-ready milestones, the picker falls back to available documents.
- Case accordion remains the selection model, with document-level attestation/service shown inside.
- Picker limits the initial rendered case groups to 100 for responsiveness on large datasets.
