# Kenza Tracker Production V3.5.0 — Appointments + Batch Operations

Before deploying, run `supabase/V3_5_APPOINTMENTS_BATCHES.sql` once in the Supabase SQL Editor.

Adds live Supabase-backed Appointments and Batch Reports, case-linked appointment creation, stage/document linkage, appointment statuses, batch creation from selected cases, quantity/amount calculation, and print action. Preserves V3.4.2 instant IndexedDB cache and all prior import/stage CRUD features.


## V3.5.1 hotfix
Fixed a client-side ReferenceError that prevented the Cases workspace from rendering. The V3.5.0 build referenced an undefined `addStage` function in the top-level AppShell; it now correctly passes `addStageToDocument`.


## V3.5.2 Cases runtime hotfix
Fixed the remaining client-side crash in CasesView. CasesView receives `addStage` as a component prop, but V3.5.1 still referenced `addStageToDocument` while rendering CaseCard. That identifier is outside the CasesView scope and caused a browser ReferenceError as soon as the Cases workspace rendered. The CaseCard now correctly receives `addStage={addStage}`.


## V3.6.1 Features-only correction
V3.6.0 changed the approved Cases UI. This build reverts to V3.5.2 as the base.
The V3.5.2 CaseCard component and all existing V3.5.2 CSS are preserved unchanged.
Only the new module navigation/routes/components and module-specific CSS are added.


## V3.7.0 Operations Parity
Cases card design remains based on V3.5.2. This release focuses on feature parity: bulk appointments from Cases, reliable bulk status with Apply button, full appointment manager, exact legacy-style batch report cards and editable print preview, Quick View CRUD/actions/status pill/label printing, and delivery queue with QR labels, partial/full handover, finance collection, QR scan, delivery note and 17-position A4 label sheet.
Run `supabase/V3_7_OPERATIONS_PARITY.sql` once before deploying this build.


## V3.7.1 Quick View correction
Restores the approved pre-V3.7 Quick View UI/layout.
New functionality is added as a compact action bar only:
Assign Appointment, Print Label, Deliver, Edit Case, Delete Case.
Document/stage CRUD, case edit CRUD, activity, status editing and label printing remain functional.


## V3.7.2 Quick View UI polish
Quick View only: corrected status pill/readability, header alignment, close button,
function-button sizing/position, financial summary alignment, document/stage text wrapping,
and case-details typography. The Cases cards and Cases page CSS are unchanged.


## V3.7.3 label / Quick View polish
- Print Label now opens an in-app 75 × 35 mm preview modal first.
- Preview shows Kenza delivery label, tracking, name, mobile, finance/document remarks and QR.
- Supports Add to Label Sheet and Print This Label.
- Single-label printing uses a 75 × 35 mm print page.
- Quick View tracking reference is larger.
- Overall-status selector has smaller corner radius and explicit readable status colours.
- Edit Case is now a compact centered two-column panel instead of a large sheet.


## V3.7.4 Batch Reports + Delivery Label parity
- Batch cards and menu styling are isolated from older generic .batch-card CSS.
- Batch setup is a compact aligned modal.
- Batch preview keeps editable rows and auto-calculation.
- Print / Save PDF now creates a dedicated A4 print document, preventing duplicate/second-page output caused by printing the app modal.
- Individual Delivery Print Label now opens the in-app Envelope Label preview instead of a new print window.
- Add to Label Sheet persists the case into the delivery-label selection queue; multiple cases can then be selected/printed together from Deliveries.
- Quick View uses the same label preview.
- Bulk label printing continues to use the 17-position A4 label sheet.


## V3.7.5 QR + label legacy parity
- Delivery-card Print Label bug fixed (missing labelCase state).
- Individual Print Label opens the in-app legacy Envelope Label preview.
- Preview dimensions/design match the V3.4.1 index.html compact 75 × 35 mm preview.
- Print This Label uses the same A4 sheet generator as legacy index.html (single label in slot 1).
- Bulk labels use the exact 17-slot geometry: 75/75/35 mm columns, seven 35 mm rows, vertical positions 5/10/15.
- Scan QR uses live camera + jsQR, upload-image scanning, framing overlay, manual label-code input and automatic opening of the Delivery handover.


