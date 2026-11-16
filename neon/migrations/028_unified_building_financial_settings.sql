-- @statement
-- Pure snapshot used for optimistic concurrency; no private financial payloads exposed.
CREATE OR REPLACE FUNCTION private.building_financial_snapshot(b public.buildings)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('balance',b.balance,'openingBalance',b.opening_balance,'reserveFund',b.reserve_fund,
  'historicalAdjustment',b.historical_adjustment_applied,'historicalMonthly',b.historical_monthly_collections_total,
  'expenses',b.historical_expenses_total,'exceptional',b.historical_exceptional_collections_total,'startMonth',to_char(b.collection_start_month,'YYYY-MM'))
$$;
-- @statement
REVOKE ALL ON FUNCTION private.building_financial_snapshot(public.buildings) FROM PUBLIC,anon,authenticated;
-- @statement
CREATE OR REPLACE FUNCTION public.save_building_management(p_building_id uuid,p_details jsonb,p_finance jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.buildings; saved public.buildings; base numeric; reserve numeric; expenses numeric; exceptional numeric;
 start_text text; start_m date; included boolean; base_delta numeric; wanted numeric; unit_id uuid;
BEGIN
 IF app_auth.user_id() IS NULL OR NOT public.can_manage_bunyan_building(p_building_id) THEN RAISE EXCEPTION 'غير مصرح بتعديل هذه العمارة' USING errcode='42501'; END IF;
 SELECT * INTO b FROM public.buildings WHERE id=p_building_id FOR UPDATE;
 IF b.id IS NULL THEN RAISE EXCEPTION 'العمارة غير متاحة'; END IF;
 IF p_finance IS NOT NULL THEN
  IF jsonb_typeof(p_finance) IS DISTINCT FROM 'object' OR private.building_financial_snapshot(b) IS DISTINCT FROM p_finance->'expected' THEN
   RAISE EXCEPTION 'تغيرت أرصدة العمارة منذ فتح الصفحة. أعد تحميل الأرصدة وراجع المبالغ قبل الحفظ.' USING errcode='40001'; END IF;
  base:=(p_finance->>'baseOpening')::numeric; reserve:=(p_finance->>'reserve')::numeric;
  expenses:=(p_finance->>'expenses')::numeric; exceptional:=(p_finance->>'exceptional')::numeric;
  included:=(p_finance->>'openingAlreadyIncluded')::boolean; start_text:=p_finance->>'startMonth';
  IF base IS NULL OR base<0 OR base>9999999999.99 OR base='NaN'::numeric OR base<>round(base,2)
   OR reserve IS NULL OR reserve<0 OR reserve>9999999999.99 OR reserve='NaN'::numeric OR reserve<>round(reserve,2)
   OR expenses IS NULL OR expenses<0 OR expenses>999999999999.99 OR expenses='NaN'::numeric OR expenses<>round(expenses,2)
   OR exceptional IS NULL OR exceptional<0 OR exceptional>999999999999.99 OR exceptional='NaN'::numeric OR exceptional<>round(exceptional,2) THEN
   RAISE EXCEPTION 'راجع المبالغ: أرقام غير سالبة وبحد أقصى رقمين عشريين'; END IF;
  IF b.opening_balance IS NULL AND included IS NULL THEN RAISE EXCEPTION 'حدد هل الرصيد المبدئي موجود ضمن الخزينة الحالية حتى لا يُحسب مرتين'; END IF;
  IF coalesce(start_text,'')<>'' THEN
   IF start_text !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' OR start_text<'1900-01' OR start_text>to_char(timezone('Africa/Cairo',now()),'YYYY-MM') THEN RAISE EXCEPTION 'حدد شهر بداية صحيحًا لا يتجاوز الشهر الحالي'; END IF;
   start_m:=(start_text||'-01')::date;
  END IF;
  IF EXISTS(SELECT FROM public.historical_monthly_allocations WHERE building_id=b.id AND (start_m IS NULL OR month<start_m)) THEN RAISE EXCEPTION 'امسح التوزيع السابق واحفظه أولًا قبل اختيار بداية تستبعد شهورًا موزعة'; END IF;
  base_delta:=CASE WHEN b.opening_balance IS NULL THEN CASE WHEN included THEN 0 ELSE base END ELSE base-(b.opening_balance-b.historical_adjustment_applied) END;
  wanted:=b.historical_monthly_collections_total+exceptional-expenses;
  IF base+wanted NOT BETWEEN -9999999999.99 AND 9999999999.99 THEN RAISE EXCEPTION 'صافي الرصيد الافتتاحي يتجاوز الحد المالي المسموح'; END IF;
 END IF;
 -- Existing metadata/fee validation is retained, inside this same transaction.
 -- Reserve is owned by the unified financial update below, not the metadata step.
 PERFORM public.update_manager_building(b.id,p_details||jsonb_build_object('reserveFund',b.reserve_fund));
 IF p_finance IS NOT NULL THEN
  -- The existing historical trigger adds only wanted - previous adjustment.
  -- Setting all opening inputs together avoids intermediate double counting.
  UPDATE public.buildings SET balance=balance+base_delta,opening_balance=base+b.historical_adjustment_applied,
   reserve_fund=reserve,collection_start_month=start_m,historical_expenses_total=expenses,historical_exceptional_collections_total=exceptional,updated_at=now()
   WHERE id=b.id;
 END IF;
 FOR unit_id IN SELECT id FROM public.apartments WHERE building_id=b.id ORDER BY id LOOP
  PERFORM private.reconcile_apartment_ledger(b.id,unit_id);
 END LOOP;
 SELECT * INTO saved FROM public.buildings WHERE id=b.id;
 IF p_finance IS NOT NULL AND (b.opening_balance,b.reserve_fund,b.balance,b.collection_start_month,b.historical_expenses_total,b.historical_exceptional_collections_total)
  IS DISTINCT FROM (saved.opening_balance,saved.reserve_fund,saved.balance,saved.collection_start_month,saved.historical_expenses_total,saved.historical_exceptional_collections_total) THEN
  INSERT INTO public.building_treasury_settings_audit(building_id,previous_opening_balance,opening_balance,previous_reserve_fund,reserve_fund,previous_balance,balance,opening_already_included,changed_by)
  VALUES(b.id,b.opening_balance,saved.opening_balance,b.reserve_fund,saved.reserve_fund,b.balance,saved.balance,coalesce(included,true),app_auth.user_id());
 END IF;
 RETURN to_jsonb(saved);
END $$;
-- @statement
REVOKE ALL ON FUNCTION public.save_building_management(uuid,jsonb,jsonb) FROM PUBLIC,anon;
-- @statement
GRANT EXECUTE ON FUNCTION public.save_building_management(uuid,jsonb,jsonb) TO authenticated;
-- @statement
CREATE OR REPLACE FUNCTION public.create_manager_building_with_finances(p_details jsonb,p_finance jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE created jsonb; b public.buildings;
BEGIN
 created:=public.create_manager_building(CASE WHEN p_finance IS NULL THEN p_details ELSE p_details||jsonb_build_object('reserveFund',0) END);
 SELECT * INTO b FROM public.buildings WHERE id=(created->>'id')::uuid FOR UPDATE;
 IF p_finance IS NULL THEN RETURN created; END IF;
 RETURN public.save_building_management(b.id,p_details,p_finance||jsonb_build_object('expected',private.building_financial_snapshot(b)));
END $$;
-- @statement
REVOKE ALL ON FUNCTION public.create_manager_building_with_finances(jsonb,jsonb) FROM PUBLIC,anon;
-- @statement
GRANT EXECUTE ON FUNCTION public.create_manager_building_with_finances(jsonb,jsonb) TO authenticated;
-- @statement
NOTIFY pgrst,'reload schema';
