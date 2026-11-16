-- Isolated rehearsal branch only. Fixtures and the auth shim roll back.
DO $test$
DECLARE b uuid:=gen_random_uuid(); manager uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); other_b uuid:=gen_random_uuid();
 details jsonb; denied boolean:=false; saved_cash numeric;
BEGIN
 BEGIN
  EXECUTE $definition$CREATE OR REPLACE FUNCTION app_auth.user_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $identity$
   SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
  $identity$$definition$;
  INSERT INTO public.buildings(id,name,balance,opening_balance,monthly_target,collection_start_month) VALUES(b,'اشتراك سابق',10000,10000,1000,'2025-01-01'),(other_b,'عمارة أخرى',0,0,200,'2025-01-01');
  INSERT INTO app_auth.users(id,email) VALUES(manager,manager||'@example.invalid'),(outsider,outsider||'@example.invalid');
  UPDATE public.profiles SET role='building_admin',approved=true,building_id=b WHERE id=manager;
  UPDATE public.profiles SET role='building_admin',approved=true,building_id=other_b WHERE id=outsider;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager)::text,true);
  details:=jsonb_build_object('name','اشتراك سابق','totalUnits',2,'totalFloors',1,'monthlyTarget',1000);
  PERFORM public.save_building_management(b,details,NULL);
  UPDATE public.apartments SET monthly_fee=1500 WHERE building_id=b AND unit_number='2';
  details:=details||'{"monthlyTarget":200}';
  SET LOCAL ROLE authenticated;
  PERFORM public.save_building_management(b,details,NULL);
  RESET ROLE;
  IF (SELECT monthly_fee FROM public.apartments WHERE building_id=b AND unit_number='1')<>1000 OR (SELECT monthly_fee FROM public.apartments WHERE building_id=b AND unit_number='2')<>1500 THEN RAISE EXCEPTION 'Custom fees changed without explicit selection'; END IF;
  PERFORM public.save_historical_monthly_allocations(b,(SELECT jsonb_agg(jsonb_build_object('apartmentId',id,'month','2025-01-01','amount',100)) FROM public.apartments WHERE building_id=b));
  SELECT balance INTO saved_cash FROM public.buildings WHERE id=b;
  SET LOCAL ROLE authenticated;
  PERFORM public.save_building_management(b,details||'{"applyMonthlyFeeToAll":true}',NULL);
  PERFORM public.save_building_management(b,details||'{"applyMonthlyFeeToAll":true}',NULL);
  RESET ROLE;
  IF EXISTS(SELECT FROM public.apartments WHERE building_id=b AND monthly_fee<>200) THEN RAISE EXCEPTION 'Explicit fee was not applied to every apartment'; END IF;
  IF (SELECT balance FROM public.buildings WHERE id=b)<>saved_cash OR (SELECT count(*) FROM public.historical_monthly_allocations WHERE building_id=b)<>2 OR EXISTS(SELECT FROM public.payments WHERE building_id=b) THEN RAISE EXCEPTION 'Fee correction changed cash or historical allocations'; END IF;
  -- Exact reported 20000 total, fifteen apartments, 200 per month from January 2025.
  PERFORM public.save_building_management(b,details||'{"totalUnits":15,"applyMonthlyFeeToAll":true}',NULL);
  PERFORM public.save_historical_monthly_allocations(b,(SELECT jsonb_agg(jsonb_build_object('apartmentId',a.id,'month',to_char(date '2025-01-01'+make_interval(months=>m),'YYYY-MM-DD'),'amount',CASE WHEN m<6 THEN 200 ELSE CASE WHEN a.unit_number::integer<=5 THEN 133.34 ELSE 133.33 END END)) FROM public.apartments a CROSS JOIN generate_series(0,6) m WHERE a.building_id=b));
  IF (SELECT balance FROM public.buildings WHERE id=b)<>30000 OR (SELECT historical_monthly_collections_total FROM public.buildings WHERE id=b)<>20000 OR (SELECT count(*) FROM public.historical_monthly_allocations WHERE building_id=b)<>105 THEN RAISE EXCEPTION 'Exact reported distribution lost cents or cash'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider)::text,true);
  BEGIN PERFORM public.save_building_management(b,details||'{"applyMonthlyFeeToAll":true}',NULL); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Outsider changed apartment fees'; END IF;
  RAISE EXCEPTION SQLSTATE 'Z0001' USING MESSAGE='fee correction passed';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
 IF EXISTS(SELECT FROM public.buildings WHERE id IN(b,other_b)) THEN RAISE EXCEPTION 'Fixture rollback failed'; END IF;
END $test$;
