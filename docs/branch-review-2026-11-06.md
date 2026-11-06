# Branch review — 2026-11-06

> **Owner decision after review:** preserve the app currently visible to the owner. The comparisons and port suggestions below are historical findings, not an approved backlog. Do not restore old features, layouts, authentication methods or branches based on this report. Future additions belong in the current app on main and must preserve its existing behavior. Verify deployed build identity before assuming it equals main. See AGENTS.md for the governing policy.

Compared with main at `6d472f4657ef136033880695daf7b030ce5e4f91` before the main-only policy change. Branches have not been deleted. Ahead/behind counts describe ancestry, not whether equivalent changes were squash-merged or superseded. Do not merge old recovery branches wholesale.

| Branch | Head SHA | Ahead | Behind |
| --- | --- | ---: | ---: |
| feature/anonymous-polls | 6f5556830e19adf34b86d9c0bb2a0a793a370dcf | 11 | 6 |
| feature/multi-tenant-buildings | b5489fe6548338a49e67600c2c28291a8bee4190 | 13 | 71 |
| feature/restore-email-auth-exceptional-collections | 625c6059c5e5d6c3d64a7225f7ab39ca54ee9150 | 20 | 1 |
| fix/auth-bootstrap-403-nov05 | ae558dfea5c05d9576a7fd905e743b0327fa0533 | 100 | 62 |
| fix/ota-apply-update-immediately | f9f6b660d964f5df599f1844c9fb6acf14e10f2a | 0 | 5 |
| fix/resident-mobile-layout-v2 | 9e308eb8b455437d3f82c459faa176bccf7a7e62 | 12 | 71 |
| fix/resident-portal-mobile-layout | 0bc144c868c5b2ecb226b5b5fe94dfc0c88f5520 | 9 | 71 |
| fix/tailwind-oxide-install | 6bbffd9727a51d55307c644fa6cafdd255501a52 | 1 | 2 |
| migration/multi-tenant-isolation | cd0c7f2e7e577c70005a4ddfdf284489a8040192 | 71 | 62 |
| recovery/google-only-stable-nov04 | 2bcba52fa392157cc4b530692457f2db51696f00 | 67 | 62 |
| recovery/nov04-11pm-stable | 2bcba52fa392157cc4b530692457f2db51696f00 | 67 | 62 |
| recovery/nov04-2300-stable | 2bcba52fa392157cc4b530692457f2db51696f00 | 67 | 62 |
| recovery/phone-auth-compatible-nov05 | d7d07798f14384fc9855e7820c5a8704a2b0fa73 | 2 | 21 |
| recovery/phone-auth-nov04 | cd0c7f2e7e577c70005a4ddfdf284489a8040192 | 71 | 62 |

`fix/ota-apply-update-immediately` is already contained in main. Other branches require content review before deletion. The connected GitHub tool supports file updates but does not expose branch deletion, and local Git access failed because the configured proxy could not be reached. SHA references here are an inventory, not a durable backup of unmerged commits.

## Content review against main 24d7e9ba75f6d2243c3e53438700bfab024c36d3

Method: compare recursive Git blob trees at every branch head, then inspect branch-side patches relative to the merge base and the current main files. Ancestry counts above were recorded before the policy commit. This is a source review, not a live Supabase audit or a device test.

### Findings requiring preservation or separate work

