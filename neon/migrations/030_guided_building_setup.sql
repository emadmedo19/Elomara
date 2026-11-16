-- Guided setup adds no customer balances until its final confirmed RPC is called.
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS opening_cash_includes_history boolean NOT NULL DEFAULT false;
-- @statement
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS is_opening_entry boolean NOT NULL DEFAULT false;
-- @statement
CREATE TABLE IF NOT EXISTS private.guided_building_setups (
 request_id uuid PRIMARY KEY, actor_id uuid NOT NULL, building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
 input jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
-- @statement
REVOKE ALL ON private.guided_building_setups FROM PUBLIC,anon,authenticated;

-- @statement
CREATE OR REPLACE FUNCTION private.reconcile_historical_opening_balance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE wanted numeric(14,2); difference numeric(14,2);
BEGIN
 wanted := coalesce(NEW.historical_monthly_collections_total,0)+coalesce(NEW.historical_exceptional_collections_total,0)-coalesce(NEW.historical_expenses_total,0);
 difference := wanted-coalesce(NEW.historical_adjustment_applied,0);
 IF NOT NEW.opening_cash_includes_history THEN
 NEW.balance := coalesce(NEW.balance,0)+difference;
 NEW.opening_balance := coalesce(NEW.opening_balance,0)+difference;
 END IF;
 NEW.historical_adjustment_applied := wanted;
 RETURN NEW;
END $$;


-- @statement
CREATE OR REPLACE FUNCTION public.save_building_management(p_building_id uuid,p_details jsonb,p_finance jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.buildings; saved public.buildings; base numeric; reserve numeric; expenses numeric; exceptional numeric;
 start_text text; start_m date; included boolean; base_delta numeric; wanted numeric; unit_id uuid;
BEGIN
 IF app_auth.user_id() IS NULL OR NOT public.can_manage_bunyan_building(p_building_id) THEN RAISE EXCEPTION 'غير مصرح بتعديل هذه العمارة' USING errcode='42501'; END IF;
 SELECT * INTO b FROM public.buildings WHERE id=p_building_id FOR UPDATE;
 IF b.id IS NULL THEN RAISE EXCEPTION 'العمارة غير متاحة'; END IF;
 IF p_finance IS NOT NULL THEN
  IF jsonb_typeof(p_finance) IS DISTINCT FROM 'object' OR private.building_financial_snapshot(b) IS DISTINCT FROM ((p_finance->'expected')-'openingIncludesHistory') THEN
   RAISE EXCEPTION 'تغيرت أرصدة العمارة منذ فتح الصفحة. أعد تحميل الأرصدة وراجع المبالغ قبل الحفظ.' USING errcode='40001'; END IF;
  base:=(p_finance->>'baseOpening')::numeric; reserve:=(p_finance->>'reserve')::numeric;
  expenses:=(p_finance->>'expenses')::numeric; exceptional:=(p_finance->>'exceptional')::numeric;
  IF b.opening_cash_includes_history AND exceptional IS DISTINCT FROM (SELECT coalesce(sum(amount),0) FROM public.payments WHERE building_id=b.id AND is_opening_entry AND payment_type='exceptional' AND NOT is_assessment) THEN RAISE EXCEPTION 'إجمالي السداد الاستثنائي السابق مرتبط بتسويات الشقق المسجلة، ولا يعدل كإجمالي منفصل'; END IF;
  included:=(p_finance->>'openingAlreadyIncluded')::boolean; start_text:=p_finance->>'startMonth';
  IF base IS NULL OR base<0 OR base>9999999999.99 OR base='NaN'::numeric OR base<>round(base,2)
   OR reserve IS NULL OR reserve<0 OR reserve>9999999999.99 OR reserve='NaN'::numeric OR reserve<>round(reserve,2)
   OR expenses IS NULL OR expenses<0 OR expenses>999999999999.99 OR expenses='NaN'::numeric OR expenses<>round(expenses,2)
   OR exceptional IS NULL OR exceptional<0 OR exceptional>999999999999.99 OR exceptional='NaN'::numeric OR exceptional<>round(exceptional,2) THEN
   RAISE EXCEPTION 'راجع المبالغ: أرقام غير سالبة وبحد أقصى رقمين عشريين'; END IF;
  IF b.opening_balance IS NULL AND included IS NULL THEN RAISE EXCEPTION 'حدد هل الرصيد المبدئي موجود ضمن الخزينة الحالية حتى لا يُحسب مرتين'; END IF;
  IF coalesce(start_text,'')<>'' THEN
   IF start_text !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' OR start_text<'1900-01' OR start_text>to_char(timezone('Africa/Cairo',now()),'YYYY-MM') THEN RAISE EXCEPTION 'حدد شهر بداية صحيحًا لا يتجاوز الشهر الحالي'; END IF;
   start_m:=(start_text||'-01')::date;
  END IF;
  IF EXISTS(SELECT FROM public.historical_monthly_allocations WHERE building_id=b.id AND (start_m IS NULL OR month<start_m)) THEN RAISE EXCEPTION 'امسح التوزيع السابق واحفظه أولًا قبل اختيار بداية تستبعد شهورًا موزعة'; END IF;
  base_delta:=CASE WHEN b.opening_balance IS NULL THEN CASE WHEN included THEN 0 ELSE base END ELSE base-(b.opening_balance-CASE WHEN b.opening_cash_includes_history THEN 0 ELSE b.historical_adjustment_applied END) END;
  wanted:=b.historical_monthly_collections_total+exceptional-expenses;
  IF (base+CASE WHEN b.opening_cash_includes_history THEN 0 ELSE wanted END) NOT BETWEEN -9999999999.99 AND 9999999999.99 THEN RAISE EXCEPTION 'صافي الرصيد الافتتاحي يتجاوز الحد المالي المسموح'; END IF;
 END IF;
 -- Existing metadata/fee validation is retained, inside this same transaction.
 -- Reserve is owned by the unified financial update below, not the metadata step.
 PERFORM public.update_manager_building(b.id,p_details||jsonb_build_object('reserveFund',b.reserve_fund));
 IF p_finance IS NOT NULL THEN
  -- The existing historical trigger adds only wanted - previous adjustment.
  -- Setting all opening inputs together avoids intermediate double counting.
  UPDATE public.buildings SET balance=balance+base_delta,opening_balance=base+CASE WHEN b.opening_cash_includes_history THEN 0 ELSE b.historical_adjustment_applied END,
   reserve_fund=reserve,collection_start_month=start_m,historical_expenses_total=expenses,historical_exceptional_collections_total=exceptional,updated_at=now()
   WHERE id=b.id;
 END IF;
 FOR unit_id IN SELECT id FROM public.apartments WHERE building_id=b.id ORDER BY id LOOP
  PERFORM private.reconcile_apartment_ledger(b.id,unit_id);
 END LOOP;
 SELECT * INTO saved FROM public.buildings WHERE id=b.id;
 IF p_finance IS NOT NULL AND (b.opening_balance,b.reserve_fund,b.balance,b.collection_start_month,b.historical_expenses_total,b.historical_exceptional_collections_total)
  IS DISTINCT FROM (saved.opening_balance,saved.reserve_fund,saved.balance,saved.collection_start_month,saved.historical_expenses_total,saved.historical_exceptional_collections_total) THEN
  INSERT INTO public.building_treasury_settings_audit(building_id,previous_opening_balance,opening_balance,previous_reserve_fund,reserve_fund,previous_balance,balance,opening_already_included,changed_by)
  VALUES(b.id,b.opening_balance,saved.opening_balance,b.reserve_fund,saved.reserve_fund,b.balance,saved.balance,coalesce(included,true),app_auth.user_id());
 END IF;
 RETURN to_jsonb(saved);
END $$;

-- @statement
CREATE OR REPLACE FUNCTION public.mutate_financial_entry(
 p_kind text,p_action text,p_building_id uuid,p_entry_id uuid,p_values jsonb,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.buildings; a public.apartments; old_payment public.payments; saved_payment public.payments;
 old_expense public.expenses; saved_expense public.expenses; charge public.payments;
 previous jsonb; saved jsonb; result jsonb; cached private.financial_mutation_requests;
 input jsonb:=jsonb_build_object('kind',p_kind,'action',p_action,'id',p_entry_id,'values',p_values);
 delta numeric:=0; v_amount numeric; monthly_paid numeric; exceptional_paid numeric; exceptional_remaining numeric;
 monthly_due numeric; remaining numeric; actor uuid:=app_auth.user_id();
BEGIN
 IF actor IS NULL OR NOT public.can_manage_bunyan_building(p_building_id) THEN
  RAISE EXCEPTION 'غير مسموح بتعديل حسابات هذه العمارة' USING ERRCODE='42501'; END IF;
 IF p_kind IS NULL OR p_action IS NULL OR p_kind NOT IN ('payment','expense') OR p_action NOT IN ('create','update','delete') OR p_request_id IS NULL THEN
  RAISE EXCEPTION 'طلب مالي غير صالح'; END IF;
 -- One lock order for every receipt/expense prevents lost updates across devices.
 SELECT * INTO b FROM public.buildings WHERE id=p_building_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'العمارة غير متاحة'; END IF;
 SELECT * INTO cached FROM private.financial_mutation_requests WHERE building_id=b.id AND request_id=p_request_id;
 IF FOUND THEN
  IF cached.actor_id<>actor OR cached.input IS DISTINCT FROM input THEN RAISE EXCEPTION 'أعد فتح النموذج بعد تغيير البيانات'; END IF;
  RETURN cached.result || jsonb_build_object('balance',b.balance);
 END IF;
 IF p_action<>'delete' THEN
  v_amount:=(p_values->>'amount')::numeric;
  IF v_amount IS NULL OR v_amount<=0 OR v_amount>9999999999.99 OR v_amount<>round(v_amount,2) THEN
   RAISE EXCEPTION 'اكتب مبلغًا موجبًا بحد أقصى رقمين عشريين'; END IF;
 END IF;
 IF p_kind='payment' THEN
  IF p_action<>'create' THEN
   SELECT * INTO old_payment FROM public.payments WHERE id=p_entry_id AND building_id=b.id FOR UPDATE;
   IF NOT FOUND OR old_payment.is_assessment OR old_payment.is_opening_entry THEN RAISE EXCEPTION 'الإيصال غير متاح أو سبق حذفه'; END IF;
   previous:=to_jsonb(old_payment);
   SELECT * INTO a FROM public.apartments WHERE id=old_payment.apartment_id AND building_id=b.id FOR UPDATE;
  ELSE
   SELECT * INTO a FROM public.apartments WHERE id=(p_values->>'apartmentId')::uuid AND building_id=b.id FOR UPDATE;
  END IF;
  IF a.id IS NULL THEN RAISE EXCEPTION 'الشقة غير متاحة'; END IF;
  IF p_action='delete' THEN
   DELETE FROM public.payments WHERE id=old_payment.id;
   delta:=-old_payment.amount;
  ELSE
   IF nullif(btrim(p_values->>'month'),'') IS NULL OR nullif(btrim(p_values->>'method'),'') IS NULL OR nullif(p_values->>'date','') IS NULL THEN
    RAISE EXCEPTION 'أكمل دورة السداد والتاريخ وطريقة الدفع'; END IF;
   IF p_action='create' THEN
    IF nullif(p_values->>'exceptionalChargeId','') IS NOT NULL THEN
     SELECT * INTO charge FROM public.payments WHERE id=(p_values->>'exceptionalChargeId')::uuid AND apartment_id=a.id AND building_id=b.id AND is_assessment AND NOT assessment_cancelled FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'التحصيل الاستثنائي غير متاح'; END IF;
    END IF;
    INSERT INTO public.payments(apartment_id,building_id,unit_number,resident_name,amount,payment_date,month,method,notes,receipt_number,recorded_by,payment_type,exceptional_charge_id,idempotency_key)
    VALUES(a.id,b.id,a.unit_number,a.resident_name,v_amount,(p_values->>'date')::date,
      CASE WHEN charge.id IS NULL THEN p_values->>'month' ELSE charge.month END,p_values->>'method',nullif(p_values->>'notes',''),nullif(p_values->>'receiptNumber',''),actor,
      CASE WHEN charge.id IS NULL THEN 'monthly' ELSE 'exceptional' END,charge.id,p_request_id::text) RETURNING * INTO saved_payment;
    delta:=v_amount;
   ELSE
    UPDATE public.payments SET amount=v_amount,payment_date=(p_values->>'date')::date,month=p_values->>'month',method=p_values->>'method',notes=nullif(p_values->>'notes',''),receipt_number=nullif(p_values->>'receiptNumber','') WHERE id=old_payment.id RETURNING * INTO saved_payment;
    delta:=v_amount-old_payment.amount;
   END IF;
   saved:=to_jsonb(saved_payment);
  END IF;
  a:=private.reconcile_apartment_ledger(b.id,a.id);
 ELSE
  IF p_action<>'create' THEN
   SELECT * INTO old_expense FROM public.expenses WHERE id=p_entry_id AND building_id=b.id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'المصروف غير متاح أو سبق حذفه'; END IF;
   previous:=to_jsonb(old_expense);
  END IF;
  IF p_action='delete' THEN DELETE FROM public.expenses WHERE id=old_expense.id; delta:=old_expense.amount;
  ELSE
   IF nullif(btrim(p_values->>'title'),'') IS NULL OR nullif(p_values->>'date','') IS NULL OR (p_values->>'category') NOT IN ('مصاعد','كهرباء','مياه ومضخات','نظافة','أمن وحراسة','صيانة عامة','أخرى') THEN RAISE EXCEPTION 'أكمل بيانات المصروف'; END IF;
   IF p_action='create' THEN
    INSERT INTO public.expenses(building_id,title,category,amount,expense_date,vendor,notes,receipt_url,approved_by)
    VALUES(b.id,p_values->>'title',p_values->>'category',v_amount,(p_values->>'date')::date,coalesce(p_values->>'vendor',''),nullif(p_values->>'notes',''),nullif(p_values->>'receiptUrl',''),actor) RETURNING * INTO saved_expense;
    delta:=-v_amount;
   ELSE
    UPDATE public.expenses SET title=p_values->>'title',category=p_values->>'category',amount=v_amount,expense_date=(p_values->>'date')::date,vendor=coalesce(p_values->>'vendor',''),notes=nullif(p_values->>'notes',''),receipt_url=nullif(p_values->>'receiptUrl','') WHERE id=old_expense.id RETURNING * INTO saved_expense;
    delta:=old_expense.amount-v_amount;
   END IF;
   saved:=to_jsonb(saved_expense);
  END IF;
 END IF;
 -- A genuine deficit remains visible; deleting a movement must restore the exact balance.
 UPDATE public.buildings SET balance=balance+delta,updated_at=now() WHERE id=b.id RETURNING * INTO b;
 result:=jsonb_build_object('entry',saved,'previous',previous,'apartment',CASE WHEN a.id IS NULL THEN NULL ELSE to_jsonb(a) END,'balance',b.balance);
 INSERT INTO private.financial_mutation_requests(building_id,request_id,actor_id,input,result) VALUES(b.id,p_request_id,actor,input,result);
 RETURN result;
END $$;

-- @statement

-- @statement
CREATE OR REPLACE FUNCTION public.get_building_financial_summary(p_building_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.profiles; b public.buildings; collected numeric; expenses numeric; history numeric; outstanding numeric;
 units jsonb; monthly jsonb; categories jsonb;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=app_auth.user_id();
 IF NOT FOUND OR actor.approved IS DISTINCT FROM true OR actor.disabled_at IS NOT NULL OR actor.role NOT IN ('tenant','owner','building_admin') OR
  (actor.role='building_admin' AND NOT public.can_manage_bunyan_building(p_building_id)) OR
  (actor.role IN ('tenant','owner') AND actor.building_id IS DISTINCT FROM p_building_id) THEN RAISE EXCEPTION 'غير مصرح بعرض تقرير هذه العمارة' USING errcode='42501'; END IF;
 SELECT * INTO b FROM public.buildings WHERE id=p_building_id;
 IF b.id IS NULL THEN RAISE EXCEPTION 'العمارة غير متاحة'; END IF;
 SELECT coalesce(sum(amount),0) INTO history FROM public.historical_monthly_allocations WHERE building_id=b.id;
 SELECT coalesce(sum(amount),0)+history+b.historical_exceptional_collections_total INTO collected FROM public.payments WHERE building_id=b.id AND NOT is_assessment AND NOT is_opening_entry;
 SELECT coalesce(sum(amount),0)+b.historical_expenses_total INTO expenses FROM public.expenses WHERE building_id=b.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('unit_number',t.unit_number,'total_paid',t.monthly_paid+t.exceptional_paid,
  'remaining',greatest(t.monthly_due-t.monthly_paid,0)+t.exceptional_remaining,
  'status',CASE WHEN t.monthly_due+t.exceptional_paid+t.exceptional_remaining>0 AND greatest(t.monthly_due-t.monthly_paid,0)+t.exceptional_remaining=0 THEN 'paid' WHEN t.monthly_paid+t.exceptional_paid>0 THEN 'partial' WHEN t.monthly_due>0 THEN 'overdue' ELSE 'pending' END
 ) ORDER BY t.unit_number),'[]'::jsonb),coalesce(sum(greatest(t.monthly_due-t.monthly_paid,0)+t.exceptional_remaining),0)
 INTO units,outstanding FROM private.apartment_ledger_totals(b.id) t WHERE actor.role='building_admin' OR t.apartment_id=actor.apartment_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('month',to_char(m.month_start,'YYYY-MM'),'income',m.income,'expenses',m.expenses) ORDER BY m.month_start),'[]'::jsonb)
 INTO monthly FROM (
  SELECT month_start,sum(income) AS income,sum(outflow) AS expenses FROM (
   SELECT date_trunc('month',payment_date)::date AS month_start,sum(amount) AS income,0::numeric AS outflow FROM public.payments
    WHERE building_id=b.id AND NOT is_assessment AND NOT is_opening_entry AND payment_date>=(date_trunc('month',timezone('Africa/Cairo',now()))-interval '11 months')::date GROUP BY 1
   UNION ALL SELECT date_trunc('month',expense_date)::date,0::numeric,sum(amount) FROM public.expenses
    WHERE building_id=b.id AND expense_date>=(date_trunc('month',timezone('Africa/Cairo',now()))-interval '11 months')::date GROUP BY 1
  ) movements GROUP BY month_start
 ) m;
 SELECT coalesce(jsonb_agg(jsonb_build_object('category',c.category,'amount',c.amount) ORDER BY c.amount DESC),'[]'::jsonb)
 INTO categories FROM (
  SELECT category,sum(amount) AS amount FROM (
   SELECT category,amount FROM public.expenses WHERE building_id=b.id
   UNION ALL SELECT 'مصروفات سابقة (إجمالي)',b.historical_expenses_total WHERE b.historical_expenses_total>0
  ) entries GROUP BY category
 ) c;
 RETURN jsonb_build_object('total_collected',collected,'total_expenses',expenses,'outstanding_amount',outstanding,'treasury_balance',b.balance,
  'monthly',monthly,'expense_categories',categories,'apartments',units,'historical_monthly_collections',history,
  'historical_exceptional_collections',b.historical_exceptional_collections_total,'historical_expenses',b.historical_expenses_total);
