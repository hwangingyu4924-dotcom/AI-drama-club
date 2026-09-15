-- MANUAL APPROVED CONTENT UPDATE ONLY. This does not activate the archive.
-- Run the complete file once in the Supabase SQL Editor for project
-- oevqyhkifpyazphnumqg, then retain the final verification result.

begin;

do $$
declare
  target_production public.productions%rowtype;
  target_log_count integer;
  updated_rows integer;
begin
  select * into target_production
  from public.productions
  where id = '892fa94e-6f56-4ad0-8a93-1d353de77196'
  for update;

  if not found then
    raise exception 'Target production not found';
  end if;
  if target_production.public_archive is distinct from false then
    raise exception 'Target production must remain private';
  end if;
  if (select count(*) from public.productions where public_archive = true) <> 0 then
    raise exception 'Expected zero public productions';
  end if;

  select count(*) into target_log_count
  from public.rehearsal_logs
  where production_id = target_production.id;
  if target_log_count <> 3 then
    raise exception 'Expected exactly three rehearsal logs, found %', target_log_count;
  end if;

  create temporary table phase2e1_rehearsal_ownership on commit drop as
  select id, author_profile_id, author, production_id, created_at
  from public.rehearsal_logs
  where production_id = target_production.id;

  update public.productions
  set
    title = '봄, 손을 잡다',
    performance_date = date '2026-10-18',
    venue = '전일빌딩245',
    project_start_date = date '2026-08-24'
  where id = target_production.id
    and public_archive = false;

  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then
    raise exception 'Expected one production update, updated %', updated_rows;
  end if;

  update public.rehearsal_logs
  set author_display_name = '황인규'
  where production_id = target_production.id;

  get diagnostics updated_rows = row_count;
  if updated_rows <> 3 then
    raise exception 'Expected three rehearsal author updates, updated %', updated_rows;
  end if;

  if exists (
    select 1
    from public.rehearsal_logs as current_log
    full join phase2e1_rehearsal_ownership as original using (id)
    where current_log.author_profile_id is distinct from original.author_profile_id
       or current_log.author is distinct from original.author
       or current_log.production_id is distinct from original.production_id
       or current_log.created_at is distinct from original.created_at
       or current_log.id is null
       or original.id is null
  ) then
    raise exception 'Rehearsal ownership or identity changed unexpectedly';
  end if;
end;
$$;

select pg_catalog.jsonb_build_object(
  'production', (
    select pg_catalog.jsonb_build_object(
      'title_ok', title = '봄, 손을 잡다',
      'performance_date_ok', performance_date = date '2026-10-18',
      'venue_ok', venue = '전일빌딩245',
      'project_start_date_ok', project_start_date = date '2026-08-24',
      'status', status,
      'parts_count', jsonb_array_length(parts),
      'public_venue_info_empty', nullif(btrim(public_venue_info), '') is null,
      'public_rehearsal_summary_empty', nullif(btrim(public_rehearsal_summary), '') is null,
      'public_archive', public_archive,
      'public_slug', public_slug
    )
    from public.productions
    where id = '892fa94e-6f56-4ad0-8a93-1d353de77196'
  ),
  'rehearsal_author_count', (
    select count(*) from public.rehearsal_logs
    where production_id = '892fa94e-6f56-4ad0-8a93-1d353de77196'
      and author_display_name = '황인규'
  ),
  'rehearsal_total', (
    select count(*) from public.rehearsal_logs
    where production_id = '892fa94e-6f56-4ad0-8a93-1d353de77196'
  ),
  'public_production_count', (
    select count(*) from public.productions where public_archive = true
  )
) as phase2e1_verification;

commit;
