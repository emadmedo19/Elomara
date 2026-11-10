CREATE SCHEMA IF NOT EXISTS private;
-- Owner-only initializer. New-building actions authorize the actor first.
-- Locking and the empty-building check make repeated calls harmless.
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
 SELECT b.id,p.unit_number,p.floor_no,'','',0,0,0,0,'pending' FROM positions p
 ON CONFLICT(building_id,unit_number) DO NOTHING;
 GET DIAGNOSTICS created=ROW_COUNT;
 RETURN created;
END $$;
REVOKE ALL ON FUNCTION private.initialize_building_apartments(uuid) FROM PUBLIC,anon,authenticated;

-- Approved managers detached by building deletion can create and attach a new
-- building atomically. Direct table INSERT remains forbidden by RLS.
CREATE OR REPLACE FUNCTION public.create_manager_building(p_details jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.profiles; result public.buildings; title text;
 units integer; floors integer; target numeric; reserve numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'سجّل الدخول أولًا' USING errcode='42501'; END IF;
 SELECT * INTO actor FROM public.profiles WHERE id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR actor.role IS DISTINCT FROM 'building_admin' OR actor.approved IS DISTINCT FROM true
  OR actor.disabled_at IS NOT NULL THEN
  RAISE EXCEPTION 'إضافة العمارة متاحة للمدير المعتمد فقط' USING errcode='42501'; END IF;
 IF actor.building_id IS NOT NULL THEN RAISE EXCEPTION 'حسابك مرتبط بعمارة بالفعل؛ حدّث بيانات التطبيق'; END IF;
 IF p_details IS NULL OR jsonb_typeof(p_details)<>'object' THEN RAISE EXCEPTION 'بيانات العمارة غير صحيحة'; END IF;
 title:=nullif(btrim(p_details->>'name'),'');
 IF title IS NULL THEN RAISE EXCEPTION 'اكتب اسم العمارة'; END IF;
 units:=coalesce((p_details->>'totalUnits')::integer,0);
 floors:=coalesce((p_details->>'totalFloors')::integer,1);
 target:=coalesce((p_details->>'monthlyTarget')::numeric,0);
 reserve:=coalesce((p_details->>'reserveFund')::numeric,0);
 IF units<0 OR floors<1 OR floors>100 OR target<0 OR reserve<0
  OR target='NaN'::numeric OR reserve='NaN'::numeric THEN RAISE EXCEPTION 'راجع الأعداد والمبالغ المدخلة'; END IF;
 INSERT INTO public.buildings(name,address,total_units,total_floors,balance,opening_balance,monthly_target,reserve_fund,
  manager_name,manager_phone,manager2_name,manager2_phone,manager3_name,manager3_phone)
 VALUES(title,btrim(coalesce(p_details->>'address','')),units,floors,0,0,target,reserve,
  btrim(coalesce(p_details->>'managerName','')),btrim(coalesce(p_details->>'managerPhone','')),
  btrim(coalesce(p_details->>'manager2Name','')),btrim(coalesce(p_details->>'manager2Phone','')),
  btrim(coalesce(p_details->>'manager3Name','')),btrim(coalesce(p_details->>'manager3Phone','')))
 RETURNING * INTO result;
 UPDATE public.profiles SET building_id=result.id,apartment_id=NULL,updated_at=now() WHERE id=actor.id;
 PERFORM private.initialize_building_apartments(result.id);
 RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.create_manager_building(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_manager_building(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_building_for_current_user(building_name text, building_address text DEFAULT ''::text, units_count integer DEFAULT 0, floors_count integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_id uuid := auth.uid();
  new_building_id uuid;
  profile_row public.profiles%rowtype;
  identity_confirmed boolean;
begin
  if current_id is null then raise exception 'Authentication required'; end if;

  select (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
    into identity_confirmed from auth.users u where u.id = current_id;
  if coalesce(identity_confirmed, false) is not true then
    raise exception 'Confirm your email or mobile number before creating a building';
  end if;

  if nullif(trim(building_name), '') is null then raise exception 'Building name is required'; end if;
  if coalesce(units_count, 0) < 0 or (floors_count is not null and floors_count < 0) then
    raise exception 'Unit and floor counts cannot be negative';
  end if;

  select * into profile_row from public.profiles where id = current_id for update;
  if not found or profile_row.role <> 'pending' or profile_row.approved or profile_row.disabled_at is not null then
    raise exception 'This account is not eligible to create a building';
  end if;
  if profile_row.building_id is not null then raise exception 'This account is already assigned to a building'; end if;

  insert into public.buildings (name, address, total_units, total_floors, manager_name)
  values (trim(building_name), coalesce(trim(building_address), ''), coalesce(units_count, 0),
          floors_count, coalesce(profile_row.full_name, ''))
  returning id into new_building_id;

  perform private.initialize_building_apartments(new_building_id);

  update public.profiles set role = 'building_admin', approved = true,
    building_id = new_building_id, apartment_id = null, updated_at = now()
  where id = current_id;
  return new_building_id;
end;
$function$
;


NOTIFY pgrst,'reload schema';
