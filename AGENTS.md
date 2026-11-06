# AGENTS.md — Development & Workflow Rules

This repository contains Elomara (العمارة). These instructions apply to all coding assistants.

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
