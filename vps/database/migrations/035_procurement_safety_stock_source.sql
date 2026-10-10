-- 035: Procurement uses the existing Inventory site/item location minima as the
-- default safety stock. No stock, supplier, quantity, or product rows are seeded.
-- Keeping a separate numeric safety_stock permits an explicit operator override.
-- Existing rows start in inventory mode per the owner's current instruction.
alter table public.procurement_product_rules
  add column if not exists safety_stock_mode text not null default 'inventory';

alter table public.procurement_product_rules
  add constraint procurement_safety_stock_mode_check
  check (safety_stock_mode in ('inventory','custom'));

comment on column public.procurement_product_rules.safety_stock_mode is
  'inventory: derive dynamically from configured enabled inventory_stock.minimum_quantity rows; custom: use procurement_product_rules.safety_stock. No unit conversion.';
