import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const execFileAsync = promisify(execFile);

export function randomId(prefix = "dep"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}_${time}${rand}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 40);
}

export function domainFromRepo(repoUrl: string): string {
  const name = repoNameFromUrl(repoUrl);
  return slugify(name);
}

export function repoNameFromUrl(repoUrl: string): string {
  const cleaned = repoUrl.replace(/\.git$/, "").replace(/\/+$/, "");
  const parts = cleaned.split("/");
  return parts[parts.length - 1] || "app";
}

export function imageNameFromId(id: string): string {
  return `mythic/${id.replace(/_/g, "-")}`;
}

export function safeEnvKey(key: string): string {
  return key
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
