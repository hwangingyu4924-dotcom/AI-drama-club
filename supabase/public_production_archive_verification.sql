-- READ-ONLY verification queries for after migration application.
-- These statements do not activate an archive or mutate application data.

-- 1. Columns/defaults/nullability.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'productions' and column_name in (
      'public_archive', 'public_slug', 'public_venue_info', 'public_rehearsal_summary'
    ))
    or (table_name in ('tasks', 'events', 'rehearsal_logs', 'rehearsal_log_images') and column_name = 'public_id')
    or (table_name = 'events' and column_name in ('public_location', 'public_description'))
    or (table_name = 'rehearsal_logs' and column_name = 'author_display_name')
  )
order by table_name, column_name;

-- 2. Backfill/uniqueness. Every count must be zero.
select 'tasks missing public_id' as check_name, count(*) as failures from public.tasks where public_id is null
union all select 'events missing public_id', count(*) from public.events where public_id is null
union all select 'logs missing public_id', count(*) from public.rehearsal_logs where public_id is null
union all select 'images missing public_id', count(*) from public.rehearsal_log_images where public_id is null
union all select 'tasks duplicate public_id', count(*) from (select public_id from public.tasks group by public_id having count(*) > 1) as duplicates
union all select 'events duplicate public_id', count(*) from (select public_id from public.events group by public_id having count(*) > 1) as duplicates
union all select 'logs duplicate public_id', count(*) from (select public_id from public.rehearsal_logs group by public_id having count(*) > 1) as duplicates
union all select 'images duplicate public_id', count(*) from (select public_id from public.rehearsal_log_images group by public_id having count(*) > 1) as duplicates
union all select 'invalid author display', count(*) from public.rehearsal_logs
  where author_display_name is null
     or author_display_name <> btrim(author_display_name)
     or char_length(author_display_name) not between 1 and 80;

-- 3. RPC security contract. All rows must be SECURITY DEFINER with the fixed path.
select p.proname, p.prosecdef, p.proconfig, pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_public_archive_production',
    'get_public_archive_tasks',
    'get_public_archive_events',
    'get_public_archive_rehearsal_logs',
    'get_public_archive_rehearsal_images'
  )
order by p.proname;

-- 4. No production may be public before the separately approved activation.
select id, public_slug, public_archive
from public.productions
where public_archive = true;

-- 5. Existing memberships must be unchanged. Run before/after snapshots and compare.
select production_id, profile_id, role, display_name, part, created_at
from public.production_members
order by production_id, profile_id;

-- 6. Public API must return empty before activation and for unknown/non-public slugs.
select * from public.get_public_archive_production('__non_public_fixture__');
select * from public.get_public_archive_tasks('__non_public_fixture__');
select * from public.get_public_archive_events('__non_public_fixture__');
select * from public.get_public_archive_rehearsal_logs('__non_public_fixture__');
select * from public.get_public_archive_rehearsal_images(
  '__non_public_fixture__',
  '00000000-0000-4000-8000-000000000000'::uuid
);

-- 7. Grants. anon should have EXECUTE only on the five public RPCs and no
-- base-table privileges. Repeat this check under an actual anon JWT via REST.
select routine_name, privilege_type, grantee
from information_schema.role_routine_grants
where specific_schema = 'public'
  and grantee = 'anon'
order by routine_name, privilege_type;

select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
order by table_name, privilege_type;

-- 8. Single-row verification summary for SQL Editor/export automation.
select pg_catalog.jsonb_build_object(
  'current_production', (
    select pg_catalog.jsonb_build_object(
      'public_archive', p.public_archive,
      'public_slug', p.public_slug
    )
    from public.productions as p
    where p.id = '892fa94e-6f56-4ad0-8a93-1d353de77196'
  ),
  'public_production_count', (select count(*) from public.productions where public_archive = true),
  'row_counts', pg_catalog.jsonb_build_object(
    'productions', (select count(*) from public.productions),
    'tasks', (select count(*) from public.tasks),
    'events', (select count(*) from public.events),
    'rehearsal_logs', (select count(*) from public.rehearsal_logs),
    'rehearsal_log_images', (select count(*) from public.rehearsal_log_images),
    'profiles', (select count(*) from public.profiles),
    'production_members', (select count(*) from public.production_members)
  ),
  'public_id_failures', pg_catalog.jsonb_build_object(
    'tasks_null', (select count(*) from public.tasks where public_id is null),
    'tasks_duplicate', (select count(*) from (select public_id from public.tasks group by public_id having count(*) > 1) as d),
    'tasks_equals_internal', (select count(*) from public.tasks where public_id = id),
    'events_null', (select count(*) from public.events where public_id is null),
    'events_duplicate', (select count(*) from (select public_id from public.events group by public_id having count(*) > 1) as d),
    'events_equals_internal', (select count(*) from public.events where public_id = id),
    'logs_null', (select count(*) from public.rehearsal_logs where public_id is null),
    'logs_duplicate', (select count(*) from (select public_id from public.rehearsal_logs group by public_id having count(*) > 1) as d),
    'logs_equals_internal', (select count(*) from public.rehearsal_logs where public_id = id),
    'images_null', (select count(*) from public.rehearsal_log_images where public_id is null),
    'images_duplicate', (select count(*) from (select public_id from public.rehearsal_log_images group by public_id having count(*) > 1) as d),
    'images_equals_internal', (select count(*) from public.rehearsal_log_images where public_id = id)
  ),
  'author_failures', pg_catalog.jsonb_build_object(
    'invalid_display', (
      select count(*) from public.rehearsal_logs
      where author_display_name is null
         or author_display_name <> btrim(author_display_name)
         or char_length(author_display_name) not between 1 and 80
    ),
    'profile_backfill_mismatch', (
      select count(*)
      from public.rehearsal_logs as log
      join public.profiles as profile on profile.id = log.author_profile_id
      where log.author_display_name is distinct from btrim(profile.display_name)
    ),
    'missing_ownership', (select count(*) from public.rehearsal_logs where author_profile_id is null)
  ),
  'memberships', pg_catalog.jsonb_build_object(
    'admin_count', (
      select count(*) from public.production_members
      where production_id = '892fa94e-6f56-4ad0-8a93-1d353de77196' and role = 'ADMIN'
    ),
    'member_7a4057ad_count', (
      select count(*) from public.production_members
      where production_id = '892fa94e-6f56-4ad0-8a93-1d353de77196'
        and profile_id = '7a4057ad-13ac-41d6-a2a7-5ad71158e063'
        and role = 'MEMBER'
    )
  ),
  'trigger_count', (
    select count(*)
    from pg_catalog.pg_trigger
    where not tgisinternal
      and tgname in (
        'rehearsal_logs_prepare_author_display_name',
        'tasks_public_id_immutable', 'events_public_id_immutable',
        'rehearsal_logs_public_id_immutable', 'rehearsal_log_images_public_id_immutable'
      )
  ),
  'rpc_security_definer_count', (
    select count(*)
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.prosecdef = true
      and routine.proconfig @> array['search_path=pg_catalog, public']
      and routine.proname in (
        'get_public_archive_production', 'get_public_archive_tasks',
        'get_public_archive_events', 'get_public_archive_rehearsal_logs',
        'get_public_archive_rehearsal_images'
      )
  ),
  'storage', (
    select pg_catalog.jsonb_build_object('public', bucket.public)
    from storage.buckets as bucket where bucket.id = 'rehearsal-images'
  )
) as verification_summary;
