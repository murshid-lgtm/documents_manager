# Kenza Customer Tracking — WordPress Setup

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
