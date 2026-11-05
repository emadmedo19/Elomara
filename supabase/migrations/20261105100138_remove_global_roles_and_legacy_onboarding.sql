-- Remove global administrator roles and retire legacy onboarding RPCs.
update public.profiles
set role = 'pending', approved = false, building_id = null, apartment_id = null, updated_at = now()
where role in ('super_admin', 'assistant_admin');

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
check (role = any (array['building_admin'::text, 'owner'::text, 'tenant'::text, 'pending'::text]));

revoke all on function public.bootstrap_first_super_admin() from public, anon, authenticated;
revoke all on function public.approve_registration_as_super_admin(uuid) from public, anon, authenticated;
revoke all on function public.set_bunyan_user_role(uuid,text) from public, anon, authenticated;
revoke all on function public.list_all_bunyan_users() from public, anon, authenticated;
revoke all on function public.disable_bunyan_user(uuid) from public, anon, authenticated;
revoke all on function public.is_active_bunyan_admin() from public, anon, authenticated;
revoke all on function public.approve_registration(uuid) from public, anon, authenticated;
revoke all on function public.approve_and_assign_registration(uuid,uuid) from public, anon, authenticated;
revoke all on function public.list_pending_registrations() from public, anon, authenticated;
revoke all on function public.accept_building_invite(uuid) from public, anon, authenticated;
revoke all on function public.accept_building_phone_invite(text) from public, anon, authenticated;
revoke all on function public.create_building_invite(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.create_building_phone_invite(uuid,uuid,text,text) from public, anon, authenticated;
