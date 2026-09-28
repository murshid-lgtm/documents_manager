-- Kenza Tracker V3.17.5 — per-shipment required work + shipment CRUD support
-- Additive migration. Does not delete existing shipment or case data.
begin;

alter table public.courier_shipment_items
  add column if not exists required_attestation text;

comment on column public.courier_shipment_items.required_attestation is
  'Work/attestation assigned to the receiving agent for this specific shipment only. Does not replace the document full workflow.';

commit;
notify pgrst,'reload schema';
