-- Unknown historical opening balances stay NULL. Never infer them from today's
-- treasury or backfill old buildings with zero (which could double-credit cash).
alter table public.buildings add column opening_balance numeric(14,2)
  check (opening_balance is null or (opening_balance between 0 and 9999999999.99));

create table public.building_treasury_settings_audit (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  previous_opening_balance numeric(14,2),
  opening_balance numeric(14,2) not null,
  previous_reserve_fund numeric(14,2) not null,
  reserve_fund numeric(14,2) not null,
  previous_balance numeric(14,2) not null,
  balance numeric(14,2) not null,
  opening_already_included boolean not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index building_treasury_settings_audit_building_idx
  on public.building_treasury_settings_audit(building_id, created_at desc);
alter table public.building_treasury_settings_audit enable row level security;
revoke all on public.building_treasury_settings_audit from anon, authenticated;
grant select on public.building_treasury_settings_audit to authenticated;
create policy treasury_settings_audit_manager_read
  on public.building_treasury_settings_audit for select to authenticated
  using (public.can_manage_bunyan_building(building_id));

create or replace function public.create_building_with_opening_balance(
  building_name text, building_address text default '', units_count integer default 0,
  floors_count integer default null, opening_balance numeric default 0
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_building_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if opening_balance is null or not (opening_balance between 0 and 9999999999.99)
     or opening_balance <> round(opening_balance, 2) then
    raise exception 'الرصيد الافتتاحي غير صحيح؛ أدخل مبلغًا من صفر إلى 9,999,999,999.99 بمنزلتين عشريتين كحد أقصى'
      using errcode = '22023';
  end if;
  new_building_id := public.create_building_for_current_user(building_name, building_address, units_count, floors_count);
  update public.buildings b set balance = create_building_with_opening_balance.opening_balance,
    opening_balance = create_building_with_opening_balance.opening_balance
  where b.id = new_building_id;
  return new_building_id;
end;
$$;

create or replace function public.update_building_treasury_settings(
  target_building_id uuid, new_opening_balance numeric, new_reserve_fund numeric,
  expected_balance numeric, expected_opening_balance numeric, expected_reserve_fund numeric,
  opening_already_included boolean default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  existing public.buildings%rowtype;
  next_balance numeric;
  cash_delta numeric;
begin
  -- Trust the stored active manager profile, never client-supplied role claims.
  perform 1 from public.profiles p where p.id = auth.uid() and p.approved
    and p.disabled_at is null and p.role = 'building_admin'
    and p.building_id = target_building_id for update;
  if not found then raise exception 'غير مصرح بتعديل إعدادات هذه العمارة' using errcode = '42501'; end if;
  if new_opening_balance is null or new_reserve_fund is null
     or not (new_opening_balance between 0 and 9999999999.99)
     or not (new_reserve_fund between 0 and 9999999999.99)
     or new_opening_balance <> round(new_opening_balance, 2)
     or new_reserve_fund <> round(new_reserve_fund, 2) then
    raise exception 'أدخل مبالغ صحيحة غير سالبة بمنزلتين عشريتين كحد أقصى' using errcode = '22023';
  end if;
  select * into existing from public.buildings where id = target_building_id for update;
  if not found then raise exception 'العمارة غير موجودة'; end if;
  if existing.balance is distinct from expected_balance
     or existing.opening_balance is distinct from expected_opening_balance
     or existing.reserve_fund is distinct from expected_reserve_fund then
    raise exception 'تغيرت الأرصدة منذ فتح الصفحة. حدّث البيانات وراجع المبالغ قبل الحفظ.' using errcode = '40001';
  end if;
  if existing.opening_balance is null and opening_already_included is null then
    raise exception 'حدد هل الرصيد الافتتاحي مشمول بالفعل في رصيد الخزينة الحالي' using errcode = '22023';
  end if;
  cash_delta := case when existing.opening_balance is null and opening_already_included
    then 0 else new_opening_balance - coalesce(existing.opening_balance, 0) end;
  next_balance := existing.balance + cash_delta;
  if next_balance < 0 or next_balance > 999999999999.99 then
    raise exception 'التعديل سيجعل رصيد الخزينة خارج النطاق المسموح' using errcode = '22023';
  end if;
  update public.buildings set opening_balance = new_opening_balance,
    reserve_fund = new_reserve_fund, balance = next_balance, updated_at = now()
  where id = target_building_id;
  if existing.opening_balance is distinct from new_opening_balance
     or existing.reserve_fund is distinct from new_reserve_fund then
    insert into public.building_treasury_settings_audit(building_id,
      previous_opening_balance, opening_balance, previous_reserve_fund, reserve_fund,
      previous_balance, balance, opening_already_included, changed_by)
    values(target_building_id, existing.opening_balance, new_opening_balance,
      existing.reserve_fund, new_reserve_fund, existing.balance, next_balance,
      coalesce(opening_already_included, true), auth.uid());
  end if;
  return jsonb_build_object('balance', next_balance, 'opening_balance', new_opening_balance, 'reserve_fund', new_reserve_fund);
end;
$$;
revoke all on function public.create_building_with_opening_balance(text,text,integer,integer,numeric) from public, anon;
grant execute on function public.create_building_with_opening_balance(text,text,integer,integer,numeric) to authenticated;
revoke all on function public.update_building_treasury_settings(uuid,numeric,numeric,numeric,numeric,numeric,boolean) from public, anon;
grant execute on function public.update_building_treasury_settings(uuid,numeric,numeric,numeric,numeric,numeric,boolean) to authenticated;
