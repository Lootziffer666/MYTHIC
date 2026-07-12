# FABLE FINAL RUN — MYTHIC One-Click Closure

This document is the source of truth for the final Fable implementation run.

Do not fork another platform. Do not restart the project. Do not redesign the landing page. Preserve every working capability and spend the remaining implementation budget on the missing product layer.

## 0. Fable Budget Rule

Fable must spend **zero implementation budget on verification work** in this run.

Do not:

- create, expand, repair, or refactor automated verification suites
- create fixtures, mocks, snapshots, sample matrices, or CI workflows
- execute existing verification suites
- perform manual acceptance scenarios
- spend time making old verification code compatible with the new architecture
- claim that the result is green, production-ready, or fully verified

Existing verification files must remain untouched unless they physically block implementation. Do not delete useful existing coverage. Opus receives the completed implementation afterward and owns compilation, static analysis, verification, failure repair, and release hardening.

Fable's finish report must clearly mark the implementation as **UNVERIFIED HANDOFF TO OPUS**.

## 1. Correct Product Definition

MYTHIC is not primarily another deployment dashboard.

MYTHIC is a **self-hosted deployment appliance factory** for people who can create software with AI but do not want to become infrastructure operators.

The complete promise is:

> Give MYTHIC the minimum temporary abilities it needs. The Provisioner creates the machine, secures access, installs MYTHIC, proves that the service answers, removes its temporary access, and hands the user a working deployment system. MYTHIC then turns repositories into safely replaceable releases.

The Provisioner is not an installation helper beside the product. **The Provisioner is the front door and the strongest differentiator.**

Most competing systems begin after the user has already:

- selected a provider
- created a server
- chosen an image and size
- configured SSH
- opened ports
- installed prerequisites
- obtained the server IP
- understood where to execute an installer

MYTHIC must begin before all of that.

## 2. Competitive Truth

The supplied repository list shows four adjacent categories.

### 2.1 Existing-server installers

Coolify, Docklift, TurboCloud Agent, and similar projects can install or control a platform after a server, IP address, and usually SSH access already exist.

Useful patterns:

- one-command installation
- remote bootstrap over SSH
- single-agent architecture
- clear install/update/uninstall commands

Their missing layer is cloud resource creation and a closed secure handover from provider credential to working platform.

### 2.2 Infrastructure-as-code provisioners

Projects such as `Ujstor/coolify-hetzner-terraform` can create a Hetzner server and install a platform.

Useful patterns:

- provider API resource creation
- firewall and server defaults
- repeatable infrastructure description
- destroy/recreate lifecycle

They are not the same product experience. They require Terraform installation, editable configuration, terminal commands, and infrastructure knowledge. They are operator automation, not frictionless end-user onboarding.

### 2.3 Hosted control planes

Some products remotely install an agent onto a server and then manage it from a vendor console.

Useful patterns:

- remote bootstrap
- single lightweight agent
- broad provider compatibility

MYTHIC must not require a vendor control plane. Credentials, handover data, and operational state remain local or on the user's own MYTHIC server.

### 2.4 Repository-to-container platforms

Vercel clones, Delivery, Meli, Docklift, Coolify, and related projects provide valuable release-management patterns after infrastructure exists:

- Git-connected deployment
- immutable releases
- build logs
- previews
- rollback
- health-aware promotion
- environment management

These patterns belong behind MYTHIC's Provisioner. They do not replace it.

## 3. Existing Baseline — Preserve It

The repository already contains:

- Git clone with branch fallback
- Nixpacks analysis and heuristic detection for Node, Python, Go, Rust, PHP, and static sites
- Docker image builds with generated Dockerfile fallback
- Docker deployment behind Traefik with automatic TLS
- automatic Docker socket and Traefik network/entrypoint/certificate-resolver discovery
- SQLite persistence
- deployment wizard, dashboard, detail page, redeploy, stop, and log polling
- OpenAI-compatible deployment diagnosis and bounded configuration repair
- local BYOK provider management with encrypted API keys
- simulation mode for development environments without Docker
- a completed cinematic landing page
- a stateless Go Provisioner with Hetzner support, resume, status, cleanup, dry-run, handover, and temporary access removal

Do not replace these systems casually. Evolve them through additive seams and migrations.

## 4. P0-A — Make the Provisioner the Real One-Click Product

