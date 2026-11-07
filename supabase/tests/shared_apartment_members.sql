begin;
do $$
declare
  manager uuid:=gen_random_uuid(); other_manager uuid:=gen_random_uuid(); husband uuid:=gen_random_uuid(); wife uuid:=gen_random_uuid(); child uuid:=gen_random_uuid();
  bld uuid; other_bld uuid; apt uuid; other_apt uuid; code text; husband_request uuid; wife_request uuid; child_request uuid;
begin
  insert into auth.users(id,email_confirmed_at) values(manager,now()),(other_manager,now()),(husband,now()),(wife,now()),(child,now());
  perform set_config('request.jwt.claim.sub',manager::text,true);
  bld:=public.create_building_with_opening_balance('Family regression','',1,1,1000);
  select id into apt from public.apartments where building_id=bld;
  code:=public.create_or_rotate_building_access_code(bld);
  perform set_config('request.jwt.claim.sub',other_manager::text,true);
  other_bld:=public.create_building_with_opening_balance('Other family regression','',1,1,0);
  select id into other_apt from public.apartments where building_id=other_bld;
  perform set_config('request.jwt.claim.sub',husband::text,true);
  husband_request:=public.submit_building_join_request(code,'زوج الاختبار',1,'1','owner');
  perform set_config('request.jwt.claim.sub',wife::text,true);
  wife_request:=public.submit_building_join_request(code,'زوجة الاختبار',1,'1','زوجة');
  perform set_config('request.jwt.claim.sub',child::text,true);
  child_request:=public.submit_building_join_request(code,'ابن الاختبار',1,'1','ساكن');
  perform set_config('request.jwt.claim.sub',manager::text,true);
  perform public.approve_building_join_request(husband_request,apt);
  perform public.approve_building_join_request_with_label(wife_request,apt,'زوجة');
  if (select count(*) from public.profiles where apartment_id=apt and approved)<>2 then raise exception 'Shared apartment blocked'; end if;
  if (select resident_name from public.apartments where id=apt)<>'زوج الاختبار'
     or not (select is_owner from public.apartments where id=apt) then raise exception 'Family approval replaced primary occupant'; end if;
  if not exists(select 1 from public.profiles where id=wife and resident_label='زوجة' and role='tenant') then raise exception 'Custom label or role boundary failed'; end if;
  perform public.set_building_member_label(bld,wife,'زوجة المالك');
  begin
    perform public.approve_building_join_request_with_label(child_request,other_apt,'ساكن');
    raise exception 'Cross-building apartment accepted';
  exception when raise_exception then
    if sqlerrm<>'الشقة المختارة لا تتبع هذه العمارة' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',other_manager::text,true);
  begin
    perform public.remove_building_member(bld,wife); raise exception 'Other manager removed member';
  exception when insufficient_privilege then null; end;
  begin
    perform public.approve_building_join_request_with_label(child_request,apt,'ساكن'); raise exception 'Other manager approved applicant';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',manager::text,true);
  insert into public.payments(building_id,apartment_id,unit_number,resident_name,amount,month,recorded_by) values(bld,apt,'1','زوج الاختبار',100,'اختبار',manager);
  perform public.remove_building_member(bld,wife);
  if not exists(select 1 from auth.users where id=wife)
     or not exists(select 1 from public.profiles where id=wife and role='pending' and not approved and building_id is null and apartment_id is null)
     or not exists(select 1 from public.profiles where id=husband and approved and apartment_id=apt)
     or (select count(*) from public.payments where apartment_id=apt)<>1
     or (select balance from public.buildings where id=bld)<>1000
     or (select resident_name from public.apartments where id=apt)<>'زوج الاختبار' then raise exception 'Removal damaged account, family or financial history'; end if;
  perform set_config('test.manager',manager::text,true);perform set_config('test.wife',wife::text,true);
  perform set_config('test.building',bld::text,true);perform set_config('test.apartment',apt::text,true);
  perform set_config('test.code',code,true);
  perform set_config('request.jwt.claim.sub',wife::text,true);
end;
$$;
-- Emulate an already-issued token: the detached profile must immediately lose access.
set local role authenticated;
do $$
begin
  if exists(select 1 from public.apartments where id=current_setting('test.apartment')::uuid)
     or exists(select 1 from public.payments where building_id=current_setting('test.building')::uuid)
     or exists(select 1 from public.app_notifications where building_id=current_setting('test.building')::uuid) then raise exception 'Removed member retained building access'; end if;
  begin
    perform public.set_building_member_label(current_setting('test.building')::uuid,current_setting('test.manager')::uuid,'مدير');
    raise exception 'Resident changed manager metadata';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
do $$
declare rejoin uuid;
begin
  rejoin:=public.submit_building_join_request(current_setting('test.code'),'زوجة الاختبار الجديدة',1,'1','ساكن');
  perform set_config('request.jwt.claim.sub',current_setting('test.manager'),true);
  perform public.approve_building_join_request_with_label(rejoin,current_setting('test.apartment')::uuid,'زوجة');
  if not exists(select 1 from public.profiles where id=current_setting('test.wife')::uuid and approved and resident_label='زوجة') then raise exception 'Rejoin failed'; end if;
  if (select count(*) from public.profiles where apartment_id=current_setting('test.apartment')::uuid and approved)<>2 then raise exception 'Rejoin changed remaining family'; end if;
  if has_function_privilege('anon','public.remove_building_member(uuid,uuid)','execute') then raise exception 'Anonymous member removal grant'; end if;
end;
$$;
rollback;
select 'PASS shared apartment, free labels, primary occupant preservation, manager isolation, member removal, old-token access revocation, preserved payments and rejoin; fixtures rolled back' as result;
