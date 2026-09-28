# V3.17.15 — Reliable Case Delete

- Fixed case deletion when documents are linked to courier shipment items.
- The UI removes courier item links before deleting the case for compatibility with older databases.
- Added a database migration changing the courier document foreign key from `ON DELETE RESTRICT` to `ON DELETE CASCADE`.
- Delete now verifies that Supabase actually returned the deleted case instead of treating a zero-row/RLS result as success.
- Removed the full browser reload after delete; the deleted case is removed immediately from local case state.
- Added a deleting state to prevent double-click / duplicate delete attempts.
- Errors are shown as useful messages rather than silently failing.
