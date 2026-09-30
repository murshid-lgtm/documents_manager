# V4.0.17 — Branding, Custody History and Workflow Modal Upgrade

## Required database step

Existing installations must run this file once in the Supabase SQL Editor before deploying the web build:

`supabase/V4_0_17_BRANDING_CUSTODY_HISTORY.sql`

The migration is safe to run once on the current V4 database. It adds the new independent logo layout settings, refreshes public branding output and repairs custody receipt history creation.

## Included improvements

- Brand assets and logo layout moved into a compact collapsible editor.
- Sidebar, login story-panel and login sign-in-card logos can be shown/hidden and sized independently.
- Each logo surface has independent scale, alignment, container width, height, background and corner radius with live preview.
- Delivery detail modal rebuilt as a clearer customer-handover record.
- Payment receipt modal rebuilt as a premium receipt preview.
- Confirmed custody receipts now create document-level custody movement history.
- Received custody transfers remain accessible in a printable archive.
- Custody handover slips and transfer manifests use the premium print system.
- Batch and shared report headers now inherit the company primary, secondary and accent colours.
- Responsive styling added for the new branding controls and modal layouts.

## Custody note

The migration also restores missing history rows for already received transfers. It uses the saved transfer route as the historical origin/destination; this is reliable for normal single-origin transfers. A legacy bulk transfer saved as “Multiple locations” will retain that label because the former per-document origin was not stored separately.
