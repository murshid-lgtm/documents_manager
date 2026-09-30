# V4.0.18 — Workflow Layouts, Transfer Archive and Notification Groups

## Interface upgrades

- Delivery confirmation detail uses a compact, responsive two-column layout with a scrollable document list and sticky actions.
- Payment receipt preview is now a compact premium receipt card on desktop and a single-column layout on mobile.
- Custody movement details use a route-first visual layout with clearer customer, scope, handler, date and notes information.
- Batch report preview now matches the branded print design with a colour hero, explicit report-title bar, metadata and premium table treatment.
- Printed batch reports now include a dedicated report-title heading bar beneath the branded header.

## Custody archive

- Received transfers are available as a first-class `Received Transfers` tab beside Current Custody and Movement History.
- The archive is searchable by transfer, branch, tracking, customer or mobile.
- Each received transfer displays route, receipt time, case/document counts and a manifest print action.

## Notification centre

- Custody notifications group by transfer number instead of opening only one case.
- Expanding a group shows every related case/update and opens the correct case individually.
- Notification groups support swipe-left actions on touch devices and an action trigger on desktop.
- Archive, restore and delete-from-view are stored per user. Audit records remain intact.
- Archived notifications have their own tab.

## Verification

- `npm run build` completed successfully with Next.js 15.5.25.
- No database migration is required for V4.0.18.
