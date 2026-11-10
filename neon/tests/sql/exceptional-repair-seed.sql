DO $$
DECLARE b uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid();
BEGIN
 INSERT INTO public.buildings(id,name,balance) VALUES(b,'اختبار تصحيح قديم',100);
 INSERT INTO public.apartments(id,building_id,unit_number,monthly_fee) VALUES(a,b,'1',0);
 INSERT INTO app_auth.users(id,email) VALUES(actor,actor||'@example.invalid');
 UPDATE public.profiles SET building_id=b,role='building_admin',approved=true WHERE id=actor;
 INSERT INTO private.auth_identity_map VALUES(actor::text,actor);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
 PERFORM set_config('test.repair_building',b::text,true);
 INSERT INTO public.exceptional_collections(building_id,title,description,amount_mode,per_apartment_amount,target_apartment_ids,created_by)
 VALUES(b,'اختبار قديم','','per_apartment',10,ARRAY[a],actor);
 INSERT INTO public.payments(apartment_id,building_id,unit_number,amount,month,method,notes,recorded_by,payment_type)
 VALUES(a,b,'1',10,'تحصيل استثنائي','تحصيل استثنائي','اختبار قديم',actor,'exceptional');
 UPDATE public.buildings SET balance=balance+10 WHERE id=b;
 INSERT INTO public.payments(apartment_id,building_id,unit_number,amount,month,method,recorded_by,receipt_number)
 VALUES(a,b,'1',1,'2026-11','نقدي',actor,'REAL-RECEIPT');
 UPDATE public.buildings SET balance=balance+1 WHERE id=b;
END $$;
