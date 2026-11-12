-- Atomically reconcile an existing building's configured unit count with its actual apartments.
-- Never modify existing apartments, floors, payments, receipts or balances.
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
 -- Use the lowest unused positive number, preserving all existing unit numbers.
 WHILE inserted_count < target_count-existing_count LOOP
   candidate := next_number::text;
   IF NOT EXISTS (SELECT 1 FROM public.apartments WHERE building_id=p_building_id AND unit_number=candidate) THEN
     INSERT INTO public.apartments
       (building_id,unit_number,floor,resident_name,resident_phone,monthly_fee,paid_amount,credit_balance,overdue_months,payment_status)
     VALUES (p_building_id,candidate,0,'','',0,0,0,0,'pending');
     inserted_count := inserted_count+1;
   END IF;
   next_number := next_number+1;
 END LOOP;
 RETURN jsonb_build_object('totalUnits',target_count,'createdUnits',inserted_count);
END $$;
REVOKE ALL ON FUNCTION public.update_manager_building(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_manager_building(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
