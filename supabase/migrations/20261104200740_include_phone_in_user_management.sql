drop function if exists public.list_building_users();
drop function if exists public.list_all_bunyan_users();

create function public.list_building_users()
returns table(
  user_id uuid, email text, phone text, full_name text, role text, approved boolean,
  building_id uuid, apartment_id uuid, registered_at timestamptz, disabled_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  manager_building_id uuid;
  manager_role text;
begin
  select p.building_id, p.role into manager_building_id, manager_role
  from public.profiles p
  where p.id = (select auth.uid()) and p.approved = true and p.disabled_at is null;
  if manager_role not in ('building_admin', 'assistant_admin', 'super_admin') then
    raise exception 'Not authorized to list building users';
  end if;
  return query
  select p.id, u.email::text, p.phone, coalesce(p.full_name, ''), p.role,
         p.approved, p.building_id, p.apartment_id, u.created_at, p.disabled_at
  from public.profiles p join auth.users u on u.id = p.id
  where (manager_role = 'super_admin' or p.building_id = manager_building_id)
  order by u.created_at desc;
end;
$$;

create function public.list_all_bunyan_users()
returns table(
  user_id uuid, email text, phone text, full_name text, role text, approved boolean,
  building_id uuid, apartment_id uuid, registered_at timestamptz, disabled_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.approved = true
      and p.role = 'super_admin' and p.disabled_at is null
  ) then
    raise exception 'Only the primary administrator can manage registered accounts';
  end if;
  return query
  select p.id, u.email::text, p.phone, coalesce(p.full_name, ''), p.role,
         p.approved, p.building_id, p.apartment_id, u.created_at, p.disabled_at
  from public.profiles p join auth.users u on u.id = p.id
  order by u.created_at desc;
end;
$$;

revoke all on function public.list_building_users() from public, anon;
grant execute on function public.list_building_users() to authenticated;
revoke all on function public.list_all_bunyan_users() from public, anon;
grant execute on function public.list_all_bunyan_users() to authenticated;
