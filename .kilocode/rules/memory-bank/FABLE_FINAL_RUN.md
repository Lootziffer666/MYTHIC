# FABLE FINAL RUN — MYTHIC Production Closure

This document is the source of truth for the final Fable implementation run.

Do not fork another platform. Do not restart the project. Do not redesign the landing page. Build the missing trust and comfort layer inside the existing MYTHIC repository while preserving every working capability.

## 1. Product Decision

MYTHIC is **not** another general-purpose Coolify clone.

MYTHIC is a self-hosted deployment guardian for people who can create software with AI but do not want to become infrastructure operators.

The product promise is:

> Give MYTHIC a repository and the minimum credentials it actually needs. MYTHIC gets the app live, proves that it is healthy, keeps evidence, repairs bounded deployment mistakes, and always provides a safe way back.

The winning difference is not the number of supported services. It is the elimination of deployment uncertainty.

## 2. Existing Baseline — Preserve It

The repository already contains working implementations for:

- Git clone with branch fallback.
- Nixpacks analysis and heuristic detection for Node, Python, Go, Rust, PHP, and static sites.
- Docker image builds with generated Dockerfile fallback.
- Docker deployment behind Traefik with automatic TLS.
- Automatic Docker socket and Traefik network/entrypoint/certificate-resolver discovery.
- SQLite persistence.
- Deployment wizard, dashboard, detail page, redeploy, stop, and log polling.
- OpenAI-compatible AI diagnosis and bounded deployment-configuration fixes.
- Local BYOK provider management with encrypted API keys.
- A stateless Go provisioner with Hetzner support, real health checks, cleanup, resume, dry-run, and handover.
- Simulation mode for development environments without Docker.
- A completed cinematic landing page.

Do not replace these systems unless a migration is required for the release model below. Preserve backwards compatibility where practical.

## 3. Competitive Audit — What the Repository List Actually Proves

The supplied repositories are not one category. They fall into four groups.

### A. Direct deployment-platform signals

| Repository | Useful signal for MYTHIC | Do not copy |
|---|---|---|
| `piyushgarg-dev/vercel-clone` | Separate API/build/router responsibilities; build artifacts and asynchronous work | AWS ECS/S3 architecture for a single self-hosted server |
| `Krish120003/zercel` | GitHub auto-deploy, live logs, environment variables, generated subdomains, rollback/preview direction | GCP/Cloudflare/Neon/Upstash cloud dependency graph and Fluid Compute |
| `dhairyathedev/githost` | Vercel-like repository-to-deploy experience | Product clone surface without MYTHIC's sovereign provisioning goal |
| `swarnikaraj/vercel-clone` | Basic Vercel interaction patterns | Tutorial-level duplication |
| `Praneeth003/Vercel-Clone` | Queue/build-worker pattern using Redis and object storage | AWS-centric distributed architecture |
| `getmeli/meli` | Immutable releases, branch deploys, preview URLs, scoped API, password protection, PR/commit status | Static-site-only product boundary |
| `coollabsio/coolify` | Mature reference for lifecycle and infrastructure vocabulary | Full PaaS breadth, teams, databases, 280+ services, operational complexity |
| `ezeslucky/deployi` | Resource monitoring, database backup concepts, CLI/API parity | Database platform scope |
| `younes101020/delivery` | Strong proof that a narrow, repository-first PaaS can be the correct product | Rebuilding its whole monorepo |
| `kubeara/core` | Private infrastructure, AI workload awareness, one-click service language, MCP as a control surface | 200+ service catalog and GPU platform scope |
| `SSujitX/docklift` | GitHub Apps/private repos, webhook auto-deploy, live logs, system metrics, simple installation | Browser terminal and broad Docker admin surface |
| `turbocloud-dev/turbocloud-agent` | Single-agent deployment, no-Dockerfile path, broad server compatibility, security-first posture | New remote control-plane architecture |
| `annihilatorrrr/GoCoolify` | Health checks, immutable image deploys, build/runtime secret separation, Compose and private registry patterns | Reimplementing all databases/services/backups |

### B. Valuable control and reliability layers

