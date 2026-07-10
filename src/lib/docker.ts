import Docker from "dockerode";
import { CONFIG } from "./config";
import { resolveDockerClient, resolveTraefikSetup } from "./discovery";

let client: Docker | null = null;

/**
 * Synchronous accessor. Prefers the auto-discovered client (set once
 * dockerAvailable() has run), and falls back to the configured/default socket
 * so existing synchronous call sites keep working.
 */
export function getDocker(): Docker {
  if (!client) {
    if (CONFIG.dockerSocket.startsWith("unix://")) {
      client = new Docker({ socketPath: CONFIG.dockerSocket.replace("unix://", "") });
    } else {
      const url = new URL(CONFIG.dockerSocket);
      client = new Docker({ host: url.hostname, port: Number(url.port) || 2375 });
    }
  }
  return client;
}

export async function dockerAvailable(): Promise<boolean> {
  // Auto-detect the working socket across common locations. Once found, cache
  // it as the module client so all sync getDocker() callers use it too.
  const resolved = await resolveDockerClient();
  if (resolved) {
    client = resolved;
    return true;
  }
  // Last resort: try the configured/default socket directly.
  try {
    await getDocker().ping();
    return true;
  } catch {
    return false;
  }
}

export interface StartContainerOpts {
  imageName: string;
  name: string;
  domain: string;
  port: number;
  env: Record<string, string>;
  /** Optional: force a network. Left empty, MYTHIC auto-detects the proxy network. */
  network?: string;
}

function traefikLabels(
  name: string,
  domain: string,
  port: number,
  entrypoint: string,
  certResolver: string
): Record<string, string> {
  const safe = name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return {
    "traefik.enable": "true",
    [`traefik.http.routers.${safe}.rule`]: `Host(\`${domain}\`)`,
    [`traefik.http.routers.${safe}.entrypoints`]: entrypoint,
    [`traefik.http.routers.${safe}.tls`]: "true",
    [`traefik.http.routers.${safe}.tls.certresolver`]: certResolver,
    [`traefik.http.services.${safe}.loadbalancer.server.port`]: String(port),
  };
}

export async function startContainer(opts: StartContainerOpts): Promise<string> {
  const d = getDocker();
  const containerName = `mythic-${opts.name}`;

  // Remove any stale container with the same name.
  try {
    const existing = d.getContainer(containerName);
    await existing.remove({ force: true });
  } catch {
    /* not found */
  }

  // Zero-config: mirror the running proxy's network + entrypoint + resolver.
  const traefik = await resolveTraefikSetup();
  const network = opts.network || traefik.network;

  const env = Object.entries(opts.env || {}).map(([k, v]) => `${k}=${v}`);
  const labels = traefikLabels(
    opts.name,
    opts.domain,
    opts.port,
    traefik.entrypoint,
    traefik.certResolver
  );

  const container = await d.createContainer({
    name: containerName,
    Image: opts.imageName,
    Env: env,
    Labels: labels,
    ExposedPorts: { [`${opts.port}/tcp`]: {} },
    HostConfig: {
      RestartPolicy: { Name: "unless-stopped" },
      NetworkMode: network,
    },
  });

  await container.start();
  return container.id;
}

export async function stopContainer(containerId: string): Promise<void> {
  try {
    const c = getDocker().getContainer(containerId);
    await c.stop({ t: 10 });
  } catch {
    /* already stopped */
  }
}

export async function removeContainer(containerId: string, name: string): Promise<void> {
  try {
    const byName = getDocker().getContainer(`mythic-${name}`);
    await byName.remove({ force: true });
  } catch {
    /* ignore */
  }
  if (containerId) {
    try {
      const c = getDocker().getContainer(containerId);
      await c.remove({ force: true });
    } catch {
      /* ignore */
    }
  }
}

export async function containerRunning(containerId: string): Promise<boolean> {
  try {
    const info = await getDocker().getContainer(containerId).inspect();
    return info.State.Running;
  } catch {
    return false;
  }
}


export interface DockerContainerSummary {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  domains: string[];
  ports: string[];
  managedByMythic: boolean;
}

function labelDomains(labels: Record<string, string> | undefined): string[] {
  const values = Object.values(labels ?? {});
  const domains = new Set<string>();
  for (const value of values) {
    const matches = value.matchAll(/Host\((?:`|\")([^`\"]+)(?:`|\")\)/g);
    for (const match of matches) domains.add(match[1]);
  }
  return [...domains];
}

export async function listDockerContainers(): Promise<{ available: boolean; containers: DockerContainerSummary[]; error?: string }> {
  const available = await dockerAvailable();
  if (!available) return { available: false, containers: [], error: "Docker socket not reachable" };

  try {
    const containers = await getDocker().listContainers({ all: true });
    return {
      available: true,
      containers: containers.map((c) => ({
        id: c.Id,
        name: (c.Names?.[0] || c.Id.slice(0, 12)).replace(/^\//, ""),
        image: c.Image,
        state: c.State,
        status: c.Status,
        domains: labelDomains(c.Labels),
        ports: (c.Ports || []).map((p) => {
          const host = p.PublicPort ? `${p.IP || "0.0.0.0"}:${p.PublicPort}->` : "";
          return `${host}${p.PrivatePort}/${p.Type}`;
        }),
        managedByMythic:
          (c.Names || []).some((name) => name.includes("mythic")) ||
          Object.keys(c.Labels || {}).some((key) => key.startsWith("traefik.http.routers.")),
      })),
    };
  } catch (err) {
    return {
      available: false,
      containers: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
