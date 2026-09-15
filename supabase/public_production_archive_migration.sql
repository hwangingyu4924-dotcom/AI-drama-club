-- PUBLIC PRODUCTION ARCHIVE / PHASE 2A
-- Production-ready migration candidate. DO NOT APPLY UNTIL PHASE 2B APPROVAL.
-- This migration does not activate any production and does not alter Storage.

begin;

-- A nullable slug lets private productions remain unroutable. Once an archive
-- is public, the CHECK constraint requires a stable, unique public slug.
alter table public.productions add column if not exists public_archive boolean;
alter table public.productions add column if not exists public_slug text;
alter table public.productions add column if not exists public_venue_info text;
alter table public.productions add column if not exists public_rehearsal_summary text;

update public.productions set public_archive = false where public_archive is null;
update public.productions set public_venue_info = '' where public_venue_info is null;
update public.productions set public_rehearsal_summary = '' where public_rehearsal_summary is null;

alter table public.productions alter column public_archive set default false;
alter table public.productions alter column public_archive set not null;
alter table public.productions alter column public_venue_info set default '';
alter table public.productions alter column public_venue_info set not null;
alter table public.productions alter column public_rehearsal_summary set default '';
alter table public.productions alter column public_rehearsal_summary set not null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.productions'::regclass
      and conname = 'productions_public_slug_format_check'
  ) then
    alter table public.productions
      add constraint productions_public_slug_format_check
      check (public_slug is null or public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.productions'::regclass
      and conname = 'productions_public_slug_required_check'
  ) then
    alter table public.productions
      add constraint productions_public_slug_required_check
      check (not public_archive or public_slug is not null);
  end if;
end;
$$;

create unique index if not exists productions_public_slug_key
  on public.productions (public_slug)
  where public_slug is not null;

-- public_id is a presentation key only. Existing internal PKs continue to
-- drive foreign keys, RLS, ownership, and all authenticated writes.
alter table public.tasks add column if not exists public_id uuid;
alter table public.events add column if not exists public_id uuid;
alter table public.rehearsal_logs add column if not exists public_id uuid;
alter table public.rehearsal_log_images add column if not exists public_id uuid;

update public.tasks set public_id = gen_random_uuid() where public_id is null;
update public.events set public_id = gen_random_uuid() where public_id is null;
update public.rehearsal_logs set public_id = gen_random_uuid() where public_id is null;
update public.rehearsal_log_images set public_id = gen_random_uuid() where public_id is null;

alter table public.tasks alter column public_id set default gen_random_uuid();
alter table public.tasks alter column public_id set not null;
alter table public.events alter column public_id set default gen_random_uuid();
alter table public.events alter column public_id set not null;
alter table public.rehearsal_logs alter column public_id set default gen_random_uuid();
alter table public.rehearsal_logs alter column public_id set not null;
alter table public.rehearsal_log_images alter column public_id set default gen_random_uuid();
alter table public.rehearsal_log_images alter column public_id set not null;

create unique index if not exists tasks_public_id_key on public.tasks (public_id);
create unique index if not exists events_public_id_key on public.events (public_id);
create unique index if not exists rehearsal_logs_public_id_key on public.rehearsal_logs (public_id);
create unique index if not exists rehearsal_log_images_public_id_key on public.rehearsal_log_images (public_id);

-- Event location and memo are unrestricted internal text, so publication uses
-- separately curated fields. Existing private values are deliberately not copied.
alter table public.events add column if not exists public_location text;
alter table public.events add column if not exists public_description text;
update public.events set public_location = '' where public_location is null;
update public.events set public_description = '' where public_description is null;
alter table public.events alter column public_location set default '';
alter table public.events alter column public_location set not null;
alter table public.events alter column public_description set default '';
alter table public.events alter column public_description set not null;

-- Editable public byline. author_profile_id remains the immutable ownership key.
alter table public.rehearsal_logs add column if not exists author_display_name text;

update public.rehearsal_logs as rl
set author_display_name = coalesce(
  nullif(btrim(profile.display_name), ''),
  nullif(btrim(rl.author), ''),
  '전대극회 부원'
)
from public.profiles as profile
where profile.id = rl.author_profile_id
  and rl.author_display_name is null;

update public.rehearsal_logs as rl
set author_display_name = coalesce(nullif(btrim(rl.author), ''), '전대극회 부원')
where rl.author_display_name is null;

update public.rehearsal_logs
set author_display_name = btrim(author_display_name)
where author_display_name <> btrim(author_display_name);

