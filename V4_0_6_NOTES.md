# V4.0.6 — Import Recovery

- Matches branch names case-insensitively and treats `Branch` / `Office` suffixes as equivalent (for example, `Corporate Office` matches `Corporate branch`).
- Checks imported tracking references directly against Supabase before showing the duplicate summary.
- Re-checks every tracking reference immediately before insert, so a retry after a partial import follows the selected duplicate policy instead of hitting the unique constraint.
- Removes a newly created case automatically when its document or stage import fails, preventing new partial case records.
- Reports unresolved branch names during workbook review and lists the available company branches.

No SQL migration is required.
