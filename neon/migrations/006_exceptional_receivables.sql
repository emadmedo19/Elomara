-- Assessments are receivables; only actual receipts enter treasury.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS is_assessment boolean NOT NULL DEFAULT false;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS exceptional_charge_id uuid REFERENCES public.payments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS payments_exceptional_charge_idx ON public.payments(exceptional_charge_id);
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
  if TG_TABLE_NAME='payments' and coalesce((item->>'is_assessment')::boolean,false) then return null; end if;
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

-- Reclassify only the exact automatic rows emitted in the collection transaction.
-- Keep their original IDs/amounts for audit. Real receipts remain unchanged.
DO $$
DECLARE entry record;
BEGIN
 FOR entry IN
  SELECT p.id,p.building_id,p.amount FROM public.payments p
  JOIN public.exceptional_collections c ON c.building_id=p.building_id
   AND p.apartment_id=ANY(c.target_apartment_ids) AND p.recorded_at=c.created_at
   AND p.recorded_by=c.created_by
   AND p.notes=btrim(c.title)||CASE WHEN coalesce(c.description,'')='' THEN '' ELSE ' - '||c.description END
  WHERE p.payment_type='exceptional' AND p.method='تحصيل استثنائي'
   AND p.month='تحصيل استثنائي' AND p.receipt_number IS NULL AND NOT p.is_assessment
 LOOP
  UPDATE public.payments SET is_assessment=true WHERE id=entry.id;
  UPDATE public.buildings SET balance=balance-entry.amount WHERE id=entry.building_id;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.create_exceptional_collection(p_building_id uuid, p_title text, p_description text, p_amount_mode text, p_total_amount numeric, p_per_apartment_amount numeric, p_target_apartment_ids uuid[], p_notify_residents boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := app_auth.user_id();
  target_count integer;
  expected_total numeric(12,2);
  amount_each numeric(12,2);
  inserted_id uuid;
  apt record;
  inserted_total numeric(12,2) := 0;
  payment_month text := 'تحصيل استثنائي';
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_bunyan_building(p_building_id) then raise exception 'Building admin permission required'; end if;
  if length(btrim(coalesce(p_title, ''))) < 3 then raise exception 'Collection title is required'; end if;
  if p_amount_mode not in ('total', 'per_apartment') then raise exception 'Invalid amount mode'; end if;
  if coalesce(array_length(p_target_apartment_ids, 1), 0) = 0 then raise exception 'Select at least one apartment'; end if;

  select count(*) into target_count
  from public.apartments a
  where a.building_id = p_building_id and a.id = any(p_target_apartment_ids);
  if target_count <> cardinality(p_target_apartment_ids) then raise exception 'One or more apartments do not belong to this building'; end if;

  if p_amount_mode = 'total' then
    if coalesce(p_total_amount, 0) <= 0 then raise exception 'Total amount must be positive'; end if;
    expected_total := round(p_total_amount, 2);
    if expected_total < target_count * 0.01 then raise exception 'Total must cover at least one cent per apartment'; end if;
    amount_each := trunc(expected_total / target_count, 2);
  else
    if coalesce(p_per_apartment_amount, 0) <= 0 then raise exception 'Per-apartment amount must be positive'; end if;
    amount_each := round(p_per_apartment_amount, 2);
    expected_total := amount_each * target_count;
  end if;

  insert into public.exceptional_collections (
    building_id, title, description, amount_mode, total_amount, per_apartment_amount,
    target_apartment_ids, notify_residents, created_by
  ) values (
    p_building_id, btrim(p_title), coalesce(p_description, ''), p_amount_mode,
    case when p_amount_mode = 'total' then expected_total else null end,
    case when p_amount_mode = 'per_apartment' then amount_each else null end,
    p_target_apartment_ids, coalesce(p_notify_residents, true), actor
  ) returning id into inserted_id;

  for apt in
    select a.id, a.unit_number, a.resident_name
    from public.apartments a
    where a.building_id = p_building_id and a.id = any(p_target_apartment_ids)
    order by a.unit_number
  loop
    -- Put any rounding remainder on the final apartment so ledger total matches exactly.
    declare line_amount numeric(12,2);
    begin
      if p_amount_mode = 'total' and apt.id = (
        select a2.id from public.apartments a2
        where a2.building_id = p_building_id and a2.id = any(p_target_apartment_ids)
        order by a2.unit_number desc limit 1
      ) then
        line_amount := expected_total - inserted_total;
      else
        line_amount := amount_each;
      end if;
      insert into public.payments (
        apartment_id, building_id, unit_number, resident_name, amount,
        payment_date, month, method, notes, recorded_by, payment_type, is_assessment
      ) values (
        apt.id, p_building_id, apt.unit_number, coalesce(apt.resident_name, ''),
        line_amount, current_date, payment_month, 'تحصيل استثنائي',
        btrim(p_title) || case when coalesce(p_description, '') = '' then '' else ' - ' || p_description end,
        actor, 'exceptional', true
      );
      inserted_total := inserted_total + line_amount;
    end;
  end loop;


  return jsonb_build_object('collection_id', inserted_id, 'total_amount', inserted_total, 'target_count', target_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_building_financial_summary(p_building_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := app_auth.user_id();
  v_profile record;
  v_building record;
  v_collected numeric := 0;
  v_expenses numeric := 0;
  v_outstanding numeric := 0;
  v_monthly jsonb := '[]'::jsonb;
  v_categories jsonb := '[]'::jsonb;
  v_apartments jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select role, approved, building_id, apartment_id, disabled_at
    into v_profile from public.profiles where id = v_uid;

  if not found or v_profile.approved is distinct from true or v_profile.disabled_at is not null then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  if v_profile.role not in ('tenant','owner','building_admin') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  if v_profile.role in ('tenant','owner') and v_profile.building_id is distinct from p_building_id then
    raise exception 'Building access denied' using errcode = '42501';
  end if;

  if v_profile.role = 'building_admin'
     and not public.can_manage_bunyan_building(p_building_id) then
    raise exception 'Building access denied' using errcode = '42501';
  end if;

  select id, balance into v_building
    from public.buildings where id = p_building_id;
  if not found then
    raise exception 'Building not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(amount),0) into v_collected
    from public.payments where building_id = p_building_id and not is_assessment;

  select coalesce(sum(amount),0) into v_expenses
    from public.expenses where building_id = p_building_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'unit_number', a.unit_number,
      'total_paid', coalesce(p.total_paid, 0) + coalesce(e.paid,0),
      'remaining', greatest(
        (a.monthly_fee * greatest(coalesce(a.overdue_months,0),1))
        - coalesce(p.total_paid, 0), 0
      ) + coalesce(e.remaining,0),
      'status', case
        when greatest((a.monthly_fee * greatest(coalesce(a.overdue_months,0),1))
          - coalesce(p.total_paid, 0),0) + coalesce(e.remaining,0) = 0 then 'paid'
        when coalesce(p.total_paid, 0) + coalesce(e.paid,0) > 0 then 'partial'
        when coalesce(a.overdue_months,0) > 0 then 'overdue'
        else 'pending'
      end
    ) order by a.unit_number), '[]'::jsonb)
    into v_apartments
    from public.apartments a
    left join (
      select apartment_id, sum(amount) as total_paid
        from public.payments
       where building_id = p_building_id
         and coalesce(payment_type, 'monthly') <> 'exceptional'
       group by apartment_id
    ) p on p.apartment_id = a.id
    left join lateral (
      select coalesce(sum(greatest(c.amount-coalesce(r.paid,0),0)),0) remaining,
             coalesce(sum(coalesce(r.paid,0)),0) paid
      from public.payments c left join lateral (
        select sum(amount) paid from public.payments where exceptional_charge_id=c.id and not is_assessment
      ) r on true where c.apartment_id=a.id and c.is_assessment
    ) e on true
   where a.building_id = p_building_id
     and (v_profile.role = 'building_admin' or a.id = v_profile.apartment_id);

  select coalesce(sum(greatest(
      (a.monthly_fee * greatest(coalesce(a.overdue_months,0),1))
      - coalesce(p.total_paid, 0), 0
     ) + coalesce(e.remaining,0)),0)
    into v_outstanding
    from public.apartments a
    left join (
      select apartment_id, sum(amount) as total_paid
        from public.payments
       where building_id = p_building_id
         and coalesce(payment_type, 'monthly') <> 'exceptional'
       group by apartment_id
    ) p on p.apartment_id = a.id
    left join lateral (
      select coalesce(sum(greatest(c.amount-coalesce(r.paid,0),0)),0) remaining,
             coalesce(sum(coalesce(r.paid,0)),0) paid
      from public.payments c left join lateral (
        select sum(amount) paid from public.payments where exceptional_charge_id=c.id and not is_assessment
      ) r on true where c.apartment_id=a.id and c.is_assessment
    ) e on true
   where a.building_id = p_building_id
     and (v_profile.role = 'building_admin' or a.id = v_profile.apartment_id);

  select coalesce(jsonb_agg(jsonb_build_object(
      'month', to_char(m.month_start,'YYYY-MM'),
      'income', m.income,
      'expenses', m.expenses
    ) order by m.month_start), '[]'::jsonb)
    into v_monthly
    from (
      select month_start, coalesce(sum(income),0) as income, coalesce(sum(expenses),0) as expenses
      from (
        select date_trunc('month', payment_date)::date as month_start, sum(amount) as income, 0::numeric as expenses
          from public.payments where building_id = p_building_id and not is_assessment
           and payment_date >= (date_trunc('month', current_date) - interval '11 months')::date group by 1
        union all
        select date_trunc('month', expense_date)::date as month_start, 0::numeric as income, sum(amount) as expenses
          from public.expenses where building_id = p_building_id
           and expense_date >= (date_trunc('month', current_date) - interval '11 months')::date group by 1
      ) movements group by month_start
    ) m;

  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'amount', amount) order by amount desc), '[]'::jsonb)
    into v_categories
    from (select category, sum(amount) as amount from public.expenses where building_id = p_building_id group by category) c;

  return jsonb_build_object(
    'total_collected', v_collected,
    'total_expenses', v_expenses,
    'outstanding_amount', v_outstanding,
    'treasury_balance', coalesce(v_building.balance,0),
    'monthly', v_monthly,
    'expense_categories', v_categories,
    'apartments', v_apartments
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_exceptional_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE charge public.payments; paid numeric;
BEGIN
 IF current_user IN ('authenticated','anon') THEN
  IF NEW.is_assessment OR (TG_OP='UPDATE' AND OLD.is_assessment) THEN
   RAISE EXCEPTION 'Assessments must be created through the collection action';
  END IF;
 END IF;
 IF NEW.is_assessment THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (NEW.apartment_id,NEW.building_id,NEW.payment_type,NEW.exceptional_charge_id)
  IS DISTINCT FROM (OLD.apartment_id,OLD.building_id,OLD.payment_type,OLD.exceptional_charge_id) THEN
  RAISE EXCEPTION 'Receipt allocation cannot be changed';
 END IF;
 IF NEW.exceptional_charge_id IS NULL THEN
  IF NEW.payment_type='exceptional' THEN RAISE EXCEPTION 'Select an exceptional assessment'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO charge FROM public.payments WHERE id=NEW.exceptional_charge_id FOR UPDATE;
 IF NOT FOUND OR NOT charge.is_assessment OR charge.apartment_id<>NEW.apartment_id
  OR charge.building_id<>NEW.building_id OR NEW.payment_type<>'exceptional' THEN
  RAISE EXCEPTION 'Invalid exceptional assessment';
 END IF;
 SELECT coalesce(sum(amount),0) INTO paid FROM public.payments
  WHERE exceptional_charge_id=charge.id AND id<>NEW.id AND NOT is_assessment;
 IF NEW.amount<=0 OR NEW.amount+paid>charge.amount THEN RAISE EXCEPTION 'Payment exceeds remaining assessment'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER guard_exceptional_receipt BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.guard_exceptional_receipt();

CREATE OR REPLACE FUNCTION public.record_exceptional_payment(p_charge_id uuid,p_amount numeric,p_date date,p_method text,p_receipt_number text,p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE charge public.payments; receipt public.payments;
BEGIN
 SELECT * INTO charge FROM public.payments WHERE id=p_charge_id AND is_assessment FOR UPDATE;
 IF NOT FOUND OR NOT public.can_manage_bunyan_building(charge.building_id) THEN
  RAISE EXCEPTION 'Building admin permission required' USING errcode='42501'; END IF;
 INSERT INTO public.payments(apartment_id,building_id,unit_number,resident_name,amount,payment_date,month,method,notes,receipt_number,recorded_by,payment_type,exceptional_charge_id)
 VALUES(charge.apartment_id,charge.building_id,charge.unit_number,charge.resident_name,p_amount,p_date,charge.month,p_method,coalesce(nullif(p_notes,''),charge.notes),nullif(p_receipt_number,''),app_auth.user_id(),'exceptional',charge.id)
 RETURNING * INTO receipt;
 UPDATE public.buildings SET balance=balance+receipt.amount,updated_at=now() WHERE id=charge.building_id;
 RETURN to_jsonb(receipt);
END $$;
REVOKE ALL ON FUNCTION public.record_exceptional_payment(uuid,numeric,date,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_exceptional_payment(uuid,numeric,date,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.create_exceptional_collection(uuid,text,text,text,numeric,numeric,uuid[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_exceptional_collection(uuid,text,text,text,numeric,numeric,uuid[],boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
