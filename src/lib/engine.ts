import { store } from "./db";
import { CONFIG, ensureDirs, repoPath } from "./config";
import { cloneRepo } from "./git";
import { analyzeRepo } from "./analyzer";
import { buildWithNixpacks, buildWithDockerfile } from "./builder";
import {
  dockerAvailable,
  startContainer,
  removeContainer,
  getDocker,
  type StartContainerOpts,
} from "./docker";
import { requestAiFix, applyFixToAnalysis, aiConfigured } from "./ai";
import { resolveTraefikSetup } from "./discovery";
import { randomId, slugify, domainFromRepo, imageNameFromId } from "./format";
import type { CreateDeploymentInput, DeploymentMode, DeploymentRecord, AnalysisResult } from "./types";

const running = new Set<string>();
const AUTO_FIX =
  (process.env.MYTHIC_AI_AUTOFIX ?? process.env.MAGIC_DEPLOY_AI_AUTOFIX) === "true";

export function buildRecord(input: CreateDeploymentInput): DeploymentRecord {
  const id = randomId();
  const name = slugify(input.name || domainFromRepo(input.repoUrl) || "app");
  const domain = input.domain
    ? input.domain
    : `${domainFromRepo(input.repoUrl)}.${CONFIG.baseDomain}`;
  const imageName = imageNameFromId(id);
  const now = Date.now();
  return {
    id,
    name,
    repoUrl: input.repoUrl,
    branch: input.branch || CONFIG.defaultBranch,
    domain,
    port: input.port || CONFIG.defaultPort,
    env: input.env || {},
    imageName,
    status: "queued",
    mode: "simulation",
    analysis: null,
    logs: "",
    createdAt: now,
    updatedAt: now,
    url: `https://${domain}`,
  };
}

async function detectMode(): Promise<DeploymentMode> {
  const docker = await dockerAvailable();
  return docker && !CONFIG.forceSimulation ? "live" : "simulation";
}

