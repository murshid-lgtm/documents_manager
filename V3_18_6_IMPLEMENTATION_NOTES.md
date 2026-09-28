# Kenza Tracker V3.18.6

## Search improvements

- Tracking, mobile, bill number, customer name, and all-fields searches now accept partial input.
- Results are ranked with exact matches first, prefix matches second, and contains matches afterward.
- Matches with the same relevance are sorted naturally, so `5818` returns `58180`, `58181`, `58182`, and similar references in numeric order.
- Ranking is applied across Cases, Documents, Appointments, Operations, Deliveries, and other modules that use the shared case search.
- Search placeholders no longer ask for an exact tracking, mobile, or bill number.

## UI consistency

- The Search By selector now uses the same compact width and height in all desktop modules.
- It remains full-width on small screens for usability.

No database migration or Supabase schema change is required.
