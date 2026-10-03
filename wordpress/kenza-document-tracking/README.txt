Document Tracking Connector 2.7.0

Replace the existing connector in WordPress (keep the same plugin folder).
Settings > Document Tracking:
Platform URL: your tracker platform HTTPS URL (no /api suffix)
Organization slug: your exact company slug
Company name and search wording: customize as needed
Shortcode: [kenza_tracking]

Search by exact tracking number OR customer mobile number. Mobile searches list
all matching cases (up to 100 per query); select a case to view document progress.
Secure shared links with token/ref are supported. This connector needs no database
key or service-role secret. Financial information and internal notes are omitted.
Clear website/cache plugin/CDN caches after replacing the plugin.


CLEAN DIRECT LINKS — 2.6.2
Keep a published WordPress page at /track/ containing [kenza_tracking]. Replace the previous plugin with this ZIP, then open Settings > Document Tracking once. If a pretty link returns 404, open Settings > Permalinks and click Save Changes without changing the selection.
Set the company Customer Tracking URL to https://mellodeals.com/track/. New links become https://mellodeals.com/track/112200. Organization selection remains in saved connector settings, not the customer URL. Existing ?ref= links still work. References containing slash use query links for compatibility. To prefer query links, configure https://mellodeals.com/track/?ref=. Custom {ref} URL templates are supported by the app; configure the matching route on that website.
Only /track/<reference> routes are added. Other website pages are unaffected. No database credentials are needed in WordPress.

SERVICE TRACKING — 2.7.0
Invoice services now support a separate service journey and customer-facing result. Search by job reference, invoice reference, customer mobile or a secure shared token. Internal notes, accounting entries, balances and prices remain private. Existing attestation searches and clean URLs continue to work. Replace the existing connector, preserving its company settings, then clear website caches.
