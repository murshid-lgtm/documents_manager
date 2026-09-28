# Kenza Tracker Web v3.27.0

## Quick View identity row

- Kept tracking reference on its own header line.
- Placed the customer name on the left and the case information group on the right of the same line on wide desktop displays.
- The information group includes mobile, submitted branch, bill, current location and status.
- Doubled the desktop information-chip text size and increased chip height for readability.
- Added safe wrapping at narrower desktop, tablet and mobile widths to prevent overlap.

## Status colours

- Added distinct colours for Received, Under Process, Waiting, Completed, Ready for Delivery, Delivered, Returned and Cancelled.
- Colours update automatically when the case status changes.

## Safety

- No workflow or event-handler logic was changed.
- No database migration is required.
- Changes remain scoped to Quick View.
