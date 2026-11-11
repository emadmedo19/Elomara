-- Read-only, caller-scoped membership lookup. No caller-supplied user ID or role.
CREATE OR REPLACE FUNCTION public.get_current_membership()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT to_jsonb(p) FROM (
  SELECT id,full_name,phone,role,building_id,apartment_id,approved,disabled_at,resident_label
  FROM public.profiles WHERE id=auth.uid()
 ) p
$$;
REVOKE ALL ON FUNCTION public.get_current_membership() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_current_membership() TO authenticated;
NOTIFY pgrst,'reload schema';
