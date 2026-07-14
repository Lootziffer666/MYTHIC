import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  extractDependencies,
  topoSortMembers,
  StackValidationError,
  createStack,
} from "./stack-engine";
import { store, stackStore } from "./db";
import type { StackMemberInput } from "./types";

describe("extractDependencies", () => {
  it("finds ${key.url} and ${key.domain} refs, ignores plain text", () => {
    expect(extractDependencies({ A: "${bellows.url}/v1", B: "plain", C: "${db.domain}" })).toEqual(
      new Set(["bellows", "db"])
    );
  });

  it("returns empty set for no placeholders", () => {
    expect(extractDependencies({ A: "hello", B: "${not.a.field}" })).toEqual(new Set());
  });
});

function member(key: string, env: Record<string, string> = {}): StackMemberInput {
  return { key, repoUrl: `https://example.invalid/${key}.git`, env };
}

describe("topoSortMembers", () => {
  it("orders a simple chain by dependency", () => {
    const out = topoSortMembers([
      member("app", { X: "${db.url}" }),
      member("db"),
    ]);
    expect(out.map((m) => m.key)).toEqual(["db", "app"]);
  });

  it("orders a diamond (two things depending on one shared base) correctly", () => {
    const out = topoSortMembers([
      member("web", { X: "${base.url}" }),
      member("base"),
      member("worker", { X: "${base.url}" }),
    ]);
    const order = out.map((m) => m.key);
    expect(order.indexOf("base")).toBeLessThan(order.indexOf("web"));
    expect(order.indexOf("base")).toBeLessThan(order.indexOf("worker"));
  });

  it("preserves input order among independent members", () => {
    const out = topoSortMembers([member("b"), member("a"), member("c")]);
    expect(out.map((m) => m.key)).toEqual(["b", "a", "c"]);
  });

  it("throws on duplicate keys", () => {
    expect(() => topoSortMembers([member("a"), member("a")])).toThrow(StackValidationError);
  });

  it("throws on self-reference", () => {
    expect(() => topoSortMembers([member("a", { X: "${a.url}" })])).toThrow(StackValidationError);
  });

  it("throws on reference to an unknown member", () => {
    expect(() => topoSortMembers([member("a", { X: "${ghost.url}" })])).toThrow(StackValidationError);
  });

  it("throws on a two-member cycle", () => {
    expect(() =>
      topoSortMembers([member("a", { X: "${b.url}" }), member("b", { X: "${a.url}" })])
    ).toThrow(StackValidationError);
  });
});

// --- End-to-end: real createStack()/runStack() through the real engine, in the
// simulation mode vitest.setup.ts forces (no Docker needed) — proves the actual
// ${key.url} substitution happens against a REAL (simulated) deployment URL, not
// just that the string-replace function works in isolation. Uses two tiny local
// git repos (a plain index.html each — the analyzer's cheapest real detection
// path) so this needs no network access. ---

function makeLocalRepo(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), "<html>hi</html>");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  return dir;
}

const cleanupIds: string[] = [];

afterEach(() => {
  for (const id of cleanupIds.splice(0)) stackStore.remove(id);
});

describe("createStack + runStack (simulation mode, real local git repos)", () => {
  it("deploys in dependency order and resolves ${key.url} to the real deployed URL", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mythic-stack-fixture-"));
    const baseRepo = makeLocalRepo(path.join(tmp, "base-repo"));
    const appRepo = makeLocalRepo(path.join(tmp, "app-repo"));

    const stack = createStack({
      name: "fixture-stack",
      members: [
        { key: "app", repoUrl: appRepo, env: { UPSTREAM: "${base.url}/v1" } },
        { key: "base", repoUrl: baseRepo },
      ],
    });
    cleanupIds.push(stack.id);

    const deadline = Date.now() + 30_000;
    let finalStack = stackStore.get(stack.id)!;
    while (finalStack.status === "queued" || finalStack.status === "running") {
      if (Date.now() > deadline) throw new Error("stack did not finish in time");
      await new Promise((r) => setTimeout(r, 300));
      finalStack = stackStore.get(stack.id)!;
    }

    expect(finalStack.status).toBe("complete");
    const byKey = Object.fromEntries(finalStack.members.map((m) => [m.key, m]));
    expect(byKey.base.status).toBe("done");
    expect(byKey.app.status).toBe("done");

    const baseDeployment = store.get(byKey.base.deploymentId!)!;
    const appDeployment = store.get(byKey.app.deploymentId!)!;
    expect(appDeployment.env.UPSTREAM).toBe(`${baseDeployment.url}/v1`);
    expect(appDeployment.env.UPSTREAM).not.toContain("${base.url}");
  }, 40_000);

  it("marks a member as skipped, not silently deployed, when its dependency fails", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mythic-stack-fail-fixture-"));
    const appRepo = makeLocalRepo(path.join(tmp, "app-repo"));

    const stack = createStack({
      name: "fixture-stack-fail",
      members: [
        { key: "app", repoUrl: appRepo, env: { UPSTREAM: "${broken.url}" } },
        // A repo URL git can never clone — forces a real, non-simulated failure.
        { key: "broken", repoUrl: "https://example.invalid/definitely-not-a-repo.git" },
      ],
    });
    cleanupIds.push(stack.id);

    const deadline = Date.now() + 30_000;
    let finalStack = stackStore.get(stack.id)!;
    while (finalStack.status === "queued" || finalStack.status === "running") {
      if (Date.now() > deadline) throw new Error("stack did not finish in time");
      await new Promise((r) => setTimeout(r, 300));
      finalStack = stackStore.get(stack.id)!;
    }

    expect(finalStack.status).toBe("failed");
    const byKey = Object.fromEntries(finalStack.members.map((m) => [m.key, m]));
    expect(byKey.broken.status).toBe("failed");
    expect(byKey.app.status).toBe("skipped");
    expect(byKey.app.deploymentId).toBeNull();
  }, 40_000);
});
