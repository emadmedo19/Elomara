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
 -- Unit count is descriptive. Apartments are added explicitly by the manager.
 RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.create_manager_building(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_manager_building(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
