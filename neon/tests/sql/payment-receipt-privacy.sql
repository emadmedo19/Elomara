-- Isolated rehearsal only, fixture users and financial writes are rolled back.
DO $test$
DECLARE b uuid:=gen_random_uuid(); other_b uuid:=gen_random_uuid(); manager uuid:=gen_random_uuid(); r1 uuid:=gen_random_uuid(); owner1 uuid:=gen_random_uuid(); r2 uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); disabled uuid:=gen_random_uuid(); pending uuid:=gen_random_uuid(); a1 uuid:=gen_random_uuid();a2 uuid:=gen_random_uuid(); request uuid:=gen_random_uuid(); payment uuid; charge uuid:=gen_random_uuid(); opening uuid:=gen_random_uuid(); result jsonb; receipt jsonb; denied boolean; notices bigint;
BEGIN
 BEGIN
  EXECUTE $definition$CREATE OR REPLACE FUNCTION app_auth.user_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $identity$
   SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
  $identity$$definition$;
  INSERT INTO public.buildings(id,name,address,balance,opening_balance) VALUES(b,'عمارة إيصالات','عنوان تجريبي',0,0),(other_b,'عمارة أخرى','',0,0);
  INSERT INTO public.apartments(id,building_id,unit_number,resident_name,monthly_fee) VALUES(a1,b,'1','ساكن أول',100),(a2,b,'2','ساكن ثان',200);
  INSERT INTO app_auth.users(id,email) SELECT u,u||'@example.invalid' FROM unnest(ARRAY[manager,r1,owner1,r2,outsider,disabled,pending])u;
  UPDATE public.profiles SET role='building_admin',approved=true,building_id=b WHERE id=manager;
  UPDATE public.profiles SET role='building_admin',approved=true,building_id=other_b WHERE id=outsider;
  UPDATE public.profiles SET role='tenant',approved=true,building_id=b,apartment_id=a1 WHERE id=r1;
  UPDATE public.profiles SET role='owner',approved=true,building_id=b,apartment_id=a1 WHERE id=owner1;
  UPDATE public.profiles SET role='tenant',approved=true,building_id=b,apartment_id=a2 WHERE id=r2;
  UPDATE public.profiles SET role='tenant',approved=true,disabled_at=now(),building_id=b,apartment_id=a1 WHERE id=disabled;
  UPDATE public.profiles SET role='tenant',approved=false,building_id=b,apartment_id=a1 WHERE id=pending;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager)::text,true);
  result:=public.mutate_financial_entry('payment','create',b,NULL,jsonb_build_object('apartmentId',a1,'amount',100.50,'date',current_date,'month','2026-11','method','نقدي','notes','<script>private note</script>'),request);payment:=(result->'entry'->>'id')::uuid;
  SELECT count(*) INTO notices FROM public.app_notifications WHERE entity_id=payment AND category='payments';
  IF notices<>3 OR EXISTS(SELECT FROM public.app_notifications WHERE entity_id=payment AND recipient_id NOT IN(manager,r1,owner1)) THEN RAISE EXCEPTION 'Payment notice reached another apartment or was duplicated'; END IF;
  IF EXISTS(SELECT FROM public.app_notifications WHERE entity_id=payment AND (body LIKE '%100.50%' OR body LIKE '%private note%')) THEN RAISE EXCEPTION 'Push body leaks invoice details'; END IF;
  PERFORM public.mutate_financial_entry('payment','create',b,NULL,jsonb_build_object('apartmentId',a1,'amount',100.50,'date',current_date,'month','2026-11','method','نقدي','notes','<script>private note</script>'),request);
  IF (SELECT count(*) FROM public.app_notifications WHERE entity_id=payment AND category='payments')<>notices THEN RAISE EXCEPTION 'Retry sent duplicate notifications'; END IF;
  SET LOCAL ROLE authenticated;receipt:=public.get_payment_receipt(payment);RESET ROLE;
  IF (receipt->>'amount')::numeric<>100.50 OR receipt->>'unitNumber'<>'1' OR receipt->>'buildingName'<>'عمارة إيصالات' OR receipt->>'residentName'<>'ساكن أول' OR receipt->>'reference'<>'PAY-'||upper(payment::text) THEN RAISE EXCEPTION 'Receipt content incorrect'; END IF;
  FOREACH r1 IN ARRAY ARRAY[r1,owner1] LOOP
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',r1)::text,true);SET LOCAL ROLE authenticated;
   receipt:=public.get_payment_receipt(payment);RESET ROLE;
   IF (receipt->>'amount')::numeric<>100.50 THEN RAISE EXCEPTION 'Approved apartment account could not access receipt'; END IF;
  END LOOP;
  FOREACH r2 IN ARRAY ARRAY[r2,outsider,disabled,pending] LOOP
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',r2)::text,true);denied:=false;
   BEGIN PERFORM public.get_payment_receipt(payment);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
   IF NOT denied THEN RAISE EXCEPTION 'Unauthorized user read another apartment receipt'; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager)::text,true);
  INSERT INTO public.payments(id,building_id,apartment_id,unit_number,amount,payment_date,month,method,payment_type,is_assessment) VALUES(charge,b,a1,'1',500,current_date,'تحصيل استثنائي','تحصيل استثنائي','exceptional',true);
  INSERT INTO public.payments(id,building_id,apartment_id,unit_number,amount,payment_date,month,method,payment_type,exceptional_charge_id,is_opening_entry) VALUES(opening,b,a1,'1',100,current_date,'تحصيل استثنائي','رصيد افتتاحي سابق','exceptional',charge,true);
  denied:=false;BEGIN PERFORM public.get_payment_receipt(opening);EXCEPTION WHEN others THEN denied:=true;END;
  IF NOT denied OR EXISTS(SELECT FROM public.app_notifications WHERE entity_id IN(opening,charge) AND category='payments') THEN RAISE EXCEPTION 'Historical opening/assessment issued an ordinary receipt notice'; END IF;
  result:=public.mutate_financial_entry('payment','create',b,NULL,jsonb_build_object('apartmentId',a1,'amount',50,'date',current_date,'month','دورة','method','تحويل','exceptionalChargeId',charge),gen_random_uuid());
  receipt:=public.get_payment_receipt((result->'entry'->>'id')::uuid);
  IF receipt->>'paymentType'<>'exceptional' OR (receipt->>'amount')::numeric<>50 THEN RAISE EXCEPTION 'Exceptional receipt incorrect'; END IF;
  PERFORM public.mutate_financial_entry('payment','update',b,payment,jsonb_build_object('amount',75,'date',current_date,'month','2026-11','method','نقدي'),gen_random_uuid());
  IF (public.get_payment_receipt(payment)->>'amount')::numeric<>75 THEN RAISE EXCEPTION 'Receipt retained stale edited amount'; END IF;
  PERFORM public.mutate_financial_entry('payment','delete',b,payment,'{}',gen_random_uuid());
  denied:=false;BEGIN PERFORM public.get_payment_receipt(payment);EXCEPTION WHEN others THEN denied:=true;END;
  IF NOT denied THEN RAISE EXCEPTION 'Deleted payment still provided an active receipt'; END IF;
  RAISE EXCEPTION SQLSTATE 'Z0001' USING MESSAGE='receipt privacy passed';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
END $test$;
