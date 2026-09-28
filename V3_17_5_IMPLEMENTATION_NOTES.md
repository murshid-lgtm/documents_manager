# Kenza Tracker V3.17.5

- Courier shipment items now store **Required Attestation / Work** per shipment.
- Required work is entered manually for each selected document; the manifest no longer prints all document stages automatically.
- Stage names appear only as quick-pick chips to help staff enter the assignment.
- Courier shipments now support Create, Read/Details, Edit and Delete.
- Edit can change shipment details, add/remove documents and change each document assignment.
- A4 portrait manifest prints only the work assigned to that shipment.
- Deleting a shipment removes its shipment items but intentionally does not reverse document milestones already recorded by a previous dispatch/receipt action.

Run `supabase/V3_17_5_COURIER_REQUIRED_WORK_CRUD.sql` before deploying this build.