END $$;

-- @statement
NOTIFY pgrst,'reload schema';

-- @statement
-- Correct the numeric opening-adjustment reset and clear all financial ledgers.
-- Replacing this function does not reset any building until its manager confirms it.
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

-- @statement
CREATE OR REPLACE FUNCTION public.capture_app_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  item jsonb;
  bld uuid;
  apt uuid;
  target_user uuid;
  audience text := 'managers';
  kind text;
  heading text;
  message text;
  manager_page text;
  member_page text := 'home';
  event_key text;
begin
  if TG_OP='UPDATE' and (to_jsonb(new)-'updated_at')=(to_jsonb(old)-'updated_at') then return null; end if;
  if TG_OP='DELETE' then item:=to_jsonb(old); else item:=to_jsonb(new); end if;
  if TG_TABLE_NAME='payments' and (coalesce((item->>'is_assessment')::boolean,false) OR coalesce((item->>'is_opening_entry')::boolean,false)) then return null; end if;
  bld := (item->>'building_id')::uuid;
  apt := (item->>'apartment_id')::uuid;
  if bld is null or not exists(select 1 from public.buildings where id=bld) then return null; end if;
  kind:=TG_TABLE_NAME;
  case TG_TABLE_NAME
    when 'announcements' then
      if item->>'archived_at' is not null then return null; end if;
      audience:='all'; heading:=case when TG_OP='UPDATE' then 'تحديث إعلان: ' else 'إعلان: ' end || (item->>'title');
      message:=left(coalesce(item->>'content','إعلان جديد من إدارة العمارة'),180);
      manager_page:='image-studio'; member_page:='announcements';
    when 'maintenance_tickets' then
      audience:='apartment'; heading:=case when TG_OP='INSERT' then 'بلاغ صيانة جديد' else 'تحديث بلاغ الصيانة' end;
      message:=coalesce(item->>'title','بلاغ صيانة') || ' • ' || coalesce(item->>'status','جديد');
      manager_page:='resident'; member_page:='maintenance';
    when 'apartments' then
      if item->>'payment_status' <> 'overdue' or (to_jsonb(old)->>'payment_status') is not distinct from item->>'payment_status' then return null; end if;
      apt:=(item->>'id')::uuid; audience:='apartment'; heading:='تنبيه مستحقات الشقة';
      message:='توجد مستحقات متأخرة على الشقة '||coalesce(item->>'unit_number',''); manager_page:='collections'; member_page:='payments';
    when 'facility_bookings' then
      audience:='apartment'; heading:=case when TG_OP='INSERT' then 'طلب حجز مرفق' else 'تحديث طلب الحجز' end;
      message:=coalesce(item->>'facility','حجز مرفق') || ' • ' || coalesce(item->>'status','قيد المراجعة');
      manager_page:='resident'; member_page:='bookings';
    when 'payments' then
      audience:='apartment'; heading:=case TG_OP when 'DELETE' then 'حذف دفعة مسجلة' when 'UPDATE' then 'تعديل دفعة مسجلة' else 'تسجيل سداد جديد' end;
      message:='شقة ' || coalesce(item->>'unit_number','') || ' • ' || coalesce(item->>'amount','0') || ' ج.م';
      manager_page:='collections'; member_page:='payments';
    when 'expenses' then
      audience:='all';
      heading:=case TG_OP when 'DELETE' then 'حذف مصروف' when 'UPDATE' then 'تعديل مصروف' else 'مصروف جديد' end;
      message:=coalesce(item->>'title','مصروف') || ' • ' || coalesce(item->>'amount','0') || ' ج.م'; manager_page:='expenses';
    when 'building_join_requests' then
      target_user:=(item->>'user_id')::uuid; audience:='user';
      heading:=case when item->>'status'='pending' then 'طلب انضمام جديد' else 'تحديث طلب الانضمام' end;
      message:=coalesce(item->>'full_name','طلب انضمام') || ' • ' || case item->>'status' when 'approved' then 'تمت الموافقة' when 'rejected' then 'تم الرفض' else 'قيد المراجعة' end;
      manager_page:='approvals';
    when 'building_polls' then
      if TG_OP='INSERT' and (item->>'starts_at')::timestamptz > now() then return null; end if;
      audience:='all'; heading:=case when item->>'status'='closed' then 'انتهاء استطلاع رأي' else 'استطلاع رأي' end;
      message:=coalesce(item->>'question','استطلاع رأي العمارة'); manager_page:='polls'; member_page:='polls';
    when 'building_treasury_settings_audit' then
      heading:='تحديث الرصيد ووديعة الصيانة'; message:='تم حفظ تعديل إعدادات خزينة العمارة'; manager_page:='treasury-settings';
    when 'app_settings' then
      heading:='تحديث إعدادات العمارة'; message:='تم حفظ إعدادات العمارة والتحصيل'; manager_page:='app-settings';
    else return null;
  end case;
  if TG_OP='INSERT' then event_key:=TG_TABLE_NAME || ':' || coalesce(item->>'id',bld::text||':'||(item->>'setting_key')) || ':initial';
  else event_key:=TG_TABLE_NAME || ':' || coalesce(item->>'id',bld::text||':'||(item->>'setting_key')) || ':' || TG_OP || ':' || txid_current()::text || ':' || md5(item::text); end if;
  -- Building expenses reach all members; payments and maintenance stay apartment-scoped.
  insert into public.app_notifications(recipient_id,building_id,category,title,body,manager_target,member_target,entity_id,source_key)
  select p.id,bld,kind,heading,message,manager_page,member_page,(item->>'id')::uuid,event_key
  from public.profiles p where p.building_id=bld and p.approved and p.disabled_at is null
    and (p.role='building_admin' or (p.role in ('owner','tenant') and
      (audience='all' or (audience='apartment' and p.apartment_id=apt) or (audience='user' and p.id=target_user))))
  on conflict(recipient_id,source_key) do nothing;
  return null;
