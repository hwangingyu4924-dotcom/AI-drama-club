-- AI-drama-club rehearsal image Storage migration
-- Run after rehearsal_images_rls_migration.sql on an existing database.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'rehearsal-images',
  'rehearsal-images',
  false,
  8388608, -- 8 MiB = 8 * 1024 * 1024 bytes
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Parses exactly production/log/uploader/file.ext. Invalid or hostile input
-- returns false; no dynamic SQL is used. The function exposes only a boolean.
create or replace function public.rehearsal_image_storage_authorized(
  object_name text,
  requested_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  path_parts text[];
  target_production_id uuid;
  target_log_id uuid;
  path_uploader_id uuid;
  caller_id uuid := auth.uid();
begin
  if caller_id is null or object_name is null or requested_action is null
    or requested_action not in ('read', 'upload', 'delete') then
    return false;
  end if;

  path_parts := string_to_array(object_name, '/');
  if cardinality(path_parts) <> 4 then
    return false;
  end if;

  begin
    target_production_id := path_parts[1]::uuid;
    target_log_id := path_parts[2]::uuid;
    path_uploader_id := path_parts[3]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  -- Object names are UUIDs with an approved image extension. Original file
  -- names never enter Storage paths.
  if path_parts[4] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$' then
    return false;
  end if;

  if requested_action = 'read' then
    return public.is_production_member(target_production_id)
      and public.rehearsal_log_belongs_to_production(target_log_id, target_production_id);
  end if;

  if requested_action = 'upload' then
    return path_uploader_id = caller_id
      and public.is_production_member(target_production_id)
      and public.rehearsal_log_belongs_to_production(target_log_id, target_production_id);
  end if;

  -- Normal deletion follows metadata permissions. If the parent log has
  -- already been deleted, a current production ADMIN or the original path
  -- uploader may still remove the orphaned object during compensating cleanup.
  if public.rehearsal_log_belongs_to_production(target_log_id, target_production_id) then
    return public.can_manage_rehearsal_log_image(
      target_production_id,
      target_log_id,
      path_uploader_id
    );
  end if;
  return public.is_production_member(target_production_id)
    and (
      public.is_production_admin(target_production_id)
      or path_uploader_id = caller_id
    );
end;
$$;

revoke all on function public.rehearsal_image_storage_authorized(text, text) from public;
grant execute on function public.rehearsal_image_storage_authorized(text, text) to authenticated;

create policy rehearsal_images_select_member
on storage.objects
for select
to authenticated
using (
  bucket_id = 'rehearsal-images'
  and public.rehearsal_image_storage_authorized(name, 'read')
);

create policy rehearsal_images_insert_member
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'rehearsal-images'
  and public.rehearsal_image_storage_authorized(name, 'upload')
);

create policy rehearsal_images_delete_manager
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'rehearsal-images'
  and public.rehearsal_image_storage_authorized(name, 'delete')
);

-- No UPDATE policy: replacements use delete + a new UUID object.

commit;
