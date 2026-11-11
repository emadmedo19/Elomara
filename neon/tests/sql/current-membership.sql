DO $$
DECLARE manager uuid:=gen_random_uuid(); resident uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); r jsonb;
BEGIN
 IF current_database()<>'elomara_migration_check_v2' THEN RAISE EXCEPTION 'Rehearsal database required'; END IF;
 INSERT INTO public.buildings(id,name) VALUES(b,'اختبار حالة الحساب');
 INSERT INTO app_auth.users(id,email) VALUES(manager,manager||'@example.invalid'),(resident,resident||'@example.invalid');
 UPDATE public.profiles SET building_id=b,role='building_admin',approved=true WHERE id=manager;
 UPDATE public.profiles SET building_id=b,role='tenant',approved=true WHERE id=resident;
 INSERT INTO private.auth_identity_map VALUES(manager::text,manager),(resident::text,resident);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager)::text,true);
 SET LOCAL ROLE authenticated;
 r:=public.get_current_membership();
 IF (r->>'id')::uuid<>manager OR r->>'role'<>'building_admin' OR (r->>'approved')::boolean IS NOT true OR (r->>'building_id')::uuid<>b THEN RAISE EXCEPTION 'Manager membership incorrect'; END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',resident)::text,true);
 SET LOCAL ROLE authenticated;
 r:=public.get_current_membership();
 IF (r->>'id')::uuid<>resident OR r->>'role'<>'tenant' THEN RAISE EXCEPTION 'Another user membership exposed'; END IF;
 RESET ROLE;
 UPDATE public.profiles SET approved=false,role='pending',building_id=NULL WHERE id=manager;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager)::text,true);
 SET LOCAL ROLE authenticated;
 r:=public.get_current_membership();
 IF r->>'role'<>'pending' OR (r->>'approved')::boolean IS NOT false THEN RAISE EXCEPTION 'Revocation was hidden'; END IF;
 RESET ROLE;
 IF has_function_privilege('anon','public.get_current_membership()','EXECUTE') THEN RAISE EXCEPTION 'Anonymous access permitted'; END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid='public.get_current_membership()'::regprocedure) THEN RAISE EXCEPTION 'Membership lookup must retain invoker RLS'; END IF;
END $$;
