# MYTHIC Provisioner

A stateless, single-binary provisioner that creates a server at a cloud provider,
installs **MYTHIC** (the self-hosted deploy tool), runs real health checks, hands
over one-time credentials, and then removes every temporary access it used.

Mental model — the user gives MYTHIC two abilities, nothing more:

- **Brain** = the LLM API key (Gehirn)
- **Hands** = the cloud provider token (Hände)

Everything else is determinism.

```
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

## Provisioning order (exact)

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

No step is simulated. A successful result requires, at minimum: provider reports
the server active, SSH connected, host key verified, MYTHIC container running,
local health check green, external HTTPS check green, MYTHIC URL answering,
bootstrap user removed, temporary key removed, cleanup verified.

## Network targets

The provisioner connects ONLY to:

1. the explicitly configured provider API (e.g. `https://api.hetzner.cloud/v1`)
2. the newly created server's IP (SSH + HTTP(S))
3. optionally the user-specified DNS provider (not yet implemented)

**Privacy by design:** no telemetry, no analytics, no crash reporting to third
parties, no external logging services, no vendor backend, no hidden update checks,
no external secret stores without explicit consent. All possible network targets
are listed above.

## Access model

- No random password login. Key-based auth only; password authentication disabled.
- Temporary SSH key pair; private key in memory, temp file `0600`, removed + verified.
- Restricted bootstrap user with only the sudo commands provisioning needs.
- No persistent root SSH login from the provisioner.
- The private key is never logged, never passed as a CLI argument, never stored
  unencrypted, never enters shell history or process listings.

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

- `admin_token` is single-use; the first login must set a permanent secret.
- Handover is never sent to any external service.
- Secrets are masked by default; full secrets are shown once, in the terminal only.
- Export is off by default; with `--handover-pass` it is written encrypted locally.

## Error handling

The provisioner never claims success unless verified. On a non-recoverable error
it classifies the failure, captures the last safe state, attempts an unambiguous
auto-repair only when one exists, re-runs health checks, and otherwise aborts with
a clear recovery instruction (usually `rerun --resume`). Bootstrap credentials are
retained temporarily for recovery and are removed on a successful resume.

## Security boundaries — stated honestly

This tool does **not** claim the following, and you should not read them into it:

- not "spurlos" (untraceable)
- not "fully anonymous"
- not "DSGVO guaranteed"
- not "no credentials"
- not "secure through self-delete"

What is true:

- The provisioner holds necessary **temporary** credentials only during install.
- The server IP is an operational address, not a secret.
- Sensitive are: provider tokens, private keys, admin secrets.
- Self-delete is **cleanup hygiene**, not a forensic deletion guarantee.
- Providers may keep their own audit / API logs — outside this tool's control.
- Mounting the Docker socket (`/var/run/docker.sock`) is host-critical:
  **access to the Docker socket is effectively broad control over the host.** It is
  used here for the first PoC and isolated inside the MYTHIC container so it can
  later be replaced by a restricted host agent with a narrow API.
- Overall security also depends on MYTHIC itself and on the server configuration.

## Tests

```bash
cd provisioner
go test ./...
```

- `TestHappyPath` — full flow with mocked SSH/install/health; asserts a fully
  cleaned handover (bootstrap removed, key removed, cleanup verified).
- `TestFailurePath` — external HTTPS healthcheck fails; asserts failure is reported
  with a recovery path and no false success.
- `TestResumePath` — seeded state file; asserts no second server is created.
