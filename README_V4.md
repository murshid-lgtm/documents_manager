# Document Operations Platform V4.0

A responsive, white-label document operations web application for case intake, document-stage processing, appointments, batch reports, customer delivery, internal custody transfers, payments, courier shipments, reporting and controlled legacy Excel import.

## Clean installation only

This V4 source is intended for a new GitHub repository, new Supabase project and new Vercel project. Do not run the V3 migrations.

1. Run `supabase/V4_0_CLEAN_INSTALL.sql` in a blank Supabase project.
2. Create the first Auth user and run the commented first-owner bootstrap block at the bottom of the SQL file.
3. Copy `.env.example` to `.env.local` and add the new Supabase credentials.
4. Run `npm install` and `npm run dev` locally.
5. Push this source to a new private GitHub repository and import that repository into a new Vercel project.

See `V4_DEPLOYMENT.md` for the full deployment and owner setup procedure.

## Security model

- Every operational record belongs to an organization.
- Row Level Security prevents cross-company access.
- Branch users receive branch-specific custody permissions.
- Only the receiving branch or an organization administrator may confirm custody receipt.
- Platform Super Admin can create and manage companies, branding, branches and staff.
- The Supabase service-role key is server-only and must never use a `NEXT_PUBLIC_` prefix.
- Automatic WhatsApp is disabled in this release; manual WhatsApp sharing remains available.

## Import template

Use `import-templates/Legacy_Single_Excel_Import_Template.xlsx`. One row is one document; rows with the same Tracking Reference become one case.
