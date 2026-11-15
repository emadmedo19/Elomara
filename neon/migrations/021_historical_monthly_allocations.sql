-- Safe monthly opening allocations: a separate ledger, never real receipts.
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS historical_monthly_collections_total numeric(14,2) NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.historical_monthly_allocations (
 building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
 apartment_id uuid NOT NULL REFERENCES public.apartments(id) ON DELETE CASCADE,
 month date NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount > 0),
 PRIMARY KEY(building_id,apartment_id,month),
 CONSTRAINT historical_month_first CHECK (extract(day from month)=1)
);
CREATE INDEX IF NOT EXISTS historical_monthly_allocations_apartment ON public.historical_monthly_allocations(apartment_id,month);
ALTER TABLE public.historical_monthly_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS historical_monthly_read ON public.historical_monthly_allocations;
CREATE POLICY historical_monthly_read ON public.historical_monthly_allocations FOR SELECT TO authenticated USING (public.can_manage_bunyan_building(building_id));
GRANT SELECT ON public.historical_monthly_allocations TO authenticated;
CREATE OR REPLACE FUNCTION private.reconcile_historical_opening_balance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE wanted numeric(14,2); difference numeric(14,2);
BEGIN
 wanted := coalesce(NEW.historical_monthly_collections_total,0)+coalesce(NEW.historical_exceptional_collections_total,0)-coalesce(NEW.historical_expenses_total,0);
 difference := wanted-coalesce(NEW.historical_adjustment_applied,0);
 NEW.balance := coalesce(NEW.balance,0)+difference;
 NEW.opening_balance := coalesce(NEW.opening_balance,0)+difference;
 NEW.historical_adjustment_applied := wanted;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reconcile_historical_opening_balance ON public.buildings;
CREATE TRIGGER reconcile_historical_opening_balance BEFORE UPDATE OF historical_monthly_collections_total,historical_exceptional_collections_total,historical_expenses_total ON public.buildings FOR EACH ROW EXECUTE FUNCTION private.reconcile_historical_opening_balance();
CREATE OR REPLACE FUNCTION public.save_historical_monthly_allocations(p_building_id uuid,p_allocations jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.profiles; row_item jsonb; apt uuid; m date; v numeric; total numeric:=0; fee numeric; start_m date; seen text[]:=ARRAY[]::text[]; k text;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=app_auth.user_id();
 IF NOT FOUND OR actor.role IS DISTINCT FROM 'building_admin' OR actor.approved IS DISTINCT FROM true OR actor.disabled_at IS NOT NULL OR actor.building_id IS DISTINCT FROM p_building_id THEN RAISE EXCEPTION 'غير مصرح' USING errcode='42501'; END IF;
 IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations)>1500 THEN RAISE EXCEPTION 'توزيع غير صالح'; END IF;
 SELECT collection_start_month INTO start_m FROM public.buildings WHERE id=p_building_id FOR UPDATE;
 IF start_m IS NULL THEN RAISE EXCEPTION 'حدد شهر بداية التحصيل أولًا'; END IF;
 FOR row_item IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
  apt := (row_item->>'apartmentId')::uuid; m := (row_item->>'month')::date; v := (row_item->>'amount')::numeric;
  SELECT monthly_fee INTO fee FROM public.apartments WHERE id=apt AND building_id=p_building_id;
  IF fee IS NULL OR fee<=0 OR v IS NULL OR v<=0 OR v>fee OR m<start_m OR m>date_trunc('month',current_date)::date OR extract(day from m)<>1 THEN RAISE EXCEPTION 'راجع الشقة أو الشهر أو قيمة السداد'; END IF;
  k:=apt::text||':'||m::text;
  IF k=ANY(seen) THEN RAISE EXCEPTION 'تكرار شهر لنفس الشقة'; END IF;
  seen:=array_append(seen,k); total:=total+v;
 END LOOP;
 DELETE FROM public.historical_monthly_allocations WHERE building_id=p_building_id;
 INSERT INTO public.historical_monthly_allocations(building_id,apartment_id,month,amount)
 SELECT p_building_id,(value->>'apartmentId')::uuid,(value->>'month')::date,(value->>'amount')::numeric FROM jsonb_array_elements(p_allocations);
 UPDATE public.buildings SET historical_monthly_collections_total=total WHERE id=p_building_id;
END $$;
REVOKE ALL ON FUNCTION public.save_historical_monthly_allocations(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_historical_monthly_allocations(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
