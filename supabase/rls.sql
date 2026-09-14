-- AI-drama-club Row Level Security
-- Run after schema.sql. This file has not been executed.

begin;

alter table public.profiles enable row level security;
alter table public.productions enable row level security;
alter table public.production_members enable row level security;
alter table public.tasks enable row level security;
alter table public.events enable row level security;
alter table public.rehearsal_logs enable row level security;
alter table public.rehearsal_log_images enable row level security;

-- Membership helpers are SECURITY DEFINER solely to avoid recursive RLS while
-- production_members policies themselves inspect membership. They return only
-- booleans, use fixed search_path, and are executable only by authenticated.
create or replace function public.is_production_member(target_production_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.production_members pm
    where pm.production_id = target_production_id
      and pm.profile_id = auth.uid()
  );
$$;

create or replace function public.is_production_admin(target_production_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.production_members pm
    where pm.production_id = target_production_id
      and pm.profile_id = auth.uid()
      and pm.role = 'ADMIN'
  );
$$;

create or replace function public.shares_production_with(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.production_members mine
    join public.production_members theirs
      on theirs.production_id = mine.production_id
    where mine.profile_id = auth.uid()
      and theirs.profile_id = target_profile_id
  );
$$;

revoke all on function public.is_production_member(uuid) from public;
revoke all on function public.is_production_admin(uuid) from public;
revoke all on function public.shares_production_with(uuid) from public;
grant execute on function public.is_production_member(uuid) to authenticated;
grant execute on function public.is_production_admin(uuid) to authenticated;
grant execute on function public.shares_production_with(uuid) to authenticated;

-- Image helpers bypass child-table RLS only to validate immutable ownership
-- relationships without recursion. They return booleans, use fixed search_path,
-- and remain unavailable to anon/PUBLIC.
create or replace function public.rehearsal_log_belongs_to_production(
  target_log_id uuid,
  target_production_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.rehearsal_logs rl
    where rl.id = target_log_id
      and rl.production_id = target_production_id
  );
$$;

