-- Kenza Tracker V3.17.15
-- Fix case deletion when a document has previously been added to a courier shipment.
-- Existing courier shipment item links are removed automatically if the document/case is deleted.

begin;

alter table if exists public.courier_shipment_items
  drop constraint if exists courier_shipment_items_document_id_fkey;

alter table if exists public.courier_shipment_items
  add constraint courier_shipment_items_document_id_fkey
  foreign key (document_id)
  references public.documents(id)
  on delete cascade;

commit;
notify pgrst,'reload schema';
