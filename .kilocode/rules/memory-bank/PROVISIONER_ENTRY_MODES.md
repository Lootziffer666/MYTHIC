# MYTHIC Provisioner Entry Modes

This file is a mandatory companion to `FABLE_FINAL_RUN.md`.

The Provisioner must not assume that every user needs a new cloud server. It has two first-class entry modes with one shared installation and handover core.

## 1. Mode Selection

The first launcher decision is:

1. **Use an existing machine** — homelab, VPS, dedicated server, Raspberry Pi, old PC, or another reachable Linux host.
2. **Create a new cloud machine** — provider-backed provisioning, Hetzner first.

Do not ask for a provider token before this decision.

The optional Brain configuration may appear before or after mode selection, but it must never be required for either mode.

## 2. Existing Machine / Homelab Mode

This is the shortest path and must be treated as a complete product mode, not a reduced fallback.

### Inputs

Required:

- hostname or IP address
- SSH port
- SSH user
- one user-approved authentication method

Supported authentication paths:

- existing local SSH key
- user-selected private-key file
- SSH agent
- temporary public key added through an already authenticated session

Do not request a cloud-provider token.
Do not access Gmail.
Do not require a public domain.
Do not require a public IP.

### Optional discovery

The launcher may offer local discovery only after explicit permission.

Allowed discovery:

- mDNS/Bonjour host discovery
- ARP-neighbor suggestions already visible to the local machine
- user-specified subnet probe with a clear range and cancel action

Do not silently scan the entire LAN.
Do not attempt passwords against discovered hosts.
Do not retain discovered device metadata after the run unless the user saves the installation.

### Preflight

Before mutation, inspect and show:

- reachable address
- captured SSH host fingerprint
- operating system and architecture
- available disk, RAM, and CPU
- Docker and Compose state
- ports 80 and 443 availability when public exposure is requested
- existing reverse proxy or Traefik detection
- whether the host appears to be a container, VM, bare-metal machine, or unsupported environment

Return one of:

- `READY`
- `READY_WITH_CHANGES`
- `BLOCKED`

Show the exact changes MYTHIC will make before proceeding.

### Exposure choices

The homelab path supports:

1. **LAN only** — reachable by local IP or hostname; no public DNS requirement.
2. **Existing reverse proxy** — attach MYTHIC to the detected or selected proxy/network.
3. **Public domain** — configure MYTHIC with the supplied domain and guide or automate DNS as separately available.
4. **Private overlay network** — future seam for Tailscale/WireGuard-style access; do not implement a full VPN product in this Fable run.

LAN-only mode must not pretend to have globally trusted HTTPS when no trusted certificate path exists. Show the real access mode honestly.

### Installation flow

`INPUT -> SSH_VERIFIED -> HOST_INSPECTED -> CHANGE_PLAN_APPROVED -> HOST_PREPARED -> MYTHIC_INSTALLED -> LOCAL_HEALTHY -> ACCESS_READY -> HANDOVER_READY -> TEMP_ACCESS_REMOVED -> COMPLETE`

If MYTHIC used an already-existing permanent user key, do not delete that key. Remove only credentials created by MYTHIC during the run.

### Homelab handover

Show:

- local MYTHIC URL
- host address and fingerprint
- exposure mode
- installed MYTHIC version
- one-time admin credential
- changes made to the host
- any ports opened or services installed
- exact uninstall and recovery action

## 3. New Cloud Machine / Hetzner Mode

This mode owns cloud resource creation.

Required inputs:

- Hetzner API token
- server and location choice, with recommended default
- exposure choice
- domain/DNS decision when public HTTPS is wanted

The temporary SSH key must be generated locally and its public half registered with Hetzner before server creation. The server must be created with key-based access from first boot.

Do not use emailed root passwords as the normal installation bridge.
Do not require Gmail access.
Do not route credentials through Gemini or any hosted MYTHIC service.

The provider path continues with the state machine and handover requirements in `FABLE_FINAL_RUN.md`.

## 4. Gmail and Gemini Boundary

Gemini in Gmail can help a human locate or summarize a relevant provider message, but that is a user-interface convenience outside MYTHIC's trusted core.

MYTHIC must not require Gmail OAuth for installation.

Reason:

- it adds another account connection before installation can begin
- Gmail read scopes expose far more personal data than the Provisioner needs
- the safer Hetzner flow eliminates dependence on emailed root credentials
- homelab mode has no provider email requirement at all

A future optional import helper may be added only under all of these constraints:

- explicit user action
- read-only authorization
- narrow provider-specific search
- user selects the exact message before content is consumed
- extracted values are shown for confirmation
- no broad mailbox ingestion
- no Gmail content sent to an external LLM by MYTHIC
- token revoked or removable immediately after import
- never the only recovery path

This helper is outside the final Fable implementation unless every mandatory Provisioner item is already implemented.

## 5. Shared Installation Core

Both entry modes converge on the same internal interfaces:

- `HostTarget`
- `HostInspector`
- `HostAccess`
- `HostMutationPlan`
- `MythicInstaller`
- `AccessConfigurator`
- `HealthGate`
- `HandoverBuilder`
- `CleanupCoordinator`

Cloud creation produces a `HostTarget`.
Homelab input resolves an existing `HostTarget`.
Everything after that must reuse the same installation core.

Do not duplicate the MYTHIC installation logic between Hetzner and homelab paths.

## 6. Updated Priority

Provisioner implementation order is now:

1. shared host-target and installation interfaces
2. existing-machine/homelab path
3. Hetzner server-creation path
4. shared browser launcher and mode selection
5. shared health-gated handover and recovery
6. DNS automation for public cloud or homelab exposure
7. deployment trust-layer work

The homelab path is intentionally first after the abstraction because it proves the installer without cloud-resource complexity and immediately supports the user's own machines.

## 7. Fable Verification Rule

Fable implements these modes but does not create or execute tests, acceptance scenarios, fixtures, or CI work.

End state remains:

**UNVERIFIED HANDOFF TO OPUS**