create or replace function public.can_manage_rehearsal_log_image(
  target_production_id uuid,
  target_log_id uuid,
  target_uploaded_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    public.is_production_member(target_production_id)
    and public.rehearsal_log_belongs_to_production(target_log_id, target_production_id)
    and (
      public.is_production_admin(target_production_id)
      or target_uploaded_by = auth.uid()
      or exists (
        select 1
        from public.rehearsal_logs rl
        where rl.id = target_log_id
          and rl.production_id = target_production_id
          and rl.author_profile_id = auth.uid()
      )
    );
$$;

create or replace function public.rehearsal_image_path_matches(
  candidate_path text,
  target_production_id uuid,
  target_log_id uuid,
  target_uploader_id uuid
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  path_parts text[];
begin
  if candidate_path is null or target_uploader_id is null then
    return false;
  end if;
  path_parts := string_to_array(candidate_path, '/');
  if cardinality(path_parts) <> 4 then
    return false;
  end if;
  begin
    if path_parts[1]::uuid <> target_production_id
      or path_parts[2]::uuid <> target_log_id
      or path_parts[3]::uuid <> target_uploader_id then
      return false;
    end if;
  exception when invalid_text_representation then
    return false;
  end;
  return path_parts[4] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$';
end;
$$;

revoke all on function public.rehearsal_log_belongs_to_production(uuid, uuid) from public;
revoke all on function public.can_manage_rehearsal_log_image(uuid, uuid, uuid) from public;
revoke all on function public.rehearsal_image_path_matches(text, uuid, uuid, uuid) from public;
grant execute on function public.rehearsal_log_belongs_to_production(uuid, uuid) to authenticated;
grant execute on function public.can_manage_rehearsal_log_image(uuid, uuid, uuid) to authenticated;
grant execute on function public.rehearsal_image_path_matches(text, uuid, uuid, uuid) to authenticated;

-- profiles: no client-side delete policy.
create policy profiles_select_self_or_coproducer on public.profiles
for select to authenticated
using (id = auth.uid() or public.shares_production_with(id));

create policy profiles_insert_self on public.profiles
for insert to authenticated
with check (id = auth.uid());

create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- productions: creation is intentionally available only through the atomic RPC
-- below; there is no direct INSERT policy.
create policy productions_select_member on public.productions
for select to authenticated
using (public.is_production_member(id));

create policy productions_update_admin on public.productions
for update to authenticated
using (public.is_production_admin(id))
with check (public.is_production_admin(id));

create policy productions_delete_admin on public.productions
for delete to authenticated
using (public.is_production_admin(id));

-- Atomic production + first ADMIN creation. SECURITY DEFINER is needed because
-- direct production INSERT is denied until membership exists. It creates data
-- only for auth.uid(), returns one UUID, and has a fixed search_path.
create or replace function public.create_production(
  production_title text default '',
  production_parts jsonb default '["연출", "배우", "무대", "조명", "음향", "기획"]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  caller_name text;
  new_production_id uuid;
begin
  if caller_id is null then
    raise exception 'authentication required';
  end if;
  if not public.is_jsonb_string_array(production_parts) then
    raise exception 'parts must be a JSON array of strings';
  end if;

  select p.display_name into caller_name
  from public.profiles p where p.id = caller_id;
  if caller_name is null then
    raise exception 'profile is required';
  end if;

  insert into public.productions (title, parts, created_by)
  values (coalesce(production_title, ''), production_parts, caller_id)
  returning id into new_production_id;

  insert into public.production_members
    (production_id, profile_id, display_name, role)
  values (new_production_id, caller_id, caller_name, 'ADMIN');

  return new_production_id;
end;
$$;

revoke all on function public.create_production(text, jsonb) from public;
grant execute on function public.create_production(text, jsonb) to authenticated;

-- production_members: MEMBER cannot insert, update, delete, or self-promote.
create policy production_members_select_member on public.production_members
for select to authenticated
using (public.is_production_member(production_id));

create policy production_members_insert_admin on public.production_members
for insert to authenticated
with check (public.is_production_admin(production_id));

create policy production_members_update_admin on public.production_members
for update to authenticated
using (public.is_production_admin(production_id))
with check (public.is_production_admin(production_id));

create policy production_members_delete_admin on public.production_members
for delete to authenticated
using (public.is_production_admin(production_id));

-- Prevent an ADMIN from deleting or demoting the last ADMIN. SECURITY DEFINER
-- is not needed: this trigger executes within the already-authorized statement.
create or replace function public.protect_last_production_admin()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  remaining_admins integer;
begin
  if old.role <> 'ADMIN' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'UPDATE' and new.role = 'ADMIN' and new.production_id = old.production_id then
    return new;
  end if;

  -- Do not block the intentional ON DELETE CASCADE after an authorized
  -- production deletion. At that point the parent row no longer exists.
  if not exists (
    select 1 from public.productions p where p.id = old.production_id
  ) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- Serialize ADMIN removal for this production so two concurrent requests
  -- cannot both observe another ADMIN and remove the final two rows.
  perform 1 from public.productions p
  where p.id = old.production_id
  for update;

  select count(*) into remaining_admins
  from public.production_members pm
  where pm.production_id = old.production_id
    and pm.role = 'ADMIN'
    and pm.profile_id <> old.profile_id;

  if remaining_admins = 0 then
    raise exception 'a production must keep at least one ADMIN';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger production_members_keep_admin
before update of role, production_id or delete on public.production_members
for each row execute function public.protect_last_production_admin();

-- tasks
create policy tasks_select_member on public.tasks
for select to authenticated using (public.is_production_member(production_id));
create policy tasks_insert_member on public.tasks
for insert to authenticated with check (public.is_production_member(production_id));
create policy tasks_update_member on public.tasks
for update to authenticated
using (public.is_production_member(production_id))
with check (public.is_production_member(production_id));
create policy tasks_delete_admin on public.tasks
for delete to authenticated using (public.is_production_admin(production_id));

-- events
create policy events_select_member on public.events
for select to authenticated using (public.is_production_member(production_id));
create policy events_insert_member on public.events
for insert to authenticated with check (public.is_production_member(production_id));
create policy events_update_member on public.events
for update to authenticated
using (public.is_production_member(production_id))
with check (public.is_production_member(production_id));
create policy events_delete_admin on public.events
for delete to authenticated using (public.is_production_admin(production_id));

-- rehearsal_logs: new authenticated rows must identify the caller. Imported
-- historical NULL authors require a trusted migration path, not browser CRUD.
create policy rehearsal_logs_select_member on public.rehearsal_logs
for select to authenticated using (public.is_production_member(production_id));
create policy rehearsal_logs_insert_member on public.rehearsal_logs
for insert to authenticated
with check (public.is_production_member(production_id) and author_profile_id = auth.uid());
create policy rehearsal_logs_update_admin_or_author on public.rehearsal_logs
for update to authenticated
using (
  public.is_production_admin(production_id)
  or (public.is_production_member(production_id) and author_profile_id = auth.uid())
)
with check (
  public.is_production_admin(production_id)
  or (public.is_production_member(production_id) and author_profile_id = auth.uid())
);
create policy rehearsal_logs_delete_admin_or_author on public.rehearsal_logs
for delete to authenticated
using (
  public.is_production_admin(production_id)
  or (public.is_production_member(production_id) and author_profile_id = auth.uid())
);

-- rehearsal_log_images: identity/path columns are intentionally immutable to
-- browser users. Only sort_order receives an UPDATE column grant below.
create policy rehearsal_log_images_select_member on public.rehearsal_log_images
for select to authenticated
using (public.is_production_member(production_id));

create policy rehearsal_log_images_insert_member on public.rehearsal_log_images
for insert to authenticated
with check (
  public.is_production_member(production_id)
  and public.rehearsal_log_belongs_to_production(rehearsal_log_id, production_id)
  and uploaded_by = auth.uid()
  and public.rehearsal_image_path_matches(storage_path, production_id, rehearsal_log_id, uploaded_by)
);

create policy rehearsal_log_images_update_manager on public.rehearsal_log_images
for update to authenticated
using (public.can_manage_rehearsal_log_image(production_id, rehearsal_log_id, uploaded_by))
with check (public.can_manage_rehearsal_log_image(production_id, rehearsal_log_id, uploaded_by));

create policy rehearsal_log_images_delete_manager on public.rehearsal_log_images
for delete to authenticated
using (public.can_manage_rehearsal_log_image(production_id, rehearsal_log_id, uploaded_by));

-- Explicit API grants complement RLS. No anon grants are added.
grant select, insert, update on public.profiles to authenticated;
grant select, update, delete on public.productions to authenticated;
grant select, insert, update, delete on public.production_members to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.rehearsal_logs to authenticated;
grant select, insert, delete on public.rehearsal_log_images to authenticated;
grant update (sort_order) on public.rehearsal_log_images to authenticated;

commit;
