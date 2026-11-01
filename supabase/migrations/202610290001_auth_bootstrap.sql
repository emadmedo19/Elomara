-- Supabase Auth profile provisioning and one-time first-admin bootstrap.
-- No legacy Firebase users or application records are imported.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, approved)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'pending',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

alter table public.profiles enable row level security;
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

create or replace function public.bootstrap_first_super_admin()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  confirmed_at timestamptz;
  existing_admin_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(741852963);

  select email_confirmed_at into confirmed_at
  from auth.users where id = current_user_id;

  if confirmed_at is null then
    return false;
  end if;

  select count(*) into existing_admin_count
  from public.profiles where role = 'super_admin';

  if existing_admin_count > 0 then
    return false;
  end if;

  update public.profiles
  set role = 'super_admin', approved = true, updated_at = now()
  where id = current_user_id and role = 'pending';

  return found;
end;
$$;

revoke all on function public.bootstrap_first_super_admin() from public;
grant execute on function public.bootstrap_first_super_admin() to authenticated;
