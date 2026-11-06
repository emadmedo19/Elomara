-- Keep exceptional assessments in the shared payment ledger without treating them as monthly dues.
alter table public.payments
  add column if not exists payment_type text not null default 'monthly'
  check (payment_type in ('monthly', 'exceptional'));

create or replace function public.create_exceptional_collection(
  p_building_id uuid,
  p_title text,
  p_description text,
  p_amount_mode text,
  p_total_amount numeric,
  p_per_apartment_amount numeric,
  p_target_apartment_ids uuid[],
  p_notify_residents boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    amount_each := round(expected_total / target_count, 2);
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
        payment_date, month, method, notes, recorded_by, payment_type
      ) values (
        apt.id, p_building_id, apt.unit_number, coalesce(apt.resident_name, ''),
        line_amount, current_date, payment_month, 'تحصيل استثنائي',
        btrim(p_title) || case when coalesce(p_description, '') = '' then '' else ' - ' || p_description end,
        actor, 'exceptional'
      );
      inserted_total := inserted_total + line_amount;
    end;
  end loop;

  update public.buildings
  set balance = balance + inserted_total, updated_at = now()
  where id = p_building_id;

  return jsonb_build_object('collection_id', inserted_id, 'total_amount', inserted_total, 'target_count', target_count);
end;
$$;

revoke all on function public.create_exceptional_collection(uuid,text,text,text,numeric,numeric,uuid[],boolean) from public;
grant execute on function public.create_exceptional_collection(uuid,text,text,text,numeric,numeric,uuid[],boolean) to authenticated;


-- Exceptional assessments must not count as monthly dues already paid.
-- Keep the existing overall treasury and income totals unchanged.
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
    from public.payments where building_id = p_building_id;

  select coalesce(sum(amount),0) into v_expenses
    from public.expenses where building_id = p_building_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'unit_number', a.unit_number,
      'total_paid', coalesce(p.total_paid, a.paid_amount, 0),
      'remaining', greatest(
        (a.monthly_fee * greatest(coalesce(a.overdue_months,0),1))
        - coalesce(p.total_paid, a.paid_amount, 0), 0
      ),
      'status', case
        when greatest((a.monthly_fee * greatest(coalesce(a.overdue_months,0),1))
          - coalesce(p.total_paid, a.paid_amount, 0),0) = 0 then 'paid'
        when coalesce(p.total_paid, a.paid_amount, 0) > 0 then 'partial'
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
      - coalesce(p.total_paid, a.paid_amount, 0), 0
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

