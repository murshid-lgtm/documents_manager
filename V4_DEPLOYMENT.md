# Document Operations Platform V4.0

## New-project installation

V4 is designed for a completely new Supabase project, GitHub repository and Vercel project. It does not require or reuse the Kenza V3 database.

1. Create a blank Supabase project.
2. Run `supabase/V4_0_CLEAN_INSTALL.sql` once in the Supabase SQL editor. Do not run the V3 migrations.
3. In Supabase Authentication, create the first owner user with email and password.
4. At the bottom of `V4_0_CLEAN_INSTALL.sql`, copy the commented bootstrap block, replace the owner email and company placeholders, remove the comment markers and run it once. This makes that user the Platform Super Admin and creates the first company and branch.
5. Create a new GitHub repository and push only the V4 source. Do not commit `.env.local`, service keys, `node_modules` or `.next`.
6. Create a new Vercel project from the new GitHub repository.
7. Add the environment variables below in Vercel and deploy.

## Required environment variables

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and is used by `/api/platform/users` to create staff accounts. Never expose it as a `NEXT_PUBLIC_` value.

For the first dedicated installation, set:

```text
NEXT_PUBLIC_ORGANIZATION_SLUG=customer-slug
```

Use the organization slug entered in the bootstrap SQL. For shared SaaS hosting, set each company's **Primary login domain** in Platform Management. The unauthenticated login screen retrieves only safe visual branding fields by hostname.

## New GitHub repository

Initialize a new repository from this source folder. Exclude the old release ZIP files and build output. Recommended first commands:

```text
git init
git add .
git commit -m "Document Operations Platform V4 clean install"
git branch -M main
git remote add origin YOUR_NEW_GITHUB_REPOSITORY_URL
git push -u origin main
```

## New Vercel project

Import the new GitHub repository into Vercel as a new project. Framework preset: Next.js. Do not connect it to the old Kenza project. Add the Supabase URL, publishable/anon key and server-only service-role key to Production, Preview and Development as appropriate, then deploy.

## Platform owner workflow

- Open **Platform Management** from the administration section.
- Create a company as either **Shared SaaS tenant** or **Dedicated installation**.
- Configure company/product identity, logo URLs, colors, login copy, tracking URL, support details and primary domain.
- Create branches and staff accounts, then assign company and branch roles.
- Enable or hide optional modules. The same `organization_settings` record can be consumed by the mobile application.
- Automatic WhatsApp remains forced off. Manual WhatsApp sharing remains available.

## Simple legacy import

- Open **Import Data** as a company administrator.
- Upload one workbook matching the supplied `Import Sample` format.
- One row represents one document. Rows sharing a **Tracking Reference** become one case.
- Branch text must match a branch configured in Company Management.
- Review counts and rejected rows, then choose **Skip existing** or **Update and rebuild imported documents**.
- The importer preserves legacy case/document identifiers and codes, rebuilds up to six stages and imports case finance totals.

## Mobile application contract

After login, the mobile application should read the signed-in profile's `organization_id`, then load `organization_settings` for that company. Use:

- `product_name`, `company_name`, `short_name`
- `logo_url`, `app_icon_url`
- `primary_color`, `secondary_color`, `accent_color`, `surface_color`
- `tracking_base_url`, support and footer fields
- `enabled_modules`
- `whatsapp_automation_enabled` (must remain false for this release)

Every operational insert must leave `organization_id` empty for the database trigger to supply it, or explicitly use the signed-in user's organization. Never accept an arbitrary organization ID from a normal company user.