## V3.7.6 Deliveries compact-card hotfix
- Delivery cards now use the same compact visual hierarchy as Cases cards.
- Delivery actions remain directly on the card: Quick View, Print Label, Deliver.
- Fixed the delivery save error caused by inserting a `DLV-...` string into the legacy bigint `delivery_no` column.


## V3.7.7 Delivery UI / label settings
- Deliveries cards no longer show redundant DOCS / TOTAL QTY counters.
- Document names/quantities are larger and remain directly visible.
- Financial figures move into a compact Finance accordion.
- Deliveries title/actions get proper page spacing.
- Delivery search matches the Cases search styling.
- Global app typography now follows the V3.4.1 prototype: Poppins, 13px base, 17px brand name, 29px page titles.
- Label preview typography/divider lines now match the printed sticker and the redundant 75×35 caption was removed.
- Sticker size is editable (50–75 mm width, 20–35 mm height) and persisted locally.


## V3.7.8 App-wide UI consistency
- Reduced unnecessary bold text in Cases cards while preserving tracking/customer/status hierarchy.
- Narrowed and tightened sidebar/nav spacing.
- Compacted KPI/count cards across Dashboard, Appointments, Deliveries, Operations and Reports.
- Enlarged Deliveries card content for readability without adding heavy font weights.
- Unified Poppins sizes, muted colors, panel radii, inputs, search fields and spacing across the app.


## V3.8.0 Operations polish
Operations is now a production action workspace matching the legacy V3.4.1 workflow while preserving the V3.7.8 visual system.

Added:
- Needs Attention / MEA / MOFA / Appointments Today KPI queues.
- Full queue navigation including Delivery, Payment, Stale and Exceptions.
- Search, Select Visible and persistent multi-case selection.
- Reliable bulk overall-status update.
- Bulk staff assignment.
- Create Batch from selected cases.
- Persistent Operations flags.
- Assigned staff and physical location on case records.
- Quick View / Flags / Appointment / Payment / Handover / WhatsApp actions.
- Appointments Today is backed by the appointments table.
- Payment and Custody modules can now open preselected from Operations.


## V3.8.1 Operations cards + advanced controls
- Operations results now render as compact 3-column cards like the Cases page.
- Added advanced filters for status, branch, assigned staff, physical location, payment, flags, age, appointment and stage.
- Added direct card controls for overall status and staff assignment.
- Added queue-aware MEA/MOFA completion action.
- Added Quick View, Appointment, Payment, Handover, Deliver, Flags and WhatsApp operational buttons.
- Bulk status, bulk staff assignment, Create Batch and Select Visible remain.
- No new database migration is required beyond V3.8.0.


## V3.8.2 Operations build hotfix
Fixed a syntax error in the Advanced Operations Filters stage-name condition.
No UI or workflow changes from V3.8.1.


## V3.8.3 Operations performance + pagination + WhatsApp
- Operations case metadata, stage checks, counts and search index are memoized instead of repeatedly scanning all 11k+ cases on every render.
- Search still runs across the full matching queue; pagination is applied only after search and advanced filters.
- Added 30/60/90-row pagination, first/previous/next/last controls, Select Page and Select All Matches.
- Removed the duplicate Operations heading inside the module and tightened KPI whitespace.
- Added a WhatsApp action centre with Status Update, Ready for Delivery, Payment Reminder, Appointment Reminder, Customer Follow-up and Tracking Details templates.
- WhatsApp message remains editable; supports Copy Tracking, Copy Message and Open WhatsApp.
- Qatar 8-digit mobile numbers are automatically prefixed with country code 974 for WhatsApp.
- No SQL migration required beyond V3.8.0.


## V3.9.0 Payments polish
- Collected Today, This Month, Outstanding and Transactions KPIs.
- Transactions and Receivables tabs.
- Search, payment method/date/balance filters and pagination.
- Record, edit and delete payment transactions with case-balance recalculation.
- Quick payment amounts and Full Balance shortcut.
- Receipt preview and printable A5 receipt.
- Payment activity is written to Case History.
- Operations can open Payments with the case preselected.
- No database migration required.


