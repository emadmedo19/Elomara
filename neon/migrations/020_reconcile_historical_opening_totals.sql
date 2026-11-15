-- Historical opening totals affect treasury exactly once, even when edited repeatedly.
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS historical_adjustment_applied numeric(14,2) NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION private.reconcile_historical_opening_balance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE wanted numeric(14,2); difference numeric(14,2);
BEGIN
 wanted := coalesce(NEW.historical_exceptional_collections_total,0) - coalesce(NEW.historical_expenses_total,0);
 difference := wanted - coalesce(NEW.historical_adjustment_applied,0);
 NEW.balance := coalesce(NEW.balance,0) + difference;
 NEW.opening_balance := coalesce(NEW.opening_balance,0) + difference;
 NEW.historical_adjustment_applied := wanted;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reconcile_historical_opening_balance ON public.buildings;
CREATE TRIGGER reconcile_historical_opening_balance BEFORE UPDATE OF historical_exceptional_collections_total,historical_expenses_total ON public.buildings FOR EACH ROW EXECUTE FUNCTION private.reconcile_historical_opening_balance();
-- Apply already saved opening amounts exactly once, including the user's existing entries.
UPDATE public.buildings SET historical_expenses_total = historical_expenses_total WHERE coalesce(historical_adjustment_applied,0) IS DISTINCT FROM (coalesce(historical_exceptional_collections_total,0)-coalesce(historical_expenses_total,0));
