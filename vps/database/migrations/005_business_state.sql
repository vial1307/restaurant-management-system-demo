begin;

create table if not exists public.business_state (
  site text primary key check (site in ('central','fuxing','yongji')),
  modules jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now()
);

create index if not exists business_state_updated_at_idx
  on public.business_state(updated_at desc);

commit;
