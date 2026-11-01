-- FCM device registrations. Each signed-in user can manage only their own tokens.
create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android' check (platform in ('android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_devices_user_id_idx on public.push_devices(user_id);
alter table public.push_devices enable row level security;
drop policy if exists "Users can view their own push devices" on public.push_devices;
create policy "Users can view their own push devices" on public.push_devices for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can register their own push devices" on public.push_devices;
create policy "Users can register their own push devices" on public.push_devices for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their own push devices" on public.push_devices;
create policy "Users can update their own push devices" on public.push_devices for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can remove their own push devices" on public.push_devices;
create policy "Users can remove their own push devices" on public.push_devices for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.push_devices to authenticated;
