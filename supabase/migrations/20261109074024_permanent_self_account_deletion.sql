-- Only explicit author references in shared records become nullable.
alter table public.announcements alter column created_by drop not null;
alter table public.announcements drop constraint announcements_created_by_fkey;
alter table public.announcements add constraint announcements_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
alter table public.payments alter column recorded_by drop not null;
alter table public.payments drop constraint payments_recorded_by_fkey;
alter table public.payments add constraint payments_recorded_by_fkey foreign key (recorded_by) references auth.users(id) on delete set null;
alter table public.expenses alter column approved_by drop not null;
alter table public.expenses drop constraint expenses_approved_by_fkey;
alter table public.expenses add constraint expenses_approved_by_fkey foreign key (approved_by) references auth.users(id) on delete set null;
alter table public.app_settings alter column updated_by drop not null;
alter table public.app_settings drop constraint app_settings_updated_by_fkey;
alter table public.app_settings add constraint app_settings_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null;
alter table public.payment_audit_logs alter column performed_by drop not null;
alter table public.payment_audit_logs drop constraint payment_audit_logs_performed_by_fkey;
alter table public.payment_audit_logs add constraint payment_audit_logs_performed_by_fkey foreign key (performed_by) references auth.users(id) on delete set null;
alter table public.maintenance_tickets alter column created_by drop not null;
alter table public.maintenance_tickets drop constraint maintenance_tickets_created_by_fkey;
alter table public.maintenance_tickets add constraint maintenance_tickets_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
alter table public.facility_bookings alter column created_by drop not null;
alter table public.facility_bookings drop constraint facility_bookings_created_by_fkey;
alter table public.facility_bookings add constraint facility_bookings_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
alter table public.exceptional_collections alter column created_by drop not null;
alter table public.exceptional_collections drop constraint exceptional_collections_created_by_fkey;
alter table public.exceptional_collections add constraint exceptional_collections_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
alter table public.building_join_requests alter column reviewed_by drop not null;
alter table public.building_join_requests drop constraint building_join_requests_reviewed_by_fkey;
alter table public.building_join_requests add constraint building_join_requests_reviewed_by_fkey foreign key (reviewed_by) references auth.users(id) on delete set null;
alter table public.building_polls alter column created_by drop not null;
alter table public.building_polls drop constraint building_polls_created_by_fkey;
alter table public.building_polls add constraint building_polls_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
create function public.delete_my_account(confirmation text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); mine public.profiles;
begin
 if me is null or confirmation is distinct from 'حذف حسابي نهائيًا' then raise exception 'Confirmation required'; end if;
 if not exists(select 1 from auth.users where id=me) then raise exception 'Account not found'; end if;
 select * into mine from public.profiles where id=me;
 if mine.role='building_admin' and mine.building_id is not null then
   perform 1 from public.buildings where id=mine.building_id for update;
   if not exists(select 1 from public.profiles where building_id=mine.building_id and id<>me and role='building_admin' and approved and disabled_at is null) then raise exception 'LAST_MANAGER'; end if;
 end if;
 -- Personal requests and device/inbox data cascade; shared accounting remains.
 delete from public.building_invites where invited_by=me;
 delete from public.building_access_codes where created_by=me;
 delete from auth.users where id=me;
end $$;
revoke all on function public.delete_my_account(text) from public,anon;
grant execute on function public.delete_my_account(text) to authenticated;

create function public.add_successor_manager(member_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare mine public.profiles;
begin
 select * into mine from public.profiles where id=auth.uid();
 if mine.id is null or mine.role<>'building_admin' or not mine.approved or mine.disabled_at is not null or mine.building_id is null then raise exception 'Forbidden'; end if;
 perform 1 from public.buildings where id=mine.building_id for update;
 update public.profiles set role='building_admin' where id=member_id and id<>mine.id and building_id=mine.building_id and approved and disabled_at is null and role in ('owner','tenant');
 if not found then raise exception 'Member not eligible'; end if;
end $$;
revoke all on function public.add_successor_manager(uuid) from public,anon;
grant execute on function public.add_successor_manager(uuid) to authenticated;