| Repository | Pattern to absorb |
|---|---|
| `dazeb/coolify-mcp-enhanced` | Stable operator actions that AI clients can call: inspect, deploy, monitor, configure, cancel |
| `ajmcclary/Coolify-Manager` | Deterministic health diagnostics and troubleshooting decision trees |
| `AshokShau/coolify-telegram-bot` | Phone-first quick actions with explicit buttons instead of command memorization |
| `ontech7/coolify-manager-app` | Mobile control is a real need; satisfy it as a responsive installable PWA before building a native app |
| `light-merlin-dark/coolify-zero` | Health-gated blue/green or standby promotion; do not destroy the working release before the replacement is proven |
| `kevinrivm/agentic-microservice-deployer` | Internal-only deployments, selected Docker networks, generated secrets, no forced public URL |
| `dungnotnull/hd-coolify-enhanced` | Optional image vulnerability scan and evidence-based deployment advisory; AI must not be the sole authority |
| `dropalltables/cdp` | Small CLI/operator surface rather than forcing every action through the dashboard |

### C. Deployment primitives, not competing products

The old Git/webhook/rsync/Pages/Flutter deployment repositories (`simple-php-git-deploy`, `github-pages-deploy-action`, `web-deploy`, `Github-Auto-Deploy`, `Git-Auto-Deploy`, `flutter-automatic-deploy`) confirm that push-triggered deployment, dry-run, explicit exclusions, and release automation are expected primitives. They are not a reason to fork.

`dnstt-deploy` is unrelated to MYTHIC's product. Its only useful lesson is verified installation, distribution-aware checks, and an honest management/recovery menu.

### D. Deployable applications and templates, not deployment platforms

The ChatGPT, v0, Google Drive, Notion, ecommerce, forms, landing-page, WordPress, ERPNext, n8n, OpenClaw, Hermes, and SPX Voice repositories are deployment targets or service templates. They prove that MYTHIC must handle real multi-service and environment-heavy repositories cleanly, but they are not MYTHIC replacements.

The generative-AI application collection and Coolify template collection suggest a future recipe/catalog layer. That is explicitly outside this final run.

## 4. Final Feature Contract

### P0 — Mandatory production closure

All P0 items must be implemented and verified before any P1 work begins.

### 4.1 Brain-first first-run setup

The first-run path must ask for the optional LLM provider **before** infrastructure details, because it is the brain used to explain and repair the rest of setup.

Required states:

1. Choose no AI, local provider, or OpenAI-compatible provider.
2. Enter and test the key/base URL/model.
3. Store the key encrypted with the existing crypto system.
4. Continue to server/domain/source setup.
5. Clearly show which operations work without AI.

Never block deployment merely because the user chose no AI.

### 4.2 Persistent Project + immutable Release model

Replace the current one-row-per-deployment mental model with:

- **Project**: persistent repository, branch, domain, environment, deployment policy, and active release.
- **Release**: one immutable deployment attempt tied to a commit SHA and image tag.
- **Release event**: ordered evidence for every state transition and log chunk.

Existing `deployments` rows must be migrated or imported non-destructively. Do not wipe the current SQLite database.

Minimum release states:

`queued -> cloning -> analyzing -> building -> starting -> verifying -> ready -> promoted`

Terminal or alternate states:

`failed`, `stopped`, `rolled_back`, `superseded`.

A failed release must never overwrite the active healthy release.

### 4.3 Git source connection and automatic redeploy

Implement:

- Capture the resolved commit SHA for every release.
- GitHub webhook endpoint with HMAC SHA-256 signature verification.
- Auto-deploy toggle per project.
- Branch filter.
- Duplicate-event protection by delivery ID and commit SHA.
- Clear trigger metadata: manual, webhook, rollback, AI repair, or provisioner.
- Public repositories as the guaranteed path.
- Private repository credentials only through encrypted settings and an ephemeral authentication mechanism; never persist a token inside a clone URL or logs.

Do not claim full GitHub App support unless the complete installation and selected-repository flow is actually implemented and tested. A clean encrypted token path is preferable to a fake GitHub App button.

### 4.4 Durable build and runtime evidence

The current append-only `logs` text column is not sufficient as the primary architecture.

Implement:

- Ordered release events/log chunks in SQLite.
- Server-Sent Events or an equally simple durable streaming endpoint.
- Reconnect from a sequence number without losing output.
- Separate build logs from runtime container logs.
- Persist status reason and failure summary.
- Redact secrets before persistence, display, or LLM transmission.
- Keep the old polling endpoint working as a compatibility layer if practical.

The UI must never show success merely because a build command exited. Success requires health evidence.

### 4.5 Health-gated safe promotion and rollback

Change deployment semantics so MYTHIC no longer removes the active container before the candidate is proven.

Required behavior:

