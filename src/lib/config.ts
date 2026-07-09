import path from "node:path";
import fs from "node:fs";

export const CONFIG = {
  workDir: process.env.MAGIC_DEPLOY_WORKDIR || path.join(process.cwd(), ".deploy"),
  dockerSocket:
    process.env.DOCKER_HOST ||
    (process.env.DOCKER_SOCK_PATH
      ? `unix://${process.env.DOCKER_SOCK_PATH}`
      : "unix:///var/run/docker.sock"),
  nixpacksBin: process.env.NIXPACKS_BIN || "nixpacks",
  defaultBranch: process.env.MAGIC_DEPLOY_BRANCH || "main",
  baseDomain: process.env.MAGIC_DEPLOY_BASE_DOMAIN || "localtest.me",
  defaultPort: Number(process.env.MAGIC_DEPLOY_DEFAULT_PORT || 3000),
  traefikNetwork: process.env.MAGIC_DEPLOY_TRAEFIK_NETWORK || "traefik",
  forceSimulation: process.env.MAGIC_DEPLOY_SIMULATION === "true",
} as const;

export function reposDir(): string {
  return path.join(CONFIG.workDir, "repos");
}

export function repoPath(id: string): string {
  return path.join(reposDir(), id);
}

export function ensureDirs(): void {
  fs.mkdirSync(CONFIG.workDir, { recursive: true });
  fs.mkdirSync(reposDir(), { recursive: true });
}
