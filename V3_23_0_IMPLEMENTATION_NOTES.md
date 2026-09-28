# Kenza Tracker Web v3.23.0

## Quick View workspace redesign

- Reorganized the desktop Quick View into a dedicated operational workspace.
- Moved case identity, submitted branch, bill number, current physical location, status and close controls into a compact left rail.
- Preserved Delivery, Handover, Payment, Appointment, Print Label, Edit Case and Delete Case actions without changing their handlers.
- Kept finance, document, active-stage and promise-date KPIs visible above the working area.
- Retained document and attestation editing behavior in the main workspace.
- Added a dedicated Activity History panel with an independent visible scrollbar.
- Increased loaded case-history entries from 30 to 150 so older activity can be reviewed.
- Preserved the existing mobile Quick View behavior with a focused mobile activity-scroll enhancement.

## Scope and safety

- No database migration is required.
- No Operations, Custody, Delivery, Payment or Appointment workflow logic was changed.
- New layout rules are scoped to `.quick-modal-v323` and do not alter other application modals.
- Production build completed successfully.
