-- conte-rush M11.1
-- Internal user grant / revoke. Paste into the Supabase SQL Editor
-- while signed in as a project owner (service role).
-- Do not run from the browser app. Do not add these statements to frontend JS.
--
-- Does not change tables, RLS, or grants. Authenticated clients remain
-- SELECT-own only. No INSERT / UPDATE / DELETE from the browser.
--
-- Flow:
-- 1. The person signs in once with Magic Link (creates auth.users).
-- 2. Replace the email below and run Grant.
-- 3. They reload conte-rush. effectiveAccess becomes internal.
--
-- If Grant inserts 0 rows, they have not signed in yet. Do not copy UUIDs by hand.

-- Confirm the Auth user exists (0 rows = not logged in yet):
-- select id, email, created_at
-- from auth.users
-- where email = 'staff@example.com';

-- Grant internal access (re-enable if previously disabled):
insert into public.internal_users (user_id, enabled)
select id, true
from auth.users
where email = 'staff@example.com'
on conflict (user_id) do update
set enabled = true,
    updated_at = now();

-- Revoke internal access (keep the row; they see denied until granted again):
-- update public.internal_users as iu
-- set enabled = false,
--     updated_at = now()
-- from auth.users as u
-- where iu.user_id = u.id
--   and u.email = 'staff@example.com';

-- Optional: remove the row instead of disabling:
-- delete from public.internal_users
-- where user_id = (
--   select id from auth.users where email = 'staff@example.com'
-- );

-- List current internal users:
-- select u.email, i.enabled, i.created_at, i.updated_at
-- from public.internal_users as i
-- join auth.users as u on u.id = i.user_id
-- order by u.email;
