-- Seed: grant admin role to one profile row.
-- IMPORTANT: Replace user_id for each environment if needed.
-- Default value below is from current project setup request.

-- 1) Optional pre-check
select user_id, role
from public.profiles
where user_id = '426fbc5e-2f9c-4f1b-a3f2-323d207fb9aa';

-- 2) Apply admin role
update public.profiles
set role = 'admin'
where user_id = '426fbc5e-2f9c-4f1b-a3f2-323d207fb9aa';

-- 3) Verify
select user_id, role
from public.profiles
where user_id = '426fbc5e-2f9c-4f1b-a3f2-323d207fb9aa';

