-- Read-only after trial: preserve reads, purchases and VIP, reject writes at the database.
CREATE OR REPLACE FUNCTION public.building_subscription_allows_writes(p_building_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((
  SELECT CASE WHEN s.status='vip' AND s.vip_granted_at IS NOT NULL THEN true
   WHEN s.status='active' AND s.paid_through>now() THEN true
   WHEN coalesce(s.trial_ends_at,b.created_at+interval '14 days')>now() THEN true
   ELSE false END
  FROM public.buildings b LEFT JOIN public.building_subscriptions s ON s.building_id=b.id WHERE b.id=p_building_id
 ),false)
$$;
REVOKE ALL ON FUNCTION public.building_subscription_allows_writes(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.building_subscription_allows_writes(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.read_building_subscription(p_building_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.buildings; s public.building_subscriptions; trial_end timestamptz; state text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=app_auth.user_id() AND p.building_id=p_building_id AND p.approved=true AND p.disabled_at IS NULL) THEN RAISE EXCEPTION 'غير مصرح' USING errcode='42501'; END IF;
 SELECT * INTO b FROM public.buildings WHERE id=p_building_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'العمارة غير موجودة'; END IF;
 SELECT * INTO s FROM public.building_subscriptions WHERE building_id=p_building_id;
 trial_end:=coalesce(s.trial_ends_at,b.created_at+interval '14 days');
 state:=CASE WHEN s.status='vip' AND s.vip_granted_at IS NOT NULL THEN 'vip' WHEN s.status='active' AND s.paid_through>now() THEN 'active' WHEN trial_end>now() THEN 'trial' ELSE 'expired' END;
 RETURN jsonb_build_object('status',state,'trial_ends_at',trial_end,'paid_through',s.paid_through,'days_remaining',CASE WHEN state='trial' THEN greatest(0,ceil(extract(epoch from(trial_end-now()))/86400)::integer) ELSE 0 END);
END $$;
REVOKE ALL ON FUNCTION public.read_building_subscription(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_building_subscription(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION private.require_active_building_subscription() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE building uuid;
BEGIN
 building:=CASE WHEN TG_OP='DELETE' THEN OLD.building_id ELSE NEW.building_id END;
 IF NOT public.building_subscription_allows_writes(building) THEN
  RAISE EXCEPTION 'انتهت الفترة التجريبية أو الاشتراك. يمكن عرض البيانات فقط حتى تجديد اشتراك العمارة.' USING errcode='P0001';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.require_active_building_subscription() FROM PUBLIC,anon,authenticated;
DO $$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['apartments','payments','expenses','announcements','maintenance_tickets','facility_bookings','building_polls','exceptional_collections','building_service_contacts','building_join_requests','building_invites','building_access_codes','historical_monthly_allocations','app_settings'] LOOP
  IF to_regclass('public.'||tab) IS NOT NULL THEN
   EXECUTE format('DROP TRIGGER IF EXISTS subscription_read_only_guard ON public.%I',tab);
   EXECUTE format('CREATE TRIGGER subscription_read_only_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.require_active_building_subscription()',tab);
  END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION private.require_active_poll_subscription() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_poll uuid; target_building uuid;
BEGIN
 target_poll:=CASE WHEN TG_OP='DELETE' THEN OLD.poll_id ELSE NEW.poll_id END;
 SELECT building_id INTO target_building FROM public.building_polls WHERE id=target_poll;
 IF NOT public.building_subscription_allows_writes(target_building) THEN RAISE EXCEPTION 'انتهى اشتراك العمارة. التصويت متوقف حتى التجديد.' USING errcode='P0001'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DO $$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['building_poll_ballots','building_poll_participation','building_poll_options'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS subscription_poll_read_only_guard ON public.%I',tab);
  EXECUTE format('CREATE TRIGGER subscription_poll_read_only_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.require_active_poll_subscription()',tab);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
