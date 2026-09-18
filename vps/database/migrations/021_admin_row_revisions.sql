begin;

create or replace function public.bump_row_revision()
returns trigger
language plpgsql
as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

alter table public.system_announcements
  add column if not exists revision bigint not null default 1;
alter table public.media_assets
  add column if not exists revision bigint not null default 1;
alter table public.menu_items
  add column if not exists revision bigint not null default 1;
alter table public.inventory_items
  add column if not exists revision bigint not null default 1;
alter table public.sop_documents
  add column if not exists revision bigint not null default 1;

alter table public.system_announcements
  drop constraint if exists system_announcements_revision_check;
alter table public.system_announcements
  add constraint system_announcements_revision_check check (revision > 0);
alter table public.media_assets
  drop constraint if exists media_assets_revision_check;
alter table public.media_assets
  add constraint media_assets_revision_check check (revision > 0);
alter table public.menu_items
  drop constraint if exists menu_items_revision_check;
alter table public.menu_items
  add constraint menu_items_revision_check check (revision > 0);
alter table public.inventory_items
  drop constraint if exists inventory_items_revision_check;
alter table public.inventory_items
  add constraint inventory_items_revision_check check (revision > 0);
alter table public.sop_documents
  drop constraint if exists sop_documents_revision_check;
alter table public.sop_documents
  add constraint sop_documents_revision_check check (revision > 0);

drop trigger if exists system_announcements_bump_revision on public.system_announcements;
create trigger system_announcements_bump_revision
before update on public.system_announcements
for each row execute function public.bump_row_revision();

drop trigger if exists media_assets_bump_revision on public.media_assets;
create trigger media_assets_bump_revision
before update on public.media_assets
for each row execute function public.bump_row_revision();

drop trigger if exists menu_items_bump_revision on public.menu_items;
create trigger menu_items_bump_revision
before update on public.menu_items
for each row execute function public.bump_row_revision();

drop trigger if exists inventory_items_bump_revision on public.inventory_items;
create trigger inventory_items_bump_revision
before update on public.inventory_items
for each row execute function public.bump_row_revision();

drop trigger if exists sop_documents_bump_revision on public.sop_documents;
create trigger sop_documents_bump_revision
before update on public.sop_documents
for each row execute function public.bump_row_revision();

commit;
