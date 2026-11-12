-- Subscription infrastructure (payment enforcement remains disabled until verified).
-- Never grant direct client writes to these tables.
CREATE TABLE IF NOT EXISTS public.building_subscriptions (
  building_id uuid PRIMARY KEY REFERENCES public.buildings(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','expired','vip')),
  plan text CHECK (plan IN ('monthly','annual')),
  trial_ends_at timestamptz,
  paid_through timestamptz,
  founder_discount boolean NOT NULL DEFAULT false,
  vip_granted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'vip' OR vip_granted_at IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS private.vip_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  redeemed_building_id uuid UNIQUE REFERENCES public.buildings(id),
  revoked_at timestamptz,
  CHECK (redeemed_at IS NULL OR redeemed_building_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS private.subscription_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  building_id uuid REFERENCES public.buildings(id),
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.building_subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON private.vip_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON private.subscription_events FROM PUBLIC, anon, authenticated;
ALTER TABLE public.building_subscriptions ENABLE ROW LEVEL SECURITY;
-- Admin-only generation/redemption functions must be implemented after verifying
-- the existing platform-owner authentication mechanism. No secrets in frontend.
-- No trial expiry enforcement, paid activation or billing occurs in this migration.
