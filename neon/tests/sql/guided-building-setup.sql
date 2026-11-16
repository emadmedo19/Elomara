-- Rehearsal branch only: fixture rows and identity shim roll back.
DO $test$
DECLARE manager uuid:=gen_random_uuid(); pending_user uuid:=gen_random_uuid(); failed_user uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 request_id uuid:=gen_random_uuid(); details jsonb; history jsonb; result jsonb; b uuid; a uuid; imported uuid; denied boolean; before_count bigint; report jsonb; other_result jsonb;
BEGIN
 BEGIN
  EXECUTE $definition$CREATE OR REPLACE FUNCTION app_auth.user_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $identity$
   SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
  $identity$$definition$;
  INSERT INTO app_auth.users(id,email,email_confirmed_at) VALUES(manager,manager||'@example.invalid',now()),(pending_user,pending_user||'@example.invalid',now()),(failed_user,failed_user||'@example.invalid',now()),(outsider,outsider||'@example.invalid',now());
  UPDATE public.profiles SET role='building_admin',approved=true WHERE id IN(manager,outsider);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager)::text,true);
  details:='{"name":"نقل حسابات","address":"شارع الاختبار","totalUnits":14,"totalFloors":7,"monthlyTarget":100}';
  history:=jsonb_build_object('mode','transfer','startMonth','2025-01','endMonth','2025-12','cash',3000,'reserve',500,'expenses',7000,'exceptionalTitle','تركيب أسانسير','exceptionalPerUnit',6000,'units',(SELECT jsonb_agg(jsonb_build_object('unitNumber',n::text,'residentName','ساكن '||n,'monthlyPaid',CASE WHEN n=1 THEN 1200 WHEN n=2 THEN 500 ELSE 0 END,'exceptionalPaid',CASE WHEN n=1 THEN 6000 WHEN n=2 THEN 2000 ELSE 0 END)) FROM generate_series(1,14)n));
  SET LOCAL ROLE authenticated;
  result:=public.complete_guided_building_setup(request_id,details,history,NULL);b:=(result->>'id')::uuid;
  RESET ROLE;
  IF (SELECT balance FROM public.buildings WHERE id=b)<>3000 OR (SELECT opening_balance FROM public.buildings WHERE id=b)<>3000 OR (SELECT historical_monthly_collections_total FROM public.buildings WHERE id=b)<>1700 OR (SELECT historical_exceptional_collections_total FROM public.buildings WHERE id=b)<>8000 THEN RAISE EXCEPTION 'Imported cash was double counted'; END IF;
  IF (SELECT sum(amount) FROM public.payments WHERE building_id=b AND is_assessment)<>84000 OR (SELECT sum(amount) FROM public.payments WHERE building_id=b AND is_opening_entry)<>8000 THEN RAISE EXCEPTION '6000 per apartment confused with collected total'; END IF;
  IF EXISTS(SELECT FROM public.app_notifications WHERE building_id=b AND category='payments') THEN RAISE EXCEPTION 'Opening entries generated receipt notifications'; END IF;
  report:=public.get_building_financial_summary(b);
  IF (report->>'total_collected')::numeric IS DISTINCT FROM 9700 THEN RAISE EXCEPTION 'Report counts opening exceptional receipts twice: %',report; END IF;
  PERFORM public.complete_guided_building_setup(request_id,details,history,NULL);
  IF (SELECT count(*) FROM public.exceptional_collections WHERE building_id=b)<>1 OR (SELECT count(*) FROM public.payments WHERE building_id=b AND is_opening_entry)<>2 THEN RAISE EXCEPTION 'Retry duplicated imported entries'; END IF;
  SELECT id INTO imported FROM public.payments WHERE building_id=b AND is_opening_entry LIMIT 1;
  denied:=false;
  BEGIN PERFORM public.mutate_financial_entry('payment','delete',b,imported,'{}',gen_random_uuid()); EXCEPTION WHEN others THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Imported settlement deletable as an ordinary receipt'; END IF;
  SELECT id INTO a FROM public.apartments WHERE building_id=b AND unit_number='2';
  PERFORM public.mutate_financial_entry('payment','create',b,NULL,jsonb_build_object('apartmentId',a,'amount',100,'date',current_date,'month',to_char(current_date,'YYYY-MM'),'method','نقدي'),gen_random_uuid());
  IF (SELECT balance FROM public.buildings WHERE id=b)<>3100 THEN RAISE EXCEPTION 'New cash receipt did not affect treasury'; END IF;
  -- Correcting history does not add old money to actual opening cash again.
  PERFORM public.save_building_management(b,details,jsonb_build_object('baseOpening',3000,'reserve',500,'startMonth','2025-01','expenses',6500,'exceptional',8000,'openingAlreadyIncluded',NULL,'expected',private.building_financial_snapshot((SELECT x FROM public.buildings x WHERE x.id=b))||'{"openingIncludesHistory":true}'));
  IF (SELECT balance FROM public.buildings WHERE id=b)<>3100 THEN RAISE EXCEPTION 'Historical correction changed net opening cash'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider)::text,true);denied:=false;
  BEGIN PERFORM public.complete_guided_building_setup(gen_random_uuid(),details,history,b); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Another manager imported data'; END IF;
  -- A second manager uses unrelated counts, fractional amounts, and a different building.
  other_result:=public.complete_guided_building_setup(gen_random_uuid(),'{"name":"عمارة مختلفة","totalUnits":3,"totalFloors":2,"monthlyTarget":250.75}',jsonb_build_object('mode','transfer','startMonth','2026-01','endMonth','2026-02','cash',987.65,'reserve',123.45,'expenses',17.25,'exceptionalTitle','صيانة مضخة','exceptionalPerUnit',999.99,'units',(SELECT jsonb_agg(jsonb_build_object('unitNumber',n::text,'monthlyPaid',CASE WHEN n=1 THEN 501.50 ELSE 0 END,'exceptionalPaid',CASE WHEN n=2 THEN 333.33 ELSE 0 END)) FROM generate_series(1,3)n)),NULL);
  IF (other_result->>'balance')::numeric<>987.65 OR (other_result->>'historical_exceptional_collections_total')::numeric<>333.33 OR (SELECT count(*) FROM public.apartments WHERE building_id=(other_result->>'id')::uuid)<>3 OR (SELECT balance FROM public.buildings WHERE id=b)<>3100 THEN RAISE EXCEPTION 'Counts, fractional amounts or buildings were coupled'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',pending_user)::text,true);
  result:=public.complete_guided_building_setup(gen_random_uuid(),details,jsonb_build_object('mode','new','startMonth',to_char(current_date,'YYYY-MM'),'endMonth',to_char(current_date,'YYYY-MM'),'cash',1000,'reserve',200,'expenses',0,'exceptionalPerUnit',0,'units',(SELECT jsonb_agg(jsonb_build_object('unitNumber',n::text,'monthlyPaid',0,'exceptionalPaid',0)) FROM generate_series(1,14)n)),NULL);
  IF (result->>'balance')::numeric<>1000 OR (SELECT role FROM public.profiles WHERE id=pending_user)<>'building_admin' THEN RAISE EXCEPTION 'Verified pending account cannot create a new building'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',failed_user)::text,true);SELECT count(*) INTO before_count FROM public.buildings;denied:=false;
  BEGIN PERFORM public.complete_guided_building_setup(gen_random_uuid(),details,history||jsonb_build_object('reserve',4000),NULL); EXCEPTION WHEN others THEN denied:=true; END;
  IF NOT denied OR (SELECT count(*) FROM public.buildings)<>before_count OR (SELECT building_id FROM public.profiles WHERE id=failed_user) IS NOT NULL THEN RAISE EXCEPTION 'Failed setup left a partial building'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager)::text,true);
  PERFORM public.clear_building_data(b,'reset','تصفير سجلات نقل حسابات');
  IF (SELECT opening_cash_includes_history FROM public.buildings WHERE id=b) OR (SELECT balance FROM public.buildings WHERE id=b)<>0 THEN RAISE EXCEPTION 'Net-opening mode not reset'; END IF;
  PERFORM public.complete_guided_building_setup(gen_random_uuid(),details,history,b);
  IF (SELECT balance FROM public.buildings WHERE id=b)<>3000 OR (SELECT count(*) FROM public.exceptional_collections WHERE building_id=b)<>1 THEN RAISE EXCEPTION 'Import after reset failed'; END IF;
  RAISE EXCEPTION SQLSTATE 'Z0001' USING MESSAGE='guided setup passed';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
END $test$;
