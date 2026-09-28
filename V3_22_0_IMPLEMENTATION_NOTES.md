# Kenza Tracker Web v3.22.0

## Branch custody transfer workflow

- Replaced immediate custody moves with transfer requests and receipt confirmation.
- Added multi-document selection within a case.
- Added bulk dispatch batches containing all documents from selected cases.
- Added an In Transit queue with transfer number, route, case count and document count.
- Physical document location changes only after Confirm Received.
- Submitted/original branch remains unchanged.
- Partial batches produce a Mixed locations case summary until all documents share one location.
- Safari can create return batches with any combination of completed documents.
- Increased text and control sizes throughout custody dialogs.

## Required setup

Run `supabase/V3_22_CUSTODY_TRANSFER_WORKFLOW.sql` once in Supabase SQL Editor before deploying this build.

## Verification

- Next.js production build completed successfully.
