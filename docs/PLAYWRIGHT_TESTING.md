# Playwright browser testing

Run `npm ci`, `npx playwright install chromium`, then `npm run test:playwright`.
View screenshots, failures and traces with `npx playwright show-report`.

Use `PLAYWRIGHT_BASE_URL` to target an authorized staging deployment. Defaults to the Kenza production portal. Live tests do not create records or send emails; the rejected-login test intercepts the login request. Never store passwords, API keys or browser session files in git. Authentication state is ignored under `playwright/.auth/`.

The mobile fixture loads the actual React navigation and stylesheet sources with isolated sample data. Run only this coverage with `npx playwright test --project mobile --grep 'real mobile'`. This checks interactions, not database persistence.

Optional `PLAYWRIGHT_CHROMIUM_PATH` selects a preinstalled Chromium executable. Optional `PLAYWRIGHT_PROXY` configures a testing proxy and ignores certificate errors in the test browser only (for intercepted proxy TLS); omit for normal direct connections. Neither option changes app runtime behavior.

## First run — 20 October 2026

- PASS: three Playwright mobile interaction scenarios: More/menu search/routing/background restoration; Escape and tracking search; Fern/Studio light/dark menu overflow checks.
- PASS, supporting existing Puppeteer suites: 46 mobile navigation checks and 150 mobile dialog checks.
- BLOCKED: production Playwright checks. This runner returned ERR_EMPTY_RESPONSE and EAI_AGAIN for the production domain; proxy attempt encountered an untrusted proxy certificate, then stalled after a test-only TLS bypass. These are environment access failures, not confirmed app defects.
- NOT TESTED: authenticated browser-to-database customer, POS, invoice, quote, attestation, payment, receipt, expense/liability, email and report workflows. Need an accessible deployment and dedicated test-company account. Existing fixture checks must not be presented as end-to-end production verification.

No production records changed and no customer email was sent. This is initial coverage, not a complete application certification.
