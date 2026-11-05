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
2. Complete upload retry recovery for ambiguous storage responses and test real private-file uploads/downloads/cleanup with scoped customer records. Current file recovery tests are mocked.
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
