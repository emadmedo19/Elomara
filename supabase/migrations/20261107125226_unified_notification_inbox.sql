create table public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  category text not null,
  title text not null,
  body text not null default '',
  manager_target text not null,
  member_target text not null,
  entity_id uuid,
  source_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(recipient_id, source_key)
);
create index app_notifications_recipient_created_idx on public.app_notifications(recipient_id,building_id,created_at desc);
create index app_notifications_unread_idx on public.app_notifications(recipient_id,building_id) where read_at is null;
alter table public.app_notifications enable row level security;
revoke all on public.app_notifications from public, anon, authenticated;
grant select, update(read_at) on public.app_notifications to authenticated;
create policy app_notifications_own_read on public.app_notifications for select to authenticated
using (recipient_id=(select auth.uid()) and exists(select 1 from public.profiles p
  where p.id=(select auth.uid()) and p.approved and p.disabled_at is null and p.building_id=app_notifications.building_id));
create policy app_notifications_own_mark_read on public.app_notifications for update to authenticated
using (recipient_id=(select auth.uid()) and exists(select 1 from public.profiles p
  where p.id=(select auth.uid()) and p.approved and p.disabled_at is null and p.building_id=app_notifications.building_id))
with check (recipient_id=(select auth.uid()) and exists(select 1 from public.profiles p
  where p.id=(select auth.uid()) and p.approved and p.disabled_at is null and p.building_id=app_notifications.building_id));

create or replace function public.capture_app_notification()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  item jsonb;
  bld uuid;
  apt uuid;
  target_user uuid;
  audience text := 'managers';
  kind text;
  heading text;
  message text;
  manager_page text;
  member_page text := 'home';
  event_key text;
begin
  if TG_OP='UPDATE' and (to_jsonb(new)-'updated_at')=(to_jsonb(old)-'updated_at') then return null; end if;
  if TG_OP='DELETE' then item:=to_jsonb(old); else item:=to_jsonb(new); end if;
  bld := (item->>'building_id')::uuid;
  apt := (item->>'apartment_id')::uuid;
  if bld is null or not exists(select 1 from public.buildings where id=bld) then return null; end if;
  kind:=TG_TABLE_NAME;
  case TG_TABLE_NAME
    when 'announcements' then
      if item->>'archived_at' is not null then return null; end if;
      audience:='all'; heading:=case when TG_OP='UPDATE' then 'تحديث إعلان: ' else 'إعلان: ' end || (item->>'title');
      message:=left(coalesce(item->>'content','إعلان جديد من إدارة العمارة'),180);
      manager_page:='image-studio'; member_page:='announcements';
    when 'maintenance_tickets' then
      audience:='apartment'; heading:=case when TG_OP='INSERT' then 'بلاغ صيانة جديد' else 'تحديث بلاغ الصيانة' end;
      message:=coalesce(item->>'title','بلاغ صيانة') || ' • ' || coalesce(item->>'status','جديد');
      manager_page:='resident'; member_page:='maintenance';
    when 'apartments' then
      if item->>'payment_status' <> 'overdue' or (to_jsonb(old)->>'payment_status') is not distinct from item->>'payment_status' then return null; end if;
      apt:=(item->>'id')::uuid; audience:='apartment'; heading:='تنبيه مستحقات الشقة';
      message:='توجد مستحقات متأخرة على الشقة '||coalesce(item->>'unit_number',''); manager_page:='collections'; member_page:='payments';
    when 'facility_bookings' then
      audience:='apartment'; heading:=case when TG_OP='INSERT' then 'طلب حجز مرفق' else 'تحديث طلب الحجز' end;
      message:=coalesce(item->>'facility','حجز مرفق') || ' • ' || coalesce(item->>'status','قيد المراجعة');
      manager_page:='resident'; member_page:='bookings';
    when 'payments' then
      audience:='apartment'; heading:=case TG_OP when 'DELETE' then 'حذف دفعة مسجلة' when 'UPDATE' then 'تعديل دفعة مسجلة' else 'تسجيل سداد جديد' end;
      message:='شقة ' || coalesce(item->>'unit_number','') || ' • ' || coalesce(item->>'amount','0') || ' ج.م';
      manager_page:='collections'; member_page:='payments';
    when 'expenses' then
      heading:=case TG_OP when 'DELETE' then 'حذف مصروف' when 'UPDATE' then 'تعديل مصروف' else 'مصروف جديد' end;
      message:=coalesce(item->>'title','مصروف') || ' • ' || coalesce(item->>'amount','0') || ' ج.م'; manager_page:='expenses';
    when 'building_join_requests' then
      target_user:=(item->>'user_id')::uuid; audience:='user';
      heading:=case when item->>'status'='pending' then 'طلب انضمام جديد' else 'تحديث طلب الانضمام' end;
      message:=coalesce(item->>'full_name','طلب انضمام') || ' • ' || case item->>'status' when 'approved' then 'تمت الموافقة' when 'rejected' then 'تم الرفض' else 'قيد المراجعة' end;
      manager_page:='approvals';
    when 'building_polls' then
      if TG_OP='INSERT' and (item->>'starts_at')::timestamptz > now() then return null; end if;
      audience:='all'; heading:=case when item->>'status'='closed' then 'انتهاء استطلاع رأي' else 'استطلاع رأي' end;
      message:=coalesce(item->>'question','استطلاع رأي العمارة'); manager_page:='polls'; member_page:='polls';
    when 'building_treasury_settings_audit' then
      heading:='تحديث الرصيد ووديعة الصيانة'; message:='تم حفظ تعديل إعدادات خزينة العمارة'; manager_page:='treasury-settings';
    when 'app_settings' then
      heading:='تحديث إعدادات العمارة'; message:='تم حفظ إعدادات العمارة والتحصيل'; manager_page:='app-settings';
    else return null;
  end case;
  if TG_OP='INSERT' then event_key:=TG_TABLE_NAME || ':' || coalesce(item->>'id',bld::text||':'||(item->>'setting_key')) || ':initial';
  else event_key:=TG_TABLE_NAME || ':' || coalesce(item->>'id',bld::text||':'||(item->>'setting_key')) || ':' || TG_OP || ':' || txid_current()::text || ':' || md5(item::text); end if;
  -- General notices reach approved members; private events reach the linked
  -- apartment only. Manager-only financial details never fan out to residents.
  insert into public.app_notifications(recipient_id,building_id,category,title,body,manager_target,member_target,entity_id,source_key)
  select p.id,bld,kind,heading,message,manager_page,member_page,(item->>'id')::uuid,event_key
  from public.profiles p where p.building_id=bld and p.approved and p.disabled_at is null
    and (p.role='building_admin' or (p.role in ('owner','tenant') and
      (audience='all' or (audience='apartment' and p.apartment_id=apt) or (audience='user' and p.id=target_user))))
  on conflict(recipient_id,source_key) do nothing;
  return null;
