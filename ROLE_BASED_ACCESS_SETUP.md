# V3.16 Role-Based Access

**Admin** — all operational access + Import Data.

**Branch** — all operational cases are accessible, but Dashboard and Cases default to the branch in `profiles.branch_id`. The user can change the Branch filter to **All Branches** at any time.

**Staff** — common operational login; all cases visible by default. Import Data is hidden.

## Install
1. In Supabase SQL Editor run `supabase/V3_16_ROLE_BASED_ACCESS.sql`.
2. Before logging out, confirm your main account is still `admin`.
3. Assign branch accounts with `role='branch'` and the correct `branch_id`.
4. Deploy this V3.16 source to Vercel.

Example:
```sql
update public.profiles
set role='branch',
    branch_id=(select id from public.branches where name='Safari Branch' limit 1)
where id='<AUTH USER UUID>';
```

No WordPress/public-tracking change is required.
