-- Cancel unpaid receivables without deleting collected receipts or changing cash.
ALTER TABLE public.exceptional_collections ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.exceptional_collections ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS exceptional_collection_id uuid REFERENCES public.exceptional_collections(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS assessment_cancelled boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS payments_exceptional_collection_idx ON public.payments(exceptional_collection_id);

-- The original generator emitted each assessment in its collection transaction.
-- Link only an unambiguous original match; never guess using title alone.
WITH matches AS (
 SELECT p.id,(array_agg(c.id))[1] collection_id
 FROM public.payments p JOIN public.exceptional_collections c
  ON c.building_id=p.building_id AND p.apartment_id=ANY(c.target_apartment_ids)
  AND p.recorded_at=c.created_at AND p.recorded_by=c.created_by
  AND p.notes=btrim(c.title)||CASE WHEN coalesce(c.description,'')='' THEN '' ELSE ' - '||c.description END
 WHERE p.is_assessment AND p.exceptional_collection_id IS NULL
 GROUP BY p.id HAVING count(*)=1
)
UPDATE public.payments p SET exceptional_collection_id=m.collection_id FROM matches m WHERE p.id=m.id;
UPDATE public.payments r SET exceptional_collection_id=c.exceptional_collection_id
FROM public.payments c WHERE r.exceptional_charge_id=c.id AND r.exceptional_collection_id IS NULL;

CREATE OR REPLACE FUNCTION public.create_exceptional_collection(p_building_id uuid, p_title text, p_description text, p_amount_mode text, p_total_amount numeric, p_per_apartment_amount numeric, p_target_apartment_ids uuid[], p_notify_residents boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
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
        payment_date, month, method, notes, recorded_by, payment_type, is_assessment, exceptional_collection_id
      ) values (
        apt.id, p_building_id, apt.unit_number, coalesce(apt.resident_name, ''),
        line_amount, current_date, payment_month, 'تحصيل استثنائي',
        btrim(p_title) || case when coalesce(p_description, '') = '' then '' else ' - ' || p_description end,
        actor, 'exceptional', true, inserted_id
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
  v_uid uuid := auth.uid();
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
      select coalesce(sum(CASE WHEN c.assessment_cancelled THEN 0 ELSE greatest(c.amount-coalesce(r.paid,0),0) END),0) remaining,
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
      select coalesce(sum(CASE WHEN c.assessment_cancelled THEN 0 ELSE greatest(c.amount-coalesce(r.paid,0),0) END),0) remaining,
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
 IF NEW.assessment_cancelled THEN RAISE EXCEPTION 'Only assessments may be cancelled'; END IF;
 IF TG_OP='UPDATE' AND (NEW.apartment_id,NEW.building_id,NEW.payment_type,NEW.exceptional_charge_id)
  IS DISTINCT FROM (OLD.apartment_id,OLD.building_id,OLD.payment_type,OLD.exceptional_charge_id) THEN
  RAISE EXCEPTION 'Receipt allocation cannot be changed';
 END IF;
 IF NEW.exceptional_charge_id IS NULL THEN
  IF NEW.exceptional_collection_id IS NOT NULL THEN RAISE EXCEPTION 'Select an exceptional assessment'; END IF;
  IF NEW.payment_type='exceptional' THEN RAISE EXCEPTION 'Select an exceptional assessment'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO charge FROM public.payments WHERE id=NEW.exceptional_charge_id FOR UPDATE;
 IF NOT FOUND OR NOT charge.is_assessment OR charge.apartment_id<>NEW.apartment_id
  OR charge.building_id<>NEW.building_id OR NEW.payment_type<>'exceptional' THEN
  RAISE EXCEPTION 'Invalid exceptional assessment';
 END IF;
 IF charge.assessment_cancelled AND TG_OP='INSERT' THEN
  RAISE EXCEPTION 'This exceptional collection was deleted'; END IF;
 NEW.exceptional_collection_id:=charge.exceptional_collection_id;
 SELECT coalesce(sum(amount),0) INTO paid FROM public.payments
  WHERE exceptional_charge_id=charge.id AND id<>NEW.id AND NOT is_assessment;
 IF NEW.amount<=0 OR NEW.amount+paid>charge.amount THEN RAISE EXCEPTION 'Payment exceeds remaining assessment'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER guard_exceptional_receipt BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.guard_exceptional_receipt();

CREATE OR REPLACE FUNCTION public.delete_exceptional_collection(p_collection_id uuid, p_confirmation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE collection public.exceptional_collections; waived numeric; received numeric;
BEGIN
 SELECT * INTO collection FROM public.exceptional_collections WHERE id=p_collection_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT public.can_manage_bunyan_building(collection.building_id) THEN
  RAISE EXCEPTION 'غير مصرح بحذف هذا التحصيل' USING errcode='42501'; END IF;
 IF p_confirmation IS DISTINCT FROM collection.title THEN RAISE EXCEPTION 'اكتب اسم التحصيل للتأكيد'; END IF;
 IF collection.deleted_at IS NOT NULL THEN RETURN jsonb_build_object('already_deleted',true); END IF;
 -- Both receipt creation and deletion lock the same assessment rows. An in-flight
 -- receipt completes before cancellation, or sees cancellation and is rejected.
 PERFORM id FROM public.payments WHERE exceptional_collection_id=collection.id AND is_assessment ORDER BY id FOR UPDATE;
 SELECT coalesce(sum(greatest(c.amount-coalesce(r.paid,0),0)),0),coalesce(sum(coalesce(r.paid,0)),0)
 INTO waived,received FROM public.payments c LEFT JOIN LATERAL (
  SELECT sum(amount) paid FROM public.payments WHERE exceptional_charge_id=c.id AND NOT is_assessment
 ) r ON true WHERE c.exceptional_collection_id=collection.id AND c.is_assessment AND NOT c.assessment_cancelled;
 UPDATE public.payments SET assessment_cancelled=true WHERE exceptional_collection_id=collection.id AND is_assessment;
 UPDATE public.exceptional_collections SET deleted_at=now(),deleted_by=auth.uid(),status='closed' WHERE id=collection.id;
 RETURN jsonb_build_object('waived_amount',waived,'preserved_receipts',received);
END $$;
REVOKE ALL ON FUNCTION public.delete_exceptional_collection(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_exceptional_collection(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
