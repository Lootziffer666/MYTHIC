import fs from "node:fs";
import { store } from "./db";
import { CONFIG, ensureDirs, repoPath } from "./config";
import { cloneRepo } from "./git";
import { analyzeRepo } from "./analyzer";
import { buildWithNixpacks, buildWithDockerfile } from "./builder";
import {
  dockerAvailable,
  getDocker,
  startContainer,
  type StartContainerOpts,
} from "./docker";
import { resolveTraefikSetup } from "./discovery";
import {
  aiConfigured,
  applyFixToAnalysis,
  requestAiFix,
  type AiFix,
} from "./ai";
import { randomId } from "./format";
import type { AnalysisResult, DeploymentMode, DeploymentRecord } from "./types";

const repairing = new Set<string>();

export interface ManualAiFixResult {
  fix: AiFix | null;
  deployment: DeploymentRecord | null;
  error?: string;
}

function appendLog(id: string, line: string): void {
  store.appendLog(id, `${line}\n`);
}

function patchAnalysis(
  record: DeploymentRecord,
  base: AnalysisResult,
  fix: AiFix
): AnalysisResult {
  const patched = applyFixToAnalysis(base, fix);
  return {
    ...patched,
    port: fix.port ?? record.port ?? patched.port,
    environment: {
      ...patched.environment,
      ...(fix.environment ?? {}),
      ...record.env,
    },
  };
}

async function buildAndDeployRepair(
  record: DeploymentRecord,
  analysis: AnalysisResult
): Promise<void> {
  const id = record.id;
  const log = (line: string) => appendLog(id, line);
  const set = (patch: Partial<DeploymentRecord>) => store.update(id, patch);

  const docker = await dockerAvailable();
  const mode: DeploymentMode = docker && !CONFIG.forceSimulation ? "live" : "simulation";
  set({ mode });

  if (mode === "live") {
    const setup = await resolveTraefikSetup();
    log(
      `AI repair environment: Docker reachable · Traefik network "${setup.network}", ` +
        `entrypoint "${setup.entrypoint}", cert resolver "${setup.certResolver}" (${setup.source})`
    );
  } else {
    log(
      "AI repair cannot deploy live because the Docker socket is not reachable; " +
        "continuing in simulation mode."
    );
  }

  set({ status: "building" });
  log(`\n[AI-REPAIR 1/2] BUILD — rebuilding image "${record.imageName}"`);

  if (mode === "live") {
    try {
      await buildWithNixpacks(repoPath(id), record.imageName, log);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log(`Nixpacks repair build failed: ${reason}`);
      log("Applying the AI-adjusted build plan through MYTHIC's Dockerfile fallback.");
      await buildWithDockerfile(repoPath(id), record.imageName, analysis, getDocker(), log);
    }
  } else {
    log(`(simulation) Would rebuild ${record.imageName} with the AI-adjusted build plan`);
  }

  set({ status: "deploying" });
  log("\n[AI-REPAIR 2/2] DEPLOY — replacing the failed deployment");

  let containerId: string;
  if (mode === "live") {
    const opts: StartContainerOpts = {
      imageName: record.imageName,
      name: record.name,
      domain: record.domain,
      port: analysis.port || record.port,
      env: analysis.environment || {},
    };
    containerId = await startContainer(opts);
    log(`Container started: ${containerId.slice(0, 12)}`);
    log(`Traefik labels applied for Host(\`${record.domain}\`)`);
  } else {
    containerId = `sim_${randomId("c")}`;
    log(`(simulation) Container "${containerId}" started virtually`);
  }

  set({
    status: "running",
    containerId,
    url: mode === "live" ? `https://${record.domain}` : `http://${record.domain}`,
  });
  log(
    mode === "live"
      ? `\n✅ AI repair deployed live at https://${record.domain}`
      : `\n✅ AI repair simulation completed for https://${record.domain}`
  );
}

async function executeRepair(record: DeploymentRecord, fix: AiFix): Promise<void> {
  if (repairing.has(record.id)) return;
  repairing.add(record.id);

  const id = record.id;
  const log = (line: string) => appendLog(id, line);

  try {
    ensureDirs();
    const dir = repoPath(id);

    if (!fs.existsSync(dir)) {
      store.update(id, { status: "cloning" });
      log("AI repair worktree missing; cloning the repository again.");
      await cloneRepo(id, record.repoUrl, { branch: record.branch }, log);
    }

    let base = record.analysis;
    if (!base) {
      store.update(id, { status: "analyzing" });
      base = await analyzeRepo(dir);
    }

    const patched = patchAnalysis(record, base, fix);
    store.update(id, {
      analysis: patched,
      port: patched.port ?? record.port,
      env: { ...record.env, ...(fix.environment ?? {}) },
      containerId: undefined,
      status: "queued",
    });

    log(`\n🤖 AI diagnosis: ${fix.diagnosis}`);
    log(`AI executable repair: ${fix.explanation}`);
    if (fix.buildCommand) log(`Patched build command: ${fix.buildCommand}`);
    if (fix.startCommand) log(`Patched start command: ${fix.startCommand}`);
    if (fix.dockerfile) log("AI supplied a complete replacement Dockerfile.");

    await buildAndDeployRepair(store.get(id) ?? record, patched);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`\n❌ AI repair failed: ${message}`);
    store.update(id, { status: "failed" });
  } finally {
    repairing.delete(id);
  }
}

export async function startManualAiFixDeployment(id: string): Promise<ManualAiFixResult> {
  const record = store.get(id);
  if (!record) return { fix: null, deployment: null, error: "Deployment not found" };

  if (!aiConfigured()) {
    return { fix: null, deployment: record, error: "AI is not configured" };
  }

  let fix: AiFix | null;
  try {
    fix = await requestAiFix({
      repoUrl: record.repoUrl,
      logs: record.logs,
      analysis: record.analysis,
    });
  } catch (err) {
    return {
      fix: null,
      deployment: record,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!fix) {
    return {
      fix: null,
      deployment: record,
      error: "AI returned a diagnosis but no machine-applicable repair",
    };
  }

  const base = record.analysis ?? { provider: "ai", environment: {} };
  const patched = patchAnalysis(record, base, fix);
  store.update(id, {
    analysis: patched,
    port: patched.port ?? record.port,
    env: { ...record.env, ...(fix.environment ?? {}) },
    containerId: undefined,
    status: "queued",
    logs: `${record.logs}\n[AI-FIX-QUEUED] ${fix.diagnosis}\n`,
  });

  const refreshed = store.get(id)!;
  void executeRepair(refreshed, fix);
  return { fix, deployment: refreshed };
}
