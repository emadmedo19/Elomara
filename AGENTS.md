AGENTS.md — Development & Workflow Rules for AI Assistants
This repository contains the Elomara (العمارة) residential property management application. All AI coding assistants (ChatGPT, Cursor, Copilot, Claude, etc.) working on this repository MUST strictly follow the workflow and architectural rules below to prevent regression, broken builds, or Over-The-Air (OTA) update overwrites.
1. Git & Branching Rules (Critical for OTA Stability)
Rule 1.1: Always Branch from Latest main
Never branch off a stale branch or an old commit.
Before starting any task or generating code, ensure the base is up to date:
git checkout main
git pull origin main
git checkout -b <branch-type>/<short-description>


Allowed branch prefixes:
feature/ — New features or UI components
fix/ — Bug fixes
refactor/ — Code cleanup without behavior change
Rule 1.2: Rebase / Sync Before Creating a Pull Request
Before finishing a task or opening a PR, always pull the latest changes from main to prevent overwriting commits made by other sessions or PRs:
git checkout main
git pull origin main
git checkout <your-branch>
git merge main


Resolve any merge conflicts carefully. NEVER discard or revert existing features or fixes from main.
Rule 1.3: Single Pull Request per Feature / Fix
Do not stack multiple unmerged branches on top of each other.
Keep each Pull Request atomic and focused on one specific feature or fix.
2. Over-The-Air (OTA) Update Lifecycle
How OTA Works in Elomara
The OTA deployment pipeline is defined in .github/workflows/bunyan-ota.yml.
It triggers ONLY on a push to main (or migration/supabase-backend).
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
Commit SHA awareness: If changes are not merged into main, they will never be deployed via OTA.
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
[ ] Fresh Base: The code is branched from the latest origin/main.
[ ] No Regressions: No existing features, styles, or imports were accidentally removed or overwritten.
[ ] Type Safety & Build: npm run build compiles without errors.
[ ] Lint Clean: npm run lint passes without blocking errors.
[ ] Scoped Changes: git diff contains only files relevant to the requested task.
