# AGENTS.md — Development & Workflow Rules

This repository contains Elomara (العمارة). These instructions apply to all coding assistants.

## Accepted product baseline — preserve the current app

Owner decision (2026-11-06): the app currently visible to the owner is the desired product. Historical branch differences are not a feature backlog and do not authorize restoring old functionality.

### Owner-approved restored baseline (2026-11-09)

- The owner explicitly selected the release that added password visibility controls and removed sample contact defaults: `08e7bfe70030491234e2fb7aafc00c64ed4b095b`. Its tracked project snapshot was restored on main by `21aade31306b93cd3455694e40e64c5f90f0e3b2`. This replaces later app versions as the accepted product baseline.
- The owner canceled the changes introduced after that selected release and before the restoration. Those canceled changes are historical work, not pending fixes or an approved backlog. Do not reintroduce them through merges, cherry-picks, old file copies, cleanup, or unrelated feature requests unless the owner explicitly requests the particular change again.
- Start all future work from the latest synchronized main containing this restoration and subsequent owner-approved work. The historical baseline SHA identifies the accepted restoration; it is not an instruction to reset future work to that SHA.
- Preserve the password visibility controls, removal of sample contact defaults, and existing restored screens and behavior. Make only the specific new change requested by the owner.
- Keep canceled code out of the working tree and release inputs. Do not restore abandoned drafts or historical deployment bundles as a starting point. Retain Git history for audit; never force-push or rewrite main to erase canceled commits.
- This restoration changed project files only. Existing database records and already-applied database changes were not rolled back; do not drop data or reverse live migrations as part of this cleanup.

- Implement every requested feature on the latest main, within the existing app screens and flows. Never implement it in an alternative app, an old branch, or a replacement version.
- Preserve existing features, navigation, appearance, authentication methods, financial behavior and data unless the owner specifically requests a change to them. A request to add a feature is not permission to remove, redesign or rewrite existing behavior.
- Read the affected current implementation before editing. Make the smallest coherent change; do not replace whole files with historical branch versions.
- Do not merge, cherry-pick or restore old branches merely because they contain different code. The branch review document is a historical comparison, not an approved implementation plan.
- Before app-code changes, identify the current main commit and available deployed APK/OTA build identifiers. Do not assume the owner's installed version equals main. If evidence shows a mismatch, reconcile which source produced the accepted app before making changes that depend on that baseline; never downgrade the app to an older branch.
- Verify the requested addition and the existing affected flows, including relevant admin/resident roles and mobile behavior. Build/type checks alone do not establish absence of regressions. State what was actually tested and any unresolved limits.
- In the completion report, name the requested addition, its location in the existing app, and the regression checks performed.
- Keep fixes to separately discovered issues as findings unless they are necessary to the requested task or separately authorized. Do not restore old phone login, layouts or announcement screens from the branch review under the guise of cleanup.

## 1. Git workflow: main only

- Work directly on `main`. Do not create feature, fix, recovery, migration, or temporary branches or branch-based worktrees unless the owner explicitly changes this policy.
- Do not require or open pull requests for routine changes. Commit and push scoped, verified changes directly to `main`.
- Before editing, inspect `git status` and preserve any existing uncommitted work. Never reset, discard, or overwrite another session's changes.
- With a clean working tree, synchronize before starting:

```bash
git switch main
git pull --ff-only origin main
```

- If switching or pulling fails, inspect and resolve the cause without force. Do not create a branch as a workaround.
- Before pushing, fetch `origin/main`. If it advanced, integrate its changes safely on `main` and repeat relevant checks.
- Never force-push or rewrite shared `main` history. Use a new corrective or revert commit for rollback.
- Review existing branches before deletion. A branch with commits absent from `main` requires review of its actual changes and preservation of needed work; commit counts alone do not prove missing features.
- All automated builds and OTA releases must use `main`. Manual release runs must also be restricted to `refs/heads/main`.
- If access, tools, or protection rules prevent an operation, report the exact limitation and completed changes; never claim a push, deletion, or check that did not happen.

