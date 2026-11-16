-- Opening adjustments can represent a genuine deficit, just like treasury cash.
-- Keep both monetary bounds; this changes validation only, not any stored balance.
ALTER TABLE public.buildings
 DROP CONSTRAINT buildings_opening_balance_check,
 ADD CONSTRAINT buildings_opening_balance_check CHECK (
  opening_balance IS NULL OR
  (opening_balance >= -9999999999.99 AND opening_balance <= 9999999999.99)
 );
