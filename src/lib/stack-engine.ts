import { store, stackStore, type StackMemberInsert } from "./db";
import { createDeployment } from "./engine";
import { domainFromRepo } from "./format";
import { CONFIG } from "./config";
import type { CreateStackInput, DeploymentRecord, StackMemberInput, StackRecord } from "./types";

/**
 * Multideploy: several of the user's own repos deployed together in dependency
 * order, with each member's env allowed to reference an already-deployed
 * sibling's real URL/domain (`${key.url}`, `${key.domain}`) — "aufeinander
 * aufbauend in einem Lauf" from the original brief. Reuses engine.ts's
 * createDeployment() per member unchanged; this module only adds ordering and
 * env-placeholder wiring around it.
 */

const PLACEHOLDER = /\$\{([a-zA-Z0-9_-]+)\.(url|domain)\}/g;

export function extractDependencies(envTemplate: Record<string, string>): Set<string> {
  const deps = new Set<string>();
  for (const value of Object.values(envTemplate)) {
    for (const match of value.matchAll(PLACEHOLDER)) deps.add(match[1]);
  }
  return deps;
}

export class StackValidationError extends Error {}

/** Kahn's algorithm. Throws StackValidationError on unknown refs, self-refs, or cycles. */
export function topoSortMembers(members: StackMemberInput[]): StackMemberInput[] {
  const byKey = new Map(members.map((m) => [m.key, m]));
  if (byKey.size !== members.length) {
    throw new StackValidationError("Duplicate member keys in stack.");
  }

  const deps = new Map<string, Set<string>>();
  for (const m of members) {
    const d = extractDependencies(m.env ?? {});
    for (const dep of d) {
      if (dep === m.key) throw new StackValidationError(`Member "${m.key}" references itself.`);
      if (!byKey.has(dep)) {
        throw new StackValidationError(`Member "${m.key}" references unknown member "${dep}".`);
      }
    }
    deps.set(m.key, d);
  }

  const resolved: StackMemberInput[] = [];
  const remaining = new Set(byKey.keys());
  while (remaining.size > 0) {
    const ready = [...remaining].filter((k) => [...(deps.get(k) ?? [])].every((d) => !remaining.has(d)));
    if (ready.length === 0) {
      throw new StackValidationError(`Dependency cycle among: ${[...remaining].join(", ")}`);
    }
    // Deterministic order among simultaneously-ready members: original input order.
    ready.sort((a, b) => members.findIndex((m) => m.key === a) - members.findIndex((m) => m.key === b));
    for (const key of ready) {
      resolved.push(byKey.get(key)!);
      remaining.delete(key);
    }
  }
  return resolved;
}

function resolveEnvTemplate(
  envTemplate: Record<string, string>,
  resolved: Map<string, { url: string; domain: string }>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(envTemplate)) {
    out[k] = v.replace(PLACEHOLDER, (whole, key: string, field: "url" | "domain") => {
      const dep = resolved.get(key);
      return dep ? dep[field] : whole;
    });
  }
  return out;
}

/** All member keys a given member depends on, directly or transitively. */
function transitiveDeps(key: string, members: StackMemberInput[]): Set<string> {
  const byKey = new Map(members.map((m) => [m.key, m]));
  const out = new Set<string>();
  const stack = [...extractDependencies(byKey.get(key)?.env ?? {})];
  while (stack.length) {
    const d = stack.pop()!;
    if (out.has(d)) continue;
    out.add(d);
    stack.push(...extractDependencies(byKey.get(d)?.env ?? {}));
  }
  return out;
}

export function createStack(input: CreateStackInput, authToken?: string): StackRecord {
  if (!input.members.length) throw new StackValidationError("Stack needs at least one member.");
  const ordered = topoSortMembers(input.members); // validates as a side effect

  const inserts: StackMemberInsert[] = ordered.map((m, i) => ({
    key: m.key,
    repoUrl: m.repoUrl,
    branch: m.branch || CONFIG.defaultBranch,
    name: m.name,
    domain: m.domain,
    port: m.port,
    envTemplate: m.env ?? {},
    order: i,
  }));

  const stack = stackStore.create(input.name, inserts);
  void runStack(stack.id, authToken);
  return stack;
}

const POLL_MS = 1500;
const TERMINAL: DeploymentRecord["status"][] = ["running", "failed", "stopped"];

async function waitForTerminal(deploymentId: string): Promise<DeploymentRecord> {
  for (;;) {
    const record = store.get(deploymentId);
    if (record && TERMINAL.includes(record.status)) return record;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export async function runStack(stackId: string, authToken?: string): Promise<void> {
  const stack = stackStore.get(stackId);
  if (!stack) return;
  stackStore.updateStatus(stackId, "running");

  const members: StackMemberInput[] = stack.members.map((m) => ({
    key: m.key,
    repoUrl: m.repoUrl,
    branch: m.branch,
    env: stackStore.getMemberEnvTemplate(stackId, m.key),
  }));

  const resolvedUrls = new Map<string, { url: string; domain: string }>();
  const failedOrSkipped = new Set<string>();
  let anyFailed = false;

  for (const member of stack.members) {
    const deps = transitiveDeps(member.key, members);
    if ([...deps].some((d) => failedOrSkipped.has(d))) {
      stackStore.updateMember(stackId, member.key, { status: "skipped", error: "Skipped: a dependency failed." });
      failedOrSkipped.add(member.key);
      anyFailed = true;
      continue;
    }

    stackStore.updateMember(stackId, member.key, { status: "deploying" });
    const raw = stackStore.getMemberRaw(stackId, member.key);
    const envTemplate = stackStore.getMemberEnvTemplate(stackId, member.key);
    const resolvedEnv = resolveEnvTemplate(envTemplate, resolvedUrls);

    let deployment: DeploymentRecord;
    try {
      deployment = createDeployment(
        {
          repoUrl: member.repoUrl,
          branch: member.branch,
          name: raw?.name || undefined,
          domain: raw?.domain || undefined,
          port: raw?.port || undefined,
          env: resolvedEnv,
        },
        authToken
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      stackStore.updateMember(stackId, member.key, { status: "failed", error: message });
      failedOrSkipped.add(member.key);
      anyFailed = true;
      continue;
    }

    stackStore.updateMember(stackId, member.key, { deploymentId: deployment.id });
    const finished = await waitForTerminal(deployment.id);

    if (finished.status === "running") {
      resolvedUrls.set(member.key, { url: finished.url, domain: finished.domain });
      stackStore.updateMember(stackId, member.key, { status: "done" });
    } else {
      stackStore.updateMember(stackId, member.key, {
        status: "failed",
        error: `Deployment ended in status "${finished.status}" — see its own logs.`,
      });
      failedOrSkipped.add(member.key);
      anyFailed = true;
    }
  }

  stackStore.updateStatus(stackId, anyFailed ? "failed" : "complete");
}

/** Only used to build UI hints (which repos are eligible env-template targets). */
export function domainHint(repoUrl: string): string {
  return `${domainFromRepo(repoUrl)}.${CONFIG.baseDomain}`;
}
