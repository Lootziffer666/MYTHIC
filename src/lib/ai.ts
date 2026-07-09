import type { AnalysisResult } from "./types";

export interface AiFix {
  diagnosis: string;
  explanation: string;
  buildCommand?: string;
  startCommand?: string;
  port?: number;
  environment?: Record<string, string>;
  dockerfile?: string;
}

interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function getAiConfig(): AiConfig | null {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return null;
  return {
    baseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
    apiKey,
    model: process.env.AI_MODEL || "gpt-4o-mini",
  };
}

export function aiConfigured(): boolean {
  return getAiConfig() !== null;
}

const SYSTEM_PROMPT = `You are a senior DevOps engineer operating "MYTHIC",
a self-hosted deployment tool (like Vercel/Railway) that clones a Git repo, detects the
stack with nixpacks, builds a Docker image and routes it behind Traefik.

A deployment just failed. You are given the pipeline logs. Diagnose the root cause and
propose a concrete fix. You may correct the build command, start command, port, or
suggest a Dockerfile snippet. Only set fields you are confident about.

Respond with STRICT JSON only (no markdown, no code fences):
{
  "diagnosis": "one-line root cause",
  "explanation": "short human-readable explanation of the fix",
  "buildCommand": "corrected build command or null",
  "startCommand": "corrected start command or null",
  "port": 3000,
  "environment": { "KEY": "value" },
  "dockerfile": "optional Dockerfile contents or null"
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
  if (!parsed.diagnosis && !parsed.startCommand && !parsed.buildCommand && !parsed.dockerfile) {
    return null;
  }
  return {
    diagnosis: parsed.diagnosis ?? "",
    explanation: parsed.explanation ?? "",
    buildCommand: parsed.buildCommand ?? undefined,
    startCommand: parsed.startCommand ?? undefined,
    port: parsed.port ?? undefined,
    environment: parsed.environment ?? undefined,
    dockerfile: parsed.dockerfile ?? undefined,
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