## V3.9.2 Record Payment UI fix
- Rebuilt only the Record/Edit Payment modal layout.
- Proper two-column field alignment and full-width case selector.
- Consistent input/select sizing and label typography.
- Cleaner Total / Paid / Balance case summary.
- Quick amount buttons aligned in a dedicated row.
- Compact footer with aligned Cancel / Save Payment buttons.
- No database or workflow changes.


## V3.10.0 Advanced Custody
- Current Custody and Movement History workspaces.
- Located, Movements Today, Unassigned Location and History KPI cards.
- Search, branch/location/status/age filters and movement-history filters.
- Compact case cards with current location, document summary, last move and Quick View.
- Search-first Handover modal avoids loading 11k cases into one select.
- Whole-case and document-only movement support. Document-only movements do not overwrite the case-level physical location.
- Destination presets and reusable locations.
- Bulk move selected whole cases.
- Movement detail preview and printable A5 custody/handover slip.
- Staff names resolved from profiles for movement history.
- Pagination for Current Custody and Movement History.
- No new SQL migration required beyond the existing Operations/Custody schema.


## V3.11.0 Delivery hotfix + fast Documents + Advanced Reports
- Restored DeliveryQrScanner and DeliveriesView, which were accidentally removed while V3.10.0 Custody was inserted. This fixes the Deliveries client-side exception.
- Documents & Stages now builds one memoized document index and renders only 60/120/240 rows per page. Search still runs across all documents before pagination.
- Added document/stage filters and sorting while retaining direct stage-status editing.
- Reports rebuilt as an advanced live reporting centre with period, branch, status and search filters.
- Reports includes Overview, Operations, Finance and Case Detail tabs; payments, deliveries, appointments and custody activity are loaded only when Reports opens.
- Added KPI summaries, case-status distribution, branch workload, stage workload, payment-method totals, receivables, pagination, CSV export and dedicated printable report.
- No new Supabase SQL migration required.

V3.11.1: Reports typography normalized to the app-wide sizing, including internal tabs, filters, KPI labels and report content. No logic or SQL changes.


## V3.11.2 UI typography + heading alignment
- Added one common page topbar to every workspace module so heading, top margin, Refresh and New Case stay in the same position.
- Removed the visible duplicate Payments heading and equivalent duplicate internal headings in Appointments, Batch Reports and Deliveries while preserving their module-specific action buttons.
- Standardized typography to the Cases scale across Appointments, Deliveries, Operations, Payments, Custody, Reports and Documents & Stages.
- Increased previously micro-sized labels, tabs, filters, card metadata and tables while keeping font weights moderate.
- No SQL/database changes.


## V3.12.0 Import polish + PDF invoice import
- Existing Excel workflow importer remains unchanged for Kenza Master, Billwise Out, Status Wise and Google Sheet.
- Added multi-PDF invoice import using PDF.js text extraction (no OCR).
- PDF filename number is treated as Kenza internal invoice `#` for automatic matching.
- The billing PDF's printed `TRACKING NO` is explicitly treated as software Bill No., not the customer Tracking Reference.
- Existing cases can auto-match by internal invoice number or Bill No.
- Unmatched PDFs require manual confirmation of the real customer Tracking Reference before import.
- PDF review supports editing Bill No., Tracking Reference, customer and mobile before import.
- Existing cases are only enriched with missing PDF fields; overall status, documents, stages and manual workflow overrides are not replaced.
- New PDF-only cases can be created after the Tracking Reference is confirmed.
- Added import source summary, clear-all control, PDF parse log, match states and safer validation.
- No Supabase SQL migration is required.


## V3.13.0 Customer Tracking
- Rebuilt Tracking Preview as a polished customer-facing tracking experience.
- Tracking lookup uses the customer Tracking Reference; optional mobile lookup is available for internal preview/testing.
- Added overall progress, case status journey, document progress and expandable attestation-stage timelines.
- Added submitted date, document count, balance, ready-for-delivery and delivered messaging.
- Added customer finance summary and contextual WhatsApp action.
- Customer Tracking search does not use software Bill No. as the public tracking key.
- No database migration required.


