import path from "node:path";
import fs from "node:fs";

// Prefer the new MYTHIC_* env vars, fall back to the legacy MAGIC_DEPLOY_* ones.
function env(name: string, ...fallbacks: string[]): string | undefined {
  for (const key of [name, ...fallbacks]) {
    const value = process.env[key];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

export const CONFIG = {
  workDir: env("MYTHIC_WORKDIR", "MAGIC_DEPLOY_WORKDIR") || path.join(process.cwd(), ".deploy"),
  dockerSocket:
    process.env.DOCKER_HOST ||
    (process.env.DOCKER_SOCK_PATH
      ? `unix://${process.env.DOCKER_SOCK_PATH}`
      : "unix:///var/run/docker.sock"),
  nixpacksBin: process.env.NIXPACKS_BIN || "nixpacks",
  defaultBranch: env("MYTHIC_BRANCH", "MAGIC_DEPLOY_BRANCH") || "main",
  baseDomain: env("MYTHIC_BASE_DOMAIN", "MAGIC_DEPLOY_BASE_DOMAIN") || "localtest.me",
  defaultPort: Number(env("MYTHIC_DEFAULT_PORT", "MAGIC_DEPLOY_DEFAULT_PORT") || 3000),
  traefikNetwork: env("MYTHIC_TRAEFIK_NETWORK", "MAGIC_DEPLOY_TRAEFIK_NETWORK") || "traefik",
  forceSimulation: env("MYTHIC_SIMULATION", "MAGIC_DEPLOY_SIMULATION") === "true",
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
