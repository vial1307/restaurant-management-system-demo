begin;

create schema if not exists import_stage;

drop table if exists import_stage.profiles;
drop table if exists import_stage.locations;
drop table if exists import_stage.items;
drop table if exists import_stage.stock;
drop table if exists import_stage.transactions;
drop table if exists import_stage.receive_defaults;

create table import_stage.profiles (
  id uuid,
  username text,
  display_name text,
  role text,
  location text,
  active boolean,
  permissions jsonb,
  preferred_language text,
  created_at timestamptz,
  updated_at timestamptz
);

create table import_stage.locations (
  id uuid,
  code text,
  name_zh_tw text,
  name_vi text,
  site text,
  kind text,
  sort_order integer,
  active boolean
);

create table import_stage.items (
  id uuid,
  item_key text,
  catalog_key text,
  name_zh_tw text,
  name_vi text,
  unit text,
  work_area text,
  storage_only boolean,
  active boolean,
  created_at timestamptz,
  updated_at timestamptz
);

create table import_stage.stock (
  item_id uuid,
  location_id uuid,
  quantity numeric(14,3),
  minimum_quantity numeric(14,3),
  updated_at timestamptz
);

create table import_stage.transactions (
  id uuid,
  item_id uuid,
  location_id uuid,
  direction text,
  amount numeric(14,3),
  before_quantity numeric(14,3),
  after_quantity numeric(14,3),
  note text,
  actor_id uuid,
  created_at timestamptz
);

create table import_stage.receive_defaults (
  site text,
  catalog_key text,
  location_id uuid,
  updated_by uuid,
  updated_at timestamptz
);

commit;
