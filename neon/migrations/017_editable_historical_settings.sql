-- Settings are independent from treasury; no legacy receipts are fabricated.
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS collection_start_month date;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS historical_expenses_total numeric(14,2) NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.save_building_historical_settings(p_building_id uuid, p_start_month text, p_expenses numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.profiles;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=app_auth.user_id();
 IF NOT FOUND OR actor.role IS DISTINCT FROM 'building_admin' OR actor.approved IS DISTINCT FROM true OR actor.disabled_at IS NOT NULL OR actor.building_id IS DISTINCT FROM p_building_id THEN RAISE EXCEPTION 'غير مصرح بتعديل هذه العمارة' USING errcode='42501'; END IF;
 IF p_expenses IS NULL OR p_expenses < 0 OR p_expenses > 999999999999 OR p_expenses = 'NaN'::numeric THEN RAISE EXCEPTION 'قيمة المصروفات غير صالحة'; END IF;
 IF p_start_month IS NOT NULL AND p_start_month <> '' AND p_start_month !~ '^\\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'شهر البداية غير صالح'; END IF;
 UPDATE public.buildings SET collection_start_month = CASE WHEN coalesce(p_start_month,'') = '' THEN NULL ELSE (p_start_month || '-01')::date END, historical_expenses_total = p_expenses WHERE id=p_building_id;
END $$;
REVOKE ALL ON FUNCTION public.save_building_historical_settings(uuid,text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_building_historical_settings(uuid,text,numeric) TO authenticated;
NOTIFY pgrst,'reload schema';
