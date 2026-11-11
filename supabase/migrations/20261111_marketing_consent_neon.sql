-- Marketing preferences are stored by verified email; only the signed-in owner may change their preference.
-- Apply to Neon before deploying the UI. Existing rows are preserved.
CREATE OR REPLACE FUNCTION public.get_my_marketing_preference()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_email text; v_pref record;
BEGIN
  IF auth.user_id() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT lower(trim(email)) INTO v_email FROM neon_auth."user" WHERE id::text=auth.user_id() AND "emailVerified"=true;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Verified email required' USING ERRCODE='42501'; END IF;
  SELECT opted_in_at,unsubscribed_at INTO v_pref FROM public.marketing_email_preferences WHERE lower(email)=v_email;
  IF NOT FOUND THEN RETURN 'unknown'; END IF;
  IF v_pref.opted_in_at IS NOT NULL AND v_pref.unsubscribed_at IS NULL THEN RETURN 'subscribed'; END IF;
  RETURN 'declined';
END $$;
CREATE OR REPLACE FUNCTION public.set_my_marketing_preference(p_subscribe boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_email text;
BEGIN
  IF p_subscribe IS NULL THEN RAISE EXCEPTION 'Choice required'; END IF;
  IF auth.user_id() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT lower(trim(email)) INTO v_email FROM neon_auth."user" WHERE id::text=auth.user_id() AND "emailVerified"=true;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Verified email required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.marketing_email_preferences(email,opted_in_at,unsubscribed_at,updated_at)
  VALUES(v_email,CASE WHEN p_subscribe THEN now() ELSE NULL END,CASE WHEN p_subscribe THEN NULL ELSE now() END,now())
  ON CONFLICT(email) DO UPDATE SET opted_in_at=excluded.opted_in_at,unsubscribed_at=excluded.unsubscribed_at,updated_at=now();
  RETURN CASE WHEN p_subscribe THEN 'subscribed' ELSE 'declined' END;
END $$;
REVOKE ALL ON FUNCTION public.get_my_marketing_preference() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_marketing_preference(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_marketing_preference() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_marketing_preference(boolean) TO authenticated;
