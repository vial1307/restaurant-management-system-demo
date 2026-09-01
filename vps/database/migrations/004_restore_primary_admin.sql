begin;

-- Admin is a system-wide superuser. Persist the canonical full permission
-- matrix so browser UI, API responses, and future migrations cannot disagree.
update public.app_users
set location = 'all',
    permissions = '{"dashboard":{"view":true,"edit":true},"inventory":{"view":true,"edit":true},"procurement":{"view":true,"edit":true},"reservations":{"view":true,"edit":true},"preparation":{"view":true,"edit":true},"menu":{"view":true,"edit":true},"sop":{"view":true,"edit":true},"skills":{"view":true,"edit":true},"attendance":{"view":true,"edit":true},"schedule":{"view":true,"edit":true},"reports":{"view":true,"edit":true},"remote":{"view":true,"edit":true},"settings":{"view":true,"edit":true}}'::jsonb
where role = 'admin';

-- Restore the owner's existing account without touching its password hash.
update public.app_users
set role = 'admin',
    location = 'all',
    active = true,
    permissions = '{"dashboard":{"view":true,"edit":true},"inventory":{"view":true,"edit":true},"procurement":{"view":true,"edit":true},"reservations":{"view":true,"edit":true},"preparation":{"view":true,"edit":true},"menu":{"view":true,"edit":true},"sop":{"view":true,"edit":true},"skills":{"view":true,"edit":true},"attendance":{"view":true,"edit":true},"schedule":{"view":true,"edit":true},"reports":{"view":true,"edit":true},"remote":{"view":true,"edit":true},"settings":{"view":true,"edit":true}}'::jsonb
where lower(username) = 'yangchuadmin';

commit;
