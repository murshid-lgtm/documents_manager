# V3.17.12 — Duplicate Tracking Review

- Prevents raw unique-constraint errors when a tracking reference already exists.
- Checks the tracking reference before insert.
- Also catches PostgreSQL/Supabase unique constraint race conditions.
- Opens a review modal showing the existing case, customer, branch, bill, status, balance and documents.
- Keeps the unsaved New Case form intact if the user chooses **Change Tracking Number**.
- **Open Existing Case** closes the New Case workspace and opens the existing case Quick View.
- No database migration required.
