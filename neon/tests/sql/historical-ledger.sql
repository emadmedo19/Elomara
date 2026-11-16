-- Isolated branch only. Fixtures and the identity shim roll back on success.
DO $test$
DECLARE b uuid:=gen_random_uuid(); deficit_b uuid:=gen_random_uuid(); foreign_b uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); a2 uuid:=gen_random_uuid(); foreign_a uuid:=gen_random_uuid();
 manager uuid:=gen_random_uuid(); resident uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid();
 this_m date:=date_trunc('month',timezone('Africa/Cairo',now()))::date; start_m date; allocations jsonb; r jsonb; entry uuid; request uuid:=gen_random_uuid(); denied boolean; candidate jsonb;
BEGIN
 BEGIN
  EXECUTE $definition$CREATE OR REPLACE FUNCTION app_auth.user_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $identity$
   SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
  $identity$$definition$;
  start_m:=(this_m-interval '2 months')::date;
  INSERT INTO public.buildings(id,name,balance,opening_balance) VALUES(b,'تجربة الأرصدة السابقة',100,100),(foreign_b,'خارج النطاق',77,77);
  INSERT INTO app_auth.users(id,email) VALUES(manager,manager||'@example.invalid'),(resident,resident||'@example.invalid'),(stranger,stranger||'@example.invalid');
  INSERT INTO public.apartments(id,building_id,unit_number,monthly_fee,overdue_months) VALUES(a,b,'1',1000,0),(a2,b,'2',2000,0),(foreign_a,foreign_b,'1',1000,0);
  UPDATE public.profiles SET building_id=b,role='building_admin',approved=true WHERE id=manager;
  UPDATE public.profiles SET building_id=b,apartment_id=a,role='tenant',approved=true WHERE id=resident;
  UPDATE public.profiles SET building_id=foreign_b,role='building_admin',approved=true WHERE id=stranger;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager)::text,true);
  SET LOCAL ROLE authenticated;
  PERFORM public.save_building_historical_settings_v3(b,to_char(start_m,'YYYY-MM'),10000,12000);
  IF (SELECT balance FROM public.buildings WHERE id=b)<>2100 THEN RAISE EXCEPTION 'Opening net is not 100+12000-10000'; END IF;
  PERFORM public.save_building_historical_settings_v3(b,to_char(start_m,'YYYY-MM'),10000,12000);
  IF (SELECT balance FROM public.buildings WHERE id=b)<>2100 THEN RAISE EXCEPTION 'Settings retry doubled opening cash'; END IF;
  allocations:=jsonb_build_array(jsonb_build_object('apartmentId',a,'month',start_m,'amount',1000),jsonb_build_object('apartmentId',a,'month',(start_m+interval '1 month')::date,'amount',500),jsonb_build_object('apartmentId',a2,'month',start_m,'amount',2000));
  PERFORM public.save_historical_monthly_allocations(b,allocations);
  PERFORM public.save_historical_monthly_allocations(b,allocations);
  IF (SELECT balance FROM public.buildings WHERE id=b)<>5600 OR (SELECT historical_monthly_collections_total FROM public.buildings WHERE id=b)<>3500 THEN RAISE EXCEPTION 'Distribution total or retry incorrect'; END IF;
  IF (SELECT paid_amount FROM public.apartments WHERE id=a)<>1500 OR (SELECT credit_balance FROM public.apartments WHERE id=a)<>0 THEN RAISE EXCEPTION 'Historical settlement not reflected on apartment'; END IF;
  r:=public.get_building_financial_summary(b);
  IF (r->>'total_collected')::numeric<>15500 OR (r->>'total_expenses')::numeric<>10000 OR (r->>'outstanding_amount')::numeric<>5500 OR (r->>'treasury_balance')::numeric<>5600 THEN RAISE EXCEPTION 'Manager summary disagrees with opening ledger: %',r; END IF;
  FOREACH candidate IN ARRAY ARRAY[
   jsonb_build_array(jsonb_build_object('apartmentId',a,'month',start_m,'amount',1.005)),
   jsonb_build_array(jsonb_build_object('apartmentId',foreign_a,'month',start_m,'amount',100)),
   jsonb_build_array(jsonb_build_object('apartmentId',a,'month',NULL,'amount',100)),
   allocations||allocations,
   'null'::jsonb
  ] LOOP
   denied:=false; BEGIN PERFORM public.save_historical_monthly_allocations(b,candidate); EXCEPTION WHEN others THEN denied:=true; END;
   IF NOT denied OR (SELECT count(*) FROM public.historical_monthly_allocations WHERE building_id=b)<>3 OR (SELECT balance FROM public.buildings WHERE id=b)<>5600 THEN RAISE EXCEPTION 'Invalid allocation damaged persisted data'; END IF;
  END LOOP;
  denied:=false; BEGIN PERFORM public.save_building_historical_settings_v3(b,to_char(this_m,'YYYY-MM'),10000,12000); EXCEPTION WHEN others THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Start date discarded allocated months'; END IF;
  r:=public.mutate_financial_entry('payment','create',b,NULL,jsonb_build_object('apartmentId',a,'amount',300,'date',current_date,'month',to_char(this_m,'YYYY-MM'),'method','نقدي'),request);
  entry:=(r->'entry'->>'id')::uuid;
  IF (r->>'balance')::numeric<>5900 OR (r->'apartment'->>'paid_amount')::numeric<>1800 OR (r->'apartment'->>'credit_balance')::numeric<>0 THEN RAISE EXCEPTION 'Receipt ignored opening history: %',r; END IF;
  r:=public.mutate_financial_entry('payment','create',b,NULL,jsonb_build_object('apartmentId',a,'amount',300,'date',current_date,'month',to_char(this_m,'YYYY-MM'),'method','نقدي'),request);
  IF (r->>'balance')::numeric<>5900 THEN RAISE EXCEPTION 'Receipt retry duplicated cash'; END IF;
  r:=public.mutate_financial_entry('payment','update',b,entry,jsonb_build_object('amount',400,'date',current_date,'month',to_char(this_m,'YYYY-MM'),'method','نقدي'),gen_random_uuid());
  IF (r->>'balance')::numeric<>6000 OR (r->'apartment'->>'paid_amount')::numeric<>1900 THEN RAISE EXCEPTION 'Receipt edit lost history'; END IF;
  r:=public.mutate_financial_entry('payment','delete',b,entry,'{}',gen_random_uuid());
  IF (r->>'balance')::numeric<>5600 OR (r->'apartment'->>'paid_amount')::numeric<>1500 THEN RAISE EXCEPTION 'Receipt deletion removed history'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',resident)::text,true);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.historical_monthly_allocations WHERE building_id=b)<>2 THEN RAISE EXCEPTION 'Resident cannot read own historical rows or sees another apartment'; END IF;
  r:=public.get_building_financial_summary(b);
  IF jsonb_array_length(r->'apartments')<>1 OR (r->>'outstanding_amount')::numeric<>1500 OR (r->'apartments'->0->>'total_paid')::numeric<>1500 THEN RAISE EXCEPTION 'Resident summary disagrees or leaks other units: %',r; END IF;
  denied:=false; BEGIN PERFORM public.save_historical_monthly_allocations(b,'[]'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Resident can change opening ledger'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',stranger)::text,true);
  SET LOCAL ROLE authenticated;
  IF EXISTS(SELECT FROM public.historical_monthly_allocations WHERE building_id=b) THEN RAISE EXCEPTION 'Foreign manager can read history'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager)::text,true);
  SET LOCAL ROLE authenticated;
  PERFORM public.save_historical_monthly_allocations(b,jsonb_build_array(jsonb_build_object('apartmentId',a2,'month',start_m,'amount',2000)));
  IF (SELECT balance FROM public.buildings WHERE id=b)<>4100 OR (SELECT paid_amount FROM public.apartments WHERE id=a)<>0 THEN RAISE EXCEPTION 'Removing one share did not reconcile cash and unit'; END IF;
  PERFORM public.save_historical_monthly_allocations(b,'[]');
  IF (SELECT balance FROM public.buildings WHERE id=b)<>2100 OR EXISTS(SELECT FROM public.historical_monthly_allocations WHERE building_id=b) THEN RAISE EXCEPTION 'Clearing distribution incorrect'; END IF;
  PERFORM public.save_building_historical_settings_v3(b,NULL,11000,12000);
  IF (SELECT balance FROM public.buildings WHERE id=b)<>1100 THEN RAISE EXCEPTION 'Expense correction applied more than its delta'; END IF;
  PERFORM public.save_building_historical_settings_v3(b,NULL,0,0);
  IF (SELECT balance FROM public.buildings WHERE id=b)<>100 THEN RAISE EXCEPTION 'Removing historical totals changed original cash'; END IF;
  RESET ROLE;
  IF (SELECT balance FROM public.buildings WHERE id=foreign_b)<>77 THEN RAISE EXCEPTION 'Operation crossed building boundary'; END IF;
  -- Exact reported flow: reset, enter expenses 10000 and exceptional income 8000.
  INSERT INTO public.buildings(id,name,balance,opening_balance) VALUES(deficit_b,'اختبار عجز افتتاحي',0,0);
  UPDATE public.profiles SET building_id=deficit_b WHERE id=manager;
  SET LOCAL ROLE authenticated;
  PERFORM public.clear_building_data(deficit_b,'reset','تصفير سجلات اختبار عجز افتتاحي');
  PERFORM public.save_building_historical_settings_v3(deficit_b,to_char(start_m,'YYYY-MM'),10000,8000);
  PERFORM public.save_building_historical_settings_v3(deficit_b,to_char(start_m,'YYYY-MM'),10000,8000);
  IF NOT EXISTS(SELECT FROM public.buildings WHERE id=deficit_b AND balance=-2000 AND opening_balance=-2000) THEN RAISE EXCEPTION 'Opening deficit was rejected, clamped or duplicated'; END IF;
  r:=public.mutate_financial_entry('expense','create',deficit_b,NULL,jsonb_build_object('title','مصروف بعد العجز','category','أخرى','amount',100,'date',current_date),gen_random_uuid());
  entry:=(r->'entry'->>'id')::uuid;
  IF (r->>'balance')::numeric<>-2100 THEN RAISE EXCEPTION 'Expense on opening deficit incorrect'; END IF;
  r:=public.mutate_financial_entry('expense','delete',deficit_b,entry,'{}',gen_random_uuid());
  IF (r->>'balance')::numeric<>-2000 THEN RAISE EXCEPTION 'Reversing deficit expense did not restore original deficit'; END IF;
  PERFORM public.save_building_historical_settings_v3(deficit_b,to_char(start_m,'YYYY-MM'),10000,12000);
  IF NOT EXISTS(SELECT FROM public.buildings WHERE id=deficit_b AND balance=2000 AND opening_balance=2000) THEN RAISE EXCEPTION 'Correcting deficit did not apply only its delta'; END IF;
  RESET ROLE;
  denied:=false;
  BEGIN UPDATE public.buildings SET opening_balance=-10000000000 WHERE id=deficit_b; EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Opening lower monetary bound was removed'; END IF;
  denied:=false;
  BEGIN UPDATE public.buildings SET opening_balance=10000000000 WHERE id=deficit_b; EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Opening upper monetary bound was removed'; END IF;
  RAISE EXCEPTION SQLSTATE 'Z0001' USING MESSAGE='historical rehearsal passed';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
 IF EXISTS(SELECT FROM public.buildings WHERE id IN(b,foreign_b,deficit_b)) THEN RAISE EXCEPTION 'Fixture rollback failed'; END IF;
END $test$;
