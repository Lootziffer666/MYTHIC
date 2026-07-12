# MYTHIC Provisioner

A stateless, single-binary provisioner that either connects to an existing Linux
machine or creates one at a cloud provider, installs **MYTHIC**, performs the
runtime health gates required for handover, and removes every temporary access it
created.

Mental model — the user gives MYTHIC only the abilities required by the selected
entry mode:

- **Brain** = optional LLM API key
- **Hands for homelab** = user-approved SSH access to an existing machine
- **Hands for cloud** = cloud-provider token used to create the machine

Everything after host acquisition is one shared deterministic installation core.

## Entry modes

### Existing machine / homelab

Use a hostname or IP address plus SSH access. This mode does not require a cloud
provider token, Gmail connection, public IP, public domain, or server creation.
It supports homelabs, existing VPS instances, dedicated servers, VMs, Raspberry
Pis, and other supported Linux hosts.

### New cloud machine

The first provider adapter is Hetzner. The final implementation contract requires
the temporary SSH key to be generated locally and its public half registered with
the provider before server creation, so installation never depends on an emailed
root password.

The mandatory mode contract lives in:

- `.kilocode/rules/memory-bank/PROVISIONER_ENTRY_MODES.md`
- `.kilocode/rules/memory-bank/FABLE_FINAL_RUN.md`

## CLI example

```bash
mythic-provisioner \
  --brain <LLM-KEY>  --brain-base <URL>  --brain-model <MODEL> \
  --hands <PROVIDER-TOKEN>  --provider hetzner \
  --server-name mythic-1 --type cpx11 --region fsn1 --image ubuntu-24.04 \
  --domain mythic.example.com
```

Secrets may also come from files (`--brain-file` / `--hands-file`) or the env vars
`MYTHIC_BRAIN` / `MYTHIC_HANDS`, so they never appear on the command line, in the
process list, or in shell history.

## Build (reproducible)

```bash
cd provisioner
go mod tidy        # resolves golang.org/x/crypto + writes go.sum (needs network once)
go build -o mythic-provisioner .
sha256sum mythic-provisioner > mythic-provisioner.sha256
# optional signing:
#   minisign sign -Sm mythic-provisioner
#   cosign sign-blob --key cosign.key mythic-provisioner
```

The only external module is `golang.org/x/crypto` (SSH client). Everything else is
the Go standard library, so the result is a single static binary.

## Run

```bash
./mythic-provisioner --provider hetzner \
  --hands-file ./hands.txt --brain-file ./brain.txt \
  --server-name mythic-1 --domain mythic.example.com
```

Flags: `--dry-run`, `--resume`, `--status`, `--cleanup`,
`--keep-server-on-failure`, `--destroy-server-on-failure`, `--export-handover`,
`--handover-pass <passphrase>`.

## Provisioning order (current cloud implementation)

1. Validate inputs
2. Authenticate provider API
3. Create server (idempotent: reuses existing by resource id)
4. Capture server IP + provider resource id
5. Generate temporary SSH key pair (in-memory; 0600 temp file only if needed)
6. Deploy public key
7. Wait for SSH reachability
8. Verify SSH host key + capture fingerprint (TOFU within the run)
9. Create restricted bootstrap user (limited sudo)
10. Install / verify Docker + Docker Compose
11. Install MYTHIC as a compose stack
12. Create volumes / persistence paths
13. Start MYTHIC
14. Local container health check
15. External HTTPS health check
16. Generate one-time admin token
17. Print handover (locally)
18. Optionally store handover encrypted at rest
19. Remove bootstrap user
20. Remove temporary SSH key
21. Remove temporary artifacts
22. Verify cleanup
23. Exit (self-delete is hygiene only — see boundaries)

This order describes the current implementation, not the final contract. The
final Fable run must move temporary key generation and provider-side public-key
registration before server creation.

No step is simulated. A successful runtime handover requires, at minimum: the host
is reachable, SSH identity is captured, MYTHIC containers answer locally, the
selected access URL answers as configured, the one-time admin credential exists,
and temporary access created by MYTHIC has been removed.

## Network targets

Depending on the selected entry mode, the provisioner connects only to:

1. an explicitly configured provider API for cloud creation
2. the selected or newly created machine over SSH and HTTP(S)
3. optionally a user-selected DNS provider

**Privacy by design:** no telemetry, no analytics, no crash reporting to third
parties, no external logging services, no vendor backend, no hidden update checks,
no external secret stores without explicit consent. All possible network targets
must remain visible to the user.

## Access model

- Key-based SSH access; no emailed provider password as the normal bridge.
- Existing-host mode uses only the authentication method explicitly selected by the user.
- Cloud mode uses a temporary local SSH key registered before machine creation.
- Temporary private-key files use mode `0600` and are removed after handover.
- Restricted bootstrap access is used for installation work where practical.
- No persistent root SSH access is created for the provisioner.
- Private keys are never logged, passed as CLI arguments, or stored unencrypted.
- Existing user credentials are never deleted; only access created by MYTHIC is cleaned up.

## Handover

On success the provisioner emits a local handover object:

```json
{
  "server_ip": "203.0.113.10",
  "server_hostname": "mythic.example.com",
  "mythic_url": "https://mythic.example.com",
  "admin_token": "ONE_TIME_SECRET",
  "ssh_host_fingerprint": "SHA256:...",
  "provider_resource_id": "server-12345",
  "provisioned_at": "ISO-8601",
  "healthcheck_status": "passed",
  "bootstrap_user_removed": true,
  "temporary_key_removed": true,
  "cleanup_verified": true
}
```

For existing-host mode, provider-specific fields may be absent.

- `admin_token` is single-use; the first login must set a permanent secret.
- Handover is never sent to any external service.
- Secrets are masked by default; full secrets are shown once, locally.
- Export is off by default; with `--handover-pass` it is written encrypted locally.

## Error handling

On a non-recoverable error the provisioner classifies the failure, captures the
last safe state, attempts an unambiguous repair only where the product contract
allows one, and otherwise stops with one clear recovery instruction such as
`resume`, `cleanup`, or explicit resource destruction.

The failure surface must state:

- what succeeded
- what failed
- what remains active or billable
- whether temporary access remains
- the safest next action

## Security boundaries — stated honestly

This tool does **not** claim the following:

- not "spurlos" or untraceable
- not fully anonymous
- not automatically DSGVO-compliant
- not credential-free
- not secure merely because a binary deletes itself

What is true:

- The provisioner holds necessary temporary credentials only during the operation.
- The server IP is an operational address, not a secret.
- Sensitive values include provider tokens, private keys, and admin credentials.
- Self-delete is cleanup hygiene, not a forensic deletion guarantee.
- Providers may retain their own audit and API records.
- Mounting `/var/run/docker.sock` gives broad host control and remains an explicit
  architectural boundary until a restricted host agent replaces it.
- Overall security also depends on MYTHIC itself, the selected host, and the user's
  networking decisions.

## Fable handoff rule

The final Fable implementation run does not create, extend, repair, or execute
verification suites. Verification and release hardening belong to the subsequent
Opus pass.

**UNVERIFIED HANDOFF TO OPUS**