P0-A comes before every dashboard or release-management enhancement.

### 4.1 Local browser launcher from the single Go binary

The Provisioner must remain distributable as a single stateless binary.

When launched without CLI arguments it must:

1. bind an ephemeral loopback-only port
2. open a local browser-based setup surface
3. keep all credentials inside the local process
4. expose no setup endpoint to the LAN or internet
5. close the setup server after handover or explicit cancellation

Keep the existing CLI as an expert and automation surface. The browser launcher is the default human path.

Do not introduce Electron, Tauri, a hosted setup service, or an external frontend dependency. Serve the minimal interface from embedded Go assets.

### 4.2 Brain and Hands first screen

The first surface must explain the two temporary abilities:

- **Brain** — optional OpenAI-compatible LLM key, base URL, and model
- **Hands** — required cloud-provider token

Requirements:

- secret fields never echo full values after entry
- values never enter URL parameters, browser storage, shell history, or process arguments
- offer file/environment input in CLI mode
- explain exactly when each credential is used
- clearly state when the Brain is optional
- allow the Hands token to be discarded locally immediately after provider work is complete
- never transmit either credential to a MYTHIC-operated service because no such service exists

### 4.3 Provider capability discovery

Complete the Hetzner path before adding another provider.

The launcher must query the provider API and present:

- reachable locations
- supported Ubuntu images
- available server types
- vCPU, RAM, disk, architecture, and current provider price metadata when available
- a recommended default suitable for MYTHIC
- an explicit estimated monthly cost before creation

Do not hard-code a single server type as the only path. Cache nothing beyond the active local run unless resume state requires it.

### 4.4 Correct credential and SSH sequence

The safe sequence must be explicit and deterministic:

1. generate the temporary SSH key pair locally
2. register or inject only the public key through the provider API
3. create the server with key-based access from first boot
4. disable password-based bootstrap assumptions
5. capture the host fingerprint on first trusted connection
6. use a restricted bootstrap account for installation work
7. remove provider-side temporary SSH-key resources when supported
8. remove the bootstrap account and local private-key material after successful handover

Never depend on a provider-generated root password being copied through the UI.

### 4.5 Cloud firewall and host baseline

The Hetzner adapter must create or attach the minimum cloud firewall required for the chosen mode:

- SSH only from the operator's detected or explicitly entered source range when practical
- HTTP and HTTPS publicly reachable for public mode
- no accidental database or application-port exposure

On the host:

- install or verify Docker Engine and Compose
- enable key-only SSH access
- avoid leaving reusable bootstrap credentials
- create the MYTHIC persistence directories and Docker network
- record every host mutation in the local run journal

Do not expand into a general server-hardening product. Implement only the baseline required for a safe MYTHIC appliance.

### 4.6 MYTHIC release acquisition

The Provisioner must install a pinned MYTHIC release, not an unbounded moving branch.

Implement:

- release channel selection: stable by default, explicit development override
- resolved version shown before installation
- checksum verification before execution or extraction
- optional signature verification when release signatures are present
- refusal on checksum mismatch
- version metadata written into the handover record
- no `curl | bash` execution path for MYTHIC itself

Development mode may install a specific repository ref, but it must be visibly marked as unverified development input.

### 4.7 Domain and DNS closure

A real one-click path cannot silently stop at “now configure DNS yourself.”

Implement two honest modes.

#### Automated DNS mode

Support narrowly scoped DNS credentials through an adapter boundary.

Priority:

1. Hetzner DNS when the user's zone is there
2. Cloudflare DNS as the next adapter only if remaining implementation budget permits

Required behavior:

- discover only accessible zones
- create or update the exact A records MYTHIC requires
- never request or store a full cloud-account credential when a DNS-scoped token is sufficient
- display the exact records before mutation
- journal old and new values for recovery
- wait for observable DNS convergence before requesting final TLS health

#### Guided DNS mode

When no supported DNS credential is supplied:

- create the server and install MYTHIC completely
- show the exact record names, types, values, and reason
- provide copy buttons
- persist resumable local state
- pause in a clear `ACTION_REQUIRED_DNS` state
- continue from the same run after the user confirms the records
- re-check DNS and complete TLS handover

Do not call guided DNS “one click.” Call the automated adapter path one click and the fallback guided provisioning.

