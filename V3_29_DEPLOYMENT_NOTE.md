# Kenza Tracker V3.29.2 Deployment

Before deploying the V3.29 web build, run this file once in the Supabase SQL Editor:

`supabase/V3_29_CUSTODY_RECEIVING_SECURITY.sql`

It adds the required role helper functions, missing custody branch columns, document-level receiving, discrepancy records, receipt notes, and branch-secured custody transfer and item policies. Existing location names are used to backfill branch IDs. It does not delete or replace existing transfer data. The migration is safe to rerun after a failed attempt.

After the SQL completes, deploy the web project normally. Test with one sending-branch account and one receiving-branch account before using a live document batch.
