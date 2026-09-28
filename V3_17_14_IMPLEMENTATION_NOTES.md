# V3.17.14 — Editable WhatsApp Case Details

- The post-create WhatsApp message now includes customer-facing case details from the saved case: tracking number, customer, submission date, documents/quantities, differing document holder names, current status, and the direct tracking link.
- The success/share modal now contains a full editable message preview.
- Staff can edit any text before sending, reset to the generated default, or copy the final message.
- `Send via WhatsApp` uses the edited preview exactly as shown.
- QR sharing uses the edited message as the native share text while the QR itself continues to point only to the direct live tracking URL.
- Internal fields such as finance, Bill No., notes, DD/workflow internals, and staff data are intentionally excluded from the generated customer message.
- No Supabase migration is required.