### 4.8 Installation state machine and journal

Replace any loose sequence with an explicit resumable state machine.

Minimum states:

`INPUT -> PROVIDER_VERIFIED -> KEY_CREATED -> SERVER_REQUESTED -> SERVER_ACTIVE -> SSH_VERIFIED -> HOST_PREPARED -> MYTHIC_INSTALLED -> LOCAL_HEALTHY -> DNS_READY -> HTTPS_HEALTHY -> HANDOVER_READY -> TEMP_ACCESS_REMOVED -> COMPLETE`

Alternate states:

- `ACTION_REQUIRED_DNS`
- `RECOVERABLE_FAILURE`
- `CLEANUP_REQUIRED`
- `CANCELLED`
- `DESTROYED`

The local journal must contain:

- provider resource IDs
- non-secret configuration
- completed state transitions
- host fingerprint
- resolved MYTHIC version and checksum
- DNS mutations
- last safe recovery action

Sensitive resume material must be encrypted locally with a run-specific key or user passphrase. Never store provider tokens or private keys as plaintext state.

### 4.9 Honest recovery surface

The browser launcher and CLI must expose the same recovery actions:

- resume interrupted run
- inspect current state
- retry the current deterministic step
- remove temporary access
- export encrypted handover
- destroy the newly created server
- keep the server for manual recovery
- forget local run state only after warning about orphaned resources

Every failure must return exactly:

- what succeeded
- what failed
- what remains active and potentially billable
- whether temporary access still exists
- one safest next action

Do not emit a generic stack trace as the primary user message.

### 4.10 Health-gated handover

“Server created” is not success.

The Provisioner may enter `COMPLETE` only after:

- provider reports the server active
- SSH host identity is captured
- Docker answers
- MYTHIC containers are running
- MYTHIC's local health endpoint answers from the host
- the public URL answers over HTTPS in public mode
- the one-time admin credential has been generated
- temporary bootstrap access has been removed
- cleanup state has been recorded

These are product gates, not a verification-suite assignment.

### 4.11 First-login handover ritual

The final screen must present a human handover, not a JSON dump alone.

Show:

- MYTHIC URL
- server IP and provider resource ID
- resolved MYTHIC version
- one-time admin credential with one reveal and copy action
- SSH host fingerprint
- monthly server estimate captured at creation
- health status
- temporary-access removal status
- encrypted handover export
- prominent warning that the provider continues billing until the server is destroyed

The one-time admin credential must force permanent credential creation on first login.

Keep JSON export for automation, but make the browser handover the default.

### 4.12 Provisioner-to-MYTHIC bootstrap contract

Define a versioned bootstrap payload shared by the Go Provisioner and MYTHIC.

Minimum fields:

- schema version
- installation ID
- provider name and resource ID
- public IP
- hostname and base domain
- exposure mode
- resolved MYTHIC version
- encrypted Brain provider configuration when supplied
- one-time admin token hash or secure injection reference
- provisioned timestamp
- host fingerprint

MYTHIC must consume the payload once, initialize its first-run state, and mark it consumed. The plaintext one-time credential must not remain in the payload afterward.

### 4.13 Appliance lifecycle after installation

Add the smallest complete lifecycle needed by a non-operator:

- show installed version
- check whether a newer pinned release exists only on explicit user action
- upgrade while preserving volumes and configuration
- restart MYTHIC services
- run deterministic appliance diagnostics
- rotate the admin recovery credential
- generate an encrypted local recovery bundle
- uninstall MYTHIC without automatically destroying unrelated server data
- optionally destroy the provider server through a separate explicit provider-authorized action

Do not build a general host-control panel.

### 4.14 Provisioner architecture boundary

The current Docker-socket design is acceptable for this final implementation run, but make the boundary explicit:

- all host-control operations live behind one internal interface
- UI and route code never access Docker directly
- document the future replacement seam for a restricted host agent
- do not spend this run implementing that future agent

## 5. P0-B — Complete the Deployment Trust Layer

Begin P0-B only after the Provisioner path is structurally complete.

### 5.1 Persistent Project and immutable Release model

Evolve the current one-row-per-deployment model into:

- **Project** — persistent repository, branch, domain, environment, deployment policy, and active release
- **Release** — one immutable deployment attempt tied to a commit SHA and uniquely tagged image
- **Release event** — ordered evidence for every phase transition and log chunk

