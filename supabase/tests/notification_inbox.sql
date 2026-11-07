begin;
do $$
declare
  manager uuid:=gen_random_uuid(); member_one uuid:=gen_random_uuid(); member_two uuid:=gen_random_uuid(); other_manager uuid:=gen_random_uuid();
  bld uuid; other_bld uuid; apt_one uuid; apt_two uuid; ann uuid; ticket uuid; pay uuid; booking uuid; poll uuid;
begin
  insert into auth.users(id,email_confirmed_at) values(manager,now()),(member_one,now()),(member_two,now()),(other_manager,now());
  perform set_config('request.jwt.claim.sub',manager::text,true);
  bld:=public.create_building_with_opening_balance('Notification regression','',2,1,0);
  select id into apt_one from public.apartments where building_id=bld and unit_number='1';
  select id into apt_two from public.apartments where building_id=bld and unit_number='2';
  update public.profiles set role='owner',approved=true,building_id=bld,apartment_id=apt_one where id=member_one;
  update public.profiles set role='tenant',approved=true,building_id=bld,apartment_id=apt_two where id=member_two;
  perform set_config('request.jwt.claim.sub',other_manager::text,true);
  other_bld:=public.create_building_with_opening_balance('Other notification regression');
  perform set_config('request.jwt.claim.sub',manager::text,true);
  insert into public.announcements(building_id,title,content,created_by) values(bld,'Notification test','General building notice',manager) returning id into ann;
  if (select count(*) from public.app_notifications where entity_id=ann)<>3 then raise exception 'Announcement audience failed'; end if;
  insert into public.maintenance_tickets(building_id,apartment_id,unit_number,resident_name,category,title,description,urgency,status,created_by)
  values(bld,apt_one,'1','Test','سباكة','Private ticket','Description','عادي','جديد',member_one) returning id into ticket;
  if (select count(*) from public.app_notifications where entity_id=ticket)<>2
     or exists(select 1 from public.app_notifications where entity_id=ticket and recipient_id=member_two) then raise exception 'Private ticket leaked'; end if;
  update public.maintenance_tickets set status='مكتمل' where id=ticket;
  if (select count(*) from public.app_notifications where entity_id=ticket)<>4 then raise exception 'Ticket status notification missing'; end if;
  update public.maintenance_tickets set updated_at=now() where id=ticket;
  if (select count(*) from public.app_notifications where entity_id=ticket)<>4 then raise exception 'Unchanged ticket duplicated notice'; end if;
  insert into public.payments(building_id,apartment_id,unit_number,resident_name,amount,month,recorded_by) values(bld,apt_one,'1','Test',100,'اختبار',manager) returning id into pay;
  if (select count(*) from public.app_notifications where entity_id=pay)<>2 then raise exception 'Payment audience failed'; end if;
  insert into public.facility_bookings(building_id,apartment_id,facility,unit_number,resident_name,booking_date,time_slot,status,created_by)
  values(bld,apt_one,'الروف','1','Test',current_date+1,'10:00','قيد المراجعة',member_one) returning id into booking;
  if (select count(*) from public.app_notifications where entity_id=booking)<>2 then raise exception 'Booking audience failed'; end if;
  insert into public.expenses(building_id,title,category,amount,vendor) values(bld,'Manager-only expense','أخرى',20,'Test');
  insert into public.app_settings(building_id,setting_key,setting_value,updated_by) values(bld,'notification-regression','{}',manager);
  if exists(select 1 from public.app_notifications where building_id=bld and category in ('expenses','app_settings') and recipient_id<>manager) then raise exception 'Manager detail leaked'; end if;
  insert into public.building_polls(building_id,created_by,question,ends_at) values(bld,manager,'اختبار الاستطلاع',now()+interval '1 day') returning id into poll;
  if (select count(*) from public.app_notifications where entity_id=poll)<>3 then raise exception 'Poll notification missing'; end if;
  update public.apartments set payment_status='overdue' where id=apt_one;
  if (select count(*) from public.app_notifications where entity_id=apt_one and category='apartments')<>2 then raise exception 'Overdue audience failed'; end if;
  if exists(select 1 from public.app_notifications where building_id=bld and recipient_id=other_manager) then raise exception 'Cross-building fanout'; end if;
  perform set_config('test.expected_inbox_count',(select count(*)::text from public.app_notifications where recipient_id=member_one),true);
  perform set_config('test.manager_id',manager::text,true);
  perform set_config('request.jwt.claim.sub',member_one::text,true);
end;
$$;
set local role authenticated;
do $$
declare changed integer;
begin
  if (select count(*) from public.app_notifications)<>current_setting('test.expected_inbox_count')::integer
    or exists(select 1 from public.app_notifications where recipient_id<>auth.uid()) then raise exception 'Inbox RLS isolation failed'; end if;
  update public.app_notifications set read_at=now() where read_at is null;
  if exists(select 1 from public.app_notifications where read_at is null) then raise exception 'Mark read failed'; end if;
  update public.app_notifications set read_at=now() where recipient_id=current_setting('test.manager_id')::uuid;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Modified another inbox'; end if;
  begin
    update public.app_notifications set title='spoof' where recipient_id=auth.uid(); raise exception 'Client changed notification content';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.app_notifications default values; raise exception 'Client forged notice';
  exception when insufficient_privilege then null; end;
end;
$$;
rollback;
select 'PASS announcement, private maintenance/status, payment, booking, manager events, poll, overdue, RLS isolation and read-only content; fixtures rolled back' as result;
