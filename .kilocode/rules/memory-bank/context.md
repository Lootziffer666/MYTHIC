# Active Context: MYTHIC

## Current State

**Project Status**: ✅ Functional deployment service ("MYTHIC", formerly "Magic Deploy Wizard") built on top of the Next.js 16 starter.

The app implements a 4-phase deployment pipeline (Ingress → Analysis → Build → Deploy) that
mirrors Vercel/Railway/Coolify: it clones a Git repo, detects the stack with **nixpacks** (with a
heuristic fallback), builds a Docker image, and routes it behind **Traefik** with automatic TLS.
It runs in **live mode** when Docker + nixpacks are present, and a **simulation mode** otherwise
(used for local/demo, e.g. this sandbox which has neither Docker nor nixpacks installed).

## Recently Completed

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