end;
$$;
revoke all on function public.capture_app_notification() from public,anon,authenticated;
create trigger announcements_inbox after insert or update on public.announcements for each row execute function public.capture_app_notification();
create trigger maintenance_inbox after insert or update on public.maintenance_tickets for each row execute function public.capture_app_notification();
create trigger overdue_inbox after update on public.apartments for each row execute function public.capture_app_notification();
create trigger bookings_inbox after insert or update on public.facility_bookings for each row execute function public.capture_app_notification();
create trigger payments_inbox after insert or update or delete on public.payments for each row execute function public.capture_app_notification();
create trigger expenses_inbox after insert or update or delete on public.expenses for each row execute function public.capture_app_notification();
create trigger join_requests_inbox after insert or update on public.building_join_requests for each row execute function public.capture_app_notification();
create trigger polls_inbox after insert or update on public.building_polls for each row execute function public.capture_app_notification();
create trigger treasury_settings_inbox after insert on public.building_treasury_settings_audit for each row execute function public.capture_app_notification();
create trigger app_settings_inbox after insert or update on public.app_settings for each row execute function public.capture_app_notification();

-- Populate useful existing notices without replaying historical financial events.
insert into public.app_notifications(recipient_id,building_id,category,title,body,manager_target,member_target,entity_id,source_key,created_at)
select p.id,a.building_id,'announcements','إعلان: '||a.title,left(a.content,180),'image-studio','announcements',a.id,'announcements:'||a.id::text||':initial',a.created_at
from public.profiles p cross join lateral(select n.* from public.announcements n where n.building_id=p.building_id and n.archived_at is null order by n.created_at desc limit 30) a
where p.approved and p.disabled_at is null and p.role in ('building_admin','owner','tenant')
on conflict(recipient_id,source_key) do nothing;
insert into public.app_notifications(recipient_id,building_id,category,title,body,manager_target,member_target,entity_id,source_key,created_at)
select p.id,t.building_id,'maintenance_tickets','بلاغ صيانة',t.title||' • '||t.status,'resident','maintenance',t.id,'maintenance_tickets:'||t.id::text||':initial',coalesce(t.updated_at,t.created_at)
from public.profiles p cross join lateral(select m.* from public.maintenance_tickets m where m.building_id=p.building_id and (p.role='building_admin' or p.apartment_id=m.apartment_id) order by m.created_at desc limit 30) t
where p.approved and p.disabled_at is null and p.role in ('building_admin','owner','tenant')
on conflict(recipient_id,source_key) do nothing;
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='app_notifications') then
    alter publication supabase_realtime add table public.app_notifications;
  end if;
end; $$;
