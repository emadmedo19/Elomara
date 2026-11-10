DO $$
DECLARE b uuid; result jsonb; manager uuid:=gen_random_uuid(); newcomer uuid:=gen_random_uuid(); c record; counts integer[];
BEGIN
 IF current_database()<>'elomara_migration_check_v2' THEN RAISE EXCEPTION 'Rehearsal database required'; END IF;
 FOR c IN SELECT * FROM (VALUES (14,4),(14,14),(2,5),(0,3),(1,1)) x(units,floors) LOOP
  b:=gen_random_uuid();
  INSERT INTO public.buildings(id,name,total_units,total_floors,balance) VALUES(b,'اختبار تجهيز الشقق',c.units,c.floors,100);
  IF private.initialize_building_apartments(b)<>c.units THEN RAISE EXCEPTION 'Incorrect generated count'; END IF;
  IF (SELECT count(*) FROM public.apartments WHERE building_id=b)<>c.units THEN RAISE EXCEPTION 'Count mismatch'; END IF;
  IF private.initialize_building_apartments(b)<>0 THEN RAISE EXCEPTION 'Repeated generation duplicated units'; END IF;
  IF EXISTS(SELECT 1 FROM public.apartments WHERE building_id=b AND (floor<1 OR floor>c.floors OR monthly_fee<>0 OR paid_amount<>0 OR credit_balance<>0 OR resident_name<>'' OR resident_phone<>'')) THEN RAISE EXCEPTION 'Invented apartment details'; END IF;
  IF (SELECT balance FROM public.buildings WHERE id=b)<>100 OR EXISTS(SELECT 1 FROM public.payments WHERE building_id=b) THEN RAISE EXCEPTION 'Generation changed cash'; END IF;
  IF c.units=14 AND c.floors=4 THEN
   SELECT array_agg(n ORDER BY floor) INTO counts FROM (SELECT floor,count(*)::integer n FROM public.apartments WHERE building_id=b GROUP BY floor) x;
   IF counts<>ARRAY[4,4,3,3] THEN RAISE EXCEPTION 'Unbalanced floor allocation %',counts; END IF;
   IF (SELECT array_agg(unit_number::integer ORDER BY unit_number::integer) FROM public.apartments WHERE building_id=b)<>ARRAY(SELECT generate_series(1,14)) THEN RAISE EXCEPTION 'Unit numbers not sequential'; END IF;
  END IF;
 END LOOP;
 -- Existing custom units must not be expanded, overwritten or renumbered.
 b:=gen_random_uuid();INSERT INTO public.buildings(id,name,total_units,total_floors) VALUES(b,'عمارة ببيانات يدوية',14,4);
 INSERT INTO public.apartments(building_id,unit_number,floor,resident_name,monthly_fee) VALUES(b,'A-7',2,'اسم محفوظ',125);
 IF private.initialize_building_apartments(b)<>0 OR (SELECT count(*) FROM public.apartments WHERE building_id=b)<>1 THEN RAISE EXCEPTION 'Existing units were changed'; END IF;
 INSERT INTO app_auth.users(id,email,email_confirmed_at) VALUES(manager,manager||'@example.invalid',now()),(newcomer,newcomer||'@example.invalid',now());
 UPDATE public.profiles SET role='building_admin',approved=true,building_id=NULL WHERE id=manager;
 INSERT INTO private.auth_identity_map VALUES(manager::text,manager),(newcomer::text,newcomer);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager)::text,true);
 SET LOCAL ROLE authenticated;
 result:=public.create_manager_building('{"name":"إضافة تلقائية","totalUnits":14,"totalFloors":14}'::jsonb);b:=(result->>'id')::uuid;
 IF (SELECT count(*) FROM public.apartments WHERE building_id=b)<>14 OR (SELECT count(DISTINCT floor) FROM public.apartments WHERE building_id=b)<>14 THEN RAISE EXCEPTION 'Manager creation did not expose generated units'; END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',newcomer)::text,true);
 SET LOCAL ROLE authenticated;
 b:=public.create_building_with_opening_balance('إنشاء مستخدم جديد','',14,4,75);
 IF (SELECT count(*) FROM public.apartments WHERE building_id=b)<>14 OR (SELECT balance FROM public.buildings WHERE id=b)<>75 THEN RAISE EXCEPTION 'Initial onboarding or opening balance regressed'; END IF;
 RESET ROLE;
END $$;
