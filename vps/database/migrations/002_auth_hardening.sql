begin;

alter table public.app_users
  add column if not exists password_changed_at timestamptz;

create index if not exists sessions_user_idx
  on public.sessions(user_id);

create index if not exists sessions_expires_idx
  on public.sessions(expires_at);

commit;
