-- MANUAL ACTIVATION ONLY. DO NOT RUN DURING PHASE 2A.
-- Run only after the migration, content privacy review, frontend deployment,
-- anonymous security tests, and an explicit release decision have all passed.

begin;

do $$
declare
  updated_rows integer;
begin
  if exists (
    select 1 from public.productions
    where public_slug = 'spring-holding-hands-2026'
      and id <> '892fa94e-6f56-4ad0-8a93-1d353de77196'
  ) then
    raise exception 'Public archive slug is already in use';
  end if;

  update public.productions
  set
    public_slug = 'spring-holding-hands-2026',
    public_archive = true
  where id = '892fa94e-6f56-4ad0-8a93-1d353de77196'
    and public_archive = false;

  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then
    raise exception 'Expected exactly one private production, updated %', updated_rows;
  end if;
end;
$$;

select public_slug, public_archive
from public.productions
where id = '892fa94e-6f56-4ad0-8a93-1d353de77196';

commit;
