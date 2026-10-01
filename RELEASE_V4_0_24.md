# V4.0.24 — account workspace and sharing fixes

- Access Management uses compact account rows, search and role filters, with responsive create/edit forms and module controls. Company administrators manage their company's staff; the platform owner manages company administrators. Account removal preserves business records. Self-deactivation/deletion controls are disabled.
- Tracking receipts decode their image bytes locally instead of fetching a data URL blocked by the production Content Security Policy. WhatsApp opens during the click gesture; downloaded receipts can be attached manually. Cancelling native sharing does not display a network error.
- Cases remembers card/table selection per company and account on this browser, with migration from the previous preference.
- Notification actions reveal beside the group header. Expanded child rows remain stationary. Active and archived groups share the same layout, with larger readable labels and touch-safe action buttons.
- Company website links use `/track/112200` by default. WordPress Connector 2.6.2 adds that route. Existing query links continue working. Built-in tracking retains organization/token scoping; external connectors resolve their organization from saved settings.

## WordPress update

Replace the old plugin with `document-tracking-connector-2.6.2.zip`. Keep the `/track/` page containing `[kenza_tracking]`, and the saved organization slug (for Kenza: `kenza-services`). Open the connector settings once after replacing it. If `/track/112200` returns 404, save WordPress Permalinks without changing its selection. Set the web app's company Tracking URL to `https://mellodeals.com/track/`. References containing `/` use query links for host compatibility. To explicitly keep query links, configure `https://mellodeals.com/track/?ref=`.

## Verification

Production Next.js build, 67 existing security assertions, local receipt/link regression tests, production dependency audit (zero reported vulnerabilities), WordPress PHP parser, and layout checks at 360/768/1440px with sample accounts. No live staff or business records were changed by tests. WordPress server installation and authenticated production workflows require confirmation after release.
