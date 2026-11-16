-- Keep the existing authorization and confirmation checks intact.
-- Reset historical amounts alongside operational records; do not reset subscriptions.
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
      historical_adjustment_applied=false
    WHERE id=b.id;
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
END; $function$
;
NOTIFY pgrst,'reload schema';