1. **High — missing versioned push endpoint.** Main calls `send-announcement-push` in `src/App.tsx` (lines 211 and 947 at the reviewed commit), but its tree has no `supabase/functions/send-announcement-push/index.ts`. That implementation exists in `fix/auth-bootstrap-403-nov05`. Fresh deployment from main cannot reproduce this endpoint. This does not prove an already-deployed endpoint is absent. Preserve and review it before deleting that branch. The old handler uses the service-role client, checks approval and building ownership, but does not select/check `disabled_at` for callers or recipients; it should not be copied into production unchanged.
2. **Medium — mobile layout fixes absent.** The resident layout branch adds viewport containment, safe-area navigation padding, long-name wrapping and CSS targeting `.fotouh-portal > nav.resident-bottom-nav`. Main's ResidentPortal still uses the older root/nav markup, and its stylesheet lacks those added selectors. Port the relevant layout changes selectively and verify on a narrow viewport; replacing the old component wholesale would lose newer polls and exceptional-payment handling.
3. **Medium — announcement management UI absent.** `fix/auth-bootstrap-403-nov05` adds announcement list/delete props to AiStudioView and wires them through App. Main's component has neither that interface nor the published-announcement list. Preserve these changes for a focused port.
4. **Product difference — phone login absent.** `recovery/phone-auth-compatible-nov05` adds phone/password login and SMS OTP signup/verification. Main AuthContext exposes Google/email methods only. The older migration/recovery branches also include phone-invite/OTP functions and migrations. These are not a drop-in fix: main's later migration explicitly revokes legacy phone/email invitation RPCs and removes global admin roles. Restoring phone authentication requires current backend/provider verification.
5. **Do not merge historical migrations wholesale.** Main's `20261105100138_remove_global_roles_and_legacy_onboarding.sql` removes super_admin/assistant_admin and revokes legacy onboarding functions. Older branches contain those roles, invitation RPCs and differently timestamped migrations. A wholesale merge could reintroduce obsolete authorization paths or duplicate migrations.

### Branch disposition

| Branch | Content finding / disposition |
| --- | --- |
| feature/restore-email-auth-exceptional-collections | Every blob present on this branch outside the six policy/report files matches main. Application, migrations and exceptional push handler are already present. No application port needed. |
| fix/tailwind-oxide-install | Its sole branch-side change pins oxide 4.3.4; main package.json has the identical blob. No port needed. |
| fix/ota-apply-update-immediately | Branch tip is an ancestor of main; src/main.tsx is identical. No port needed. |
| feature/anonymous-polls | PollsView, poll migration and send-poll-push are identical blobs on main; App/Header/ResidentPortal contain the poll integration plus later changes. No poll-feature port identified. |
| fix/resident-portal-mobile-layout | Preserve mobile CSS changes; older tenant/onboarding code must not replace main. |
| fix/resident-mobile-layout-v2 | Preserve viewport/nav/wrapping changes described above. |
| feature/multi-tenant-buildings | Contains the v2 mobile work and older multi-tenant onboarding; preserve mobile changes, avoid wholesale merge. |
| fix/auth-bootstrap-403-nov05 | Preserve announcement management UI and missing push endpoint; selectively review remaining auth changes. Not safe to declare fully superseded. |
| recovery/phone-auth-compatible-nov05 | Preserve phone auth implementation pending backend/product review. |
| migration/multi-tenant-isolation | Historical phone invitation/WhatsApp-first OTP backend and migrations; preserve before removal. |
| recovery/phone-auth-nov04 | Exactly the same commit/tree as migration/multi-tenant-isolation; redundant branch pointer, not evidence the work is in main. |
| recovery/google-only-stable-nov04 | Same commit/tree as the following two recovery branches; contains historical phone/invitation backend. |
| recovery/nov04-11pm-stable | Duplicate pointer to 2bcba52fa392157cc4b530692457f2db51696f00. |
| recovery/nov04-2300-stable | Duplicate pointer to 2bcba52fa392157cc4b530692457f2db51696f00. |

No branches were deleted or merged by this review. Before deleting branches with unique work, preserve their history in a verified archive/tag or selectively port reviewed changes. Recording a SHA in this file is not a backup.

### Validation

At review time, GitHub Actions for policy commit 24d7e9b reported CI, Validate anonymous polls and Bunyan OTA successful; Android APK build was still running. Build success does not verify deployed Edge Functions, authentication providers, tenant isolation or mobile layout.