Import existing deployment records non-destructively.

Minimum release flow:

`queued -> cloning -> analyzing -> building -> starting -> verifying -> ready -> promoted`

Alternate states:

`failed`, `stopped`, `rolled_back`, `superseded`.

A failed candidate must never overwrite or remove the active healthy release.

### 5.2 Git source and automatic redeploy

Implement:

- resolved commit SHA on every release
- GitHub webhook with HMAC SHA-256 signature verification
- auto-deploy toggle per project
- branch filter
- duplicate-event protection by delivery ID and commit SHA
- trigger metadata: manual, webhook, rollback, AI repair, or Provisioner
- public repository path as the guaranteed baseline
- encrypted ephemeral authentication for private repositories

Do not fake a GitHub App flow. A clean encrypted token path is preferable to an incomplete button.

### 5.3 Durable logs and release evidence

Replace the single append-only log text field as the primary architecture with ordered release events.

Implement:

- durable build log chunks
- durable runtime log chunks
- simple reconnectable streaming from a sequence number
- status reason and failure summary
- secret redaction before persistence, display, API output, or LLM transmission
- compatibility access for the old polling UI where practical

### 5.4 Safe candidate promotion and rollback

Change deployment semantics:

1. build a uniquely tagged image
2. start a uniquely named candidate container
3. verify Docker running state
4. probe configured or inferred health
5. promote routing only after the candidate answers
6. keep the prior release available if promotion fails
7. provide rollback to a retained known-good image without rebuilding
8. retain the last three successful release images by default
9. provide explicit cleanup of older unused images

Do not promise universal zero downtime. Promise that MYTHIC does not destroy the working release before the replacement proves it can answer.

### 5.5 Project variables and secret safety

Implement:

- plain variables
- encrypted secrets
- build and runtime scopes
- write-only secret display after save
- redaction everywhere
- expected-name discovery from `.env.example`, framework conventions, and analysis output
- readiness display that names missing variables without exposing values

The AI may suggest variable names. It must never invent secret values.

### 5.6 Public and internal-only projects

Each project chooses:

- **Public** — Traefik router, domain, TLS
- **Internal** — no public router or certificate; approved Docker network and stable internal service address

Validate selected networks. Never silently attach arbitrary host networks.

### 5.7 Bounded AI deployment guardian

Preserve the current AI repair layer and restrict it to:

- build command
- start command
- port
- required environment variable names
- generated Dockerfile or build metadata
- health path or strategy

Rules:

- redact all known secrets
- maximum two automated repair attempts per release
- store diagnosis, accepted configuration changes, and result as release evidence
- reject unsupported actions
- no source-code commits
- no arbitrary shell commands
- no unbounded loop

### 5.8 Mobile-first PWA operator surface

Do not build a native app in this run.

The installable responsive web surface must prioritize:

- appliance health
- project state
- active URL or internal address
- current release and commit
- last failure
- deploy or redeploy
- restart
- rollback
- stop
- live logs

Use large touch targets and confirmations for destructive actions. Do not add a browser terminal.

### 5.9 Deterministic diagnostics

Add one appliance diagnostics action and one project diagnostics action.

Appliance diagnostics:

1. provider metadata availability
2. disk and memory pressure
3. Docker connectivity
4. proxy and network discovery
5. MYTHIC service state
6. domain and certificate state

Project diagnostics:

1. repository accessibility
2. required variable names
3. DNS readiness for public projects
4. build prerequisites
5. candidate container state
6. health endpoint
7. runtime logs

Return `pass`, `warn`, or `fail` plus one recovery action. AI may explain deterministic results but may not replace them.

## 6. P1 — Only with Remaining Implementation Budget

### 6.1 Branch and pull-request previews

- generated preview subdomain per branch or commit
- previews never replace production
- optional password protection
- expiry and cleanup policy
- GitHub status URL only when authentication is genuinely available

### 6.2 Stable local operator API

Expose narrowly scoped local actions for:

- inspect appliance
- list projects and releases
- inspect health and diagnostics
- stream logs
- deploy or redeploy
- restart
- rollback
- stop

This is the future foundation for MCP, CUE, Android, Telegram, and other clients. Do not implement a full MCP server during this run.

### 6.3 Additional provider adapter

