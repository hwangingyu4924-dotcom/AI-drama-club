-- AI-drama-club rehearsal image metadata RLS migration
-- Run after rehearsal_images_migration.sql on an existing database.

begin;

alter table public.rehearsal_log_images enable row level security;

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

grant select, insert, delete on public.rehearsal_log_images to authenticated;
grant update (sort_order) on public.rehearsal_log_images to authenticated;

commit;
