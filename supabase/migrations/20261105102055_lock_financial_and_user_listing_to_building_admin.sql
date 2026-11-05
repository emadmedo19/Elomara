create or replace function public.get_building_financial_summary(p_building_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
  if v_profile.role = 'building_admin' and not public.can_manage_bunyan_building(p_building_id) then
    raise exception 'Building access denied' using errcode = '42501';
  end if;
  select id, balance into v_building from public.buildings where id = p_building_id;
  if not found then raise exception 'Building not found' using errcode = 'P0002'; end if;
  select coalesce(sum(amount),0) into v_collected from public.payments where building_id = p_building_id;
  select coalesce(sum(amount),0) into v_expenses from public.expenses where building_id = p_building_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'unit_number', a.unit_number,
      'total_paid', coalesce(p.total_paid, a.paid_amount, 0),
      'remaining', greatest((a.monthly_fee * greatest(coalesce(a.overdue_months,0),1)) - coalesce(p.total_paid, a.paid_amount, 0), 0),
      'status', case
        when greatest((a.monthly_fee * greatest(coalesce(a.overdue_months,0),1)) - coalesce(p.total_paid, a.paid_amount, 0),0) = 0 then 'paid'
        when coalesce(p.total_paid, a.paid_amount, 0) > 0 then 'partial'
        when coalesce(a.overdue_months,0) > 0 then 'overdue'
        else 'pending' end
    ) order by a.unit_number), '[]'::jsonb)
    into v_apartments
    from public.apartments a
    left join (select apartment_id, sum(amount) as total_paid from public.payments where building_id = p_building_id group by apartment_id) p
      on p.apartment_id = a.id
   where a.building_id = p_building_id
     and (v_profile.role = 'building_admin' or a.id = v_profile.apartment_id);
  select coalesce(sum(greatest((a.monthly_fee * greatest(coalesce(a.overdue_months,0),1)) - coalesce(p.total_paid, a.paid_amount, 0), 0)),0)
    into v_outstanding
    from public.apartments a
    left join (select apartment_id, sum(amount) as total_paid from public.payments where building_id = p_building_id group by apartment_id) p
      on p.apartment_id = a.id
   where a.building_id = p_building_id
     and (v_profile.role = 'building_admin' or a.id = v_profile.apartment_id);
  select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m.month_start,'YYYY-MM'), 'income', m.income, 'expenses', m.expenses) order by m.month_start), '[]'::jsonb)
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
    'total_collected', v_collected, 'total_expenses', v_expenses,
    'outstanding_amount', v_outstanding, 'treasury_balance', coalesce(v_building.balance,0),
    'monthly', v_monthly, 'expense_categories', v_categories, 'apartments', v_apartments
  );
end;
$function$;

create or replace function public.list_building_users()
returns table(user_id uuid, email text, phone text, full_name text, role text, approved boolean, building_id uuid, apartment_id uuid, registered_at timestamp with time zone, disabled_at timestamp with time zone)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  manager_building_id uuid;
  manager_role text;
begin
  select p.building_id, p.role into manager_building_id, manager_role
  from public.profiles p
  where p.id = (select auth.uid()) and p.approved = true and p.disabled_at is null;
  if (select auth.uid()) is null or manager_role <> 'building_admin'
     or manager_building_id is null
     or not public.can_manage_bunyan_building(manager_building_id) then
    raise exception 'Not authorized to list building users' using errcode = '42501';
  end if;
  return query
  select p.id, u.email::text, p.phone, coalesce(p.full_name, ''), p.role,
         p.approved, p.building_id, p.apartment_id, u.created_at, p.disabled_at
  from public.profiles p join auth.users u on u.id = p.id
  where p.building_id = manager_building_id
  order by u.created_at desc;
end;
$function$;
