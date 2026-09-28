# Kenza Tracker V3.17.0

This release adds the first production implementation of the revised workflow model.

## Included
- Courier Shipments module with batch creation, manifest printing, dispatch, receipt confirmation and bulk document milestone updates.
- Case tracking family support while preserving exact tracking references such as `/1`.
- Document holder/source tracking fields.
- B2B / organization account fields and case filters.
- Collection / branch / external-office intake source.
- DD (customer direct to Delhi) flag and filters.
- Current operational milestone + milestone date at case and document level.
- Stage milestone date display.
- Google operational status parser for known Kenza shorthand patterns, while keeping unknown values reviewable.
- Import cutoff date defaults to the first day six months ago.
- Import finance is now software-authoritative instead of Google-authoritative.
- Branch normalization includes Collection -> Safari and Bill No fallback: S/A Safari, A/A Al Khor, H/A Corporate Office.

## Database
Run `supabase/V3_17_WORKFLOW_COURIER_IMPORT.sql` after the V3.16 role migration. It is additive and does not delete existing cases.

## Important before fresh production import
Use Import Data -> Analyze first. Review all unrecognized Google status values and unmatched records before deleting the current operational data.
