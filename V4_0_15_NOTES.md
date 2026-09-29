# V4.0.15 Public Tracking Hotfix

- Corrected the public tracking API organization filter.
- V4 organizations use `status = 'Active'`; the previous API incorrectly
  queried a non-existent `is_active` column.
- Organization lookup failures now return a clear server error instead of
  incorrectly reporting that the workspace does not exist.
- No SQL migration and no WordPress plugin update are required.
