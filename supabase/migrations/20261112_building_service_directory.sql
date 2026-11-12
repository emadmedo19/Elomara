-- Shared, building-scoped contact directory. Managers write; approved residents read.
create table if not exists public.building_service_contacts (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  category text not null check (char_length(btrim(category)) between 2 and 60),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  phone text not null check (char_length(btrim(phone)) between 5 and 30),
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists building_service_contacts_building_idx on public.building_service_contacts(building_id,category);
alter table public.building_service_contacts enable row level security;
create policy building_service_contacts_read on public.building_service_contacts for select to authenticated using (
  public.can_manage_bunyan_building(building_id) or exists (
    select 1 from public.profiles p where p.id = (select auth.uid())
      and p.building_id = building_service_contacts.building_id and p.approved = true
      and p.disabled_at is null and p.role in ('owner','tenant') and p.apartment_id is not null
  )
);
create policy building_service_contacts_insert on public.building_service_contacts for insert to authenticated with check (public.can_manage_bunyan_building(building_id));
create policy building_service_contacts_update on public.building_service_contacts for update to authenticated using (public.can_manage_bunyan_building(building_id)) with check (public.can_manage_bunyan_building(building_id));
create policy building_service_contacts_delete on public.building_service_contacts for delete to authenticated using (public.can_manage_bunyan_building(building_id));
grant select,insert,update,delete on public.building_service_contacts to authenticated;