2. Over-The-Air (OTA) Update Lifecycle
How OTA Works in Elomara
The OTA deployment pipeline is defined in .github/workflows/bunyan-ota.yml.
It triggers on pushes to main or manual runs on main only.
The pipeline executes:
npm install
npm run build
Bundles dist/ into ${GITHUB_SHA}.zip and updates latest.json in the Supabase Storage bunyan-ota bucket.
Deploys the manifest with bundleId = ${GITHUB_SHA}.
AI Constraints for OTA:
Never break npm run build: If the build fails, the OTA pipeline will fail, and updates will not reach end users.
Client-side LiveUpdate protection:
The client update logic is located in src/main.tsx (initializeLiveUpdates) and uses @capawesome/capacitor-live-update.
Do NOT modify the core bundle validation, checksum matching, or reload logic in src/main.tsx unless explicitly requested.
Do NOT change autoUpdateStrategy: 'none' in capacitor.config.ts.
Commit SHA awareness: OTA deploys commits pushed directly to main. Keep its validation and build checks passing.
3. Project Architecture & Directory Structure
Adhere strictly to the existing modular structure in src/:
src/
├── components/     # Reusable UI components & AI assistant dialogs
├── context/        # React Context providers (State management)
├── data/           # Static data and mock definitions
├── hooks/          # Custom reusable React hooks
├── lib/            # External clients (Supabase client in supabase.ts)
├── services/       # AI services (Google Gemini API via @google/genai)
├── types.ts        # Central TypeScript interfaces & type definitions
├── main.tsx        # Application entry point & OTA live-update initialization
├── App.tsx         # Main layout & routing
└── index.css       # Tailwind CSS v4 styling rules


Architectural Guardrails:
TypeScript & React 19: Strictly type all props, functions, and state. Do not use any unless absolutely necessary.
Component Organization: Before creating a new component, check src/components/ to reuse existing primitives and avoid duplicate implementations.
State Management: Use existing React Contexts in src/context/. Do not introduce secondary or conflicting state managers.
Database & Auth: All database queries and auth operations must use the centralized Supabase client from src/lib/.
Database Migrations: Any schema or table changes must be documented with an SQL migration script inside supabase/migrations/.
4. Environment Variables & Security
Never commit secrets, service role keys, or API credentials to Git.
Client-accessible environment variables must start with VITE_ (e.g. VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
AI keys (e.g., GEMINI_API_KEY) and Supabase admin keys (SUPABASE_SERVICE_ROLE_KEY) must remain secure.
5. Mandatory Pre-Commit Checklist for AI Assistants
Before declaring any task or code change complete, verify:
[ ] Fresh Base: Work is on main and synchronized with origin/main; no extra branch was created.
[ ] No Regressions: No existing features, styles, or imports were accidentally removed or overwritten.
[ ] Type Safety & Build: npm run build compiles without errors.
[ ] TypeScript Check: npm run lint (tsc --noEmit) passes without blocking errors.
[ ] Scoped Changes: git diff contains only files relevant to the requested task.

For documentation-only changes, review the diff and links; a full application build is unnecessary. For workflow changes, validate workflow structure and branch guards, then inspect GitHub Actions results. Report any check that could not be run.

## Mobile notification release notes

- When shipping a user-visible improvement, update `release-notes.json` with a new stable `release_id` and short, friendly Arabic title/body explaining the benefit. Never copy commit messages, code names, or technical details into the user notification. Routine internal changes keep the existing release ID.
- OTA publishes that notice only after uploading the bundle. The database deduplicates by release ID and queues each registered device separately.
- `deliver-mobile-notifications` authenticates scheduled calls using the existing hashed cron secret. Its gateway JWT verification is disabled because its own secret authentication is required. Keep this check; no unauthenticated delivery is permitted.
- Phone notifications use generic text for financial/maintenance events; amounts and private details stay inside the authenticated inbox. Never test delivery by broadcasting fictional events to real members.
