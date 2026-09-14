-- AI-drama-club rehearsal image metadata migration
-- Apply only to an existing database where schema.sql + rls.sql were already applied.
-- This migration creates DB metadata only; it does not create a Storage bucket or policies.

begin;

-- Supports a composite FK that guarantees each image production_id matches
-- its parent rehearsal log. The existing globally unique id makes this safe
-- for all existing rehearsal_logs rows.
alter table public.rehearsal_logs
  add constraint rehearsal_logs_id_production_id_key unique (id, production_id);

create table public.rehearsal_log_images (
  id uuid primary key default gen_random_uuid(),
  rehearsal_log_id uuid not null,
  production_id uuid not null references public.productions(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rehearsal_log_images_log_production_fk
    foreign key (rehearsal_log_id, production_id)
    references public.rehearsal_logs(id, production_id)
    on delete cascade,
  constraint rehearsal_log_images_storage_path_key unique (storage_path),
  constraint rehearsal_log_images_storage_path_not_blank check (btrim(storage_path) <> ''),
  constraint rehearsal_log_images_original_filename_not_blank check (btrim(original_filename) <> ''),
  constraint rehearsal_log_images_original_filename_length check (char_length(original_filename) <= 1024),
  constraint rehearsal_log_images_mime_type_check check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  -- 8 MiB = 8 * 1024 * 1024 bytes. The Storage bucket must use the same limit.
  constraint rehearsal_log_images_file_size_check check (file_size > 0 and file_size <= 8388608),
  constraint rehearsal_log_images_sort_order_check check (sort_order >= 0)
);

-- Fail closed before policies are added by the next migration. If the RLS
-- migration fails, both anonymous and authenticated clients still see no rows.
alter table public.rehearsal_log_images enable row level security;

-- sort_order is intentionally not UNIQUE: temporary duplicate positions make
-- button-based reordering possible without a multi-row constraint collision.
create index rehearsal_log_images_log_order_idx
  on public.rehearsal_log_images (rehearsal_log_id, sort_order, created_at, id);
create index rehearsal_log_images_production_id_idx
  on public.rehearsal_log_images (production_id);
create index rehearsal_log_images_uploaded_by_idx
  on public.rehearsal_log_images (uploaded_by)
  where uploaded_by is not null;

create trigger rehearsal_log_images_set_updated_at
before update on public.rehearsal_log_images
for each row execute function public.set_updated_at();

commit;