async function buildAndDeploy(
  record: DeploymentRecord,
  analysis: AnalysisResult,
  log: (line: string) => void,
  set: (patch: Partial<DeploymentRecord>) => void,
  attemptAi: boolean
): Promise<void> {
  const mode: DeploymentMode = await detectMode();
  set({ mode });

  if (mode === "live") {
    const setup = await resolveTraefikSetup();
    log(
      `Environment: Docker reachable · Traefik network "${setup.network}", ` +
        `entrypoint "${setup.entrypoint}", cert resolver "${setup.certResolver}" (${setup.source})`
    );
  } else {
    log(
      `Environment: running in SIMULATION mode — the Docker socket is not reachable ` +
        `from MYTHIC. Grant socket access (mount /var/run/docker.sock) to deploy for real.`
    );
  }

  // --- Phase 3: Build ---
  set({ status: "building" });
  log(`\n[3/4] BUILD — creating Docker image "${record.imageName}"`);
  if (mode === "live") {
    try {
      await buildWithNixpacks(repoPath(record.id), record.imageName, log);
    } catch {
      log(`nixpacks unavailable, falling back to generated Dockerfile`);
      await buildWithDockerfile(repoPath(record.id), record.imageName, analysis, getDocker(), log);
    }
  } else {
    log(`(simulation) Would run: nixpacks build ./repos/${record.id} --name ${record.imageName}`);
    log(`(simulation) Image "${record.imageName}:latest" created virtually`);
  }

  // --- Phase 4: Deploy ---
  set({ status: "deploying" });
  log(`\n[4/4] DEPLOY — starting container behind reverse proxy`);
  let containerId: string | undefined;
  if (mode === "live") {
    const opts: StartContainerOpts = {
      imageName: record.imageName,
      name: record.name,
      domain: record.domain,
      port: analysis.port || record.port,
      env: analysis.environment || {},
      // network omitted on purpose — startContainer auto-detects the proxy network.
    };
    containerId = await startContainer(opts);
    log(`Container started: ${containerId.slice(0, 12)}`);
    log(`Traefik labels applied for Host(\`${record.domain}\`)`);
  } else {
    containerId = `sim_${randomId("c")}`;
    log(`(simulation) Container "${containerId}" started virtually`);
    log(`(simulation) Traefik would issue a Let's Encrypt cert for ${record.domain}`);
  }

  set({
    status: "running",
    containerId,
    url: mode === "live" ? `https://${record.domain}` : `http://${record.domain}`,
  });
  log(
    `\n✅ Deployed! ${
      mode === "live"
        ? `Live at https://${record.domain}`
        : `(simulation) would be live at https://${record.domain}`
    }`
  );
}

async function runPipeline(record: DeploymentRecord): Promise<void> {
  const id = record.id;
  if (running.has(id)) return;
  running.add(id);
  const log = (line: string) => store.appendLog(id, `${line}\n`);
  const set = (patch: Partial<DeploymentRecord>) => store.update(id, patch);

  try {
    ensureDirs();
    log(`MYTHIC — pipeline starting`);
    log(`Repository: ${record.repoUrl} (${record.branch})`);

    // --- Phase 1: Ingestion ---
    set({ status: "cloning" });
    log(`\n[1/4] INGESTION — cloning repository`);
    await cloneRepo(id, record.repoUrl, { branch: record.branch }, log);

    // --- Phase 2: Analysis ---
    set({ status: "analyzing" });
    log(`\n[2/4] ANALYSIS — detecting stack with nixpacks / heuristics`);
    const analysis = await analyzeRepo(repoPath(id));
    set({ analysis });
    log(`Detected: ${analysis.language ?? "unknown"}${analysis.framework ? ` (${analysis.framework})` : ""}`);
    log(`Base image : ${analysis.baseImage ?? "n/a"}`);
    log(`Build      : ${analysis.buildCommand ?? "(none)"}`);
    log(`Start      : ${analysis.startCommand ?? "(none)"}`);
    log(`Port       : ${analysis.port ?? "n/a"}`);

    if (record.port) analysis.port = record.port;
    if (Object.keys(record.env).length) {
      analysis.environment = { ...analysis.environment, ...record.env };
    }

    if (!analysis.startCommand) {
      throw new Error("Could not determine a start command. Configure it manually or let AI fix it.");
    }

    try {
      await buildAndDeploy(record, analysis, log, set, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (AUTO_FIX && aiConfigured() && !record.logs.includes("[AI-FIX-APPLIED]")) {
        log(`\n🤖 AI auto-fix engaged…`);
        const fix = await requestAiFix({ repoUrl: record.repoUrl, logs: store.get(id)?.logs ?? "", analysis });
        if (fix) {
          const patched = applyFixToAnalysis(analysis, fix);
          set({ analysis: patched, logs: `${store.get(id)?.logs ?? ""}[AI-FIX-APPLIED]\n` });
          log(`AI diagnosis: ${fix.diagnosis}`);
          log(`AI fix: ${fix.explanation}`);
          await buildAndDeploy(record, patched, log, set, false);
        } else {
          throw new Error(message);
        }
      } else {
        throw new Error(message);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`\n❌ Pipeline failed: ${message}`);
    set({ status: "failed" });
  } finally {
    running.delete(id);
  }
}

export function createDeployment(input: CreateDeploymentInput): DeploymentRecord {
  const record = buildRecord(input);
  store.create(record);
  void runPipeline(record);
  return record;
}

export function redeploy(id: string): DeploymentRecord | null {
  const record = store.get(id);
  if (!record) return null;
  store.update(id, {
    status: "queued",
    containerId: undefined,
    logs: "",
    analysis: null,
  });
  const fresh = store.get(id)!;
  void runPipeline(fresh);
  return fresh;
}

export interface AiFixResult {
  fix: import("./ai").AiFix | null;
  deployment: DeploymentRecord;
  error?: string;
}

/**
 * Manually trigger the AI to analyze the failure logs and patch the deployment,
 * then re-run the pipeline. Exposed via POST /api/deployments/[id]/ai-fix.
 */
export async function aiFixDeployment(id: string): Promise<AiFixResult> {
  const record = store.get(id);
  if (!record) return { fix: null, deployment: undefined as unknown as DeploymentRecord, error: "not found" };

  if (!aiConfigured()) {
    return { fix: null, deployment: record, error: "AI not configured (set AI_API_KEY)" };
  }

  let fix: import("./ai").AiFix | null = null;
  try {
    fix = await requestAiFix({
      repoUrl: record.repoUrl,
      logs: record.logs,
      analysis: record.analysis,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { fix: null, deployment: record, error: message };
  }

  if (!fix) {
    return { fix: null, deployment: record, error: "AI returned no actionable fix" };
  }

  const base = record.analysis ?? {
    provider: "ai",
    environment: {},
  };
  const patched = applyFixToAnalysis(base, fix);
  store.update(id, {
    analysis: patched,
    port: fix.port ?? record.port,
    env: { ...record.env, ...(fix.environment ?? {}) },
    logs: `${record.logs}\n[AI-FIX-APPLIED] ${fix.diagnosis}\n`,
  });

  const refreshed = store.get(id)!;
  void runPipeline(refreshed);
  return { fix, deployment: refreshed };
}

export async function teardown(id: string): Promise<boolean> {
  const record = store.get(id);
  if (!record) return false;
  if (record.containerId) {
    await removeContainer(record.containerId, record.name).catch(() => {});
  }
  store.update(id, { status: "stopped", containerId: undefined });
  return true;
}

export function isRunning(id: string): boolean {
  return running.has(id);
}