Only after the Hetzner path and adapter boundary are complete, add one further provider if the implementation budget clearly permits it.

Do not add multiple half-working providers. A complete Hetzner path is more valuable than a provider logo collection.

### 6.4 Optional image advisory

When Trivy is already available or explicitly enabled:

- scan the built image
- store the report as release evidence
- warn on high or critical findings
- never present an LLM explanation as a completed vulnerability repair
- keep scanning optional for the zero-config path

## 7. Explicit Non-Goals

Do not build:

- multi-tenant SaaS billing
- organizations or team permissions
- database provisioning or backups
- a large one-click service marketplace
- Kubernetes
- serverless or Fluid Compute
- global CDN
- multi-cloud fleet management
- native mobile application
- Telegram bot
- browser terminal
- generic WordPress, n8n, ERPNext, or voice-agent special cases
- AI-generated arbitrary Compose from prose
- WAF or ML resource-prediction platform
- source-code editing and committing by deployment AI
- another landing-page redesign
- a hosted MYTHIC control plane
- a generic server administration panel

When a seam is required for a mandatory item, implement the smallest internal abstraction rather than the full adjacent product category.

## 8. Suggested Additive Data Model

Use additive SQLite migrations with a migration-version table.

### `installations`

- `id`
- `schema_version`
- `provider`
- `provider_resource_id`
- `public_ip`
- `hostname`
- `base_domain`
- `exposure_mode`
- `mythic_version`
- `host_fingerprint`
- `provisioned_at`
- `bootstrap_consumed_at`

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

Do not duplicate encryption implementations. Generalize the existing crypto/settings boundary.

## 9. Compatibility Requirements

- preserve the current root quick start
- preserve simulation mode
- preserve existing Provisioner behavior while moving it behind the new state machine and browser launcher
- preserve existing verification files untouched for the Opus handoff
- preserve `/api/deployments` through adapters or compatibility wrappers until the new UI is migrated
- retain existing records after migration
- retain existing BYOK settings
- do not stop existing deployments during migration
- keep the Provisioner CLI compatible where practical

## 10. Implementation Order

Do not jump to visual polish.

1. Freeze the existing working baseline and identify the Provisioner/MYTHIC bootstrap seam.
2. Define the versioned bootstrap payload.
3. Refactor the Provisioner into an explicit resumable state machine and encrypted journal.
4. Correct the SSH-key-before-server-creation sequence and provider resource cleanup.
5. Add Hetzner capability discovery, recommendation, and cost preview.
6. Add cloud firewall creation and minimum host baseline.
7. Add pinned MYTHIC release acquisition with checksum enforcement.
8. Add the embedded loopback-only browser launcher.
9. Add automated Hetzner DNS and guided resumable DNS fallback.
10. Add browser handover, one-time admin consumption, and first-login completion.
11. Add appliance lifecycle actions: inspect, resume, upgrade, restart, recovery export, uninstall, explicit destroy.
12. Add installation persistence inside MYTHIC.
13. Add Project, Release, and Release Event storage.
14. Import legacy deployment records.
15. Refactor deployment around unique candidate releases.
16. Add health-gated promotion, rollback, and image retention.
17. Add durable log storage and reconnectable streaming.
18. Add project variables, encrypted secrets, and redaction.
19. Add GitHub webhook auto-deploy.
20. Add internal-only project mode.
21. Add appliance and project diagnostics.
22. Update dashboard and PWA control surface.
23. Restrict AI repair around structured release evidence.
24. Implement P1 only if meaningful implementation budget remains.
25. Update README and memory bank with implemented reality and an explicit unverified handoff.

## 11. Finish Contract

At the end of the Fable run, report only:

- exact files changed
- architecture and schema changes
- Provisioner states and recovery actions implemented
- provider, DNS, firewall, release-acquisition, and handover capabilities implemented
- deployment trust-layer features implemented
- migration behavior intended
- compatibility seams retained
- known incomplete branches and risks
- work intentionally deferred to Opus
- the exact label: **UNVERIFIED HANDOFF TO OPUS**

Do not spend remaining budget producing verification evidence. Do not claim completion merely because code was written.

The finished direction must feel fundamentally different from a Vercel clone:

> MYTHIC does not merely deploy an app onto infrastructure. MYTHIC creates the trustworthy place from which deployments become possible.