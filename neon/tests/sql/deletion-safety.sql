-- Execute after migration 004 inside a rollback transaction in rehearsal only.
DO $$ BEGIN IF current_database()<>'elomara_migration_check_v2' THEN RAISE EXCEPTION 'Rehearsal database required'; END IF; END $$;
CREATE SCHEMA IF NOT EXISTS neon_auth;
CREATE TABLE IF NOT EXISTS neon_auth."user" (id uuid primary key,email text,"emailVerified" boolean,name text,banned boolean);
ALTER TABLE neon_auth."user" ADD COLUMN IF NOT EXISTS banned boolean DEFAULT false;
CREATE TABLE IF NOT EXISTS neon_auth.session (id uuid primary key,"userId" uuid references neon_auth."user"(id) on delete cascade);
CREATE TABLE IF NOT EXISTS neon_auth.account (id uuid primary key,"userId" uuid references neon_auth."user"(id) on delete cascade);
DO $$
DECLARE
 b uuid:=gen_random_uuid(); foreign_b uuid:=gen_random_uuid(); apt uuid:=gen_random_uuid(); foreign_apt uuid:=gen_random_uuid();
 manager uuid:=gen_random_uuid(); resident uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); pending uuid:=gen_random_uuid(); suspended uuid:=gen_random_uuid();
 pay uuid:=gen_random_uuid(); foreign_pay uuid:=gen_random_uuid(); item record; candidate uuid; succeeded boolean;
