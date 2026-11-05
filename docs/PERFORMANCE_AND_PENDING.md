# Performance and remaining work — 5 November 2026

## Current speed architecture
- App JavaScript/CSS is cached locally by the service worker. Authenticated pages, API responses, customer records and transactions are excluded.
- Workspace snapshots are scoped to user, organization, role and branch, held in memory for 30 seconds and invalidated after changes/sign-out.
- PDF generation already shares concurrent requests, reuses server Chromium, caches artwork, and renders preview pages on demand.
- This batch increases small-PDF capacity from 8 to 32 browser entries and 10 to 40 server entries, retaining the existing 12 MB / 20 MB limits and expiry periods. Recently reused entries stay longer. Changed document content/paper remains a separate cache entry. Server keys include user and hostname; access is checked before server cache output.
- No new paid cache service or permanent browser storage for customer documents was introduced.

## Observed production sample (5 November 2026)
One existing production request, retrieved from runtime logs; not a percentile or a speed guarantee. Access: 100 ms; generation: 3393 ms; browser startup: 2984 ms; layout: 144 ms; print: 176 ms; output: 192276 bytes. The logged function region was bom1. This shows renderer startup dominated this sample, rather than database access. Do not infer the database region from this log.
This batch extends renderer idle reuse from 3 to 15 minutes within a warm instance, without adding keep-alive requests. New function instances can still incur browser startup.

### Post-release live verification
Release `dd6ec34a41782382dd1f4247b769e1bdadfcb9db`, deployment `dpl_9e9VL6mV8AmEThNWx5pq5G5Ev2FS`: signed in and opened the invoice and job order for case **112233 — TEST**. Both reached a one-page PDF-ready preview. Reopening the invoice also reached PDF ready; the retrieved logs contained one invoice generation request, consistent with browser cache reuse. No records were changed and no external messages were sent.

| Document | Access | Generation | Browser acquisition | Layout | Print |
| --- | ---: | ---: | ---: | ---: | ---: |
| TEST invoice | 347 ms | 3442 ms | 2981 ms | 201 ms | 183 ms |
| TEST job order | 357 ms | 4341 ms | 4042 ms | 181 ms | 43 ms |

These are two individual server-side samples, not end-to-end latency or percentiles. Both logs reported region cle1. The second document still incurred expensive browser acquisition, so a longer idle timeout does not establish that separate production requests reuse the same instance. The browser inspection API did not expose Performance entries; no numeric browser timing was verified. Further cold-start improvements must account for function lifecycle, rather than relying on idle reuse alone.

Code inspection also confirms that `AppShell.loadCases` progressively loads 300 rows at a time but continues through the entire accessible case history. The first-page UI is responsive sooner, but this is not server-side pagination of the user's current view. Splitting dashboard aggregates and list/detail queries remains a material speed opportunity.

### Case-loading implementation batch
Case document hydration now runs at most two 50-case groups concurrently. Each group's 250-document pages remain sequential and complete. Results retain input group order even when the second group finishes first. A failed group settles its current pair, stops further groups and fails the response instead of returning partial workflow data. Reads continue using the signed-in user's token and tenant filters. Targeted mocked tests cover overlap/concurrency limits, complete pagination, tenant scoping, stable ordering and failed-pair isolation. This reduces the sequential query waterfall; production latency improvement has not yet been measured. Full-history loading still needs the broader list/dashboard redesign.

## Measured local benchmark
Synthetic one-line invoices; renderer/cache only. Authentication, network, production cold starts, artwork retrieval and device preview are excluded. These are individual measurements, not production percentiles.

{
  "scope": "Local synthetic PDF generation only; excludes access RPC, network and device preview.",
  "cold_render_ms": 296.76,
  "reopen_after_12_documents": {
    "previous": {
      "ms": 92.35,
      "cache": "miss"
    },
    "improved": {
      "ms": 0.15,
      "cache": "hit"
    }
  }
}

Run: `PDF_TEST_SKIP_CHOWN=1 node scripts/pdf-latency-benchmark.mjs`.
The benchmark compares the current source against `origin/main`; after publishing, set `PDF_BENCH_BASE_REF=bc5e7267e255cc060d08ae13367f3cf273ae450d` to repeat this before/after comparison.

