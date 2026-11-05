drop policy if exists announcements_resident_select on public.announcements;
create policy announcements_resident_select on public.announcements
for select to authenticated
using (
  building_id = (
    select p.building_id from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true and p.disabled_at is null
      and p.role in ('tenant','owner')
  )
);

drop policy if exists apartments_resident_select on public.apartments;
create policy apartments_resident_select on public.apartments
for select to authenticated
using (
  id = (
    select p.apartment_id from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true and p.disabled_at is null
      and p.role in ('tenant','owner')
  )
);

drop policy if exists buildings_resident_select on public.buildings;
create policy buildings_resident_select on public.buildings
for select to authenticated
using (
  id = (
    select p.building_id from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true and p.disabled_at is null
      and p.role in ('tenant','owner')
  )
);

drop policy if exists exceptional_collections_resident_select on public.exceptional_collections;
create policy exceptional_collections_resident_select on public.exceptional_collections
for select to authenticated
using (
  target_apartment_ids @> array[(
    select p.apartment_id from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true and p.disabled_at is null
      and p.role in ('owner','tenant')
  )]
);

drop policy if exists facility_bookings_resident_insert on public.facility_bookings;
create policy facility_bookings_resident_insert on public.facility_bookings
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and apartment_id = (
    select p.apartment_id from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true and p.disabled_at is null
      and p.role in ('tenant','owner')
  )
  and building_id = (
    select p.building_id from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true and p.disabled_at is null
      and p.role in ('tenant','owner')
  )
);

drop policy if exists facility_bookings_resident_select on public.facility_bookings;
create policy facility_bookings_resident_select on public.facility_bookings
for select to authenticated
using (
  apartment_id = (
    select p.apartment_id from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true and p.disabled_at is null
      and p.role in ('tenant','owner')
  )
);

drop policy if exists maintenance_tickets_resident_insert on public.maintenance_tickets;
create policy maintenance_tickets_resident_insert on public.maintenance_tickets
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and apartment_id = (
    select p.apartment_id from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true and p.disabled_at is null
      and p.role in ('tenant','owner')
  )
  and building_id = (
    select p.building_id from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true and p.disabled_at is null
      and p.role in ('tenant','owner')
  )
);

drop policy if exists maintenance_tickets_resident_select on public.maintenance_tickets;
create policy maintenance_tickets_resident_select on public.maintenance_tickets
for select to authenticated
using (
  apartment_id = (
    select p.apartment_id from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true and p.disabled_at is null
      and p.role in ('tenant','owner')
  )
);

drop policy if exists payments_resident_select on public.payments;
create policy payments_resident_select on public.payments
for select to authenticated
using (
  apartment_id = (
    select p.apartment_id from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true and p.disabled_at is null
      and p.role in ('tenant','owner')
  )
);
