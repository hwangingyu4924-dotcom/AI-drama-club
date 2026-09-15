-- EMERGENCY MANUAL ROLLBACK. Do not run unless the public archive must close.
-- The slug is intentionally retained for stable routing and future reactivation.

begin;

do $$
declare
  updated_rows integer;
begin
  update public.productions
  set public_archive = false
  where id = '892fa94e-6f56-4ad0-8a93-1d353de77196'
    and public_archive = true;

  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then
    raise exception 'Expected exactly one public production, updated %', updated_rows;
  end if;
end;
$$;

select public_slug, public_archive
from public.productions
where id = '892fa94e-6f56-4ad0-8a93-1d353de77196';

select count(*) as public_production_count
from public.productions
where public_archive = true;

commit;
