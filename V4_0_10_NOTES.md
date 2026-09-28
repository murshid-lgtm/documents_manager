# V4.0.10 — Compact controls, navigation polish and delete fix

## Interface updates

- Quick View close control is now a smaller circular chip on desktop and mobile.
- Favorites now use a bookmark icon in cards, Quick View, shelves and the favorites-only filter.
- Favorites-only and Advanced Filters are compact icon controls beside search.
- Search-field selectors are compact icon controls throughout the application while retaining their accessible field labels and native option menu.
- Favorites and Recently Viewed shelves now include independent Clear actions.
- Role, notification and primary top-bar controls use a consistent height.
- The sidebar collapse arrow is centered and easier to target.
- Collapsed navigation provides menu-name hover labels and vertically stacks account, settings and sign-out controls.
- Company Management remains available from the footer settings control and is no longer duplicated in navigation.
- Uploaded company logos replace the generic product-name lockup in both the application sidebar and login page.

## Case deletion repair

- Delete review now also detects protected custody-transfer items.
- A safe case first attempts the direct case deletion.
- If the database reports that only the case's own document records block deletion, those internal documents/stages are removed and the case deletion is retried.
- External operational links remain protected and are never silently removed.

## Verification

- `npm run build` completes successfully with Next.js 15.5.25.
- No database migration is required for this release.
