# Security baseline — V4.0.20

## Authentication

- Passwords are owned by Supabase Auth and are never stored in application
  tables or logs. Staff accounts are created with email invitations; the
  application never accepts or stores an administrator-chosen staff password.
- Login is proxied through `/api/auth/login`, restricted to same-origin JSON
  requests and limited to 10 attempts per email/IP pair per 15 minutes.
- Password-reset requests are generic to prevent account enumeration and are
  limited to 5 per email/IP pair per hour.
- Additional IP-wide limits prevent evasion by changing the email address.
- Logout uses Supabase's global sign-out and clears the user's local case cache.
- Every authenticated database policy verifies the JWT session ID against
  `auth.sessions`. Revoked sessions and JWT lifetimes above 24 hours are rejected.
- Production Supabase configuration must keep JWT expiry at 3600 seconds,
  reset/OTP expiry at 3600 seconds, password minimum at 12 characters, and
  leaked-password protection enabled.

## Endpoint authorization matrix

| Endpoint | Authentication and resource authorization |
|---|---|
| `POST /api/auth/login` | Public, same-origin only, server rate-limited; returns only a short-lived Supabase session. |
| `POST /api/auth/password-reset` | Public, same-origin only, server rate-limited; always returns a non-enumerating response. |
| `GET /api/public/track` | Public, server rate-limited; requires an opaque case token or tracking reference plus registered mobile. Only customer-safe fields are returned. |
| `POST /api/platform/users` | Active platform owner or company admin. Company admins are tenant-bound and cannot create admins. Branch IDs are validated against the target company. |
| `PATCH /api/platform/users` | Active platform owner or company admin. Company admins cannot edit admin/platform-owner accounts, cross tenants, or assign admin. |
| `POST /api/platform/branding-upload` | Active platform owner or tenant admin. Organization ownership is checked; uploaded images are decoded, bounded, metadata-stripped and re-encoded. |
| `POST /api/notifications/process` | Server bearer secret compared in constant time. The state-changing `GET` alias is disabled. Pending jobs are conditionally claimed to prevent duplicate processing. |

Operational resource authorization is enforced again in Supabase RLS. Branch
users can edit submitted cases and cases received for processing. Pending
receiving branches have read access to transfer cases; receipt confirmation is
transactional and restricted to the recipient or an administrator. Staff/admin
access remains tenant-bound. Only the platform
owner can cross tenant boundaries. Privileged `profiles` fields cannot be
written directly by authenticated clients.

## Database query safety

Application database access uses the Supabase query builder/RPC parameter
binding. No application query constructs SQL, MongoDB filters, or raw ORM text
from user-controlled input. The security migration adds composite tenant-parent
constraints for new writes.

## Secrets and repository exposure

The repository must contain only `.env.example` placeholders. The following
values belong in Vercel server-side environment variables and must never use a
`NEXT_PUBLIC_` prefix:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RATE_LIMIT_PEPPER`
- `NOTIFICATION_PROCESS_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`

Enable GitHub Secret Scanning and Push Protection in repository settings. If a
real secret is ever committed, deleting the file is insufficient: revoke/rotate
the credential first, then remove it from Git history.

## Production controls

`next.config.mjs` disables the framework signature and production source maps,
and sets CSP, HSTS, frame denial, MIME sniffing protection, a no-referrer policy,
permissions policy and cross-origin isolation headers. API errors use a stable
JSON shape and log detailed failures only on the server with a request ID.

Run before release:

```bash
npm ci
npm run security:check
```

The regression suite uses an isolated PostgreSQL engine with fixtures, not
production customer data. It verifies tenant/branch permissions, privilege
escalation prevention, parent matching, receipt idempotency, session revocation
and atomic rate limits. PDF workers are copied from the pinned dependency during
build and served locally so import continues working under CSP.

## Release order

1. Verify a backup and apply `supabase/V4_0_20_SECURITY_HARDENING.sql` to the
   Document Manager database. Do not apply it to the separate legacy V3 project.
2. Confirm Vercel has a server-only Supabase service key and `APP_ORIGIN` set to
   the platform HTTPS URL. Set a random `RATE_LIMIT_PEPPER`; never put a service
   key in a browser variable.
3. Deploy this version, then test sign-in, branch transfer receipt, payment,
   branding and invitations using test accounts.
4. Verify Supabase Auth JWT/OTP expiry (3600 seconds), minimum password length
   (12), provider login/reset rate limits, authorized redirect URLs and leaked
   password protection in its dashboard. These provider settings cannot be
   inferred or changed by application source. The public Auth endpoint remains
   governed by Supabase's own limits, even when login is proxied by this app.

CSP retains `unsafe-inline` for the existing Next.js runtime and inline print
layouts. Moving to nonce-based scripts is a separate architectural change; this
release does not claim a strict nonce-only CSP.

## Reporting a vulnerability

Do not open a public issue containing credentials or customer data. Contact the
platform owner privately, include reproduction steps, and rotate any potentially
exposed credential immediately.
