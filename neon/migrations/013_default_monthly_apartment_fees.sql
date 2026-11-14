-- Align automatically generated apartments with the building's per-unit default monthly fee.
-- Preserve all existing non-zero custom fees, historical receipts and treasury balances.
-- A value of zero on an apartment means that the default fee has not been assigned yet.
CREATE OR REPLACE FUNCTION private.initialize_building_apartments(p_building_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.buildings; floors integer; created integer;
BEGIN
 SELECT * INTO b FROM public.buildings WHERE id=p_building_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Building not found'; END IF;
 IF b.total_units<=0 OR EXISTS(SELECT 1 FROM public.apartments WHERE building_id=b.id) THEN RETURN 0; END IF;
 floors:=greatest(coalesce(b.total_floors,1),1);
 WITH positions AS (
  SELECT f.floor_no,row_number() OVER(ORDER BY f.floor_no,s.slot)::text unit_number
  FROM generate_series(1,floors) f(floor_no)
  CROSS JOIN LATERAL generate_series(1,b.total_units/floors+CASE WHEN f.floor_no<=b.total_units%floors THEN 1 ELSE 0 END) s(slot)
 )
 INSERT INTO public.apartments(building_id,unit_number,floor,resident_name,resident_phone,monthly_fee,paid_amount,credit_balance,overdue_months,payment_status)
 SELECT b.id,p.unit_number,p.floor_no,'','',b.monthly_target,0,0,0,'pending' FROM positions p
 ON CONFLICT(building_id,unit_number) DO NOTHING;
 GET DIAGNOSTICS created=ROW_COUNT;
 RETURN created;
END $$;

CREATE OR REPLACE FUNCTION public.update_manager_building(p_building_id uuid, p_details jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 actor public.profiles;
 b public.buildings;
 existing_count integer;
 target_count integer;
 next_number integer := 1;
 inserted_count integer := 0;
 candidate text;
BEGIN
 IF app_auth.user_id() IS NULL THEN RAISE EXCEPTION 'سجّل الدخول أولًا' USING errcode='42501'; END IF;
 SELECT * INTO actor FROM public.profiles WHERE id=app_auth.user_id();
 IF NOT FOUND OR actor.role IS DISTINCT FROM 'building_admin' OR actor.approved IS DISTINCT FROM true
    OR actor.disabled_at IS NOT NULL OR actor.building_id IS DISTINCT FROM p_building_id THEN
   RAISE EXCEPTION 'غير مصرح بتعديل هذه العمارة' USING errcode='42501';
 END IF;
 IF p_details IS NULL OR jsonb_typeof(p_details) <> 'object' THEN RAISE EXCEPTION 'بيانات العمارة غير صحيحة'; END IF;
 SELECT * INTO b FROM public.buildings WHERE id=p_building_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'العمارة غير موجودة'; END IF;
 target_count := (p_details->>'totalUnits')::integer;
 IF target_count IS NULL OR target_count < 0 OR target_count > 10000
    OR coalesce((p_details->>'totalFloors')::integer,0) NOT BETWEEN 1 AND 100
    OR nullif(btrim(p_details->>'name'),'') IS NULL
    OR coalesce((p_details->>'monthlyTarget')::numeric,0) < 0
    OR coalesce((p_details->>'reserveFund')::numeric,0) < 0 THEN
   RAISE EXCEPTION 'راجع بيانات العمارة وعدد الشقق والأدوار';
 END IF;
 SELECT count(*) INTO existing_count FROM public.apartments WHERE building_id=p_building_id;
 IF target_count < existing_count THEN
   RAISE EXCEPTION 'لا يمكن تقليل عدد الشقق عن العدد المسجل دون مراجعة بياناتها';
 END IF;
 UPDATE public.buildings SET
   name=btrim(p_details->>'name'),
   address=btrim(coalesce(p_details->>'address','')),
   total_units=target_count,
   total_floors=(p_details->>'totalFloors')::integer,
   monthly_target=coalesce((p_details->>'monthlyTarget')::numeric,0),
   reserve_fund=coalesce((p_details->>'reserveFund')::numeric,0),
   manager_name=btrim(coalesce(p_details->>'managerName','')),
   manager_phone=btrim(coalesce(p_details->>'managerPhone','')),
   manager2_name=btrim(coalesce(p_details->>'manager2Name','')),
   manager2_phone=btrim(coalesce(p_details->>'manager2Phone','')),
   manager3_name=btrim(coalesce(p_details->>'manager3Name','')),
   manager3_phone=btrim(coalesce(p_details->>'manager3Phone',''))
 WHERE id=p_building_id;
 -- Only fill missing monthly fees. Custom positive fees, receipts and balances stay intact.
 IF coalesce((p_details->>'monthlyTarget')::numeric,0)>0 THEN
   UPDATE public.apartments
   SET monthly_fee=(p_details->>'monthlyTarget')::numeric
   WHERE building_id=p_building_id AND monthly_fee=0;
 END IF;
 -- Use the lowest unused positive number, preserving all existing unit numbers.
 WHILE inserted_count < target_count-existing_count LOOP
   candidate := next_number::text;
   IF NOT EXISTS (SELECT 1 FROM public.apartments WHERE building_id=p_building_id AND unit_number=candidate) THEN
     INSERT INTO public.apartments
       (building_id,unit_number,floor,resident_name,resident_phone,monthly_fee,paid_amount,credit_balance,overdue_months,payment_status)
     VALUES (p_building_id,candidate,0,'','',coalesce((p_details->>'monthlyTarget')::numeric,0),0,0,0,'pending');
     inserted_count := inserted_count+1;
   END IF;
   next_number := next_number+1;
 END LOOP;
 RETURN jsonb_build_object('totalUnits',target_count,'createdUnits',inserted_count);
END $$;

-- Exclude zero-dues apartments from paid status in the resident building summary.
-- Use the authoritative payment ledger rather than stale apartment paid_amount cache.
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
    from public.payments where building_id = p_building_id;

  select coalesce(sum(amount),0) into v_expenses
    from public.expenses where building_id = p_building_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'unit_number', a.unit_number,
      'total_paid', coalesce(p.total_paid, 0),
      'remaining', greatest(
        (a.monthly_fee * greatest(coalesce(a.overdue_months,0),1))
        - coalesce(p.total_paid, 0), 0
      ),
      'status', case
        when (a.monthly_fee * greatest(coalesce(a.overdue_months,0),1)) > 0
         and greatest((a.monthly_fee * greatest(coalesce(a.overdue_months,0),1))
          - coalesce(p.total_paid, 0),0) = 0 then 'paid'
        when a.monthly_fee = 0 then 'pending'
        when coalesce(p.total_paid, 0) > 0 then 'partial'
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
   where a.building_id = p_building_id
     and (v_profile.role = 'building_admin' or a.id = v_profile.apartment_id);

  select coalesce(sum(greatest(
      (a.monthly_fee * greatest(coalesce(a.overdue_months,0),1))
      - coalesce(p.total_paid, 0), 0
    )),0)
    into v_outstanding
    from public.apartments a
    left join (
      select apartment_id, sum(amount) as total_paid
        from public.payments
       where building_id = p_building_id
         and coalesce(payment_type, 'monthly') <> 'exceptional'
       group by apartment_id
    ) p on p.apartment_id = a.id
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
          from public.payments where building_id = p_building_id
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
$function$
;

NOTIFY pgrst,'reload schema';