1. Build a uniquely tagged image for the release.
2. Start a uniquely named candidate container on the correct Docker network.
3. Verify Docker running state.
4. Perform an HTTP health probe using a configured or inferred path and port; fall back to TCP/process responsiveness when an HTTP root is not meaningful.
5. Only promote after health succeeds.
6. Leave the previous known-good release available until promotion succeeds.
7. Provide one-click rollback to the previous healthy image without rebuilding.
8. Record the exact evidence and timing.

Use a blue/green or standby approach compatible with the existing Traefik/Docker architecture. Avoid claiming mathematically guaranteed zero downtime on unknown external Traefik setups. The hard requirement is **no build-time outage and no destruction of the healthy release before verification**.

Keep at least the last three successful release images by default, with explicit garbage collection for older unused images.

### 4.6 Project environment and secret safety

Implement project-level environment management with:

- Plain non-secret variables.
- Encrypted secret values.
- Separate `build` and `runtime` scopes.
- Secret values write-only after save.
- Redaction in commands, logs, errors, AI prompts, API responses, and audit events.
- Detection of expected variable names from `.env.example`, framework conventions, and analysis output.
- A readiness view that reports missing names without reading or exposing a committed `.env` file.

The AI repair layer may suggest variable **names**, but must never invent or expose secret values.

### 4.7 Public and internal-only service modes

Every project must choose one exposure mode:

- **Public**: Traefik router, domain, TLS.
- **Internal**: no public router or certificate; attach to an approved Docker network and expose a stable internal service address.

Internal mode must support an optional selected network for cases such as n8n-to-agent communication. Validate the network exists. Do not silently attach arbitrary host networks.

### 4.8 Bounded AI repair guardian

Preserve the current AI fix, but make the contract explicit and safe.

Allowed repair outputs:

- build command
- start command
- port
- required environment variable names
- generated Dockerfile/build metadata
- health-check path or strategy

Rules:

- Redact all known secrets before sending evidence to an external model.
- Maximum two automated repair attempts per release.
- Every repair is stored as structured evidence: diagnosis, proposed changes, accepted changes, result.
- No unbounded loop.
- No source-code commit or arbitrary shell command execution without a separate explicit future capability.
- If the model returns an unsupported action, reject it and explain why.

### 4.9 Mobile-first operator surface

Do not build a native app in this run. Make the web application an installable, responsive PWA.

The phone view must prioritize:

- project state
- active URL or internal address
- current release and commit
- health
- last failure reason
- deploy/redeploy
- restart
- rollback
- stop
- live logs

Use large touch targets and confirmation for destructive actions. Do not add a browser terminal.

### 4.10 Deterministic diagnostics

Add a single project diagnostics action that checks, in order:

1. Docker connectivity.
2. Proxy/network discovery.
3. repository accessibility.
4. required environment names.
5. domain DNS readiness for public projects.
6. build prerequisites.
7. candidate container state.
8. health endpoint.
9. runtime logs.

Return a structured result with `pass`, `warn`, or `fail`, plus one recovery action. AI may explain the result but must not replace the deterministic checks.

## 5. P1 — Only after every P0 gate is green

### 5.1 Branch and pull-request previews

- Generated preview subdomain per branch or commit.
- Preview release must never replace production.
- Optional password protection.
- Expiry/cleanup policy.
- GitHub commit status or check URL only if authentication is available and verified.

### 5.2 Stable operator API

Expose a documented local API for:

- list projects/releases
- inspect health and diagnostics
- stream logs
- deploy/redeploy
- restart
- rollback
- stop

Use narrowly scoped local tokens. This API is the future foundation for MCP, Android, Telegram, CUE, or other agent clients. Do not implement a full MCP server in this run unless all P0 and preview work is complete.

### 5.3 Optional security advisory

When Trivy is installed or enabled:

- scan the built image
- store the report as release evidence
- warn on high/critical findings
- never claim that an LLM explanation is a vulnerability fix
- do not make Trivy a mandatory dependency for the normal zero-config path

## 6. Explicit Non-Goals

Do not build any of the following in this run:

- multi-tenant SaaS billing
- organizations and team permissions
- database provisioning or database backups
- 200+ one-click service marketplace
- Kubernetes
- serverless or Fluid Compute
- global CDN
- multi-cloud control plane
- native mobile app
- Telegram bot
- browser terminal
- generic WordPress/n8n/ERPNext special cases
- AI-generated arbitrary Docker Compose from prose
- WAF/ML resource prediction platform
- source-code editing and committing by the deployment AI
- another landing-page redesign

