-- Non-destructive foundation; existing buildings remain unconfigured.
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS collection_start_month date;
ALTER TABLE public.buildings DROP CONSTRAINT IF EXISTS buildings_collection_start_first_day;
ALTER TABLE public.buildings ADD CONSTRAINT buildings_collection_start_first_day CHECK (collection_start_month IS NULL OR EXTRACT(DAY FROM collection_start_month) = 1);
COMMENT ON COLUMN public.buildings.collection_start_month IS 'First monthly dues period. NULL until manager explicitly configures it; existing balances are unchanged.';
