# Guided building account setup

Start from the manager setup screen after login, the detached manager welcome page, or Building Details → تسجيل الحسابات خطوة بخطوة. New buildings enter details and actual cash; transfers additionally enter the historical period, each apartment’s actual monthly payments, and an optional exceptional assessment with actual paid amounts. All inputs belong to the selected building, with no example amounts or unit counts prefilled. Lists paginate after 20 apartments.

Monthly payments allocate oldest first through the selected historical end month. A 6000 per-apartment exceptional assessment across 14 units is 84000 due, independently of actual collections. Imported exceptional settlements link to the corresponding assessment, are identified as opening entries, cannot be edited/deleted as ordinary receipts, and do not issue receipt notifications. They remain available for apartment balances while period cash reports exclude them; historical summaries count them once.

The entered treasury amount is observed net opening cash. Historical data is already included and never adds cash again. Reserve is an earmarked portion of that amount. A new building flag leaves all existing legacy opening arithmetic unchanged. Existing financial records block a fresh import before any write; no automatic reset is performed. The explicit reset operation clears the new opening mode and allows a subsequent new import.

Migration 030 adds two false-by-default flags and a private idempotency table, and updates only the relevant function definitions. It invokes no resets and rewrites no customer financial records. The final setup RPC verifies identity and building ownership, locks membership/building rows, validates every share and period, commits everything atomically, and replays an identical request without duplicating records. A possibly committed client request freezes its payload until confirmed; known validation rejections allow correction. Verified pending managers and approved detached managers use their existing creation authorization paths.

Verification:

- TypeScript, production build, native JSON serialization, opening-cash preview and payment/OTA/backend unit tests.
- Real Chromium on mobile and desktop using synthetic transport: 14 × 6000 due, 100 subscription, partial/zero/full payments, observed cash 3000, reserve validation, back-step draft retention, pending save, retry with identical key/payload, new-building skip path and protected existing records.
- Separate 21-unit browser scenario uses a 250.75 subscription and confirms pagination preserves the correct apartment share.
- Isolated Neon SQL rehearsal wraps both schema and all fixture changes in a rollback. Tests cover 14-unit and unrelated 3-unit buildings, fractional amounts 250.75/999.99/333.33, manager/building isolation, 84000 due, partial payments, treasury preservation, reports, retries, future cash receipts, imported-entry protection, verified pending creation, failed-save rollback and reset/reimport.
- Existing unified financial settings, historical ledger, explicit fee changes and membership handoff regressions.

These are native transport simulations, real browser checks and isolated Postgres tests, not a physical Android-device test. The simplified transfer currently accepts one historical exceptional assessment; further separate assessments remain available through the existing exceptional collection screen. Subscription amount is entered for all units during setup; existing apartment editing supports later custom subscriptions.

Production status: the owner explicitly approved updating the live Neon database and publishing the feature. Migration 030 was installed atomically on the production Neon branch; installation invoked no reset or customer accounting mutation. The setup RPC, authenticated execution grant and new flags were verified from the database catalog before publication. Imported exceptional settlement totals are derived and read-only in the legacy settings form, to prevent disagreement with apartment-level payments. The simplified initial wizard does not edit an already populated ledger.