If a non-goal is needed to complete a P0 requirement, implement the smallest internal seam, not the full product category.

## 7. Suggested Data Model

Use additive SQLite migrations with a migration version table.

Suggested tables/fields:

### `projects`

- `id`
- `name`
- `repo_url`
- `branch`
- `production_domain`
- `exposure_mode`
- `internal_network`
- `auto_deploy`
- `active_release_id`
- `previous_release_id`
- `created_at`
- `updated_at`

### `releases`

- `id`
- `project_id`
- `commit_sha`
- `branch`
- `image_name`
- `container_id`
- `status`
- `trigger_type`
- `trigger_ref`
- `analysis_json`
- `health_json`
- `repair_json`
- `failure_summary`
- `url`
- `created_at`
- `started_at`
- `finished_at`
- `promoted_at`

### `release_events`

- `id`
- `release_id`
- `sequence`
- `kind`
- `phase`
- `message`
- `metadata_json`
- `created_at`

### `project_variables`

- `id`
- `project_id`
- `name`
- `scope`
- `is_secret`
- encrypted value fields compatible with the existing AES-256-GCM implementation
- `created_at`
- `updated_at`

### `webhook_deliveries`

- `provider`
- `delivery_id`
- `project_id`
- `commit_sha`
- `received_at`
- `result`

Do not duplicate provider key encryption. Reuse and generalize the existing crypto/settings implementation.

## 8. Compatibility Requirements

- Preserve current root quick start.
- Preserve simulation mode.
- Preserve the existing provisioner tests and behavior.
- Preserve existing `/api/deployments` routes through adapters or compatibility wrappers until the new UI is fully migrated.
- Existing records remain visible after migration.
- Existing BYOK settings remain readable.
- Existing deployments must not be stopped during a database migration.

## 9. Implementation Order

Follow this order. Do not jump to visual polish.

1. Add migrations and Project/Release/Event models.
2. Import legacy deployment records.
3. Refactor pipeline around immutable releases and unique images/containers.
4. Add candidate health verification and safe promotion.
5. Add rollback and image retention/garbage collection.
6. Add durable event log storage and streaming.
7. Add project variables/secrets with redaction and readiness analysis.
8. Add GitHub webhook verification, duplicate protection, and auto-deploy.
9. Add internal-only exposure mode.
10. Update dashboard/detail UI and PWA shell.
11. Add deterministic diagnostics.
12. Harden bounded AI repair around the new evidence model.
13. Add tests and compatibility checks.
14. Update README and memory bank with verified reality only.
15. Implement P1 only if all P0 checks remain green.

## 10. Required Tests

Add a `bun test` path and deterministic tests for at least:

- additive migration from the current schema
- legacy record import
- valid and invalid GitHub HMAC signatures
- webhook duplicate rejection
- release state transitions
- active release remains untouched after candidate failure
- successful candidate promotion
- rollback uses a previous image without rebuilding
- event ordering and stream resume sequence
- secret encryption round trip
- secret redaction in logs and AI evidence
- internal project creates no public Traefik router
- repair attempt limit
- simulation mode behavior

Continue to run:

```bash
bun typecheck
bun lint
bun test
bun run build
cd provisioner && go test ./...
```

## 11. Manual Acceptance Scenarios

The run is not complete until these scenarios are demonstrated or accurately marked blocked by the environment:

1. Deploy a healthy public sample project.
2. Push a new commit and trigger one webhook deployment.
3. Watch logs live, disconnect, reconnect, and continue from the correct event sequence.
4. Deploy a broken commit and prove the current healthy release remains live.
5. Roll back to the prior release without rebuilding.
6. Save a secret and prove it never appears in API output, logs, or AI evidence.
7. Deploy an internal-only sample and prove no public router exists.
8. Use the dashboard from a narrow mobile viewport and complete redeploy and rollback.
9. Run diagnostics against a failed project and receive one grounded recovery path.
10. Verify the provisioner still passes all tests.

## 12. Finish Contract

At the end of the run, report:

- exact files changed
- database migration behavior
- implemented P0 features
- any P1 features completed
- commands run and their real results
- manual scenarios verified
- limitations that remain
- no statement of success without evidence

The final result should feel smaller than Coolify, safer than a tutorial Vercel clone, and dramatically easier for a non-infrastructure creator to trust.