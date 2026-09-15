-- READ-ONLY content review. This reports counts/flags, never matched text.
-- Run as an authenticated administrator before activation.

with target as (
  select * from public.productions
  where id = '892fa94e-6f56-4ad0-8a93-1d353de77196'
), patterns as (
  select '(?:[[:alnum:]_.%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|01[016789][ -]?[0-9]{3,4}[ -]?[0-9]{4}|(?:password|passwd|비밀번호|출입번호|계정정보)[[:space:]]*[:=])'::text as sensitive
)
select pg_catalog.jsonb_build_object(
  'counts', pg_catalog.jsonb_build_object(
    'productions', (select count(*) from target),
    'tasks', (select count(*) from public.tasks where production_id = (select id from target)),
    'events', (select count(*) from public.events where production_id = (select id from target)),
    'rehearsal_logs', (select count(*) from public.rehearsal_logs where production_id = (select id from target)),
    'rehearsal_log_images', (select count(*) from public.rehearsal_log_images where production_id = (select id from target)),
    'profiles', (select count(*) from public.profiles),
    'production_members', (select count(*) from public.production_members)
  ),
  'current_public_state', (
    select pg_catalog.jsonb_build_object('public_archive', public_archive, 'public_slug', public_slug)
    from target
  ),
  'canonical_fields_missing', (
    select pg_catalog.jsonb_build_object(
      'title', nullif(btrim(title), '') is null,
      'performance_date', performance_date is null,
      'venue', nullif(btrim(venue), '') is null,
      'project_start_date', project_start_date is null,
      'status', nullif(btrim(status), '') is null,
      'parts', parts is null or jsonb_array_length(parts) = 0,
      'public_venue_info', nullif(btrim(public_venue_info), '') is null,
      'public_rehearsal_summary', nullif(btrim(public_rehearsal_summary), '') is null
    ) from target
  ),
  'sensitive_pattern_flags', pg_catalog.jsonb_build_object(
    'production_public_fields', (
      select count(*) from target, patterns
      where concat_ws(' ', title, venue, public_venue_info, public_rehearsal_summary) ~* patterns.sensitive
    ),
    'task_public_fields', (
      select count(*) from public.tasks, target, patterns
      where tasks.production_id = target.id
        and concat_ws(' ', tasks.name, tasks.part, tasks.status, tasks.priority) ~* patterns.sensitive
    ),
    'event_curated_fields', (
      select count(*) from public.events, target, patterns
      where events.production_id = target.id
        and concat_ws(' ', events.title, events.type, events.part, events.public_location, events.public_description) ~* patterns.sensitive
    ),
    'rehearsal_public_fields', (
      select count(*) from public.rehearsal_logs, target, patterns
      where rehearsal_logs.production_id = target.id
        and concat_ws(' ', rehearsal_logs.title, rehearsal_logs.content, rehearsal_logs.category,
          rehearsal_logs.author_display_name, rehearsal_logs.tags::text) ~* patterns.sensitive
    )
  ),
  'author_display_review', pg_catalog.jsonb_build_object(
    'invalid', (
      select count(*) from public.rehearsal_logs, target
      where rehearsal_logs.production_id = target.id
        and (author_display_name is null or author_display_name <> btrim(author_display_name)
          or char_length(author_display_name) not between 1 and 80)
    ),
    'account_like', (
      select count(*) from public.rehearsal_logs, target
      where rehearsal_logs.production_id = target.id
        and author_display_name ~* '^[[:alnum:]_.-]{6,}$'
    )
  ),
  'slug_conflicts', (
    select count(*) from public.productions
    where public_slug = 'spring-holding-hands-2026'
      and id <> '892fa94e-6f56-4ad0-8a93-1d353de77196'
  )
) as content_review_summary;
