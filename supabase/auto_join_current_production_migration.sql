-- Additive migration: authenticated users automatically join one explicitly
-- selected current production. Existing memberships and roles are preserved.
begin;

alter table public.productions
  add column is_current boolean not null default false;

create unique index productions_one_current_idx
  on public.productions (is_current)
  where is_current;

create or replace function public.ensure_current_production_membership()
returns table (production_id uuid, profile_id uuid, role text, created boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  caller_name text;
  current_production_id uuid;
  existing_role text;
  membership_created boolean := false;
begin
  if caller_id is null then
    raise exception 'authentication required';
  end if;

  select p.display_name into caller_name
  from public.profiles p
  where p.id = caller_id;
  if caller_name is null then
    raise exception 'profile is required';
  end if;

  select p.id into current_production_id
  from public.productions p
  where p.is_current;
  if current_production_id is null then
    raise exception 'current production is not configured';
  end if;

  select pm.role into existing_role
  from public.production_members pm
  where pm.production_id = current_production_id
    and pm.profile_id = caller_id;

  if existing_role is null then
    insert into public.production_members
      (production_id, profile_id, display_name, role)
    values (current_production_id, caller_id, caller_name, 'MEMBER')
    on conflict on constraint production_members_pkey do nothing;
    membership_created := found;

    select pm.role into existing_role
    from public.production_members pm
    where pm.production_id = current_production_id
      and pm.profile_id = caller_id;
  end if;

  return query select current_production_id, caller_id, existing_role, membership_created;
end;
$$;

revoke all on function public.ensure_current_production_membership() from public;
grant execute on function public.ensure_current_production_membership() to authenticated;

commit;
