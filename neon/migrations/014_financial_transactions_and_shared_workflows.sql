-- Atomic Neon financial writes; existing records and opening balances are preserved.
CREATE TABLE IF NOT EXISTS public.financial_audit_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
 entity_type text NOT NULL CHECK(entity_type IN ('payment','expense')), entity_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('create','update','delete')), apartment_id uuid,
 unit_number text NOT NULL DEFAULT '', performed_by uuid, performed_by_name text NOT NULL,
 previous_data jsonb, new_data jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS financial_audit_building_time ON public.financial_audit_log(building_id,created_at DESC);
ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_audit_manager_read ON public.financial_audit_log;
CREATE POLICY financial_audit_manager_read ON public.financial_audit_log FOR SELECT TO authenticated
 USING(public.can_manage_bunyan_building(building_id));
REVOKE ALL ON public.financial_audit_log FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.financial_audit_log TO authenticated;

CREATE TABLE IF NOT EXISTS private.financial_mutation_requests (
 building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE, request_id uuid NOT NULL,
 actor_id uuid NOT NULL, input jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(building_id,request_id)
);
REVOKE ALL ON private.financial_mutation_requests FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.capture_financial_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE before_row jsonb; after_row jsonb; item jsonb; actor uuid:=app_auth.user_id(); actor_name text;
BEGIN
 IF TG_OP<>'INSERT' THEN before_row:=to_jsonb(OLD)-'receipt_url'; END IF;
 IF TG_OP<>'DELETE' THEN after_row:=to_jsonb(NEW)-'receipt_url'; END IF;
 item:=coalesce(after_row,before_row);
 -- Cascading account/building removals must not recreate financial history for a removed building.
 IF NOT EXISTS(SELECT FROM public.buildings WHERE id=(item->>'building_id')::uuid) THEN RETURN NULL; END IF;
 SELECT full_name INTO actor_name FROM public.profiles WHERE id=actor;
 INSERT INTO public.financial_audit_log(building_id,entity_type,entity_id,action,apartment_id,unit_number,performed_by,performed_by_name,previous_data,new_data)
 VALUES((item->>'building_id')::uuid,CASE WHEN TG_TABLE_NAME='payments' THEN 'payment' ELSE 'expense' END,(item->>'id')::uuid,
 CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'update' ELSE 'delete' END,
 (item->>'apartment_id')::uuid,coalesce(item->>'unit_number',item->>'title',''),actor,coalesce(nullif(actor_name,''),'إدارة العمارة'),before_row,after_row);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.capture_financial_audit() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE TRIGGER financial_payment_audit AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.capture_financial_audit();
CREATE OR REPLACE TRIGGER financial_expense_audit AFTER INSERT OR UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION private.capture_financial_audit();

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
  SELECT coalesce(sum(p.amount),0) INTO monthly_paid FROM public.payments p WHERE p.apartment_id=a.id AND NOT p.is_assessment AND p.payment_type<>'exceptional';
  SELECT coalesce(sum(s.paid),0),coalesce(sum(greatest(CASE WHEN c.assessment_cancelled THEN 0 ELSE c.amount-s.paid END,0)),0)
  INTO exceptional_paid,exceptional_remaining FROM public.payments c CROSS JOIN LATERAL(
   SELECT coalesce(sum(r.amount),0) AS paid FROM public.payments r WHERE r.exceptional_charge_id=c.id AND NOT r.is_assessment
  ) s WHERE c.apartment_id=a.id AND c.is_assessment;
  monthly_due:=a.monthly_fee*greatest(coalesce(a.overdue_months,0),1);
  remaining:=greatest(monthly_due-monthly_paid,0)+exceptional_remaining;
  -- overdue_months is the persisted basis of dues. Never clear it after receiving cash.
  UPDATE public.apartments SET paid_amount=monthly_paid+exceptional_paid,credit_balance=greatest(monthly_paid-monthly_due,0),
   payment_status=CASE WHEN monthly_due+exceptional_paid+exceptional_remaining>0 AND remaining=0 THEN 'paid' WHEN monthly_paid+exceptional_paid>0 THEN 'pending' WHEN overdue_months>0 THEN 'overdue' ELSE 'pending' END,
   last_payment_date=(SELECT max(payment_date) FROM public.payments WHERE apartment_id=a.id AND NOT is_assessment AND payment_type<>'exceptional'),updated_at=now()
   WHERE id=a.id RETURNING * INTO a;
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
REVOKE ALL ON FUNCTION public.mutate_financial_entry(text,text,uuid,uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mutate_financial_entry(text,text,uuid,uuid,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';

ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS manager_note text NOT NULL DEFAULT '';
ALTER TABLE public.facility_bookings ADD COLUMN IF NOT EXISTS manager_note text NOT NULL DEFAULT '';
ALTER TABLE public.facility_bookings ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.facility_bookings ALTER COLUMN updated_at SET DEFAULT now();
CREATE OR REPLACE FUNCTION public.update_service_request(p_kind text,p_id uuid,p_building_id uuid,p_status text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF app_auth.user_id() IS NULL OR NOT public.can_manage_bunyan_building(p_building_id) THEN RAISE EXCEPTION 'غير مسموح بتعديل هذا الطلب' USING ERRCODE='42501'; END IF;
 IF length(coalesce(p_note,''))>1000 THEN RAISE EXCEPTION 'الملاحظة طويلة؛ الحد الأقصى 1000 حرف'; END IF;
 IF p_kind='ticket' AND p_status IN ('جديد','قيد التنفيذ','مكتمل') THEN
  UPDATE public.maintenance_tickets SET status=p_status,manager_note=coalesce(p_note,''),updated_at=now() WHERE id=p_id AND building_id=p_building_id RETURNING to_jsonb(maintenance_tickets.*) INTO result;
 ELSIF p_kind='booking' AND p_status IN ('قيد المراجعة','مؤكد','ملغي') THEN
  UPDATE public.facility_bookings SET status=p_status,manager_note=coalesce(p_note,''),updated_at=now() WHERE id=p_id AND building_id=p_building_id RETURNING to_jsonb(facility_bookings.*) INTO result;
 ELSE RAISE EXCEPTION 'حالة الطلب غير صالحة'; END IF;
 IF result IS NULL THEN RAISE EXCEPTION 'الطلب غير متاح. حدّث البيانات'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.update_service_request(text,uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_service_request(text,uuid,uuid,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
