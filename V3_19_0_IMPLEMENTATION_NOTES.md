# Kenza Tracker V3.19.0 — Premium Operations Experience

## Dashboard and visual system

- Rebuilt Home as a richer operations dashboard with a layered command hero, live workload, Today strip, quick actions, upgraded KPIs, recent cases, and delivery queue.
- Added richer elevation, softer surfaces, stronger hierarchy, improved spacing, subtle gradients, and interactive depth throughout the application.
- Upgraded Cases and operational cards without changing their data or workflows.
- Added a branded full-screen loading presentation.

## Responsive navigation

- Added a mobile web bottom command navigation.
- Central Scan action is elevated and visually prominent.
- Desktop retains the full Kenza workspace sidebar.

## Action-based QR workflow

- QR scan now resolves the case first and shows four actions: Open Case, Delivery, Handover, and Payment.
- Delivery routes into the existing customer-delivery workflow and preserves document selection and partial delivery.
- Handover routes into the existing Custody workflow with the scanned case preselected.
- Payment routes into the existing payment form with the scanned case preselected.
- The action scanner is available globally and from the Deliveries page.

## Case actions

- Quick View now includes a premium dark operational dock for Delivery, Handover, Payment, Appointment, Print Label, and Edit Case.
- Delivery is explicitly treated as documents given to the customer.
- Handover is explicitly treated as internal custody transfer.

No database migration or Supabase schema change is required.
