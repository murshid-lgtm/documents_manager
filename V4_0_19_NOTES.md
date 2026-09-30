# V4.0.19 — Delivery Integrity, Branch Locations and Notification Actions

## Delivery safeguards

- Previously delivered documents are excluded from subsequent customer-delivery forms.
- Partial delivery status is calculated against the remaining documents instead of the original case total.
- A fully delivered case opens its saved handover record and offers only the delivery-slip print action.
- Delivered cards show the documents from the saved delivery record.
- Delivery print terminology is standardized as `Delivery Slip`.

## Professional interface wording

- `Print Premium Receipt` is now `Print Receipt`.
- Marketing terms such as `premium` are no longer exposed in workflow button labels or preview descriptions.

## Custody locations

- Custody location filters now use only active branches supplied by Company Management.
- Removed hard-coded legacy choices such as Customer, MOFA, Embassy, Courier, Safari and Al Khor aliases.

## Batch report parity

- The editable batch preview now follows the printed report structure: branded header, report title, metadata, coloured table, totals, notes, signature lines and footer.
- Tracking, customer, quantity, amount, reference and remarks remain editable before saving or printing.

## Notification actions

- Rebuilt slide actions with icon-only Archive/Restore and Delete controls.
- Added a visible chevron slide button for mouse users.
- Supports swipe left to reveal and swipe right to close.
- Fixed exposed action backgrounds, card clipping and expanded-group alignment.
- Active and archived notifications use the same interaction.
- Custody notification titles no longer expose internal UUID values.

## Verification

- `npm run build` completed successfully with Next.js 15.5.25.
- No database migration is required.
