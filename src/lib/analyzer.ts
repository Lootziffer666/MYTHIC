import { execFileAsync } from "./format";
import type { AnalysisResult } from "./types";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config";

interface NixpacksPlan {
  providers?: string[];
  variables?: Record<string, string>;
  phases?: Record<string, { cmds?: string[]; depCmds?: string[]; env?: Record<string, string> }>;
  start?: { cmd?: string; runImage?: string };
  static?: boolean;
  buildImage?: string;
}

async function nixpacksAvailable(): Promise<boolean> {
  try {
    await execFileAsync(CONFIG.nixpacksBin, ["--version"], { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Phase 2 (Analysis) — primary detection path.
 * Uses `nixpacks plan` when the CLI is installed on the host.
 */
export async function analyzeWithNixpacks(repoDir: string): Promise<AnalysisResult | null> {
  if (!(await nixpacksAvailable())) return null;
  try {
    const { stdout } = await execFileAsync(CONFIG.nixpacksBin, ["plan", repoDir, "--json"], {
      timeout: 60000,
      maxBuffer: 1024 * 1024 * 5,
    });
    const plan = JSON.parse(stdout) as NixpacksPlan;
    const buildPhase = plan.phases?.build;
    const buildCmd = buildPhase?.cmds?.join(" && ");
    const env: Record<string, string> = {};
    for (const phase of Object.values(plan.phases ?? {})) {
      Object.assign(env, phase.env ?? {});
    }
    Object.assign(env, plan.variables ?? {});
    return {
      provider: "nixpacks",
      language: plan.providers?.[0],
      framework: plan.providers?.[1],
      baseImage: plan.buildImage,
      buildCommand: buildCmd,
      startCommand: plan.start?.cmd,
      environment: env,
      notes: "Detected with nixpacks",
    };
  } catch (err) {
    return null;
  }
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Fallback detector used when nixpacks is not installed (e.g. local / sandbox)
 * or when it fails. Mirrors the kind of detection nixpacks performs.
 */
export function heuristicAnalysis(repoDir: string): AnalysisResult {
  const has = (p: string) => fs.existsSync(path.join(repoDir, p));
  const env: Record<string, string> = {};

  // --- Node.js / TypeScript ---
  if (has("package.json")) {
    const pkg = (readJson(path.join(repoDir, "package.json")) ?? {}) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const scripts = pkg.scripts ?? {};
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const framework = Object.keys(deps).find((d) =>
      ["next", "nuxt", "svelte", "vite", "remix", "@angular/core", "astro", "express", "fastify"].includes(d)
    );
    const fwName =
      framework === "next"
        ? "Next.js"
        : framework === "nuxt"
          ? "Nuxt"
          : framework === "svelte"
            ? "SvelteKit"
            : framework === "vite"
              ? "Vite"
              : framework === "remix"
                ? "Remix"
                : framework === "astro"
                  ? "Astro"
                  : framework === "express"
                    ? "Express"
                    : framework === "fastify"
                      ? "Fastify"
                      : undefined;

    const buildCommand = scripts.build
      ? `npm run build`
      : scripts.prepare
        ? `npm run prepare`
        : undefined;
    const startCommand = scripts.start
      ? `npm run start`
      : scripts.dev
        ? `npm run dev`
        : `node server.js`;
    const port = fwName === "Vite" || fwName === "Astro" ? 4321 : 3000;

    return {
      provider: "heuristic",
      language: "Node.js",
      framework: fwName,
      baseImage: "node:20-slim",
      buildCommand,
      startCommand,
      port,
      environment: env,
      notes: "Detected via package.json (heuristic fallback)",
    };
  }

  // --- Python ---
  if (has("requirements.txt") || has("pyproject.toml") || has("Pipfile")) {
    const reqs = has("requirements.txt")
      ? fs.readFileSync(path.join(repoDir, "requirements.txt"), "utf8")
      : "";
    const framework = ["fastapi", "flask", "django", "streamlit"].find((f) => reqs.includes(f));
    const port = 8000;
    let startCommand = "python app.py";
    if (framework === "fastapi" || framework === "flask") {
      const modName = reqs.includes("uvicorn") ? "app:app" : "app";
      startCommand = `uvicorn ${modName} --host 0.0.0.0 --port ${port}`;
    } else if (framework === "django") {
      startCommand = `gunicorn project.wsgi:application --bind 0.0.0.0:${port}`;
    }
    return {
      provider: "heuristic",
      language: "Python",
      framework,
      baseImage: "python:3.12-slim",
      buildCommand: "pip install -r requirements.txt",
      startCommand,
      port,
      environment: env,
      notes: "Detected via requirements.txt (heuristic fallback)",
    };
  }

  // --- Go ---
  if (has("go.mod")) {
    const modFile = fs.readFileSync(path.join(repoDir, "go.mod"), "utf8");
    const modName = (modFile.match(/^module\s+(\S+)/m)?.[1] ?? "app").split("/").pop();
    return {
      provider: "heuristic",
      language: "Go",
      framework: "Go",
      baseImage: "golang:1.22",
      buildCommand: `go build -o bin/app .`,
      startCommand: "./bin/app",
      port: 8080,
      environment: env,
      notes: "Detected via go.mod (heuristic fallback)",
    };
  }

  // --- Rust ---
  if (has("Cargo.toml")) {
    return {
      provider: "heuristic",
      language: "Rust",
      framework: "Rust",
      baseImage: "rust:1.79",
      buildCommand: "cargo build --release",
      startCommand: "./target/release/app",
      port: 8080,
      environment: env,
      notes: "Detected via Cargo.toml (heuristic fallback)",
    };
  }

  // --- PHP ---
  if (has("composer.json")) {
    return {
      provider: "heuristic",
      language: "PHP",
      framework: "Laravel/PHP",
      baseImage: "php:8.3-apache",
      buildCommand: "composer install",
      startCommand: "apache2-foreground",
      port: 80,
      environment: env,
      notes: "Detected via composer.json (heuristic fallback)",
    };
  }

  // --- Static site ---
  if (has("index.html")) {
    return {
      provider: "heuristic",
      language: "Static",
      framework: "Static HTML",
      baseImage: "nginx:alpine",
      buildCommand: undefined,
      startCommand: "nginx -g 'daemon off;'",
      port: 80,
      environment: env,
      notes: "Detected static index.html (heuristic fallback)",
    };
  }

  return {
    provider: "heuristic",
    language: "Unknown",
    baseImage: "alpine:latest",
    buildCommand: undefined,
    startCommand: undefined,
    port: CONFIG.defaultPort,
    environment: env,
    notes: "Could not detect framework. Please configure manually.",
  };
}

export async function analyzeRepo(repoDir: string): Promise<AnalysisResult> {
  const nix = await analyzeWithNixpacks(repoDir);
  if (nix && (nix.startCommand || nix.buildCommand)) return nix;
  return heuristicAnalysis(repoDir);
}
