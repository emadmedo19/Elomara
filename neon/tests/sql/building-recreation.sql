DO $$
DECLARE actor uuid:=gen_random_uuid(); resident uuid:=gen_random_uuid(); pending uuid:=gen_random_uuid(); suspended uuid:=gen_random_uuid();
 old_b uuid:=gen_random_uuid(); foreign_b uuid:=gen_random_uuid(); result jsonb; recreated uuid; candidate uuid; rejected boolean;
 details jsonb:='{"name":"برج اختبار","address":"عنوان اختبار","totalFloors":4,"totalUnits":14,"monthlyTarget":28000,"reserveFund":500,"managerName":"أول","managerPhone":"01012345678","manager2Name":"ثان","manager2Phone":"01112345678","manager3Name":"ثالث","manager3Phone":"01212345678","balance":999999}';
BEGIN
 IF current_database()<>'elomara_migration_check_v2' THEN RAISE EXCEPTION 'Rehearsal database required'; END IF;
 INSERT INTO public.buildings(id,name) VALUES(old_b,'عمارة قبل الحذف'),(foreign_b,'عمارة أخرى');
 INSERT INTO app_auth.users(id,email) VALUES(actor,actor||'@example.invalid'),(resident,resident||'@example.invalid'),(pending,pending||'@example.invalid'),(suspended,suspended||'@example.invalid');
 UPDATE public.profiles SET building_id=old_b,approved=true,role='building_admin' WHERE id=actor;
 UPDATE public.profiles SET building_id=foreign_b,approved=true,role='tenant' WHERE id=resident;
 UPDATE public.profiles SET building_id=NULL,approved=false,role='pending' WHERE id=pending;
 UPDATE public.profiles SET building_id=NULL,approved=true,role='building_admin',disabled_at=now() WHERE id=suspended;
 INSERT INTO private.auth_identity_map VALUES(actor::text,actor),(resident::text,resident),(pending::text,pending),(suspended::text,suspended);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
 SET LOCAL ROLE authenticated;
 PERFORM public.clear_building_data(old_b,'delete','حذف عمارة عمارة قبل الحذف');
 IF (SELECT building_id FROM public.profiles WHERE id=actor) IS NOT NULL THEN RAISE EXCEPTION 'Deletion did not detach manager'; END IF;
 -- The original direct insert must remain blocked. Do not weaken RLS to fix onboarding.
 rejected:=false;
 BEGIN INSERT INTO public.buildings(name) VALUES('محاولة مباشرة'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Direct table insertion was allowed'; END IF;
 result:=public.create_manager_building(details);recreated:=(result->>'id')::uuid;
 IF recreated IS NULL OR (result->>'name')<>'برج اختبار' OR (result->>'address')<>'عنوان اختبار'
  OR (result->>'total_floors')::integer<>4 OR (result->>'total_units')::integer<>14
  OR (result->>'monthly_target')::numeric<>28000 OR (result->>'reserve_fund')::numeric<>500
  OR (result->>'manager_name')<>'أول' OR (result->>'manager_phone')<>'01012345678'
  OR (result->>'manager2_name')<>'ثان' OR (result->>'manager2_phone')<>'01112345678'
  OR (result->>'manager3_name')<>'ثالث' OR (result->>'manager3_phone')<>'01212345678'
  OR (result->>'balance')::numeric<>0 THEN RAISE EXCEPTION 'Returned fields are incomplete %',result; END IF;
 IF (SELECT building_id FROM public.profiles WHERE id=actor) IS DISTINCT FROM recreated THEN RAISE EXCEPTION 'Manager was not linked atomically'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.buildings WHERE id=recreated) THEN RAISE EXCEPTION 'Manager cannot read new building'; END IF;
 IF EXISTS(SELECT 1 FROM public.apartments WHERE building_id=recreated) THEN RAISE EXCEPTION 'Unit count generated unwanted apartments'; END IF;
 rejected:=false;
 BEGIN PERFORM public.create_manager_building(details); EXCEPTION WHEN others THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Repeated creation produced another building'; END IF;
 RESET ROLE;
 FOREACH candidate IN ARRAY ARRAY[resident,pending,suspended] LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',candidate)::text,true);
  SET LOCAL ROLE authenticated;
  rejected:=false;
  BEGIN PERFORM public.create_manager_building(details); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Ineligible account created a building'; END IF;
  RESET ROLE;
 END LOOP;
 -- A rejected save after deleting again must leave the approved manager detached.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
 SET LOCAL ROLE authenticated;
 PERFORM public.clear_building_data(recreated,'delete','حذف عمارة برج اختبار');
 rejected:=false;
 BEGIN PERFORM public.create_manager_building(details||'{"monthlyTarget":-1}'::jsonb); EXCEPTION WHEN others THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Invalid target accepted'; END IF;
 IF (SELECT building_id FROM public.profiles WHERE id=actor) IS NOT NULL THEN RAISE EXCEPTION 'Failed creation left a profile link'; END IF;
 RESET ROLE;
 IF EXISTS(SELECT 1 FROM public.buildings WHERE name='برج اختبار') THEN RAISE EXCEPTION 'Failed creation left an orphan'; END IF;
END $$;
