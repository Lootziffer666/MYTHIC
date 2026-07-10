# MYTHIC

MYTHIC is a self-hostable, zero-config deployment service for vibe-coded apps. Give it a Git repository, a domain, and optionally an AI API key; MYTHIC clones the repo, detects the stack, builds a Docker image, and deploys it behind Traefik with TLS.

It is intentionally shaped like a tiny self-hosted Vercel/Railway/Coolify:

1. **Connect**: paste a public Git clone URL and branch.
2. **Detect**: MYTHIC uses nixpacks first, then built-in heuristics as a fallback.
3. **Deploy**: it builds a Docker image and starts a container on the proxy network.
4. **Live**: Traefik routes the requested domain to the app and issues TLS certs.

## Why this matters

AI coding tools make it easy for non-infra users to create apps, but the last mile is still painful: ports, Dockerfiles, reverse proxies, certificates, build commands, and failed deploy logs. MYTHIC tries to make that last mile one button.

## Quick start

Prerequisites:

- A Linux server with Docker and Docker Compose
- DNS pointing `deploy.example.com` and app subdomains such as `my-app.example.com` at the server
- Ports `80` and `443` open

```bash
git clone <this-repo-url> mythic
cd mythic
MYTHIC_BASE_DOMAIN=example.com docker compose up -d --build
```

Open `https://deploy.example.com`, paste a repository URL, and click deploy.

## Configuration

MYTHIC works without most manual configuration by inspecting Docker and Traefik at runtime. Environment variables are optional overrides.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MYTHIC_BASE_DOMAIN` | `example.com` in compose | Base domain used for suggested app domains |
| `MYTHIC_TRAEFIK_NETWORK` | auto-detected / `traefik` | Force the Docker network for deployed apps |
| `MYTHIC_TRAEFIK_ENTRYPOINT` | auto-detected / `websecure` | Force the Traefik HTTPS entrypoint |
| `MYTHIC_TRAEFIK_CERT_RESOLVER` | auto-detected / `letsencrypt` | Force the Traefik certificate resolver |
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Docker socket/API endpoint |
| `MYTHIC_AI_AUTOFIX` | `false` | Enable automatic AI repair after failed builds |
| `MYTHIC_PUBLIC_IP` | unset | Optional public IPv4 shown in DNS setup hints |
| `AI_API_KEY` | unset | Optional env fallback for AI auto-fix |
| `AI_BASE_URL` | OpenAI-compatible default | Optional OpenAI-compatible API base URL |
| `AI_MODEL` | provider default | Optional model for AI auto-fix |

You can also add LLM providers in the Settings UI. Keys are stored locally and encrypted at rest when `MYTHIC_SECRET` or `MAGIC_DEPLOY_SECRET` is configured.

## DNS setup

For a Hetzner server, the safe default is simple: point `deploy.<base-domain>` and `*.<base-domain>` A-records at the server's public IPv4. For external DNS providers, MYTHIC should only automate records with a narrowly scoped DNS token; full account or cloud tokens are intentionally out of scope.

## Architecture

- **Next.js UI/API**: wizard, dashboard, settings, and deployment API routes.
- **SQLite store**: deployment records, logs, and local LLM provider metadata.
- **nixpacks + Docker**: stack detection and image builds.
- **Traefik**: reverse proxy and automatic TLS.
- **AI auto-fix**: optional OpenAI-compatible build failure diagnosis and patching.
- **Provisioner**: Go binary for server creation and first MYTHIC install handover.

## Development

Use Bun for local development commands:

```bash
bun install
bun typecheck
bun lint
bun run build
```

Do not run the production deployment engine without understanding the Docker socket boundary: mounting `/var/run/docker.sock` gives MYTHIC control over the host Docker daemon by design.

## Current maturity

MYTHIC already has the end-to-end deployment path, simulation mode for machines without Docker/nixpacks, BYOK LLM settings, and a server provisioner. The next production-hardening priorities are authentication, per-user/project isolation, deploy log streaming durability, stronger input validation, and hosted install documentation.
