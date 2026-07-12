# Active Context: MYTHIC

## Current State

**Project Status**: ✅ Functional deployment service ("MYTHIC", formerly "Magic Deploy Wizard") built on top of the Next.js 16 starter.

The app implements a 4-phase deployment pipeline (Ingress → Analysis → Build → Deploy) that
mirrors Vercel/Railway/Coolify: it clones a Git repo, detects the stack with **nixpacks** (with a
heuristic fallback), builds a Docker image, and routes it behind **Traefik** with automatic TLS.
It runs in **live mode** when Docker + nixpacks are present, and a **simulation mode** otherwise
(used for local/demo, e.g. this sandbox which has neither Docker nor nixpacks installed).

## Next Mission — Final Fable Run

The next implementation run is the one-click production-closure run defined in both mandatory documents:

- `.kilocode/rules/memory-bank/FABLE_FINAL_RUN.md`
- `.kilocode/rules/memory-bank/PROVISIONER_ENTRY_MODES.md`

The run must read and follow both. It must not fork or rebuild another deployment platform, redesign the landing page, or expand into a full Coolify replacement.

The **Provisioner is the front door and highest priority**, but it now has two equal entry modes:

1. **Existing machine / homelab** — hostname or IP plus user-approved SSH access; no cloud token, Gmail connection, public IP, or public domain required.
2. **New Hetzner machine** — provider-backed server creation with the temporary public SSH key registered before server creation; no emailed root password dependency.

Both modes must converge on one shared host-inspection, MYTHIC-installation, health-gated handover, cleanup, and recovery core. Do not duplicate installation logic.

Gmail/Gemini is not part of the mandatory path. It may help the human locate a provider message, but MYTHIC must not require Gmail OAuth. A future narrow, explicit, read-only import helper is P1 at most.

After both Provisioner paths are structurally complete, remaining implementation budget goes to Project/Release history, webhook auto-deploy, durable logs, health-gated promotion, rollback, encrypted project secrets, internal-only services, bounded AI repair, deterministic diagnostics, and a mobile-first PWA control surface.

Fable must not create, expand, repair, or execute verification suites and must not perform manual acceptance work. Existing verification files remain untouched for the later Opus handoff. Fable ends with the exact label **UNVERIFIED HANDOFF TO OPUS**.

## Recently Completed

- [x] Added explicit MYTHIC release resolution for the Provisioner: stable channel defaults to a pinned image tag, development images require an explicit override, and release metadata is stored in state/handover.
- [x] Extended the local Provisioner launcher with a read-only Hetzner capability discovery action that keeps provider credentials in the loopback session and does not execute mutations from the browser.
- [x] Added the first local loopback-only browser launcher slice for the Provisioner default human path, with mode selection and Brain/Hands explanation that does not request cloud credentials before entry-mode choice.
- [x] Fixed the Hetzner/cloud Provisioner bootstrap sequence so the run-scoped SSH key is generated and registered with the provider before server creation, waits for active/reachable bootstrap access, and cleans up provider-side temporary SSH-key resources.
- [x] Added provider capability discovery plumbing for the Provisioner, including Hetzner locations, Ubuntu images, server-type hardware metadata, monthly price hints, and an explicit CLI capabilities view.
- [x] Repository onboarding README: documented MYTHIC positioning, quick start, configuration, architecture, development commands, and production-hardening priorities; added `public/.gitkeep` so Dockerfile public asset copy has a stable source.
- [x] Fixed current ESLint blockers in Settings and Wizard client components so lint/typecheck/build can pass again.
- [x] Repaired provisioner compile/test blockers: compose label quoting, missing imports/state fields, host-key handshake auth, temp work-dir creation, and test seams for SSH/health/injection.
- [x] Added Docker host overview to the dashboard, DNS readiness guidance for Hetzner/external providers, wizard DNS A-record hints, and visible AI change-scope boundaries in Settings.
- [x] Completed the interrupted landing/provisioner patch: fixed provisioner Traefik label quoting, added the cinematic MYTHIC landing page, and added the procedural WebM generator scaffold under `scripts/generate_mythic_videos.py`.
- [x] Elevated the landing page with a client-side raw WebGL2 shader/particle portal, premium MYTHIC hero composition, proof cards, and conversion-focused deployment forge while preserving progressive enhancement and build safety.
- [x] Multi-step Wizard UI (Connect → Detect → Deploy → Live) with live log polling
- [x] Deployment engine (`src/lib/engine.ts`): orchestrates all 4 phases + job queue + append logs
- [x] Ingestion: `git clone` with default-branch fallback (`src/lib/git.ts`)
- [x] Analysis: nixpacks `plan` + heuristic detector for Node/Python/Go/Rust/PHP/Static (`src/lib/analyzer.ts`)
- [x] Build: `nixpacks build` or generated Dockerfile via Docker API (`src/lib/builder.ts`)
- [x] Deploy: Docker container start with Traefik labels + SQLite store (`src/lib/docker.ts`, `src/lib/db.ts`)
- [x] API routes: `/api/deployments`, `/api/deployments/[id]`, `/redeploy`, `/ai-fix`, `/api/analyze`
- [x] Dashboard + per-deployment detail page with redeploy/stop
- [x] **AI auto-fix**: OpenAI-compatible chat API (`src/lib/ai.ts`) diagnoses failures and patches
      build/start/port/env; auto-applied when `MYTHIC_AI_AUTOFIX=true`, manual "✨ Ask AI to fix" button
