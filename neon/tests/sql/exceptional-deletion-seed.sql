DO $$
DECLARE b uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); c uuid; charge uuid; r jsonb;
BEGIN
 IF current_database()<>'elomara_migration_check_v2' THEN RAISE EXCEPTION 'Rehearsal database required'; END IF;
 INSERT INTO public.buildings(id,name,balance) VALUES(b,'اختبار ربط التحصيل القديم',100);
 INSERT INTO public.apartments(id,building_id,unit_number,monthly_fee) VALUES(a,b,'1',0);
 INSERT INTO app_auth.users(id,email) VALUES(actor,actor||'@example.invalid');
 UPDATE public.profiles SET building_id=b,role='building_admin',approved=true WHERE id=actor;
 INSERT INTO private.auth_identity_map VALUES(actor::text,actor);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
 SELECT (public.create_exceptional_collection(b,'تحصيل قديم للربط','','per_apartment',NULL,200,ARRAY[a],false)->>'collection_id')::uuid INTO c;
 SELECT id INTO charge FROM public.payments WHERE apartment_id=a AND is_assessment;
 r:=public.record_exceptional_payment(charge,50,current_date,'نقدي','KEEP-ME','');
 PERFORM set_config('test.delete_collection',c::text,true);
 PERFORM set_config('test.delete_receipt',r->>'id',true);
 PERFORM set_config('test.delete_building',b::text,true);
END $$;
