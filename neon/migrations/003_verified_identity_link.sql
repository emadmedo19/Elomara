-- Preserve application UUIDs while Neon Auth owns credentials and sessions.
-- This function accepts no email, UUID or role supplied by the caller.
CREATE FUNCTION public.resolve_app_identity() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  native_id text := auth.user_id();
  native_user record;
  application_id uuid;
  match_count integer;
BEGIN
  IF native_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  SELECT id,email,"emailVerified",name INTO native_user FROM neon_auth."user" WHERE id::text=native_id;
  IF NOT FOUND OR native_user."emailVerified" IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Verify your email before accessing the application' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(native_user.email), 746281));
  SELECT app_user_id INTO application_id FROM private.auth_identity_map WHERE neon_user_id=native_id;
  IF application_id IS NOT NULL THEN RETURN application_id; END IF;
  SELECT count(*) INTO match_count FROM app_auth.users WHERE lower(email)=lower(native_user.email);
  IF match_count > 1 THEN RAISE EXCEPTION 'Account requires manual identity reconciliation'; END IF;
  SELECT id INTO application_id FROM app_auth.users WHERE lower(email)=lower(native_user.email);
  IF application_id IS NULL THEN
    application_id := gen_random_uuid();
    INSERT INTO app_auth.users(id,email,email_confirmed_at,raw_user_meta_data)
      VALUES(application_id,native_user.email,now(),jsonb_build_object('full_name',native_user.name));
  END IF;
  INSERT INTO private.auth_identity_map(neon_user_id,app_user_id) VALUES(native_id,application_id);
  RETURN application_id;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_app_identity() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolve_app_identity() TO authenticated;
