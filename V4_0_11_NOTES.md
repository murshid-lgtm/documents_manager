# V4.0.11 — Logo Studio and collapsed-sidebar repair

## Branding improvements

- Company logos now render inside a white, rounded container with a subtle border and shadow.
- Transparent logos remain readable on the dark application sidebar and login presentation.
- Company administrators and platform super administrators can independently configure:
  - Application sidebar logo size: 50–130%.
  - Application sidebar alignment: left, center or right.
  - Login logo size: 50–130%.
  - Login logo alignment: left, center or right.
- Both logo placements have live previews in Company Management → Branding.
- Desktop and mobile login previews use the same saved logo layout.

## Collapsed sidebar

- The user-name initial/avatar is hidden when the sidebar is collapsed.
- Settings and Sign Out remain as a clean vertical footer stack.
- The collapsed company-logo container uses a compact square surface and no longer overlaps navigation.

## Required Supabase update

Run `supabase/V4_0_11_LOGO_LAYOUT.sql` once on an existing V4 database before saving the new logo controls.

Fresh installations can use the updated `supabase/V4_0_CLEAN_INSTALL.sql` directly.
