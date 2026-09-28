# V3.17.13 — WhatsApp Direct Tracking Share

- After a manually-created case succeeds, opens a customer tracking share modal.
- Generates a unique QR code containing the direct tracking URL for that tracking reference.
- WhatsApp button opens a prefilled customer message with the tracking number and direct tracking link.
- Qatar 8-digit mobile numbers are automatically prefixed with +974 for WhatsApp.
- Added Copy Link and Share / Download QR actions.
- On supported mobile browsers, Share QR uses the native share sheet with the QR image file and tracking message; on other browsers it downloads the QR image.
- The customer link uses `NEXT_PUBLIC_CUSTOMER_TRACKING_URL` when configured, otherwise falls back to the current Vercel `/public-track` page.
- No Supabase migration is required.
