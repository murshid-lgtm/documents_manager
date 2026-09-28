# Kenza Tracker Web — V3.21.0

## Notification Centre

- Added a top-bar bell with a live unread counter.
- Shows recent case, payment, delivery, custody, appointment, courier and warning activity.
- New activity is visually highlighted.
- `Mark all read` is stored per signed-in user in the browser.
- Refreshes automatically every 60 seconds and supports manual refresh.
- Clicking a notification opens the related case directly.

## Activity Audit Log

- Uses the existing `case_history` records; no new database table is required.
- Displays action, case, customer, staff member, timestamp, field, old value and new value.
- Search by case, customer, action, field or value.
- Filter by module and exact date.
- Administrators can filter activity by staff member.
- Respects existing database permissions and row-level security.
- Audit results can be exported as PDF, Excel, Word or CSV.

## UI

- Premium right-side activity drawer with responsive mobile layout.
- Module-specific colors and icons.
- Loading, filtered-empty and caught-up states.
- Unread indicators and compact relative timestamps.

## Deployment

- Version: `3.21.0`
- Database migration: **Not required**
- Production build: **Passed**