end;
$function$;


-- @statement
CREATE OR REPLACE FUNCTION public.complete_guided_building_setup(p_request_id uuid,p_details jsonb,p_history jsonb,p_building_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.profiles; b public.buildings; previous private.guided_building_setups; input jsonb;
 row_item jsonb; a public.apartments; charge_id uuid; collection_result jsonb; collection_id uuid; ids uuid[];
 fee numeric; cash numeric; reserve numeric; expenses numeric; monthly_paid numeric:=0; exceptional_paid numeric:=0;
 paid numeric; remaining numeric; amount numeric; per_unit numeric; start_m date; end_m date; m date;
 months integer; mode text; seen text[]:=ARRAY[]::text[]; unit_count integer; allocation_count integer:=0; reconcile_unit_id uuid;
BEGIN
 IF app_auth.user_id() IS NULL THEN RAISE EXCEPTION 'سجل الدخول أولًا' USING errcode='42501'; END IF;
 SELECT * INTO actor FROM public.profiles WHERE id=app_auth.user_id() FOR UPDATE;
 IF actor.id IS NULL OR actor.disabled_at IS NOT NULL THEN RAISE EXCEPTION 'غير مصرح' USING errcode='42501'; END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_details) IS DISTINCT FROM 'object' OR jsonb_typeof(p_history) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'راجع بيانات التسجيل'; END IF;
 input:=jsonb_build_object('details',p_details,'history',p_history,'building',p_building_id);
 SELECT * INTO previous FROM private.guided_building_setups WHERE request_id=p_request_id;
 IF FOUND THEN
  IF previous.actor_id<>actor.id OR NOT public.can_manage_bunyan_building(previous.building_id) OR previous.input<>input THEN RAISE EXCEPTION 'طلب مختلف بنفس رقم الحفظ'; END IF;
  RETURN (SELECT to_jsonb(saved) FROM public.buildings saved WHERE saved.id=previous.building_id);
 END IF;
 mode:=p_history->>'mode';fee:=(p_details->>'monthlyTarget')::numeric;
 unit_count:=(p_details->>'totalUnits')::integer;cash:=(p_history->>'cash')::numeric;reserve:=(p_history->>'reserve')::numeric;
 expenses:=coalesce((p_history->>'expenses')::numeric,0);per_unit:=coalesce((p_history->>'exceptionalPerUnit')::numeric,0);
 IF mode IS NULL OR mode NOT IN ('new','transfer') OR unit_count IS NULL OR unit_count NOT BETWEEN 1 AND 10000 OR fee IS NULL OR fee<=0 OR fee>9999999999.99 OR fee<>round(fee,2)
  OR cash IS NULL OR cash NOT BETWEEN 0 AND 9999999999.99 OR cash<>round(cash,2) OR reserve IS NULL OR reserve NOT BETWEEN 0 AND cash OR reserve<>round(reserve,2)
  OR expenses NOT BETWEEN 0 AND 9999999999.99 OR expenses<>round(expenses,2) OR per_unit NOT BETWEEN 0 AND 9999999999.99 OR per_unit<>round(per_unit,2)
  OR jsonb_typeof(p_history->'units') IS DISTINCT FROM 'array' OR jsonb_array_length(p_history->'units')<>unit_count THEN RAISE EXCEPTION 'راجع الأعداد والمبالغ وخانات الشقق'; END IF;
 IF p_history->>'startMonth' !~ '^\d{4}-(0[1-9]|1[0-2])$' OR p_history->>'endMonth' !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'راجع فترة الحسابات'; END IF;
 start_m:=((p_history->>'startMonth')||'-01')::date;end_m:=((p_history->>'endMonth')||'-01')::date;
 IF start_m IS NULL OR end_m IS NULL OR start_m<date '1900-01-01' OR start_m>end_m OR end_m>date_trunc('month',timezone('Africa/Cairo',now()))::date THEN RAISE EXCEPTION 'راجع فترة الحسابات السابقة'; END IF;
 months:=(extract(year from end_m)::integer-extract(year from start_m)::integer)*12+extract(month from end_m)::integer-extract(month from start_m)::integer+1;
 IF mode='new' AND (per_unit<>0 OR expenses<>0 OR start_m<>date_trunc('month',timezone('Africa/Cairo',now()))::date) THEN RAISE EXCEPTION 'العمارة الجديدة تبدأ من الشهر الحالي دون حسابات سابقة'; END IF;
 IF p_building_id IS NULL THEN
  IF actor.building_id IS NOT NULL THEN RAISE EXCEPTION 'حسابك مرتبط بعمارة بالفعل'; END IF;
  IF actor.role='building_admin' AND actor.approved THEN
   b:=jsonb_populate_record(NULL::public.buildings,public.create_manager_building(p_details));
  ELSE
   p_building_id:=public.create_building_for_current_user(p_details->>'name',coalesce(p_details->>'address',''),unit_count,(p_details->>'totalFloors')::integer);
   SELECT * INTO b FROM public.buildings WHERE id=p_building_id;
  END IF;
 ELSE
  IF NOT public.can_manage_bunyan_building(p_building_id) THEN RAISE EXCEPTION 'غير مصرح بإدارة هذه العمارة' USING errcode='42501'; END IF;
  SELECT * INTO b FROM public.buildings WHERE id=p_building_id FOR UPDATE;
  IF b.id IS NULL OR b.balance<>0 OR coalesce(b.opening_balance,0)<>0 OR b.historical_adjustment_applied<>0 OR b.historical_monthly_collections_total<>0 OR b.historical_exceptional_collections_total<>0 OR b.historical_expenses_total<>0
   OR EXISTS(SELECT FROM public.payments WHERE building_id=b.id) OR EXISTS(SELECT FROM public.expenses WHERE building_id=b.id) OR EXISTS(SELECT FROM public.historical_monthly_allocations WHERE building_id=b.id)
   OR b.opening_cash_includes_history THEN RAISE EXCEPTION 'الحسابات مسجلة بالفعل. عدلها من بيانات العمارة؛ النقل متاح للعمارات بدون سجلات مالية فقط'; END IF;
 END IF;
 IF (SELECT count(*) FROM public.apartments WHERE building_id=b.id)>unit_count THEN RAISE EXCEPTION 'عدد الشقق لا يطابق بيانات العمارة'; END IF;
 PERFORM public.update_manager_building(b.id,p_details||'{"applyMonthlyFeeToAll":true,"reserveFund":0}');
 UPDATE public.buildings SET opening_cash_includes_history=true,collection_start_month=start_m WHERE id=b.id;
 IF per_unit>0 THEN
  IF length(btrim(coalesce(p_history->>'exceptionalTitle','')))<3 THEN RAISE EXCEPTION 'اكتب اسم التحصيل الاستثنائي'; END IF;
  SELECT array_agg(id ORDER BY id) INTO ids FROM public.apartments WHERE building_id=b.id;
  collection_result:=public.create_exceptional_collection(b.id,p_history->>'exceptionalTitle','حسابات سابقة عند بدء استخدام التطبيق','per_apartment',NULL,per_unit,ids,false);
  collection_id:=coalesce((collection_result->>'collection_id')::uuid,(collection_result->>'id')::uuid);
  IF collection_id IS NULL THEN RAISE EXCEPTION 'تعذر تأكيد بند التحصيل الاستثنائي'; END IF;
 END IF;
 FOR row_item IN SELECT value FROM jsonb_array_elements(p_history->'units') LOOP
  IF row_item->>'unitNumber'=ANY(seen) THEN RAISE EXCEPTION 'رقم شقة مكرر'; END IF;
  seen:=array_append(seen,row_item->>'unitNumber');
  SELECT * INTO a FROM public.apartments WHERE building_id=b.id AND unit_number=row_item->>'unitNumber' FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'رقم الشقة غير موجود'; END IF;
  UPDATE public.apartments SET resident_name=coalesce(nullif(btrim(row_item->>'residentName'),''),resident_name) WHERE id=a.id;
  paid:=coalesce((row_item->>'monthlyPaid')::numeric,0);amount:=coalesce((row_item->>'exceptionalPaid')::numeric,0);
  IF paid NOT BETWEEN 0 AND fee*months OR paid<>round(paid,2) OR amount NOT BETWEEN 0 AND per_unit OR amount<>round(amount,2) OR (mode='new' AND (paid<>0 OR amount<>0)) THEN RAISE EXCEPTION 'مدفوع الشقة أكبر من المطلوب أو غير صحيح'; END IF;
  allocation_count:=allocation_count+ceil(paid/fee)::integer;
  IF allocation_count>1500 THEN RAISE EXCEPTION 'الفترة والمدفوعات تتجاوز الحد المتاح للتوزيع (١٥٠٠ شهر للشقق)'; END IF;
  monthly_paid:=monthly_paid+paid;exceptional_paid:=exceptional_paid+amount;remaining:=paid;m:=start_m;
  WHILE remaining>0 LOOP
   INSERT INTO public.historical_monthly_allocations(building_id,apartment_id,month,amount) VALUES(b.id,a.id,m,least(fee,remaining));
   remaining:=remaining-least(fee,remaining);m:=(m+interval '1 month')::date;
  END LOOP;
  IF amount>0 THEN
   SELECT id INTO charge_id FROM public.payments WHERE building_id=b.id AND apartment_id=a.id AND exceptional_collection_id=collection_id AND is_assessment;
   INSERT INTO public.payments(building_id,apartment_id,unit_number,resident_name,amount,payment_date,month,method,notes,payment_type,exceptional_charge_id,is_opening_entry,recorded_by)
   VALUES(b.id,a.id,a.unit_number,a.resident_name,amount,end_m,to_char(end_m,'YYYY-MM'),'رصيد افتتاحي سابق','سداد استثنائي سابق عند نقل الحسابات','exceptional',charge_id,true,actor.id);
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.historical_monthly_allocations WHERE building_id=b.id)>1500 THEN RAISE EXCEPTION 'الفترة المدخلة تتجاوز الحد المتاح للتوزيع (١٥٠٠ شهر للشقق)'; END IF;
 UPDATE public.buildings SET historical_monthly_collections_total=monthly_paid,historical_exceptional_collections_total=exceptional_paid,historical_expenses_total=expenses WHERE id=b.id;
 UPDATE public.buildings SET balance=cash,opening_balance=cash,reserve_fund=reserve WHERE id=b.id;
 FOR reconcile_unit_id IN SELECT id FROM public.apartments WHERE building_id=b.id ORDER BY id LOOP
  PERFORM private.reconcile_apartment_ledger(b.id,reconcile_unit_id);
 END LOOP;
 INSERT INTO private.guided_building_setups(request_id,actor_id,building_id,input) VALUES(p_request_id,actor.id,b.id,input);
 RETURN (SELECT to_jsonb(saved) FROM public.buildings saved WHERE saved.id=b.id);
END $$;
-- @statement
REVOKE ALL ON FUNCTION public.complete_guided_building_setup(uuid,jsonb,jsonb,uuid) FROM PUBLIC,anon;
-- @statement
GRANT EXECUTE ON FUNCTION public.complete_guided_building_setup(uuid,jsonb,jsonb,uuid) TO authenticated;
-- @statement
NOTIFY pgrst,'reload schema';
