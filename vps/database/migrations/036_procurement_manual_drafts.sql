-- 036: Site-scoped manually prepared order forms. A draft is NOT a supplier order.
-- Keep inventory_stock, supplier relationships, procurement_supplier_orders unchanged.
create table if not exists public.procurement_order_drafts (
 id uuid primary key default gen_random_uuid(),
 site_code text not null references public.sites(code),
 request_key uuid not null,
 order_date date not null,
 status text not null default 'draft' check(status='draft'),
 lines jsonb not null check(jsonb_typeof(lines)='array' and jsonb_array_length(lines) between 1 and 200),
 actor_user_id uuid references public.app_users(id) on delete set null,
 actor_username text,
 created_at timestamptz not null default now(),
 unique(site_code,request_key)
);
create index if not exists procurement_order_drafts_site_created
 on public.procurement_order_drafts(site_code,created_at desc);
comment on table public.procurement_order_drafts is
 'Operator-prepared site order-form drafts; no vendor dispatch, stock movement or inventory authority.';