- [x] **Coolify CLI**: `scripts/coolify-deploy.sh` POSTs to `/api/v1/applications` to deploy without the UI
- [x] `docker-compose.yml` (Traefik + app) and `Dockerfile` (installs nixpacks + docker CLI)
- [x] Competitive re-audit completed and translated into the final Fable production-closure contract.
- [x] Final contract refocused around the Provisioner; all new verification work deferred to Opus.
- [x] Provisioner entry modes split into existing-machine/homelab and new-Hetzner paths with one shared installation core.

## Current Structure

| Path | Purpose |
|------|---------|
| `src/lib/engine.ts` | Orchestrates clone→analyze→build→deploy, AI auto-fix, job guard |
| `src/lib/git.ts` | Ingestion (git clone + branch fallback) |
| `src/lib/analyzer.ts` | Phase 2: nixpacks + heuristic stack detection |
| `src/lib/builder.ts` | Phase 3: nixpacks build / Dockerfile build |
| `src/lib/docker.ts` | Phase 4: container start with Traefik labels |
| `src/lib/ai.ts` | AI failure diagnosis + fix (OpenAI-compatible) |
| `src/lib/db.ts` | SQLite store (better-sqlite3) |
| `src/components/Wizard.tsx` | 4-step deploy wizard (client) |
| `src/app/api/**` | API routes |
| `scripts/coolify-deploy.sh` | Coolify API automation CLI |
| `docker-compose.yml` / `Dockerfile` | Traefik reverse proxy + app image |
| `provisioner/` | Existing-host or cloud-host bootstrap, MYTHIC installation, handover, cleanup, and recovery |
| `.kilocode/rules/memory-bank/FABLE_FINAL_RUN.md` | Provisioner-first final implementation scope and Opus handoff contract |
| `.kilocode/rules/memory-bank/PROVISIONER_ENTRY_MODES.md` | Mandatory homelab/cloud mode split and shared installation architecture |

## Environment Notes

- This sandbox has `git` but **no Docker / nixpacks** → engine runs in simulation mode.
- Native modules (`better-sqlite3`) and `dockerode` are marked `serverExternalPackages` in `next.config.ts`.
- AI fix requires `AI_API_KEY` (+ optional `AI_BASE_URL`, `AI_MODEL`). Works with OpenAI, OpenRouter,
  Ollama, Groq, etc. (any OpenAI-compatible `/chat/completions` endpoint).

## Session History

| Date | Changes |
|------|---------|
| Initial | Next.js 16 starter template created |
| Now | Built the deploy service: 4-phase pipeline, Traefik routing, SQLite, AI auto-fix, Coolify CLI |
| Now | Renamed app to **MYTHIC** (UI, env vars `MYTHIC_*` w/ legacy `MAGIC_DEPLOY_*` fallback, container/image/db names) |
| Now | **Zero-config discovery** (`src/lib/discovery.ts`): auto-detects Docker socket (multiple candidate paths) + Traefik network/entrypoint/cert-resolver by inspecting the running proxy container. Env vars now only act as optional overrides. Live vs simulation logged with the reason. |
| Now | **BYOK / LLM support**: local encrypted settings store (`crypto.ts` AES-256-GCM, `settings.ts` + `llm_providers` table), `/api/settings` (GET/POST manage providers), `/api/llm/chat` local BYOK proxy, Settings UI page (`/settings`) with provider CRUD + connection test, `ai.ts` reads default provider from store (env fallback). DSGVO: no telemetry, keys encrypted at rest, only egress is user's own LLM base URL. |
| Now | **MYTHIC Provisioner** (Go, `provisioner/`): stateless single-binary that creates a server, installs MYTHIC via compose (docker.sock mounted), runs real health checks, emits one-time handover, then removes bootstrap user + temp SSH key. Brain=LLM key, Hands=provider token. Hetzner adapter (net/http) + mock adapter; tests Happy/Failure/Resume. Honest security boundaries documented (no "DSGVO guaranteed" claims). |
| Now | Added root `README.md` for first-time operators and fixed React ESLint violations in `src/app/settings/page.tsx` and `src/components/Wizard.tsx`; `bun typecheck`, `bun lint`, `bun run build`, and `cd provisioner && go test ./...` pass. |
| Now | Resolved the interrupted patch follow-up by restoring valid provisioner compose YAML quoting, implementing the cinematic landing-page UI, and adding a reproducible procedural video generator. |
| Now | Upgraded the homepage into a high-end MYTHIC launch experience with a raw WebGL2 particle/shader backdrop, stronger hero narrative, proof points, and refined ritual cards. |
| 2026-07-12 | Re-audited the supplied deployment ecosystem and committed the final Fable production-closure specification. |
| 2026-07-12 | Removed all new verification work from Fable's scope and expanded the Provisioner-first one-click implementation contract. |
| 2026-07-12 | Added separate homelab/existing-host and Hetzner/new-cloud entry modes; Gmail is no longer considered part of the mandatory path. |
| 2026-07-12 | Corrected cloud provisioning to use provider-injected, run-scoped SSH access from first boot, wait for provider active state before SSH, and clean up provider-side temporary SSH-key resources. |
| 2026-07-12 | Added Hetzner capability discovery output for locations, Ubuntu images, server types, recommendation defaults, and price hints before cloud creation. |
| 2026-07-12 | Added the initial embedded loopback-only Provisioner browser launcher, keeping the CLI as the executable automation path while making no-args launch open a local setup surface. |
| 2026-07-12 | Extended the launcher with read-only provider capability discovery so cloud choices can be inspected locally before any mutation. |
| 2026-07-12 | Added Provisioner release-channel/image resolution and handover/state metadata for the installed MYTHIC artifact. |