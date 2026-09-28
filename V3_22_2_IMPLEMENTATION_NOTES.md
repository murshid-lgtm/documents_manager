# Kenza Tracker Web v3.22.2

## Critical fix

- Fixed the client-side exception affecting Operations and Custody.
- Restored Operations branch variables to the Operations component.
- Moved Custody branch scope variables into the Custody component where they belong.

## Quick View custody location

- Added each document's physical location to all case-loading queries.
- Added Current Location to the Quick View hero.
- Added Submitted Branch and Current Location as separate case details.
- Added document-level Current Location badges.
- Shows Mixed locations when a case's documents are held in different places.

## Verification

- Next.js production build completed successfully.
- No additional SQL is required beyond the V3.22 and V3.22.1 migrations.
