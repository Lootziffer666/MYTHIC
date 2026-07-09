import Docker from "dockerode";
import { CONFIG } from "./config";

let client: Docker | null = null;

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
  try {
    const d = getDocker();
    await d.ping();
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
  network: string;
}

function traefikLabels(name: string, domain: string, port: number): Record<string, string> {
  const safe = name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return {
    "traefik.enable": "true",
    [`traefik.http.routers.${safe}.rule`]: `Host(\`${domain}\`)`,
    [`traefik.http.routers.${safe}.entrypoints`]: "websecure",
    [`traefik.http.routers.${safe}.tls`]: "true",
    [`traefik.http.routers.${safe}.tls.certresolver`]: "letsencrypt",
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

  const env = Object.entries(opts.env || {}).map(([k, v]) => `${k}=${v}`);
  const labels = traefikLabels(opts.name, opts.domain, opts.port);

  const container = await d.createContainer({
    name: containerName,
    Image: opts.imageName,
    Env: env,
    Labels: labels,
    ExposedPorts: { [`${opts.port}/tcp`]: {} },
    HostConfig: {
      RestartPolicy: { Name: "unless-stopped" },
      NetworkMode: opts.network,
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
