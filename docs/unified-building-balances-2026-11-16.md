# Unified building balances — 16 November 2026

Opening cash and the emergency reserve now live in the existing Building Details dialog alongside historical settings and monthly allocations. The separate More menu item and Treasury Settings page are removed. Old `treasury-settings` URLs and notification links open the unified dialog; guide steps point at its real fields.

The base opening amount excludes the historical adjustment already applied to the stored opening balance. The preview includes saved historical monthly allocations, exceptional opening collections, historical expenses and actual cash movements. The emergency reserve retains its existing meaning: a separate designated amount that does not automatically become cash income or an expense.

`save_building_management` validates the financial snapshot under a building lock, saves metadata and all opening inputs in one transaction, applies only the base and historical differences, reconciles units, and records the treasury audit entry. Concurrent balance changes reject the stale form without partial metadata writes. `create_manager_building_with_finances` also rolls back membership and generated apartments if opening validation fails. Unknown legacy opening balances retain the explicit included/add choice.

The reported reset → historical expenses 10000 → historical exceptional collections 8000 failure was reproduced on the isolated Neon rehearsal branch. The old opening constraint rejected -2000. Migration 027 permits signed opening balances while preserving both numeric bounds; it does not change stored balances. Migration 028 defines the unified operations without rewriting production records. Both were tested on the rehearsal branch before installation. No customer balance or allocation was entered or reset for testing.

Verification:

- TypeScript and production build; relevant Node financial, Neon client, OTA and backend tests.
- `test-unified-building-finance.py`: 390/1280 widths; menu removal, one-page save, pending/error/stale/cancel behavior, unchanged base after historical adjustments, independent reserve, old links and legacy inclusion choice.
- `test-historical-ledger.py`: 320/390/1280 widths; complete allocation workflow, reports, resident balances, and the exact reported negative-opening case.
- Membership handoff scenarios (creation, auth races, retries, account switches and generated units) still pass with the new creation operation.
- Opening/reserve guide steps were exercised in their new dialog on mobile and desktop, without financial writes.
- `neon/tests/sql/historical-ledger.sql` and `unified-building-finance.sql`: real Postgres arithmetic, delta-only updates, negative openings, bounds, authorization, stale snapshots, metadata/financial atomicity and creation rollback. Fixtures and the temporary identity shim are rolled back on the isolated branch.

These checks do not constitute a physical Android or real email-delivery test. The separate pre-existing announcement-image test issue remains documented in the earlier historical review.

Follow-up: native saving and distribution access

The unified save now sends explicit JSON through the established native-compatible transport, including all named RPC parameters. Creation uses the same transport; session errors do not automatically retry financial writes. Tests assert the exact nested request body, explicit null finance, authentication errors and parameter-cache failures.

An inline “حفظ بيانات العمارة وفتح التوزيع” button saves pending changes, refreshes the confirmed snapshot and keeps the dialog open before enabling allocation. Normal save retains its close behavior. Browser checks reproduce base 10000, expenses 5000 and exceptional collections 8000: cash becomes 13000, then allocating 1000 from January 2025 makes cash 14000 without creating ordinary receipts. Verification uses synthetic native transport and Chromium, not a physical Android device.

Follow-up: total distribution and apartment subscriptions

Editing the historical monthly total now drafts equal shares in integer cents, limited by each apartment's monthly fee and the saved collection period. Apartments with zero dues are excluded. Managers can edit each share or explicitly redistribute again; invalid totals and unallocated overflow remain visible and block saving. Loading existing allocations preserves their months and amounts until edited.

An explicit checkbox in Building Details applies the entered default subscription to all existing apartments, including customized rates. Leaving it unchecked preserves existing positive fees. Migration 029 changes only the function definition; installation does not modify customer rows. The existing unified save performs fee changes and ledger reconciliation atomically. Saving from the distribution panel reloads confirmed apartment rates immediately.

The historical-allocation mutation now uses explicit native JSON as well, with a confirmed void HTTP response and no automatic mutation retry. Verification includes cents/capacity/zero-fee unit tests; native request serialization; reported 20000 over 15 apartments at 200; manual edits, reopening, overflow and mobile/desktop UI; and isolated SQL tests for opt-in fee changes, cash preservation, repeat saves and authorization. No physical Android device was used.
