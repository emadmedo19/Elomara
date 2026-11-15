# Application review fixes — 15 November 2026

Scope: the twenty findings in the application review, on the existing Neon app.

| Finding | Implementation |
| --- | --- |
| 1. Fabricated invoice data | OCR errors retain the user's values and image, report the failure, and allow manual entry. The sample receipt button was removed from the production expense form. |
| 2. Arrears becoming advance credit | Payment creation, editing, and reconciliation no longer reset the persisted dues basis (`overdue_months`). Tests cover settlement and deleting the receipt afterwards. |
| 3. Partial financial writes | Neon `mutate_financial_entry` locks the building, writes the movement, recalculates its apartment, records the audit event and applies the treasury delta in one transaction. Stable request IDs protect retries of the same form. |
| 4. Concealed treasury deficit | The financial transaction preserves a real negative balance; reversing the expense restores the exact previous balance. |
| 5. Separate booking lists | Manager bookings load from the same Neon table used by residents. Manager-created bookings are persisted there. Confirm/cancel/status updates are scoped to the building. |
| 6. Incomplete maintenance lifecycle | Managers can start/complete/reopen a ticket and include a note. Residents read its status, note and update time from Neon. |
| 7. Premature expense form close | The form waits for confirmed success, disables resubmission, retains its values on failure and reuses its request ID on an unchanged retry. |
| 8. Device-only audit | New payment and expense changes create server-time audit rows, with previous/new values and actor identity. Managers can read only their building's rows and cannot update/delete them through the client. The UI displays the latest 500 rows. Receipt image payloads are excluded from audit snapshots. |
| 9. Read errors shown as empty data | Resident payment, maintenance, booking and report reads report failures; successful previous lists are retained and a retry action is offered. |
| 10. Advance cash inflates collection rate | The rate uses settled dues, while actual cash and advance credit remain separate totals. |
| 11. Demo labels/date | Removed the fixed October 2024 cycle and the experiment wording from manager unit review. |
| 12. Resident Back navigation | Primary tabs and shortcuts now update browser history consistently. |
| 13. Payment shortcut | Dashboard collection action opens the payment form directly. |
| 14. Small adjacent destructive actions | Compact cards keep the payment action visible and group uncommon edit/delete actions under unit options. Remaining financial icon targets are at least 44 px. |
| 15. Long apartment cards | Compact rows show identity and financial status, with full information in the existing details dialog. Search and filters remain. |
| 16. More/settings duplication | More is grouped into finance, resident services, tools, building administration and account settings. Sign-out/account deletion remain in account settings. |
| 17. Misleading copy | Reports describe recorded data without claiming an approval process; login copy includes email; the assistant describes informational support and prompts review of legal/financial information. |
| 18. Missing Other category | Expense category breakdown includes Other and unknown categories in Other. |
| 19. Empty service grids/single language | An empty directory has one clear message and a manager add action. Only populated categories are listed. Arabic is displayed as information rather than a one-choice settings page. |
| 20. Long first-run guide | Manager/resident first use has 5/4 steps. Help retains the full 41/22-step guide. |

## Verification

- `npm run lint`, `npm run build`, `npm run lint --prefix neon`.
- `node --test tests/paymentTotals.test.mjs tests/neonClient.test.mjs tests/otaUpdates.test.mjs neon/tests/*.test.mjs`.
- Browser fixtures and `test-review-fixes.py`, `test-collections-dialogs.py`, `test-signup-verification.py`, `test-resident-success-feedback.py`, `test-app-tour.py`.
- Rehearsal SQL: `neon/tests/sql/review-financials.sql` on isolated Neon branch `br-little-cake-be5atnde`. The role simulation changes **only** `app_auth.user_id()` inside a rolled-back test transaction; the real Neon Auth function is retained. This tests authorization boundaries without impersonating a real user or issuing production events.
- Concurrent transactions on that isolated branch: initial balance 100; two simultaneous receipts of 10 and 20; final balance 130, receipt total 30, two audit rows. Original application identity function restored afterwards.

## Deployment and data boundaries

Apply `neon/migrations/014_financial_transactions_and_shared_workflows.sql` to Neon before publishing this client. It adds the audit/request tables, RPCs, service notes and booking update time. It does not recompute existing balances or backfill local-device history as verified server history. Old dues that were already reset by a previous version cannot be reconstructed reliably from cash alone; any historical correction needs the actual obligation period.

SQL rehearsal and browser tests do not verify a physical Android installation, actual Google/email delivery, Play Billing, or push delivery to a real device. No fictional production event is sent for testing. Shared service workflows and server transactions are Neon changes; no legacy provider migration is included.

Deployment verification: the migration was applied transactionally to the existing Neon production branch before client publication. Read-only verification confirmed the audit table, enabled row security, authenticated read access, no client DELETE privilege, authenticated financial RPC access, no anonymous RPC access, and both service-note columns. No production receipts, expenses, bookings or balances were created or rewritten during verification.
