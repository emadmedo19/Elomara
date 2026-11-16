-- Definition only; no customer building or subscription is changed by installation.
-- VIP codes remain permanently unusable and original redemption history is archived.
CREATE OR REPLACE FUNCTION public.clear_building_data(target_building_id uuid, operation text, confirmation text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  DELETE FROM public.historical_monthly_allocations WHERE building_id=b.id;
  DELETE FROM public.payments WHERE building_id=b.id;
  DELETE FROM public.expenses WHERE building_id=b.id;
  DELETE FROM public.payment_audit_logs WHERE building_id=b.id;
  DELETE FROM public.financial_audit_log WHERE building_id=b.id;
  DELETE FROM private.financial_mutation_requests WHERE building_id=b.id;
  DELETE FROM public.maintenance_tickets WHERE building_id=b.id;
  DELETE FROM public.facility_bookings WHERE building_id=b.id;
  DELETE FROM public.announcements WHERE building_id=b.id;
  DELETE FROM public.building_polls WHERE building_id=b.id;
  DELETE FROM public.exceptional_collections WHERE building_id=b.id;
  DELETE FROM public.building_treasury_settings_audit WHERE building_id=b.id;
  IF operation='reset' THEN
    -- Historical totals are persisted separately from payments and expenses.
    -- Clear them before the final zeroing of cash, since the reconciliation trigger
    -- adjusts the opening balance when these totals change.
    UPDATE public.buildings SET
      historical_monthly_collections_total=0,
      historical_exceptional_collections_total=0,
      historical_expenses_total=0,
      historical_exceptional_expenses_total=0,
      historical_adjustment_applied=0
    WHERE id=b.id;
    UPDATE public.apartments SET paid_amount=0,credit_balance=0,last_payment_date=NULL,
      overdue_months=0,payment_status='pending',updated_at=now() WHERE building_id=b.id;
    UPDATE public.buildings SET balance=0,opening_balance=0,reserve_fund=0,opening_cash_includes_history=false,updated_at=now() WHERE id=b.id;
  ELSE
    -- Retain private subscription history independently of the deleted building.
    -- Consumed VIP codes are permanently revoked, never returned to the unused pool.
    -- Archive redemption timestamps before clearing the FK-bound fields, since
    -- vip_codes_check requires a building whenever redeemed_at is non-null.
    INSERT INTO private.subscription_events(building_id,event_type,metadata)
    SELECT NULL,'building_deleted',jsonb_build_object(
      'deleted_building_id',b.id,'deleted_building_name',b.name,'deleted_by',mine.id,
      'vip_redemptions',coalesce(jsonb_agg(jsonb_build_object('code_id',v.id,'redeemed_at',v.redeemed_at,'revoked_at',v.revoked_at)) FILTER(WHERE v.id IS NOT NULL),'[]'::jsonb))
    FROM private.vip_codes v WHERE v.redeemed_building_id=b.id;
    UPDATE private.vip_codes SET revoked_at=coalesce(revoked_at,now()),redeemed_at=NULL,redeemed_building_id=NULL
      WHERE redeemed_building_id=b.id;
    UPDATE private.subscription_events SET metadata=metadata||jsonb_build_object('deleted_building_id',b.id),building_id=NULL
      WHERE building_id=b.id;
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
END; $function$
;
