# V3.18.2 — Tracking Family Reconciliation

- Slash-style Google tracking rows such as `55465/1` are no longer created as standalone cases when their root family exists.
- Their documents attach to the root case while `source_tracking_reference` preserves the exact slash reference and holder name.
- Dry-run now separates Family child rows from true Google-only cases.
- Added normalization for dated `DLD18.02.2026` / `RDL21.07.2026` forms and spacing/typo variants including `R - UAE`, `R-NOTORY`, and `R QATAR EMBASSY`.
- Duplicate Kenza references remain blocked.
- No database migration required.
