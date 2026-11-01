-- Super-admin controlled approval queue for new resident registrations.
create or replace function public.list_pending_registrations()
returns table (
  user_id uuid,
  email text,
  full_name text,
  registered_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_admin'
      and p.approved = true
  ) then
    raise exception 'Only the active super admin can review registrations';
  end if;

  return query
  select p.id, u.email::text, coalesce(p.full_name, ''), u.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'pending' and p.approved = false
  order by u.created_at asc;
end;
$$;

create or replace function public.approve_registration(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_admin'
      and p.approved = true
  ) then
    raise exception 'Only the active super admin can approve registrations';
  end if;

  update public.profiles
  set role = 'tenant', approved = true, updated_at = now()
  where id = target_user_id and role = 'pending' and approved = false;

  return found;
end;
$$;

revoke all on function public.list_pending_registrations() from public;
revoke all on function public.approve_registration(uuid) from public;
grant execute on function public.list_pending_registrations() to authenticated;
grant execute on function public.approve_registration(uuid) to authenticated;
