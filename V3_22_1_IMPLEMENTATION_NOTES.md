# Kenza Tracker Web v3.22.1

## Branch-aware custody

- Branch logins default to their assigned branch cases.
- Added a branch-view selector populated from the configured branch list.
- Admin users can view all branches and all transfers.
- Branch users see transfers sent from or addressed to their login branch.
- Receipt confirmation is available only to the destination branch; admins can confirm any transfer.
- Receiving branch is selected from the configured branch list.
- Added database policies enforcing transfer visibility and destination-only confirmation.
- Existing transfer records are backfilled to matching branch IDs during migration.

## Required upgrade

Run `supabase/V3_22_1_BRANCH_CUSTODY_ACCESS.sql` once after the previous V3.22 custody migration.

## Verification

- Next.js production build completed successfully.
