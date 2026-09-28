# V3.17.10 — New Case Visibility Fix

- Newly created manual cases are inserted into the local Cases list immediately after the database transaction succeeds.
- After creation, the app navigates to Cases, clears filters that could hide the record, and searches the newly created tracking reference.
- Branch users remain scoped to their own default branch; admin is reset to All Branches for visibility.
- The background full reload still runs to reconcile server state.
- `refreshCase()` now fetches the newer workflow/document fields as well, preventing partial refreshes from dropping holder/DD/milestone data in local state.
