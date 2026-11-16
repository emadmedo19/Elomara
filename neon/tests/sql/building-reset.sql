-- Run only on an isolated Neon rehearsal branch. All fixtures and the temporary
-- identity shim are rolled back by the sentinel subtransaction below.
DO $test$
DECLARE b uuid:=gen_random_uuid(); other_b uuid:=gen_random_uuid(); a uuid:=gen_random_uuid();
 actor uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); old_request uuid:=gen_random_uuid(); denied boolean; result public.buildings;
BEGIN
 BEGIN
  EXECUTE $definition$CREATE OR REPLACE FUNCTION app_auth.user_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $identity$
   SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
  $identity$$definition$;
  INSERT INTO public.buildings(id,name,balance,opening_balance,collection_start_month)
   VALUES(b,'اختبار تصفير معزول',100,100,(date_trunc('month',current_date)-interval '5 months')::date),(other_b,'اختبار خارج النطاق',77,77,NULL);
  INSERT INTO app_auth.users(id,email) VALUES(actor,actor||'@example.invalid'),(outsider,outsider||'@example.invalid');
  UPDATE public.profiles SET building_id=b,role='building_admin',approved=true WHERE id=actor;
  UPDATE public.profiles SET building_id=other_b,role='building_admin',approved=true WHERE id=outsider;
  INSERT INTO public.apartments(id,building_id,unit_number,monthly_fee,paid_amount,credit_balance,overdue_months)
   VALUES(a,b,'1',1000,1500,500,3);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
  INSERT INTO public.payments(building_id,apartment_id,unit_number,amount,month) VALUES(b,a,'1',200,'test');
  INSERT INTO public.expenses(building_id,title,amount) VALUES(b,'test',50);
  INSERT INTO public.historical_monthly_allocations VALUES(b,a,date_trunc('month',current_date)::date,500);
  INSERT INTO private.financial_mutation_requests(building_id,request_id,actor_id,input,result) VALUES(b,old_request,actor,'{"old":"payload"}','{"amount":123}');
  UPDATE public.buildings SET historical_monthly_collections_total=500,historical_exceptional_collections_total=12000,
   historical_expenses_total=10000,historical_exceptional_expenses_total=500,reserve_fund=100 WHERE id=b;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider)::text,true);
  denied:=false;
  BEGIN PERFORM public.clear_building_data(b,'reset','تصفير سجلات اختبار تصفير معزول'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Foreign manager reset allowed'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
  denied:=false;
  BEGIN PERFORM public.clear_building_data(b,'reset','wrong confirmation'); EXCEPTION WHEN others THEN denied:=true; END;
  IF NOT denied OR NOT EXISTS(SELECT FROM public.payments WHERE building_id=b) THEN RAISE EXCEPTION 'Confirmation did not protect records'; END IF;
  SET LOCAL ROLE authenticated;
  PERFORM public.clear_building_data(b,'reset','تصفير سجلات اختبار تصفير معزول');
  RESET ROLE;
  SELECT * INTO result FROM public.buildings WHERE id=b;
  IF result.id IS NULL OR result.balance<>0 OR result.opening_balance<>0 OR result.reserve_fund<>0
   OR result.historical_monthly_collections_total<>0 OR result.historical_exceptional_collections_total<>0
   OR result.historical_expenses_total<>0 OR result.historical_exceptional_expenses_total<>0 OR result.historical_adjustment_applied<>0 THEN
   RAISE EXCEPTION 'Reset left cash or historical totals: %',to_jsonb(result); END IF;
  IF EXISTS(SELECT FROM public.payments WHERE building_id=b) OR EXISTS(SELECT FROM public.expenses WHERE building_id=b)
   OR EXISTS(SELECT FROM public.historical_monthly_allocations WHERE building_id=b)
   OR EXISTS(SELECT FROM public.financial_audit_log WHERE building_id=b)
   THEN RAISE EXCEPTION 'Reset left financial ledgers'; END IF;
  IF NOT EXISTS(SELECT FROM private.financial_mutation_requests t WHERE t.building_id=b AND t.request_id=old_request AND t.input='{}' AND t.result='{}') THEN RAISE EXCEPTION 'Reset did not invalidate retry payload'; END IF;
  denied:=false;
  BEGIN PERFORM public.mutate_financial_entry('payment','create',b,NULL,jsonb_build_object('apartmentId',a,'amount',10,'date',current_date,'month','test','method','نقدي'),old_request); EXCEPTION WHEN others THEN denied:=true; END;
  IF NOT denied OR EXISTS(SELECT FROM public.payments WHERE building_id=b) THEN RAISE EXCEPTION 'Delayed retry resurrected reset financial data'; END IF;
  IF NOT EXISTS(SELECT FROM public.apartments WHERE id=a AND monthly_fee=1000 AND paid_amount=0 AND credit_balance=0)
   OR NOT EXISTS(SELECT FROM public.profiles WHERE id=actor AND building_id=b AND approved)
   OR result.collection_start_month IS DISTINCT FROM date_trunc('month',timezone('Africa/Cairo',now()))::date THEN RAISE EXCEPTION 'Reset damaged retained settings or membership'; END IF;
  IF (SELECT balance FROM public.buildings WHERE id=other_b)<>77 THEN RAISE EXCEPTION 'Reset crossed building scope'; END IF;
  -- Force rollback of this entire inner block, including the identity shim.
  RAISE EXCEPTION SQLSTATE 'Z0001' USING MESSAGE='reset rehearsal passed';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
 IF EXISTS(SELECT FROM public.buildings WHERE id IN(b,other_b)) THEN RAISE EXCEPTION 'Fixture rollback failed'; END IF;
END $test$;
