-- Additive only. Existing trial, VIP, founder flags and building records remain intact.
BEGIN;
ALTER TABLE public.building_subscriptions ADD COLUMN IF NOT EXISTS billing_source text;
CREATE TABLE IF NOT EXISTS private.play_purchases (
 token_hash text PRIMARY KEY,
 purchase_token text NOT NULL,
 building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
 admin_id uuid NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
 product_id text NOT NULL CHECK(product_id IN ('elomara_building_monthly','elomara_building_annual')),
 base_plan_id text NOT NULL,
 play_state text NOT NULL,
 last_order_id text,
 expires_at timestamptz,
 auto_renewing boolean NOT NULL DEFAULT false,
 entitled boolean NOT NULL DEFAULT false,
 last_checked_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS play_purchases_building ON private.play_purchases(building_id);
CREATE INDEX IF NOT EXISTS play_purchases_verified ON private.play_purchases(last_checked_at);
REVOKE ALL ON private.play_purchases FROM PUBLIC,anon,authenticated;
ALTER TABLE private.play_purchases ENABLE ROW LEVEL SECURITY;
COMMIT;
-- No client policies, payment gates, trial resets or data backfills.
