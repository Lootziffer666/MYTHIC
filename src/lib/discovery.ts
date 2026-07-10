import Docker from "dockerode";
import fs from "node:fs";
import os from "node:os";
import { CONFIG } from "./config";

/**
 * Zero-config runtime discovery.
 *
 * MYTHIC inspects the host it runs on and figures out everything it needs by
 * itself: which Docker socket to talk to, which network the existing reverse
 * proxy (Traefik) lives on, and which entrypoint + cert resolver that proxy
 * uses. Nothing has to be configured by hand — the only thing a human must do
 * is grant access to the Docker socket (a deliberate security boundary), which
 * MYTHIC's own compose file already declares.
 *
 * Every value can still be forced via an env var (see config.ts); discovery is
 * only used when the corresponding override is absent.
 */

export interface TraefikSetup {
  network: string;
  entrypoint: string;
  certResolver: string;
  source: string; // human-readable note on where this came from
}

let cachedClient: Docker | null = null;
let cachedTraefik: TraefikSetup | null = null;
let traefikResolved = false;

/** Candidate Docker socket paths, most common first. */
function socketCandidates(): string[] {
  const list: string[] = [];
  // Explicit override always wins.
  if (process.env.DOCKER_HOST) list.push(process.env.DOCKER_HOST);
  if (process.env.DOCKER_SOCK_PATH) list.push(`unix://${process.env.DOCKER_SOCK_PATH}`);
  // Standard locations across distros / rootless / Docker Desktop.
  list.push(
    "unix:///var/run/docker.sock",
    "unix:///run/docker.sock",
    `unix://${os.homedir()}/.docker/run/docker.sock`,
    `unix:///run/user/${typeof process.getuid === "function" ? process.getuid() : 0}/docker.sock`
  );
  // De-duplicate while preserving order.
  return [...new Set(list)];
}

function makeClient(endpoint: string): Docker {
  if (endpoint.startsWith("unix://")) {
    return new Docker({ socketPath: endpoint.replace("unix://", "") });
  }
  const url = new URL(endpoint);
  return new Docker({ host: url.hostname, port: Number(url.port) || 2375 });
}

/**
 * Return a working Docker client, trying each candidate socket until one
 * responds to ping(). Result is cached. Returns null if none work.
 */
export async function resolveDockerClient(): Promise<Docker | null> {
  if (cachedClient) return cachedClient;

  for (const endpoint of socketCandidates()) {
    // For unix sockets, skip fast if the file isn't even there.
    if (endpoint.startsWith("unix://")) {
      const p = endpoint.replace("unix://", "");
      if (!fs.existsSync(p)) continue;
    }
    try {
      const client = makeClient(endpoint);
      await client.ping();
      cachedClient = client;
      return client;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/**
 * Inspect the running containers, find the Traefik proxy, and mirror its
 * settings so MYTHIC-deployed containers attach to the same network and use
 * the same entrypoint + cert resolver. Cached after first resolution.
 */
export async function detectTraefik(): Promise<TraefikSetup | null> {
  if (traefikResolved) return cachedTraefik;
  traefikResolved = true;

  const docker = await resolveDockerClient();
  if (!docker) return null;

  try {
    const containers = await docker.listContainers({ all: false });
    const traefik = containers.find((c) => {
      const img = (c.Image || "").toLowerCase();
      const names = (c.Names || []).join(" ").toLowerCase();
      return img.includes("traefik") || names.includes("traefik") || names.includes("proxy");
    });
    if (!traefik) return null;

    const info = await docker.getContainer(traefik.Id).inspect();

    // --- network ---
    const nets = Object.keys(info.NetworkSettings?.Networks ?? {}).filter(
      (n) => !["bridge", "host", "none"].includes(n)
    );
    // Prefer a network that looks like a proxy network.
    const network =
      nets.find((n) => /coolify|traefik|proxy/i.test(n)) ?? nets[0] ?? "bridge";

    // --- entrypoint + cert resolver from the proxy's launch args ---
    const args: string[] = [
      ...(info.Config?.Cmd ?? []),
      ...(info.Args ?? []),
      // Coolify passes some config via labels too.
      ...Object.entries(info.Config?.Labels ?? {}).map(([k, v]) => `${k}=${v}`),
    ];
    const joined = args.join("\n");

    // The websecure entrypoint is whichever one binds :443.
    // e.g. --entrypoints.https.address=:443  ->  "https"
    let entrypoint = "websecure";
    const epMatch = joined.match(/ent[Pp]oints\.([A-Za-z0-9_-]+)\.address=:443\b/);
    if (epMatch) entrypoint = epMatch[1];
    else if (/ent[Pp]oints\.https\b/.test(joined)) entrypoint = "https";

    // The cert resolver name from certificatesresolvers.<name>.acme...
    let certResolver = "letsencrypt";
    const crMatch = joined.match(/certificates[Rr]esolvers\.([A-Za-z0-9_-]+)\./);
    if (crMatch) certResolver = crMatch[1];

    cachedTraefik = {
      network,
      entrypoint,
      certResolver,
      source: `auto-detected from container ${(traefik.Names?.[0] || traefik.Id).replace(/^\//, "")}`,
    };
    return cachedTraefik;
  } catch {
    return null;
  }
}

/**
 * The effective Traefik settings MYTHIC will use: explicit env overrides take
 * priority, otherwise auto-detected values, otherwise safe defaults.
 */
export async function resolveTraefikSetup(): Promise<TraefikSetup> {
  const detected = await detectTraefik();
  const overridden =
    CONFIG.traefikNetworkOverride ||
    CONFIG.traefikEntrypointOverride ||
    CONFIG.traefikCertResolverOverride;

  return {
    network: CONFIG.traefikNetworkOverride || detected?.network || "traefik",
    entrypoint: CONFIG.traefikEntrypointOverride || detected?.entrypoint || "websecure",
    certResolver:
      CONFIG.traefikCertResolverOverride || detected?.certResolver || "letsencrypt",
    source: overridden
      ? "env override" + (detected ? " + " + detected.source : "")
      : detected?.source || "defaults (no Traefik detected)",
  };
}

/** For tests / redeploys: forget cached discovery. */
export function resetDiscovery(): void {
  cachedClient = null;
  cachedTraefik = null;
  traefikResolved = false;
}
