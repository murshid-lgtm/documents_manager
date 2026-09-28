# V3.17.8 – Complete Manual Case Transaction

- Rebuilt New Case as one continuous transaction for customer/tracking, documents, stages and financials.
- Supports multiple documents before saving the case.
- Each document has its own holder, quantity, stage workflow and DD / Direct-to-Delhi flag.
- DD is no longer set at case level during manual case creation. Legacy case DD columns remain for backward compatibility but new manual cases save them as false/null.
- Complete creation uses best-effort rollback if a document or stage insert fails, reducing half-created manual cases.
- No database migration required.
