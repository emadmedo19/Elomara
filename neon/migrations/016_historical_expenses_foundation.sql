-- Opening historical expenses: a single aggregate, not fabricated itemized expenses.
-- No current treasury or transaction is modified by this migration.
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS historical_expenses_total numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.buildings ADD CONSTRAINT historical_expenses_total_nonnegative CHECK (historical_expenses_total >= 0);
COMMENT ON COLUMN public.buildings.historical_expenses_total IS 'Aggregate expenses predating onboarding; not an expense ledger row. Treasury reconciliation must avoid double deduction.';
