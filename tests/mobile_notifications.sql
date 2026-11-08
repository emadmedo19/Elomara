-- Transactional integration checks: no messages or financial changes persist.
begin;
do $$
declare n uuid; b uuid; u uuid; expected integer; actual integer; first_count integer;
begin
  if has_function_privilege('authenticated','public.publish_app_release(text,text,text)','EXECUTE') then raise exception 'Client can broadcast releases'; end if;
  if has_function_privilege('anon','public.claim_mobile_notifications(integer)','EXECUTE') then raise exception 'Anonymous can claim deliveries'; end if;
  if has_table_privilege('authenticated','public.notification_deliveries','SELECT') then raise exception 'Client can read delivery queue'; end if;
  select p.id,p.building_id into u,b from public.profiles p join public.push_devices d on d.user_id=p.id where p.approved and p.disabled_at is null and p.building_id is not null limit 1;
  if u is null then raise exception 'No eligible device to verify queue'; end if;
  insert into public.app_notifications(recipient_id,building_id,category,title,body,manager_target,member_target,source_key)
  values(u,b,'expenses','اختبار لا يرسل','اختبار','expenses','home','transactional-notification-test') returning id into n;
  select count(*) into expected from public.push_devices where user_id=u;
  select count(*) into actual from public.notification_deliveries where notification_id=n;
  if actual<>expected then raise exception 'Wrong number of device deliveries'; end if;
  perform * from public.claim_mobile_notifications(100);
  select count(*) into actual from public.notification_deliveries where notification_id=n and attempts=1 and lease_id is not null;
  if actual<>expected then raise exception 'Claim did not lease devices'; end if;
  perform * from public.claim_mobile_notifications(100);
  if exists(select 1 from public.notification_deliveries where notification_id=n and attempts<>1) then raise exception 'Concurrent duplicate claim'; end if;
  first_count:=public.publish_app_release('transactional-release-test','تحديث تجريبي','لن يرسل هذا الاختبار');
  if first_count<1 or public.publish_app_release('transactional-release-test','تحديث تجريبي','لن يرسل هذا الاختبار')<>0 then raise exception 'Release deduplication failed'; end if;
end $$;
rollback;