alter table public.rehearsal_logs alter column author_display_name set not null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.rehearsal_logs'::regclass
      and conname = 'rehearsal_logs_author_display_name_check'
  ) then
    alter table public.rehearsal_logs
      add constraint rehearsal_logs_author_display_name_check
      check (
        author_display_name = btrim(author_display_name)
        and char_length(author_display_name) between 1 and 80
      );
  end if;
end;
$$;

create or replace function public.prepare_rehearsal_author_display_name()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  profile_display_name text;
begin
  if tg_op = 'UPDATE' and new.author_profile_id is distinct from old.author_profile_id then
    raise exception 'author_profile_id cannot be changed';
  end if;

  if new.author_display_name is null or btrim(new.author_display_name) = '' then
    select p.display_name into profile_display_name
    from public.profiles as p
    where p.id = new.author_profile_id;
    new.author_display_name := coalesce(
      nullif(btrim(profile_display_name), ''),
      nullif(btrim(new.author), ''),
      '전대극회 부원'
    );
  else
    new.author_display_name := btrim(new.author_display_name);
  end if;

  if char_length(new.author_display_name) > 80 then
    raise exception 'author_display_name must be 80 characters or fewer';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.rehearsal_logs'::regclass
      and tgname = 'rehearsal_logs_prepare_author_display_name'
      and not tgisinternal
  ) then
    create trigger rehearsal_logs_prepare_author_display_name
    before insert or update of author_display_name, author_profile_id on public.rehearsal_logs
    for each row execute function public.prepare_rehearsal_author_display_name();
  end if;
end;
$$;

create or replace function public.prevent_public_archive_identity_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.public_id is distinct from old.public_id then
    raise exception 'public_id cannot be changed';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.tasks'::regclass and tgname = 'tasks_public_id_immutable' and not tgisinternal
  ) then
    create trigger tasks_public_id_immutable before update of public_id on public.tasks
    for each row execute function public.prevent_public_archive_identity_change();
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.events'::regclass and tgname = 'events_public_id_immutable' and not tgisinternal
  ) then
    create trigger events_public_id_immutable before update of public_id on public.events
    for each row execute function public.prevent_public_archive_identity_change();
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.rehearsal_logs'::regclass and tgname = 'rehearsal_logs_public_id_immutable' and not tgisinternal
  ) then
    create trigger rehearsal_logs_public_id_immutable before update of public_id on public.rehearsal_logs
    for each row execute function public.prevent_public_archive_identity_change();
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.rehearsal_log_images'::regclass and tgname = 'rehearsal_log_images_public_id_immutable' and not tgisinternal
  ) then
    create trigger rehearsal_log_images_public_id_immutable before update of public_id on public.rehearsal_log_images
    for each row execute function public.prevent_public_archive_identity_change();
  end if;
end;
$$;

