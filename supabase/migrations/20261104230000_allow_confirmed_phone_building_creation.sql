-- Allow an authenticated account with either a confirmed email or a confirmed
-- mobile number to create its own isolated building.
create or replace function public.create_building_for_current_user(
  building_name text,
  building_address text default '',
  units_count integer default 0,
  floors_count integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_id uuid := auth.uid();
  new_building_id uuid;
  profile_row public.profiles%rowtype;
  identity_confirmed boolean;
begin
  if current_id is null then raise exception 'Authentication required'; end if;

  select (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
    into identity_confirmed from auth.users u where u.id = current_id;
  if coalesce(identity_confirmed, false) is not true then
    raise exception 'Confirm your email or mobile number before creating a building';
  end if;

  if nullif(trim(building_name), '') is null then raise exception 'Building name is required'; end if;
  if coalesce(units_count, 0) < 0 or (floors_count is not null and floors_count < 0) then
    raise exception 'Unit and floor counts cannot be negative';
  end if;

  select * into profile_row from public.profiles where id = current_id for update;
  if not found or profile_row.role <> 'pending' or profile_row.approved or profile_row.disabled_at is not null then
    raise exception 'This account is not eligible to create a building';
  end if;
  if profile_row.building_id is not null then raise exception 'This account is already assigned to a building'; end if;

  insert into public.buildings (name, address, total_units, total_floors, manager_name)
  values (trim(building_name), coalesce(trim(building_address), ''), coalesce(units_count, 0),
          floors_count, coalesce(profile_row.full_name, ''))
  returning id into new_building_id;

  if coalesce(units_count, 0) > 0 then
    insert into public.apartments (building_id, unit_number, floor)
    select new_building_id, units.unit_no::text,
      case when coalesce(floors_count, 0) > 0
        then ceil(units.unit_no::numeric / ceil(units_count::numeric / floors_count::numeric))::integer
        else 1 end
    from generate_series(1, units_count) as units(unit_no);
  end if;

  update public.profiles set role = 'building_admin', approved = true,
    building_id = new_building_id, apartment_id = null, updated_at = now()
  where id = current_id;
  return new_building_id;
end;
$function$;

revoke all on function public.create_building_for_current_user(text, text, integer, integer) from public;
grant execute on function public.create_building_for_current_user(text, text, integer, integer) to authenticated;
