-- Isolated branch only. All fixture rows and the identity shim roll back.
DO $test$
DECLARE b uuid:=gen_random_uuid(); other_b uuid:=gen_random_uuid(); manager uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); resident uuid:=gen_random_uuid();
 code uuid:=gen_random_uuid(); other_code uuid:=gen_random_uuid(); code_text text:=gen_random_uuid()::text; other_text text:=gen_random_uuid()::text;
 redeemed timestamptz:=now()-interval '1 day'; subscription_before jsonb; denied boolean; archived jsonb; created jsonb;
BEGIN
 BEGIN
  EXECUTE $definition$CREATE OR REPLACE FUNCTION app_auth.user_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $identity$
   SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
  $identity$$definition$;
  INSERT INTO public.buildings(id,name,balance,opening_balance,collection_start_month) VALUES(b,'حذف اختبار VIP',1000,1000,'2025-01-01'),(other_b,'عمارة أخرى',2000,2000,'2025-01-01');
  INSERT INTO app_auth.users(id,email) VALUES(manager,manager||'@example.invalid'),(outsider,outsider||'@example.invalid'),(resident,resident||'@example.invalid');
  UPDATE public.profiles SET building_id=b,role='building_admin',approved=true WHERE id=manager;
  UPDATE public.profiles SET building_id=other_b,role='building_admin',approved=true WHERE id=outsider;
  UPDATE public.profiles SET building_id=b,role='tenant',approved=true WHERE id=resident;
  INSERT INTO public.apartments(building_id,unit_number,monthly_fee) VALUES(b,'1',100),(other_b,'1',250);
  INSERT INTO private.vip_codes(id,code_hash,redeemed_at,redeemed_building_id)
   VALUES(code,encode(public.digest(upper(code_text),'sha256'),'hex'),redeemed,b),(other_code,encode(public.digest(upper(other_text),'sha256'),'hex'),redeemed,other_b);
  INSERT INTO public.building_subscriptions(building_id,status,vip_granted_at) VALUES(b,'vip',redeemed),(other_b,'vip',redeemed)
   ON CONFLICT(building_id) DO UPDATE SET status='vip',vip_granted_at=redeemed;
  INSERT INTO private.subscription_events(building_id,event_type,metadata) VALUES(b,'vip_redeemed',jsonb_build_object('code_id',code)),(other_b,'vip_redeemed',jsonb_build_object('code_id',other_code));
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider)::text,true);denied:=false;
  BEGIN PERFORM public.clear_building_data(b,'delete','حذف عمارة حذف اختبار VIP'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Another manager deleted a building'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager)::text,true);denied:=false;
  BEGIN PERFORM public.clear_building_data(b,'delete','تأكيد خطأ'); EXCEPTION WHEN others THEN denied:=true; END;
  IF NOT denied OR (SELECT redeemed_building_id FROM private.vip_codes WHERE id=code) IS DISTINCT FROM b THEN RAISE EXCEPTION 'Wrong confirmation changed VIP data'; END IF;
  SELECT to_jsonb(s) INTO subscription_before FROM public.building_subscriptions s WHERE building_id=b;
  SET LOCAL ROLE authenticated;
  PERFORM public.clear_building_data(b,'reset','تصفير سجلات حذف اختبار VIP');
  RESET ROLE;
  IF (SELECT to_jsonb(s) FROM public.building_subscriptions s WHERE building_id=b) IS DISTINCT FROM subscription_before OR (SELECT redeemed_at FROM private.vip_codes WHERE id=code) IS DISTINCT FROM redeemed OR EXISTS(SELECT FROM private.subscription_events WHERE metadata->>'deleted_building_id'=b::text) THEN RAISE EXCEPTION 'Reset altered subscription or VIP redemption'; END IF;
  SET LOCAL ROLE authenticated;
  PERFORM public.clear_building_data(b,'delete','حذف عمارة حذف اختبار VIP');
  RESET ROLE;
  IF EXISTS(SELECT FROM public.buildings WHERE id=b) OR EXISTS(SELECT FROM public.apartments WHERE building_id=b) OR EXISTS(SELECT FROM public.building_subscriptions WHERE building_id=b) THEN RAISE EXCEPTION 'Building deletion remained blocked'; END IF;
  IF NOT EXISTS(SELECT FROM private.vip_codes WHERE id=code AND redeemed_building_id IS NULL AND redeemed_at IS NULL AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'Consumed VIP code became usable'; END IF;
  SELECT metadata INTO archived FROM private.subscription_events WHERE event_type='building_deleted' AND metadata->>'deleted_building_id'=b::text;
  IF (archived->'vip_redemptions'->0->>'code_id')::uuid IS DISTINCT FROM code OR (archived->'vip_redemptions'->0->>'redeemed_at')::timestamptz IS DISTINCT FROM redeemed OR NOT EXISTS(SELECT FROM private.subscription_events WHERE event_type='vip_redeemed' AND building_id IS NULL AND metadata->>'deleted_building_id'=b::text AND metadata->>'code_id'=code::text) THEN RAISE EXCEPTION 'Subscription history was lost'; END IF;
  IF (SELECT balance FROM public.buildings WHERE id=other_b)<>2000 OR (SELECT redeemed_building_id FROM private.vip_codes WHERE id=other_code) IS DISTINCT FROM other_b OR NOT EXISTS(SELECT FROM private.subscription_events WHERE building_id=other_b AND event_type='vip_redeemed') THEN RAISE EXCEPTION 'Another building was modified'; END IF;
  IF (SELECT building_id FROM public.profiles WHERE id=manager) IS NOT NULL OR (SELECT role FROM public.profiles WHERE id=manager)<>'building_admin' OR (SELECT building_id FROM public.profiles WHERE id=resident) IS NOT NULL OR (SELECT role FROM public.profiles WHERE id=resident)<>'pending' THEN RAISE EXCEPTION 'Member accounts were not detached correctly'; END IF;
  created:=public.create_manager_building('{"name":"بعد الحذف","totalUnits":1,"totalFloors":1,"monthlyTarget":75}');
  denied:=false;BEGIN PERFORM public.redeem_building_vip((created->>'id')::uuid,code_text); EXCEPTION WHEN others THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Used VIP code could be redeemed again'; END IF;
  -- No-VIP buildings still delete normally.
  PERFORM public.clear_building_data((created->>'id')::uuid,'delete','حذف عمارة بعد الحذف');
  IF EXISTS(SELECT FROM public.buildings WHERE id=(created->>'id')::uuid) THEN RAISE EXCEPTION 'No-VIP deletion regressed'; END IF;
  RAISE EXCEPTION SQLSTATE 'Z0001' USING MESSAGE='VIP building deletion passed';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
END $test$;
