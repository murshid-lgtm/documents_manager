# Customer Tracking — V4.0.20 security update

The historical instructions below describe the old reference-only integration.
For V4.0.20, WordPress integrations must forward the opaque `token` query
parameter to `/api/public/track?token=...`. Manual searches must send
`reference`, `mobile` and the company's `org` slug. A reference alone no longer
returns customer data. Do not cache successful tracking responses in WordPress,
CDNs or page caches; they contain customer information.

Keep the Supabase service key exclusively in Vercel. WordPress calls the app's
customer-safe API; it must never query operational tables with a privileged key.
Use `wp_remote_get`, a configured HTTPS platform URL, a timeout, and WordPress
escaping (`esc_html`, `esc_url`) for every returned value. Do not accept the
upstream URL from a visitor, or log customer links/tokens.

This repository does not contain the separately installed WordPress plugin.
Its code must be updated to pass `token` through before using token links with
an external configured tracking page. Until then, use the app's `/public-track`
page as the tracking URL. Embedded iframe integration is blocked by the app's
frame-denial policy; use a direct link or a server-rendered WordPress integration.

## Historical V3 setup (superseded)

## 1. Deploy V3.15.0 to Vercel
Replace the existing project files with this build and redeploy.

## 2. Add the server-only Supabase key in Vercel
Vercel → Project → Settings → Environment Variables:

`SUPABASE_SERVICE_ROLE_KEY` = your Supabase service_role key

Find it in Supabase → Project Settings → API / API Keys. Keep it server-only. Never put it in WordPress and never name it `NEXT_PUBLIC_...`.

Redeploy after adding the variable.

## 3. Test the public page
Open:

`https://kenza-tracker.vercel.app/public-track`

You can also link directly to a tracking:

`https://kenza-tracker.vercel.app/public-track?ref=58880`

## 4. Add to WordPress
Create a WordPress page such as **Track Documents**. Add a **Custom HTML** block and paste:

```html
<div class="kenza-tracking-embed">
  <iframe
    src="https://kenza-tracker.vercel.app/public-track"
    title="Kenza Document Tracking"
    loading="lazy"
    referrerpolicy="strict-origin-when-cross-origin"
  ></iframe>
</div>

<style>
.kenza-tracking-embed{width:100%;max-width:1180px;margin:0 auto}
.kenza-tracking-embed iframe{display:block;width:100%;height:980px;border:0;background:#fff;border-radius:18px}
@media(max-width:768px){.kenza-tracking-embed iframe{height:1150px;border-radius:12px}}
</style>
```

If your Vercel domain changes, replace the iframe URL.

## Privacy note
Reference lookup is enabled. Public mobile-number lookup is disabled by default because a mobile number can be shared by multiple cases and is easier for another person to know. The internal Customer Tracking preview can continue to support mobile lookup.
