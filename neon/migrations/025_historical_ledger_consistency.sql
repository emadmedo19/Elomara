-- @statement
-- Keep receipt cash movements separate from opening-balance allocations.
-- Defining these functions does not rewrite any existing balance or allocation.
CREATE OR REPLACE FUNCTION private.reconcile_apartment_ledger(p_building_id uuid,p_apartment_id uuid)
RETURNS public.apartments LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.apartments; start_m date; monthly_paid numeric; monthly_due numeric; historical_months integer:=0;
 exceptional_paid numeric; exceptional_remaining numeric; remaining numeric;
BEGIN
 SELECT collection_start_month INTO start_m FROM public.buildings WHERE id=p_building_id;
 SELECT * INTO a FROM public.apartments WHERE id=p_apartment_id AND building_id=p_building_id FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'الشقة غير متاحة'; END IF;
 IF start_m IS NOT NULL THEN
  historical_months:=greatest(0,(extract(year from timezone('Africa/Cairo',now()))::integer-extract(year from start_m)::integer)*12+extract(month from timezone('Africa/Cairo',now()))::integer-extract(month from start_m)::integer+1);
 END IF;
 SELECT t.monthly_paid,t.monthly_due,t.exceptional_paid,t.exceptional_remaining INTO monthly_paid,monthly_due,exceptional_paid,exceptional_remaining
 FROM private.apartment_ledger_totals(p_building_id) t WHERE t.apartment_id=a.id;
 remaining:=greatest(monthly_due-monthly_paid,0)+exceptional_remaining;
 UPDATE public.apartments SET paid_amount=monthly_paid+exceptional_paid,credit_balance=greatest(monthly_paid-monthly_due,0),
  payment_status=CASE WHEN monthly_due+exceptional_paid+exceptional_remaining>0 AND remaining=0 THEN 'paid' WHEN monthly_paid+exceptional_paid>0 THEN 'pending' WHEN greatest(coalesce(a.overdue_months,0),historical_months)>1 THEN 'overdue' ELSE 'pending' END,
  last_payment_date=(SELECT max(paid_on) FROM (
   SELECT payment_date AS paid_on FROM public.payments WHERE apartment_id=a.id AND NOT is_assessment AND payment_type<>'exceptional'
   UNION ALL SELECT month FROM public.historical_monthly_allocations WHERE apartment_id=a.id AND building_id=p_building_id
  ) dates),updated_at=now() WHERE id=a.id RETURNING * INTO a;
 RETURN a;