BEGIN
 INSERT INTO public.buildings(id,name,balance,reserve_fund) VALUES(b,'اختبار الحذف',500,100),(foreign_b,'اختبار آخر',700,200);
 INSERT INTO public.apartments(id,building_id,unit_number,monthly_fee,paid_amount,credit_balance,overdue_months) VALUES(apt,b,'1',100,50,25,3),(foreign_apt,foreign_b,'1',100,20,0,2);
 FOR item IN SELECT * FROM (VALUES(manager,b,NULL::uuid,'building_admin',true,NULL::timestamptz),(resident,b,apt,'owner',true,NULL::timestamptz),(outsider,foreign_b,foreign_apt,'tenant',true,NULL::timestamptz),(pending,b,apt,'tenant',false,NULL::timestamptz),(suspended,b,apt,'tenant',true,now())) x(id,building,apartment,role,approved,disabled) LOOP
  INSERT INTO app_auth.users(id,email) VALUES(item.id,item.id||'@example.invalid');
  UPDATE public.profiles SET building_id=item.building,apartment_id=item.apartment,role=item.role,approved=item.approved,disabled_at=item.disabled,full_name='مدير الاختبار' WHERE id=item.id;
  INSERT INTO neon_auth."user"(id,email,"emailVerified",name,banned) VALUES(item.id,item.id||'@example.invalid',true,'اختبار',false);
  INSERT INTO private.auth_identity_map VALUES(item.id::text,item.id);
 END LOOP;
 INSERT INTO neon_auth.session VALUES(gen_random_uuid(),manager);
 INSERT INTO neon_auth.account VALUES(gen_random_uuid(),manager);
 INSERT INTO public.payments(id,apartment_id,building_id,unit_number,resident_name,amount,payment_date,month,method,recorded_by)
 VALUES(pay,apt,b,'1','اختبار',50,current_date,'2026-11','نقدي',manager),(foreign_pay,foreign_apt,foreign_b,'1','آخر',20,current_date,'2026-11','نقدي',outsider);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',resident)::text,true);
 SET LOCAL ROLE authenticated;
 succeeded:=false;
 BEGIN PERFORM public.clear_building_data(b,'reset','تصفير سجلات اختبار الحذف'); succeeded:=true; EXCEPTION WHEN others THEN NULL; END;
 IF succeeded THEN RAISE EXCEPTION 'Resident managed building data'; END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager)::text,true);
 SET LOCAL ROLE authenticated;
 succeeded:=false;
 BEGIN PERFORM public.clear_building_data(foreign_b,'delete','حذف عمارة اختبار آخر'); succeeded:=true; EXCEPTION WHEN others THEN NULL; END;
 IF succeeded THEN RAISE EXCEPTION 'Foreign building was deleted'; END IF;
 succeeded:=false;
 BEGIN PERFORM public.clear_building_data(b,'reset','wrong'); succeeded:=true; EXCEPTION WHEN others THEN NULL; END;
 IF succeeded THEN RAISE EXCEPTION 'Confirmation bypass'; END IF;
 FOREACH candidate IN ARRAY ARRAY[NULL::uuid,manager,outsider,pending,suspended] LOOP
  succeeded:=false;
  BEGIN PERFORM public.delete_account_with_successor('حذف حسابي نهائيًا',candidate); succeeded:=true; EXCEPTION WHEN others THEN NULL; END;
  IF succeeded THEN RAISE EXCEPTION 'Invalid successor accepted'; END IF;
 END LOOP;
 succeeded:=false;
 BEGIN PERFORM public.delete_my_account('حذف حسابي نهائيًا'); succeeded:=true; EXCEPTION WHEN others THEN NULL; END;
 IF succeeded THEN RAISE EXCEPTION 'Legacy bypass allowed'; END IF;
 PERFORM public.clear_building_data(b,'reset','تصفير سجلات اختبار الحذف');
 RESET ROLE;
 IF EXISTS(SELECT FROM public.payments WHERE building_id=b) OR NOT EXISTS(SELECT FROM public.payments WHERE id=foreign_pay) THEN RAISE EXCEPTION 'Reset isolation failed'; END IF;
 IF NOT EXISTS(SELECT FROM public.apartments WHERE id=apt AND paid_amount=0 AND credit_balance=0 AND overdue_months=0) THEN RAISE EXCEPTION 'Balances retained'; END IF;
 IF NOT EXISTS(SELECT FROM public.profiles WHERE id=resident AND building_id=b) THEN RAISE EXCEPTION 'Reset removed membership'; END IF;
 IF EXISTS(SELECT FROM public.app_notifications WHERE building_id=b) THEN RAISE EXCEPTION 'Phantom notifications'; END IF;
 INSERT INTO public.payments(id,apartment_id,building_id,unit_number,resident_name,amount,payment_date,month,method,recorded_by) VALUES(pay,apt,b,'1','اختبار',100,current_date,'2026-11','نقدي',manager);
 SET LOCAL ROLE authenticated;
 PERFORM public.delete_account_with_successor('حذف حسابي نهائيًا',resident);
 IF app_auth.user_id() IS NOT NULL THEN RAISE EXCEPTION 'Deleted session retained application identity'; END IF;
 RESET ROLE;
 IF NOT EXISTS(SELECT FROM public.profiles WHERE id=resident AND role='building_admin') THEN RAISE EXCEPTION 'Successor not promoted'; END IF;
 IF EXISTS(SELECT FROM app_auth.users WHERE id=manager) OR EXISTS(SELECT FROM neon_auth."user" WHERE id=manager)
  OR EXISTS(SELECT FROM neon_auth.session WHERE "userId"=manager) OR EXISTS(SELECT FROM neon_auth.account WHERE "userId"=manager) THEN RAISE EXCEPTION 'Account credentials retained'; END IF;
 IF NOT EXISTS(SELECT FROM public.payments WHERE id=pay AND recorded_by IS NULL) THEN RAISE EXCEPTION 'Shared ledger lost'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',resident)::text,true);
 SET LOCAL ROLE authenticated;
 PERFORM public.clear_building_data(b,'delete','حذف عمارة اختبار الحذف');
 RESET ROLE;
 IF EXISTS(SELECT FROM public.buildings WHERE id=b) OR EXISTS(SELECT FROM public.apartments WHERE building_id=b) OR EXISTS(SELECT FROM public.payments WHERE building_id=b) THEN RAISE EXCEPTION 'Building data retained'; END IF;
 IF NOT EXISTS(SELECT FROM public.profiles WHERE id=resident AND building_id IS NULL) OR NOT EXISTS(SELECT FROM app_auth.users WHERE id=resident) THEN RAISE EXCEPTION 'Member account lost'; END IF;
 IF NOT EXISTS(SELECT FROM public.payments WHERE id=foreign_pay) THEN RAISE EXCEPTION 'Foreign ledger lost'; END IF;
END $$;
SELECT 'PASS: authorization, successor eligibility, reset, atomic native account deletion, shared ledger preservation, full building deletion and tenant isolation' AS result;
