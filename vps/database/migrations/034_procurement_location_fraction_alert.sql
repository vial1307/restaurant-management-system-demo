-- 034: Optional per-product, per-location reorder alert rules.
-- Extends the current authoritative Procurement product rules; warehouse stock
-- stays in existing inventory_stock and locations. No supplier/product seeds.
alter table public.procurement_product_rules
  add column if not exists reorder_alert_enabled boolean not null default false,
  add column if not exists reorder_location_id uuid references public.inventory_locations(id) on delete set null,
  add column if not exists reorder_reference_quantity numeric(14,3),
  add column if not exists reorder_numerator smallint not null default 1,
  add column if not exists reorder_denominator smallint not null default 3;

alter table public.procurement_product_rules
  add constraint procurement_rule_reorder_fraction_check
  check (reorder_numerator between 1 and 1000
     and reorder_denominator between 1 and 1000
     and reorder_numerator <= reorder_denominator);

alter table public.procurement_product_rules
  add constraint procurement_rule_reorder_alert_complete_check
  check (reorder_alert_enabled = false or
    (reorder_location_id is not null
     and reorder_reference_quantity is not null
     and reorder_reference_quantity > 0));
