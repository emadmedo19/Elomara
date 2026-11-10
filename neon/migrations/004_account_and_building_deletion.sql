-- Install functions only; never invokes a deletion or changes application rows.
-- Keep account deletion, successor promotion and credential removal atomic.
CREATE OR REPLACE FUNCTION public.delete_account_with_successor(confirmation text, successor_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  me uuid := app_auth.user_id();
  native_id text := auth.user_id();
  mine public.profiles;
  successor public.profiles;
BEGIN
  IF me IS NULL OR confirmation IS DISTINCT FROM 'حذف حسابي نهائيًا' THEN
    RAISE EXCEPTION 'اكتب عبارة التأكيد لحذف حسابك' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM neon_auth."user" n JOIN private.auth_identity_map m ON m.neon_user_id=n.id::text
    WHERE m.app_user_id=me AND m.neon_user_id=native_id AND n."emailVerified" AND NOT coalesce(n.banned,false)) THEN
    RAISE EXCEPTION 'سجّل الدخول مجددًا قبل حذف الحساب' USING ERRCODE='42501';
  END IF;
  SELECT * INTO mine FROM public.profiles WHERE id=me;
  IF mine.building_id IS NOT NULL THEN
    PERFORM 1 FROM public.buildings WHERE id=mine.building_id FOR UPDATE;
  END IF;
  SELECT * INTO mine FROM public.profiles WHERE id=me FOR UPDATE;
  IF mine.role='building_admin' AND mine.building_id IS NOT NULL THEN
    IF NOT mine.approved OR mine.disabled_at IS NOT NULL THEN
      RAISE EXCEPTION 'لا توجد صلاحية لنقل إدارة العمارة' USING ERRCODE='42501';
    END IF;
    SELECT p.* INTO successor FROM public.profiles p
      JOIN public.apartments a ON a.id=p.apartment_id AND a.building_id=p.building_id
      WHERE p.id=successor_id AND p.id<>me AND p.building_id=mine.building_id
        AND p.role IN ('owner','tenant') AND p.approved AND p.disabled_at IS NULL FOR UPDATE OF p;
    IF successor.id IS NULL THEN
      RAISE EXCEPTION 'اختار ساكنًا معتمدًا من نفس العمارة ليصبح المدير البديل';
    END IF;
    UPDATE public.profiles SET role='building_admin',updated_at=now() WHERE id=successor.id;
    UPDATE public.buildings SET manager_name=successor.full_name,manager_phone=coalesce(successor.phone,''),updated_at=now()
      WHERE id=mine.building_id;
  END IF;
  DELETE FROM public.building_invites WHERE invited_by=me;
  DELETE FROM public.building_access_codes WHERE created_by=me;
  -- Native user FKs cascade to OAuth credentials and all native sessions.
  DELETE FROM neon_auth."user" WHERE id::text=native_id;
  DELETE FROM app_auth.users WHERE id=me;
END; $$;
REVOKE ALL ON FUNCTION public.delete_account_with_successor(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_account_with_successor(text,uuid) TO authenticated;
-- The imported legacy function deletes only the shadow identity and must not be
-- used to bypass the successor requirement or leave live Neon credentials.
REVOKE EXECUTE ON FUNCTION public.delete_my_account(text) FROM authenticated,anon,PUBLIC;

CREATE OR REPLACE FUNCTION public.clear_building_data(target_building_id uuid, operation text, confirmation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.buildings; mine public.profiles;
BEGIN
  IF app_auth.user_id() IS NULL THEN RAISE EXCEPTION 'سجّل الدخول أولًا' USING ERRCODE='42501'; END IF;
  IF operation IS NULL OR operation NOT IN ('reset','delete') THEN RAISE EXCEPTION 'اختار نوع الحذف'; END IF;
  SELECT * INTO b FROM public.buildings WHERE id=target_building_id FOR UPDATE;
  SELECT * INTO mine FROM public.profiles WHERE id=app_auth.user_id() FOR UPDATE;
  IF b.id IS NULL OR mine.role IS DISTINCT FROM 'building_admin' OR mine.approved IS DISTINCT FROM true
    OR mine.disabled_at IS NOT NULL OR mine.building_id IS DISTINCT FROM b.id THEN
    RAISE EXCEPTION 'غير مصرح بإدارة بيانات هذه العمارة' USING ERRCODE='42501';
  END IF;
  IF confirmation IS DISTINCT FROM (CASE operation WHEN 'reset' THEN 'تصفير سجلات ' ELSE 'حذف عمارة ' END || b.name) THEN
    RAISE EXCEPTION 'اكتب عبارة التأكيد كما هي';
  END IF;
  -- Children first; all operations roll back on any failure. Delete generated
  -- inbox rows last so bulk cleanup cannot leave phantom payment notifications.
  DELETE FROM public.payments WHERE building_id=b.id;
  DELETE FROM public.expenses WHERE building_id=b.id;
  DELETE FROM public.payment_audit_logs WHERE building_id=b.id;
  DELETE FROM public.maintenance_tickets WHERE building_id=b.id;
  DELETE FROM public.facility_bookings WHERE building_id=b.id;
  DELETE FROM public.announcements WHERE building_id=b.id;
  DELETE FROM public.building_polls WHERE building_id=b.id;
  DELETE FROM public.exceptional_collections WHERE building_id=b.id;
  DELETE FROM public.building_treasury_settings_audit WHERE building_id=b.id;
  IF operation='reset' THEN
    UPDATE public.apartments SET paid_amount=0,credit_balance=0,last_payment_date=NULL,
      overdue_months=0,payment_status='pending',updated_at=now() WHERE building_id=b.id;
    UPDATE public.buildings SET balance=0,opening_balance=0,reserve_fund=0,updated_at=now() WHERE id=b.id;
  ELSE
    DELETE FROM public.building_join_requests WHERE building_id=b.id;
    DELETE FROM public.building_invites WHERE building_id=b.id;
    DELETE FROM public.building_access_codes WHERE building_id=b.id;
    DELETE FROM public.app_settings WHERE building_id=b.id;
    UPDATE public.profiles SET building_id=NULL,apartment_id=NULL,
      approved=(role='building_admin'),role=CASE WHEN role='building_admin' THEN role ELSE 'pending' END,updated_at=now()
      WHERE building_id=b.id;
    DELETE FROM public.apartments WHERE building_id=b.id;
    DELETE FROM public.buildings WHERE id=b.id;
  END IF;
  DELETE FROM public.app_notifications WHERE building_id=b.id;
END; $$;
REVOKE ALL ON FUNCTION public.clear_building_data(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clear_building_data(uuid,text,text) TO authenticated;
