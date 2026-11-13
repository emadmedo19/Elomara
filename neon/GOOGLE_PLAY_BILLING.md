# Google Play building subscriptions

The existing **المزيد → الاشتراك والباقات** screen uses the native official Google Play Billing Library (8.0.0). Only the Neon Android build with the new native plugin supports purchasing. Older APKs receiving an OTA remain usable and show no purchase buttons. No LiveUpdate validation or update strategy changed.

## Play Console setup (required before purchases)

Package: `app.bunyan.residential`. Upload the signed `Elomara-Google-Play-AAB` artifact from **Build Neon Android candidate** on main to an internal test track. Use Play installation and license tester accounts; sideloaded APK tests do not establish billing readiness.

| Product ID | Auto-renewing base plan ID | Billing period | Egypt price per building |
| --- | --- | --- | --- |
| `elomara_building_monthly` | `monthly` | P1M | EGP 99 |
| `elomara_building_annual` | `annual` | P1Y | EGP 999 |

Configure and activate these exact products/base plans and regional availability in Play Console. The UI uses `PricingPhase.getFormattedPrice()` only; no exchange-rate calculation or hardcoded fallback price. Residents pay nothing. No Play free trial is created: the existing server-calculated 14-day building trial stays unchanged. Buying during it starts the Play subscription immediately; Play's confirmation sheet shows the charge.

Enable the Google Play Android Developer API for the associated Cloud project. Grant a dedicated service account access to this app with permissions to view financial data/orders/subscriptions and manage orders/subscriptions, including acknowledgement. Store its JSON only as GitHub Actions secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`; deployment forwards it to the existing Neon Function. Never use a VITE variable. Do not reuse or expose Firebase credentials.

Create an authenticated Pub/Sub push subscription for Play real-time developer notifications, including voided purchases, to:

`https://<existing-neon-function-origin>/functions/v1/google-play-rtdn`

Grant Google's Play notification publisher the required publisher role on the topic. Configure the push service account/OIDC token and the exact audience. Set repository variables `GOOGLE_PLAY_RTDN_EMAIL` (push identity email) and `GOOGLE_PLAY_RTDN_AUDIENCE` (exact configured audience). Deploy the backend again. Wrong issuer, audience, email or unverified email is rejected before token processing. Notification contents never grant entitlement; they trigger Developer API verification. Configure retries/dead-letter monitoring. Unknown tokens are ignored until an authorized administrator restores them; no building is inferred from untrusted notifications.

Purchasing is off by default. After Console products, backend credentials, migration and internal testing are ready, set repository variable `GOOGLE_PLAY_BILLING_ENABLED=true` and redeploy to expose purchase buttons to the test app. This flag controls purchase availability, not payment enforcement. There are **no payment restrictions** anywhere in this change. Do not enable paid Cloud services without owner authorization.

## Database and server behavior

Apply `neon/migrations/012_google_play_billing.sql` using the existing direct Neon migration connection. The identical `supabase/migrations/20261113_google_play_billing.sql` is documentation under the repository-required migration path, **not an instruction to modify the legacy Supabase backend**. Prerequisite: the existing `building_subscriptions` / private subscription foundation already deployed in Neon. The migration adds a private, RLS-protected token ledger and a nullable billing-source column; it performs no data backfill, trial reset or user/building deletion. Do not run the old foundation against Neon as a substitute.

The endpoint authenticates the existing Neon identity, checks current approved, enabled `building_admin` membership, then calls `purchases.subscriptionsv2.get`. Obfuscated account/profile IDs are deterministic SHA-256 hashes of domain-separated application administrator/building IDs. Both must match Google's response. A token cannot be moved to another building or account. Another current building manager can refresh existing subscriptions without receiving their tokens; claiming/restoring an unknown purchase requires the original purchasing administrator. Account transfer is not automated.

Tokens are server-only in `private.play_purchases` for notification/reconciliation; never returned to clients or logged. Google OAuth uses short-lived server-signed assertions. Advisory token locks and building row locks serialize duplicate callbacks and entitlement updates. Active purchases are acknowledged server-side. Acknowledgement failures roll back activation and are retried on restore/RTDN/reconciliation. Pending purchases do not activate or overwrite an existing subscription.

Cancellation retains access until Google's expiration, including grace period. Hold, pause, expiration and revoked purchases remove Play entitlement. RTDN refunds additionally query Google's voided-purchases API and match the latest order; refunded orders cannot be reactivated by replaying an ordinary callback. A later verified renewal can reactivate. The building status uses the best remaining verified purchase, preserves VIP, and never overwrites unrelated existing paid status with a failed/expired new purchase. Existing founder flags remain unchanged.

Register the disabled example `elomara-play-billing` trigger in `neon/triggers.json` against `/cron/play-billing` after setup. The route uses existing Neon platform trigger authentication, not a public cron header. It verifies the 50 oldest ledger entries each invocation. Monitor failures and provision an adequate cadence for ledger size. It is intentionally not enabled by this commit; setting up an external scheduler or paid service is not automatic. RTDN plus periodic reconciliation are required for reliable background renewals/refunds while the app is closed. App opening/resuming and explicit restore also reverify stored and Play-owned purchases.

## Trial, VIP and founder discount

Existing trial calculations, VIP redemption and platform-owner controls are unchanged. `elomara50off` remains a provisional founder code for the first ten buildings, without reserving a slot or granting a discount. Existing founder flags are retained. **No founder offer is currently configured or supported for sale**: both native catalog and backend reject discount offer IDs. The UI explicitly says checkout uses the displayed Play price. Before selling a founder discount, configure the approved offer in Play and add a reviewed, server-authorized eligibility/reservation flow for the ten-building limit. Never calculate half-price locally or mark a founder subscription paid from a code alone.

## Release acceptance checklist

Use internal-track license testers, not real member charges. Verify monthly and annual localized pricing and Play confirmation; purchase/acknowledgement; pending→paid; user cancellation; network loss after charge; app restart and restore; restore with wrong administrator/building; disabled/unapproved managers and residents; two administrators/devices; renewal, cancellation until expiration, grace, hold, pause, refund/revoke and duplicate/out-of-order RTDN; expired trial remains usable; VIP remains free; founder code never alters Play prices. Verify existing sign-in, admin/resident screens, push registration and OTA checks. No fabricated broadcasts to members.

Automated tests cover entitlement states, product/offer allowlists, authentication/membership, cross-account/building binding, untrusted client success, acknowledgement ordering, pending purchases, and forged notifications. Unit/mocked tests do not substitute for Play Console tests. Do not enable payment enforcement based on these tests alone.
