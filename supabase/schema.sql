-- AI-drama-club initial Supabase schema
-- Source of truth: ../SUPABASE_MIGRATION_SPEC.md
-- Run this file before rls.sql. This file is declarative only; it has not been executed.

begin;

create extension if not exists pgcrypto;

-- CHECK constraints cannot contain subqueries, so this small immutable helper
-- verifies that parts/tags are arrays containing strings only.
create or replace function public.is_jsonb_string_array(value jsonb)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select jsonb_typeof(value) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(value) as element
      where jsonb_typeof(element) <> 'string'
    );
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_not_blank check (btrim(display_name) <> '')
);

create table public.productions (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  performance_date date,
  venue text not null default '',
  venue_info text not null default '',
  project_start_date date,
  status text not null default '준비중',
  parts jsonb not null default '["연출", "배우", "무대", "조명", "음향", "기획"]'::jsonb,
  rehearsal_availability text not null default '',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint productions_status_check check (status in ('준비중', '진행중', '완료')),
  constraint productions_parts_string_array check (public.is_jsonb_string_array(parts))
);

create table public.production_members (
  production_id uuid not null references public.productions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  part text not null default '',
  role text not null default 'MEMBER',
  created_at timestamptz not null default now(),
  primary key (production_id, profile_id),
  constraint production_members_display_name_not_blank check (btrim(display_name) <> ''),
  constraint production_members_role_check check (role in ('ADMIN', 'MEMBER'))
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  legacy_id text not null,
  part text not null default '',
  name text not null,
  assignee text not null default '',
  deadline date,
  status text not null default '대기',
  priority text not null default '보통',
  prerequisite_task_id uuid references public.tasks(id) on delete set null,
  required boolean not null default false,
  pre_show_check boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_production_legacy_id_key unique (production_id, legacy_id),
  constraint tasks_legacy_id_not_blank check (btrim(legacy_id) <> ''),
  constraint tasks_name_not_blank check (btrim(name) <> ''),
  constraint tasks_status_check check (status in ('대기', '진행중', '완료', '보류')),
  constraint tasks_priority_check check (priority in ('높음', '보통', '낮음')),
  constraint tasks_not_own_prerequisite check (prerequisite_task_id is null or prerequisite_task_id <> id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  legacy_id text not null,
  title text not null,
  event_date date not null,
  start_time time,
  end_time time,
  type text not null default '연습',
  part text not null default '',
  location text not null default '',
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_production_legacy_id_key unique (production_id, legacy_id),
  constraint events_legacy_id_not_blank check (btrim(legacy_id) <> ''),
  constraint events_title_not_blank check (btrim(title) <> ''),
  constraint events_type_check check (type in ('연습', '회의', '리딩', '공연', '설치/기술', '기타'))
);

create table public.rehearsal_logs (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  legacy_id text not null,
  title text not null,
  rehearsal_date date not null,
  author text not null,
  author_profile_id uuid references public.profiles(id) on delete set null,
  category text not null default '전체연습',
  content text not null,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rehearsal_logs_production_legacy_id_key unique (production_id, legacy_id),
  constraint rehearsal_logs_legacy_id_not_blank check (btrim(legacy_id) <> ''),
  constraint rehearsal_logs_title_not_blank check (btrim(title) <> ''),
  constraint rehearsal_logs_author_not_blank check (btrim(author) <> ''),
  constraint rehearsal_logs_category_check check (category in ('전체연습', '연기', '연출', '무대', '회의', '기타')),
  constraint rehearsal_logs_tags_string_array check (public.is_jsonb_string_array(tags))
);

-- The redundant-looking pair is the parent key for image metadata. Because id
-- is already globally unique, adding this constraint does not reject or mutate
-- existing rehearsal log rows.
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

-- Eleven explicit indexes. PK and UNIQUE constraints create their own indexes.
create index productions_created_by_idx on public.productions (created_by);
create index production_members_profile_id_idx on public.production_members (profile_id);
create index tasks_production_id_idx on public.tasks (production_id);
create index tasks_production_deadline_idx on public.tasks (production_id, deadline) where deadline is not null;
create index tasks_prerequisite_task_id_idx on public.tasks (prerequisite_task_id) where prerequisite_task_id is not null;
create index events_production_date_idx on public.events (production_id, event_date);
create index rehearsal_logs_production_date_idx on public.rehearsal_logs (production_id, rehearsal_date desc);
create index rehearsal_logs_author_profile_id_idx on public.rehearsal_logs (author_profile_id) where author_profile_id is not null;
-- sort_order is intentionally not UNIQUE: temporary duplicate positions make
-- button-based reordering possible without a multi-row constraint collision.
create index rehearsal_log_images_log_order_idx on public.rehearsal_log_images (rehearsal_log_id, sort_order, created_at, id);
create index rehearsal_log_images_production_id_idx on public.rehearsal_log_images (production_id);
create index rehearsal_log_images_uploaded_by_idx on public.rehearsal_log_images (uploaded_by) where uploaded_by is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger productions_set_updated_at before update on public.productions
for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();
create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();
create trigger rehearsal_logs_set_updated_at before update on public.rehearsal_logs
for each row execute function public.set_updated_at();
create trigger rehearsal_log_images_set_updated_at before update on public.rehearsal_log_images
for each row execute function public.set_updated_at();

-- RLS checks membership in both OLD and NEW rows. This trigger additionally
-- prevents moving an existing child row between productions, including when a
-- caller happens to be a member of both productions.
create or replace function public.prevent_production_id_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.production_id is distinct from old.production_id then
    raise exception 'production_id cannot be changed';
  end if;
  return new;
end;
$$;

create trigger tasks_production_id_immutable before update on public.tasks
for each row execute function public.prevent_production_id_change();
create trigger events_production_id_immutable before update on public.events
for each row execute function public.prevent_production_id_change();
create trigger rehearsal_logs_production_id_immutable before update on public.rehearsal_logs
for each row execute function public.prevent_production_id_change();

-- The creator is audit/ownership provenance and must not be reassigned through
-- a normal production update.
create or replace function public.prevent_production_creator_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed';
  end if;
  return new;
end;
$$;

create trigger productions_created_by_immutable before update on public.productions
for each row execute function public.prevent_production_creator_change();

-- A self-FK alone permits a prerequisite from another production. Enforce the
-- production boundary without adding a table.
create or replace function public.validate_task_prerequisite_same_production()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  prerequisite_production_id uuid;
begin
  if new.prerequisite_task_id is null then
    return new;
  end if;

  select t.production_id into prerequisite_production_id
  from public.tasks as t
  where t.id = new.prerequisite_task_id;

  if prerequisite_production_id is null or prerequisite_production_id <> new.production_id then
    raise exception 'prerequisite task must belong to the same production';
  end if;
  return new;
end;
$$;

create trigger tasks_validate_prerequisite
before insert or update of prerequisite_task_id, production_id on public.tasks
for each row execute function public.validate_task_prerequisite_same_production();

-- Required Auth hook: creates only the matching profile row. The fixed
-- search_path and qualified objects limit SECURITY DEFINER resolution risk.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), '사용자')
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

commit;