END $$;
-- @statement
REVOKE ALL ON FUNCTION private.reconcile_apartment_ledger(uuid,uuid) FROM PUBLIC,anon,authenticated;
-- @statement
CREATE OR REPLACE FUNCTION public.save_building_historical_settings_v3(p_building_id uuid,p_start_month text,p_expenses numeric,p_exceptional_collections numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.profiles; b public.buildings; start_m date; unit_id uuid;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=app_auth.user_id();
 IF NOT FOUND OR actor.role IS DISTINCT FROM 'building_admin' OR actor.approved IS DISTINCT FROM true OR actor.disabled_at IS NOT NULL OR actor.building_id IS DISTINCT FROM p_building_id THEN RAISE EXCEPTION 'غير مصرح بتعديل هذه العمارة' USING errcode='42501'; END IF;
 SELECT * INTO b FROM public.buildings WHERE id=p_building_id FOR UPDATE;
 IF b.id IS NULL THEN RAISE EXCEPTION 'العمارة غير متاحة'; END IF;
 IF p_expenses IS NULL OR p_expenses<0 OR p_expenses>999999999999.99 OR p_expenses='NaN'::numeric OR p_expenses<>round(p_expenses,2)
  OR p_exceptional_collections IS NULL OR p_exceptional_collections<0 OR p_exceptional_collections>999999999999.99 OR p_exceptional_collections='NaN'::numeric OR p_exceptional_collections<>round(p_exceptional_collections,2) THEN RAISE EXCEPTION 'اكتب الأرصدة السابقة بحد أقصى رقمين عشريين ودون قيم سالبة'; END IF;
 IF coalesce(p_start_month,'')<>'' THEN
  IF p_start_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' OR p_start_month<'1900-01' OR p_start_month>to_char(timezone('Africa/Cairo',now()),'YYYY-MM') THEN RAISE EXCEPTION 'حدد شهر بداية صحيحًا لا يتجاوز الشهر الحالي'; END IF;
  start_m:=(p_start_month||'-01')::date;
 END IF;
 IF EXISTS(SELECT FROM public.historical_monthly_allocations WHERE building_id=b.id AND (start_m IS NULL OR month<start_m)) THEN RAISE EXCEPTION 'امسح التوزيع السابق واحفظه أولًا قبل اختيار بداية تستبعد شهورًا موزعة'; END IF;
 UPDATE public.buildings SET collection_start_month=start_m,historical_expenses_total=p_expenses,historical_exceptional_collections_total=p_exceptional_collections WHERE id=b.id;
 FOR unit_id IN SELECT id FROM public.apartments WHERE building_id=b.id ORDER BY id LOOP
  PERFORM private.reconcile_apartment_ledger(b.id,unit_id);
 END LOOP;
END $$;
-- @statement
CREATE OR REPLACE FUNCTION public.save_historical_monthly_allocations(p_building_id uuid,p_allocations jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.profiles; row_item jsonb; apt uuid; m date; v numeric; total numeric:=0; fee numeric; start_m date; seen text[]:=ARRAY[]::text[]; k text; unit_id uuid;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=app_auth.user_id();
 IF NOT FOUND OR actor.role IS DISTINCT FROM 'building_admin' OR actor.approved IS DISTINCT FROM true OR actor.disabled_at IS NOT NULL OR actor.building_id IS DISTINCT FROM p_building_id THEN RAISE EXCEPTION 'غير مصرح' USING errcode='42501'; END IF;
 IF jsonb_typeof(p_allocations) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'توزيع غير صالح'; END IF;
 IF jsonb_array_length(p_allocations)>1500 THEN RAISE EXCEPTION 'الحد المتاح ١٥٠٠ شهر موزع'; END IF;
 SELECT collection_start_month INTO start_m FROM public.buildings WHERE id=p_building_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'العمارة غير متاحة'; END IF;
 IF start_m IS NULL AND jsonb_array_length(p_allocations)>0 THEN RAISE EXCEPTION 'حدد شهر بداية التحصيل أولًا'; END IF;
 FOR row_item IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
  apt:=(row_item->>'apartmentId')::uuid; m:=(row_item->>'month')::date; v:=(row_item->>'amount')::numeric;
  SELECT monthly_fee INTO fee FROM public.apartments WHERE id=apt AND building_id=p_building_id;
  IF fee IS NULL OR fee<=0 OR v IS NULL OR v<=0 OR v>fee OR v='NaN'::numeric OR v<>round(v,2) OR m IS NULL OR m<start_m OR m>date_trunc('month',timezone('Africa/Cairo',now()))::date OR extract(day from m)<>1 THEN RAISE EXCEPTION 'راجع الشقة أو الشهر أو المبلغ؛ الحد الأقصى رقمين عشريين'; END IF;
  k:=apt::text||':'||m::text;
  IF k=ANY(seen) THEN RAISE EXCEPTION 'تكرار شهر لنفس الشقة'; END IF;
  seen:=array_append(seen,k); total:=total+v;
 END LOOP;
 DELETE FROM public.historical_monthly_allocations WHERE building_id=p_building_id;
 INSERT INTO public.historical_monthly_allocations(building_id,apartment_id,month,amount)
 SELECT p_building_id,(value->>'apartmentId')::uuid,(value->>'month')::date,(value->>'amount')::numeric FROM jsonb_array_elements(p_allocations);
 UPDATE public.buildings SET historical_monthly_collections_total=total WHERE id=p_building_id;
 FOR unit_id IN SELECT id FROM public.apartments WHERE building_id=p_building_id ORDER BY id LOOP
  PERFORM private.reconcile_apartment_ledger(p_building_id,unit_id);
 END LOOP;
END $$;
-- @statement
CREATE OR REPLACE FUNCTION private.prevent_unreconciled_historical_unit_deletion() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT FROM public.historical_monthly_allocations WHERE apartment_id=OLD.id) THEN RAISE EXCEPTION 'امسح توزيع الرصيد السابق للشقة واحفظه قبل حذفها'; END IF;
 RETURN OLD;
END $$;
-- @statement
REVOKE ALL ON FUNCTION private.prevent_unreconciled_historical_unit_deletion() FROM PUBLIC,anon,authenticated;
-- @statement
CREATE OR REPLACE TRIGGER historical_unit_deletion_guard BEFORE DELETE ON public.apartments FOR EACH ROW EXECUTE FUNCTION private.prevent_unreconciled_historical_unit_deletion();
-- @statement
DROP POLICY IF EXISTS historical_monthly_read ON public.historical_monthly_allocations;
-- @statement
CREATE POLICY historical_monthly_read ON public.historical_monthly_allocations FOR SELECT TO authenticated USING (
 public.can_manage_bunyan_building(building_id) OR EXISTS(
  SELECT 1 FROM public.profiles p WHERE p.id=app_auth.user_id() AND p.approved=true AND p.disabled_at IS NULL AND p.building_id=historical_monthly_allocations.building_id AND p.apartment_id=historical_monthly_allocations.apartment_id
 )
);

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
   IF NOT FOUND OR old_payment.is_assessment THEN RAISE EXCEPTION 'الإيصال غير متاح أو سبق حذفه'; END IF;
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
CREATE OR REPLACE FUNCTION private.apartment_ledger_totals(p_building_id uuid)
RETURNS TABLE(apartment_id uuid,unit_number text,monthly_due numeric,monthly_paid numeric,exceptional_paid numeric,exceptional_remaining numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT a.id,a.unit_number,a.monthly_fee*greatest(coalesce(a.overdue_months,0),1,
  (extract(year from timezone('Africa/Cairo',now()))::integer-extract(year from b.collection_start_month)::integer)*12+extract(month from timezone('Africa/Cairo',now()))::integer-extract(month from b.collection_start_month)::integer+1),
 coalesce(p.paid,0),coalesce(e.paid,0),coalesce(e.remaining,0)
 FROM public.apartments a JOIN public.buildings b ON b.id=a.building_id
 LEFT JOIN (
  SELECT row.apartment_id,sum(row.amount) AS paid FROM (
   SELECT apartment_id,amount FROM public.payments WHERE building_id=p_building_id AND NOT is_assessment AND payment_type<>'exceptional'
   UNION ALL SELECT apartment_id,amount FROM public.historical_monthly_allocations WHERE building_id=p_building_id
  ) row GROUP BY row.apartment_id
 ) p ON p.apartment_id=a.id
 LEFT JOIN LATERAL (
  SELECT coalesce(sum(r.paid),0) AS paid,coalesce(sum(CASE WHEN c.assessment_cancelled THEN 0 ELSE greatest(c.amount-r.paid,0) END),0) AS remaining
  FROM public.payments c CROSS JOIN LATERAL(
   SELECT coalesce(sum(amount),0) AS paid FROM public.payments WHERE exceptional_charge_id=c.id AND NOT is_assessment
  ) r WHERE c.apartment_id=a.id AND c.is_assessment
 ) e ON true WHERE a.building_id=p_building_id
$$;
-- @statement
REVOKE ALL ON FUNCTION private.apartment_ledger_totals(uuid) FROM PUBLIC,anon,authenticated;
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
 SELECT coalesce(sum(amount),0)+history+b.historical_exceptional_collections_total INTO collected FROM public.payments WHERE building_id=b.id AND NOT is_assessment;
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
    WHERE building_id=b.id AND NOT is_assessment AND payment_date>=(date_trunc('month',timezone('Africa/Cairo',now()))-interval '11 months')::date GROUP BY 1
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
