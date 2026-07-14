import type { AnalysisResult } from "./types";
import { getDefaultProvider, getProviderSecret, listProviders } from "./settings";

export interface AiFix {
  diagnosis: string;
  explanation: string;
  buildCommand?: string;
  startCommand?: string;
  port?: number;
  environment?: Record<string, string>;
  dockerfile?: string;
}

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function envConfig(): AiConfig | null {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return null;
  return {
    baseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
    apiKey,
    model: process.env.AI_MODEL || "gpt-4o-mini",
  };
}

/**
 * Resolve the LLM config. BYOK settings win (stored locally + encrypted);
 * process env vars remain a convenience fallback.
 */
export function getAiConfig(): AiConfig | null {
  const env = envConfig();
  if (env) return env;

  const provider = getDefaultProvider() ?? listProviders()[0];
  if (!provider) return null;
  const secret = getProviderSecret(provider.id);
  if (!secret) return null;
  return { baseUrl: provider.baseUrl, apiKey: secret, model: provider.model };
}

export function aiConfigured(): boolean {
  return getAiConfig() !== null;
}

/** Where the active config came from (for UI display / logs). */
export function aiConfigSource(): "env" | "byok" | "none" {
  if (envConfig()) return "env";
  if (getDefaultProvider() ?? listProviders()[0]) return "byok";
  return "none";
}

const SYSTEM_PROMPT = `You are a senior DevOps engineer operating "MYTHIC",
a self-hosted deployment tool (like Vercel/Railway) that clones a Git repo, detects the
stack with nixpacks, builds a Docker image and routes it behind Traefik.

A deployment just failed. You are given the pipeline logs. Diagnose the root cause and
return a machine-applicable repair. A diagnosis by itself is NOT a fix.

At least one of these fields MUST contain an executable change:
- buildCommand
- startCommand
- port
- environment
- dockerfile

For a missing Node package, return a buildCommand that installs the exact missing package
with the package manager visible in the logs and then runs the original build command.
For example, use a pattern like "npm install -D <package> && npm run build" when npm is
clearly in use. Do not merely explain that a package should be added.

A dockerfile value must be complete Dockerfile contents, not a fragment. Only set fields
you are confident about. Do not invent secrets, domains, or package names.

Respond with STRICT JSON only (no markdown, no code fences):
{
  "diagnosis": "one-line root cause",
  "explanation": "short human-readable explanation of the applied fix",
  "buildCommand": "corrected executable build command or null",
  "startCommand": "corrected executable start command or null",
  "port": 3000,
  "environment": { "KEY": "value" },
  "dockerfile": "complete optional Dockerfile contents or null"
}`;

function extractJson(text: string): Partial<AiFix> {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last >= 0) t = t.slice(first, last + 1);
  try {
    return JSON.parse(t) as Partial<AiFix>;
  } catch {
    return {};
  }
}

export function isActionableAiFix(fix: Partial<AiFix> | null | undefined): boolean {
  if (!fix) return false;
  const environment = fix.environment && typeof fix.environment === "object"
    ? Object.keys(fix.environment).length > 0
    : false;
  return Boolean(
    fix.buildCommand?.trim() ||
      fix.startCommand?.trim() ||
      fix.dockerfile?.trim() ||
      (typeof fix.port === "number" && Number.isFinite(fix.port)) ||
      environment
  );
}

export async function requestAiFix(input: {
  repoUrl: string;
  logs: string;
  analysis: AnalysisResult | null;
}): Promise<AiFix | null> {
  const cfg = getAiConfig();
  if (!cfg) return null;

  const userPrompt = `Repository: ${input.repoUrl}
Detected stack: ${input.analysis ? `${input.analysis.language} / ${input.analysis.framework}` : "unknown"}
Current build command: ${input.analysis?.buildCommand ?? "(none)"}
Current start command: ${input.analysis?.startCommand ?? "(none)"}

--- PIPELINE LOGS ---
${input.logs.slice(-8000)}
--- END LOGS ---`;

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI provider returned ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  const parsed = extractJson(content);
  if (!isActionableAiFix(parsed)) return null;

  const environment: Record<string, string> = {};
  if (parsed.environment && typeof parsed.environment === "object") {
    for (const [key, value] of Object.entries(parsed.environment)) {
      if (typeof value === "string") environment[key] = value;
    }
  }

  return {
    diagnosis: parsed.diagnosis ?? "Deployment repair",
    explanation: parsed.explanation ?? "Applied an executable deployment repair.",
    buildCommand: parsed.buildCommand?.trim() || undefined,
    startCommand: parsed.startCommand?.trim() || undefined,
    port: typeof parsed.port === "number" && Number.isFinite(parsed.port) ? parsed.port : undefined,
    environment: Object.keys(environment).length ? environment : undefined,
    dockerfile: parsed.dockerfile?.trim() || undefined,
  };
}

export function applyFixToAnalysis(analysis: AnalysisResult, fix: AiFix): AnalysisResult {
  return {
    ...analysis,
    buildCommand: fix.buildCommand ?? analysis.buildCommand,
    startCommand: fix.startCommand ?? analysis.startCommand,
    port: fix.port ?? analysis.port,
    environment: { ...analysis.environment, ...(fix.environment ?? {}) },
    dockerfile: fix.dockerfile ?? analysis.dockerfile,
    notes: `AI auto-fix: ${fix.diagnosis}`,
  };
}