-- Public RPCs are the only anonymous read boundary. They use no dynamic SQL,
-- expose explicit columns, and require both the opt-in flag and exact slug.
create or replace function public.get_public_archive_production(requested_public_slug text)
returns table (
  public_slug text, title text, performance_date date, venue text,
  public_venue_info text, project_start_date date, status text, parts jsonb,
  public_rehearsal_summary text
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select p.public_slug, p.title, p.performance_date, p.venue,
    p.public_venue_info, p.project_start_date, p.status, p.parts,
    p.public_rehearsal_summary
  from public.productions as p
  where p.public_archive = true
    and p.public_slug = requested_public_slug
  limit 1;
$$;

create or replace function public.get_public_archive_tasks(requested_public_slug text)
returns table (
  public_id uuid, prerequisite_public_id uuid, part text, title text,
  deadline date, status text, priority text, required boolean,
  pre_show_check boolean
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select task.public_id, prerequisite.public_id, task.part, task.name,
    task.deadline, task.status, task.priority, task.required,
    task.pre_show_check
  from public.tasks as task
  join public.productions as production on production.id = task.production_id
  left join public.tasks as prerequisite
    on prerequisite.id = task.prerequisite_task_id
   and prerequisite.production_id = task.production_id
  where production.public_archive = true
    and production.public_slug = requested_public_slug
  order by task.deadline nulls last, task.created_at, task.public_id;
$$;

create or replace function public.get_public_archive_events(requested_public_slug text)
returns table (
  public_id uuid, title text, event_date date, start_time time,
  end_time time, category text, part text, public_location text,
  public_description text
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select event.public_id, event.title, event.event_date, event.start_time,
    event.end_time, event.type, event.part, event.public_location,
    event.public_description
  from public.events as event
  join public.productions as production on production.id = event.production_id
  where production.public_archive = true
    and production.public_slug = requested_public_slug
  order by event.event_date, event.start_time nulls last, event.public_id;
$$;

create or replace function public.get_public_archive_rehearsal_logs(requested_public_slug text)
returns table (
  public_id uuid, title text, rehearsal_date date,
  author_display_name text, category text, content text, tags jsonb,
  created_date date, updated_date date
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select log.public_id, log.title, log.rehearsal_date,
    log.author_display_name, log.category, log.content, log.tags,
    pg_catalog.timezone('Asia/Seoul', log.created_at)::date,
    pg_catalog.timezone('Asia/Seoul', log.updated_at)::date
  from public.rehearsal_logs as log
  join public.productions as production on production.id = log.production_id
  where production.public_archive = true
    and production.public_slug = requested_public_slug
  order by log.rehearsal_date desc, log.created_at desc, log.public_id;
$$;

create or replace function public.get_public_archive_rehearsal_images(
  requested_public_slug text,
  requested_rehearsal_public_id uuid
)
returns table (image_public_id uuid, rehearsal_public_id uuid, sort_order integer)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select image.public_id, log.public_id, image.sort_order
  from public.rehearsal_log_images as image
  join public.rehearsal_logs as log
    on log.id = image.rehearsal_log_id
   and log.production_id = image.production_id
  join public.productions as production on production.id = image.production_id
  where production.public_archive = true
    and production.public_slug = requested_public_slug
    and log.public_id = requested_rehearsal_public_id
  order by image.sort_order, image.created_at, image.public_id;
$$;

revoke all on function public.prepare_rehearsal_author_display_name() from public;
revoke all on function public.prevent_public_archive_identity_change() from public;
revoke all on function public.get_public_archive_production(text) from public;
revoke all on function public.get_public_archive_tasks(text) from public;
revoke all on function public.get_public_archive_events(text) from public;
revoke all on function public.get_public_archive_rehearsal_logs(text) from public;
revoke all on function public.get_public_archive_rehearsal_images(text, uuid) from public;

-- Supabase projects can carry explicit anon EXECUTE defaults independently of
-- the pseudo-role PUBLIC. Remove those grants from every private helper/RPC;
-- triggers continue to run through their table operations.
revoke execute on function public.is_jsonb_string_array(jsonb) from anon;
revoke execute on function public.set_updated_at() from anon;
revoke execute on function public.prevent_production_id_change() from anon;
revoke execute on function public.prevent_production_creator_change() from anon;
revoke execute on function public.validate_task_prerequisite_same_production() from anon;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.is_production_member(uuid) from anon;
revoke execute on function public.is_production_admin(uuid) from anon;
revoke execute on function public.shares_production_with(uuid) from anon;
revoke execute on function public.rehearsal_log_belongs_to_production(uuid, uuid) from anon;
revoke execute on function public.can_manage_rehearsal_log_image(uuid, uuid, uuid) from anon;
revoke execute on function public.rehearsal_image_path_matches(text, uuid, uuid, uuid) from anon;
revoke execute on function public.rehearsal_image_storage_authorized(text, text) from anon;
revoke execute on function public.create_production(text, jsonb) from anon;
revoke execute on function public.protect_last_production_admin() from anon;
revoke execute on function public.ensure_current_production_membership() from anon;
revoke execute on function public.prepare_rehearsal_author_display_name() from anon;
revoke execute on function public.prevent_public_archive_identity_change() from anon;

grant execute on function public.get_public_archive_production(text) to anon, authenticated;
grant execute on function public.get_public_archive_tasks(text) to anon, authenticated;
grant execute on function public.get_public_archive_events(text) to anon, authenticated;
grant execute on function public.get_public_archive_rehearsal_logs(text) to anon, authenticated;
grant execute on function public.get_public_archive_rehearsal_images(text, uuid) to anon, authenticated;

-- Defense in depth: anonymous callers receive no direct base-table privileges.
revoke all on table public.profiles from anon;
revoke all on table public.productions from anon;
revoke all on table public.production_members from anon;
revoke all on table public.tasks from anon;
revoke all on table public.events from anon;
revoke all on table public.rehearsal_logs from anon;
revoke all on table public.rehearsal_log_images from anon;

-- No production is activated here. No Storage object or policy is changed.

commit;
