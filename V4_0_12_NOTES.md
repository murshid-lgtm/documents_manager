# V4.0.12 — Brand Surface Controls & Search Menu

## Included

- Replaced the browser-native **Search by** select with a compact, application-styled field menu.
- Added clear selected-state styling, descriptions, keyboard Escape handling, outside-click close, and a mobile bottom-sheet presentation.
- Rebuilt the logo layout editor so wide or transparent logos cannot overflow into the controls.
- Added independent settings for the **application sidebar** and **login page**:
  - show or hide logo;
  - logo size;
  - left, center or right alignment;
  - container background color;
  - container corner radius.
- Updated live desktop/mobile previews and the real sidebar/login surfaces to use those settings.
- Preserved the text/initial fallback when no company logo has been uploaded.

## Database update

Run `supabase/V4_0_12_BRAND_SURFACE_CONTROLS.sql` once in the Supabase SQL Editor, then deploy this build.

This migration is self-contained: it also creates the V4.0.11 size/alignment fields when they do not already exist.