## V3.13.1 Edit Case save fix
- Rebuilt Quick View → Edit Case save handling.
- Removed manual writes to `updated_at`; database/trigger remains responsible for timestamp updates.
- Update now requests the saved row back with `.select(...).single()` so zero-row/RLS failures cannot appear as silent success.
- Added visible Saving state, inline error response and successful-save notification.
- Added input normalization for tracking, customer, mobile, bill, dates and financial values.
- Refreshes the Quick View case immediately after a confirmed database save.
- Adds a Case edited history entry without blocking the main save if history logging fails.
- No SQL migration required.


## V3.13.2 Customer Tracking — multiple cases per mobile
- Mobile search now returns every case linked to the entered mobile number instead of only the first match.
- Handles Qatar mobile numbers stored either as 8 digits or with the `974` country code.
- If exactly one case matches, it opens directly as before.
- If multiple cases match, customers get a compact case-selection screen with Tracking Reference, customer, submission date, document count, progress, status and balance.
- Cases are prioritised by active/ready status and then by newest submission date.
- After opening one case, `View All Cases` returns to the mobile-linked case list without re-searching.
- Tracking Reference search remains direct and unchanged.
- No SQL migration required.


## V3.14.0 Premium Customer Tracking
- Removed all financial information from the customer-facing tracking result, including total, paid and balance.
- Removed balance from the multiple-cases-by-mobile selector.
- Simplified duplicate status information: the main status is represented by one journey/timeline instead of repeating Current Status and a separate status badge.
- Rebuilt the result UI with a cleaner tracking hero, circular progress indicator, compact summary and premium document cards.
- Added animated entry transitions, progress transitions, active-step pulse and subtle card hover motion.
- Added skeleton loading state before tracking results appear.
- Added reduced-motion accessibility support.
- Document stage details remain expandable and use a cleaner vertical journey.
- No SQL migration required.


## V3.14.1 Customer Tracking Typography + Print / Save PDF
- Increased customer-tracking typography throughout the search, journey, summary, document cards, stage details and mobile multi-case selector.
- Added `Print / Save PDF` beside `Copy Tracking No.`.
- Print action opens the browser print dialog, where users can print or choose `Save as PDF`.
- Print output is limited to the customer tracking result and hides app navigation, controls and internal UI.
- Added A4 print styling and page-break handling for document cards.
- No SQL migration required.


## V3.14.2 Print blank-page fix
- Fixed the extra blank second page in Customer Tracking print / Save PDF.
- Root cause: the previous print CSS used `visibility:hidden` on the app shell. Hidden elements still occupied layout space and Chrome paginated that invisible space onto a second page.
- Print now opens a dedicated print document containing only the customer tracking result.
- Navigation, app shell, buttons and other hidden page layout no longer participate in print pagination.
- Keeps A4 styling and avoids splitting document cards where possible.
- No SQL migration required.


## V3.14.3 Customer Tracking print fix
- Removed popup-window printing, which could print before the cloned page/styles had rendered and result in a blank page.
- Printing now clones the already-rendered result inside the current document, waits for paint, then prints.
- All live app elements are removed from print layout with display:none, preventing both blank output and extra blank pages.
- No SQL migration required.

## V3.15.0 Public Customer Tracking / WordPress
- Added standalone `/public-track` route with no login, sidebar or internal application controls.
- Added server-side `/api/public/track` endpoint.
- API returns an explicit customer-safe whitelist only: Tracking Reference, customer name, submission date, overall status, document names and public stage status.
- It does not return bill number, invoice number, finance, notes, staff, custody/location, flags or other internal case fields.
- Requires `SUPABASE_SERVICE_ROLE_KEY` in Vercel server environment. Never expose this key in WordPress or any `NEXT_PUBLIC_` variable.
- Public mobile lookup is disabled by default. Reference lookup is the recommended public method.
- Direct links supported: `/public-track?ref=58880`.
- WordPress can embed the route with an iframe; see `WORDPRESS_TRACKING_SETUP.md`.


## V3.16.0 Admin / Branch / Staff
- Branch-priority Dashboard and Cases.
- Branch users can switch to All Branches.
- Common Staff login sees all cases.
- Import Data is Admin-only in UI.
- Added active-user RLS and admin-only profile/branch administration.
- Run `supabase/V3_16_ROLE_BASED_ACCESS.sql` before deploy.
