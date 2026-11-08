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
      audience:='all';
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
  -- Building expenses reach all members; payments and maintenance stay apartment-scoped.
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

-- Only future events are queued: historical inbox entries are not replayed.
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.app_notifications(id) on delete cascade,
  device_id uuid not null references public.push_devices(id) on delete cascade,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_id uuid,
  completed_at timestamptz,
  outcome text,
  unique(notification_id, device_id)
);
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from public, anon, authenticated;
grant all on public.notification_deliveries to service_role;
create index notification_deliveries_pending on public.notification_deliveries(available_at) where completed_at is null;

create function public.queue_mobile_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.category in ('announcements','payments','expenses','maintenance_tickets','app_updates') then
    insert into public.notification_deliveries(notification_id,device_id)
    select new.id,d.id from public.push_devices d where d.user_id=new.recipient_id
    on conflict do nothing;
  end if;
  return null;
end; $$;
revoke all on function public.queue_mobile_notification() from public,anon,authenticated;
create trigger queue_mobile_notification after insert on public.app_notifications
for each row execute function public.queue_mobile_notification();

create function public.claim_mobile_notifications(batch_size integer default 40)
returns table(delivery_id uuid,lease_id uuid,notification_id uuid,device_id uuid,token text,title text,body text,category text,building_id uuid)
language sql security invoker set search_path='' as $$
  with candidates as (
    select d.id from public.notification_deliveries d
    where d.completed_at is null and d.available_at<=now() and d.attempts<8
    order by d.available_at limit least(greatest(batch_size,1),100)
    for update skip locked
  ), claimed as (
    update public.notification_deliveries d set attempts=d.attempts+1,
      available_at=now()+interval '5 minutes',lease_id=gen_random_uuid()
    from candidates c where d.id=c.id returning d.*
  )
  select c.id,c.lease_id,n.id,pd.id,pd.token,n.title,n.body,n.category,n.building_id
  from claimed c join public.app_notifications n on n.id=c.notification_id
  join public.push_devices pd on pd.id=c.device_id
  join public.profiles p on p.id=n.recipient_id and p.id=pd.user_id
  where p.approved and p.disabled_at is null and p.building_id=n.building_id
    and p.role in ('building_admin','owner','tenant')
    and (p.role='building_admin' or n.category not in ('payments','maintenance_tickets') or
      exists(select 1 from public.payments x where n.category='payments' and x.id=n.entity_id and x.apartment_id=p.apartment_id) or
      exists(select 1 from public.maintenance_tickets x where n.category='maintenance_tickets' and x.id=n.entity_id and x.apartment_id=p.apartment_id));
$$;
revoke all on function public.claim_mobile_notifications(integer) from public,anon,authenticated;
grant execute on function public.claim_mobile_notifications(integer) to service_role;

-- A curated release ID prevents repeated broadcasts on routine commits/retries.
create table public.app_release_notices (
  release_id text primary key,
  title text not null check(length(title) between 1 and 80),
  body text not null check(length(body) between 1 and 240),
  created_at timestamptz not null default now()
);
alter table public.app_release_notices enable row level security;
revoke all on public.app_release_notices from public,anon,authenticated;
grant all on public.app_release_notices to service_role;
create function public.publish_app_release(release_id text,title text,body text) returns integer
language plpgsql security invoker set search_path='' as $$
declare inserted integer;
begin
  insert into public.app_release_notices values(release_id,title,body,now()) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=0 then return 0; end if;
  insert into public.app_notifications(recipient_id,building_id,category,title,body,manager_target,member_target,source_key)
  select p.id,p.building_id,'app_updates',publish_app_release.title,publish_app_release.body,'dashboard','home','release:'||release_id
  from public.profiles p where p.approved and p.disabled_at is null and p.building_id is not null
    and p.role in ('building_admin','owner','tenant') on conflict do nothing;
  get diagnostics inserted=row_count;
  return inserted;
end; $$;
revoke all on function public.publish_app_release(text,text,text) from public,anon,authenticated;
grant execute on function public.publish_app_release(text,text,text) to service_role;

select cron.schedule('elomara-mobile-notifications','* * * * *',$job$
  select net.http_post(
    url:=(select decrypted_secret from vault.decrypted_secrets where name='bunyan_project_url')||'/functions/v1/deliver-mobile-notifications',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='bunyan_anon_key'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='bunyan_overdue_cron_secret')),
    body:='{}'::jsonb,timeout_milliseconds:=55000);
$job$);
