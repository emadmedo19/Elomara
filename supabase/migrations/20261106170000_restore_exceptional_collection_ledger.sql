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