## Pending, in priority order
1. Measure production end-to-end PDF latency by cold/warm/cache-hit paths and document size. Existing Server-Timing separates access and generation; browser measures separate artwork and request time. Collect p50/p95 before promising a speed target.
2. Live-test private-file upload reconciliation, downloads and cleanup with scoped customer records. Retry now retains the same ID, immutable path and selected file while its window stays open. Recovery after closing/reloading the window remains outside this implementation. Current recovery tests are mocked.
3. Live verification of the recent customer register/editor/renewal recovery changes, including company timezone and staff/vehicle owner access. Appointment conflict and bulk conflict tests were separately verified live on case 112233; that does not establish live coverage for customer records.
4. Audit workspace startup and large case/customer lists for repeated full-history reads, query waterfalls, response size and index use. Prefer scoped pagination, server aggregates and mutation-driven invalidation over long-lived stale lists.
5. Complete broader role/branch/custody regression verification, especially received-custody access and custody history. Keep submitted branch separate from current document location.
6. Review and implement the remaining customer portal, theme/CRM styling and mobile polish against the original requirements. These are not declared complete by the reliability releases.

## Next speed decisions
- Optimize first-open artwork sizes, query count and server/database placement from measured phase times.
- Consider a private shared server cache only if production measurements show excessive misses across function instances; assess usage/cost and keep authorization before every output.
- A full offline customer-data copy requires explicit product rules for shared devices, expiry, synchronization and conflicts. Continue caching static app assets locally; do not silently persist financial/customer documents.
- Target fast repeat previews, but do not promise instant cold PDFs or use cached balances/permissions as authority for payments, delivery or access decisions.

## Current batch validation scope
Private-file recovery, PDF cache capacity/eviction, copied byte isolation, request sharing, cancellation, access checks, PDF content/pagination and desktop/mobile preview. Tests using mocked data must not be described as complete live database verification. External email and WhatsApp queues are not invoked.

## Private upload reconciliation batch
- Keeps the selected File and stable metadata ID/path during an uncertain upload. A retry cannot silently create another attachment.
- If metadata insert fails or throws, checks the exact scoped row before proceeding. If storage upload fails or throws, downloads through the same user access policy and compares SHA-256 content hashes before reporting success. No upsert and no automatic metadata deletion on an uncertain storage result.
- Disables another upload until the current attachment is confirmed; exposes Retry attachment, guards duplicate clicks and suppresses stale completion messages when the record scope changes. Selected files are held only in component memory, not persistent browser storage. Closing/reloading loses this retry draft; existing metadata may still need manual review/removal if the object never uploaded.
- Validation: helper tests cover lost insert/upload responses, denied/mismatched metadata lookup, different stored content, offline recovery and stable IDs. 22 mocked desktop/mobile file UI checks cover recovery and existing error/removal behavior. Live storage/database verification is still pending.

## Live verification of release 458ac315
Deployment `dpl_H4fEMAQc3ksCdea4QYj7PzXF9R9C` was verified READY with client and master aliases and no alias error. Signed-in workspace loaded all 731 accessible cases. On customer TEST (`8666af93-6e14-4897-b9b8-bf3f36b9997a`), created the clearly labelled disposable record `4f4b283e-dd4b-4185-aa13-bebd553e8dfd` with reminders disabled and no expiry date. Uploaded a synthetic 624-byte PDF, downloaded it through the UI, and verified identical SHA-256 hashes (`968b5f6f1d5c8c2cb1d7d071fd7a1bb81c039124e0f5360e978ac4790560c2be`). SQL confirmed exactly one metadata row and a storage object; record was then archived through the UI and SQL confirmed archived=true, reminders=false, expiry=null, files=1. The synthetic attachment is retained in archive history. No email or WhatsApp messages were sent. This validates the ordinary upload/download/archive path, not live response-loss injection or all roles/RLS combinations.

A tab opened before deployment encountered a stale lazy CRM chunk (`ChunkLoadError`); a full reload restored CRM. The next saved batch changes the route error boundary to offer Reload workspace for failed app code loads, retaining ordinary reset for other errors. It performs no automatic reloads. Targeted handler tests pass. This error-boundary change is not yet deployed.

## Saved follow-up: recovery after closing the upload window
A failed download now offers reselecting the original attachment. Its name (using the stored 200-character limit), size and MIME type must match before upload begins. Reselection reuses the existing metadata ID and schema-bound object path; storage upsert remains disabled. Existing stored bytes are reconciled by the upload helper, so a different file cannot overwrite a committed object. No permanent browser copy is introduced. Scope/list refresh clears the repair prompt. This is a saved, not-yet-deployed follow-up; live reselection and role checks remain pending. Mocked tests cover wrong-file rejection and successful reselection after remount with the existing ID/path.
