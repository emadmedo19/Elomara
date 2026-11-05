update public.profiles
set role='pending', approved=false, building_id=null, apartment_id=null, updated_at=now()
where role in ('super_admin','assistant_admin');
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
check (role in ('building_admin','owner','tenant','pending'));
