-- Isolated branch only. Fixtures and the identity shim roll back.
DO $test$
DECLARE
  owner_id uuid := gen_random_uuid();
  manager_id uuid := gen_random_uuid();
  resident_id uuid := gen_random_uuid();
  building uuid := gen_random_uuid();
  legacy_id uuid := gen_random_uuid();
  generated jsonb;
  code_id uuid;
  code_text text;
  victim uuid;
  action text;
BEGIN
  BEGIN
    EXECUTE $definition$CREATE OR REPLACE FUNCTION app_auth.user_id() RETURNS uuid
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $identity$
      SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
    $identity$$definition$;
    INSERT INTO public.buildings(id,name,balance,opening_balance,collection_start_month)
      VALUES(building,'VIP code fixture',0,0,'2025-01-01');
    INSERT INTO app_auth.users(id,email)
      SELECT id, id || '@example.invalid' FROM unnest(ARRAY[owner_id, manager_id, resident_id]) AS id;
    INSERT INTO private.auth_identity_map(neon_user_id, app_user_id) VALUES (owner_id::text, owner_id);
    INSERT INTO private.platform_owners(neon_user_id) VALUES (owner_id::text);
    UPDATE public.profiles SET building_id=building,role='building_admin',approved=true WHERE id=manager_id;
    UPDATE public.profiles SET building_id=building,role='tenant',approved=true WHERE id=resident_id;
    INSERT INTO private.vip_codes(id,code_hash) VALUES (legacy_id, legacy_id::text);

    FOREACH victim IN ARRAY ARRAY[manager_id, resident_id] LOOP
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',victim)::text,true);
      SET LOCAL ROLE authenticated;
      FOREACH action IN ARRAY ARRAY['list','generate','pause','resume','delete'] LOOP
        BEGIN
          PERFORM public.platform_subscription_admin(action, legacy_id);
          RAISE EXCEPTION SQLSTATE 'Z0002' USING MESSAGE='Non-owner accessed VIP code administration';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
      END LOOP;
      RESET ROLE;
    END LOOP;

    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id)::text,true);
    SET LOCAL ROLE authenticated;
    IF NOT public.platform_subscription_admin('list') @> jsonb_build_array(
      jsonb_build_object('id',legacy_id,'status','available','code',NULL)) THEN
      RAISE EXCEPTION 'Legacy VIP code missing from list';
    END IF;
    PERFORM public.platform_subscription_admin('pause', legacy_id);
    PERFORM public.platform_subscription_admin('delete', legacy_id);
    IF public.platform_subscription_admin('list') @> jsonb_build_array(jsonb_build_object('id',legacy_id)) THEN
      RAISE EXCEPTION 'Deleted legacy code is still listed';
    END IF;

    generated := public.platform_subscription_admin('generate');
    code_id := (generated->>'id')::uuid;
    code_text := generated->>'code';
    PERFORM public.platform_subscription_admin('pause', code_id);
    IF NOT public.platform_subscription_admin('list') @> jsonb_build_array(
      jsonb_build_object('id',code_id,'status','paused','code',code_text)) THEN
      RAISE EXCEPTION 'Paused code or display text missing';
    END IF;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager_id)::text,true);
    BEGIN
      PERFORM public.redeem_building_vip(building, code_text);
      RAISE EXCEPTION SQLSTATE 'Z0002' USING MESSAGE='Paused code was redeemable';
    EXCEPTION WHEN raise_exception THEN NULL;
    END;

    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id)::text,true);
    PERFORM public.platform_subscription_admin('resume', code_id);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager_id)::text,true);
    IF NOT (public.redeem_building_vip(building, lower(code_text))->>'ok')::boolean THEN
      RAISE EXCEPTION 'Resumed code could not be redeemed';
    END IF;

    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id)::text,true);
    IF NOT public.platform_subscription_admin('list') @> jsonb_build_array(
      jsonb_build_object('id',code_id,'status','used','code',NULL)) THEN
      RAISE EXCEPTION 'Used code status or masking is wrong';
    END IF;
    BEGIN
      PERFORM public.platform_subscription_admin('delete', code_id);
      RAISE EXCEPTION SQLSTATE 'Z0002' USING MESSAGE='Used code could be deleted';
    EXCEPTION WHEN raise_exception THEN NULL;
    END;
    RESET ROLE;
    IF NOT EXISTS (SELECT FROM public.building_subscriptions WHERE building_id=building AND status='vip')
      OR EXISTS (SELECT FROM private.vip_codes WHERE id=code_id AND display_code IS NOT NULL) THEN
      RAISE EXCEPTION 'VIP entitlement or display-code cleanup regressed';
    END IF;
    RAISE EXCEPTION SQLSTATE 'Z0001' USING MESSAGE='VIP code management passed';
  EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
  END;
END $test$;
