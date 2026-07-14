import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config";
import type { DeploymentRecord, StackMemberRecord, StackPhase, StackRecord } from "./types";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(CONFIG.workDir, { recursive: true });
  const file = path.join(CONFIG.workDir, "mythic.db");
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repoUrl TEXT NOT NULL,
      branch TEXT NOT NULL,
      domain TEXT NOT NULL,
      port INTEGER NOT NULL,
      env TEXT NOT NULL DEFAULT '{}',
      imageName TEXT NOT NULL,
      containerId TEXT,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      analysis TEXT,
      logs TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS llm_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      model TEXT NOT NULL,
      api_key_iv TEXT NOT NULL,
      api_key_tag TEXT NOT NULL,
      api_key_data TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stacks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stack_members (
      stackId TEXT NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      repoUrl TEXT NOT NULL,
      branch TEXT NOT NULL,
      name TEXT,
      domain TEXT,
      port INTEGER,
      envTemplate TEXT NOT NULL DEFAULT '{}',
      memberOrder INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      deploymentId TEXT,
      error TEXT,
      PRIMARY KEY (stackId, key)
    );
  `);
  return db;
}

/** Exposed for sibling modules (e.g. settings.ts) that need the raw DB handle. */
export { getDb };

type Row = {
  id: string;
  name: string;
  repoUrl: string;
  branch: string;
  domain: string;
  port: number;
  env: string;
  imageName: string;
  containerId: string | null;
  status: string;
  mode: string;
  analysis: string | null;
  logs: string;
  url: string;
  createdAt: number;
  updatedAt: number;
};

function rowToRecord(row: Row): DeploymentRecord {
  return {
    id: row.id,
    name: row.name,
    repoUrl: row.repoUrl,
    branch: row.branch,
    domain: row.domain,
    port: row.port,
    env: JSON.parse(row.env || "{}"),
    imageName: row.imageName,
    containerId: row.containerId ?? undefined,
    status: row.status as DeploymentRecord["status"],
    mode: row.mode as DeploymentRecord["mode"],
    analysis: row.analysis ? (JSON.parse(row.analysis) as DeploymentRecord["analysis"]) : null,
    logs: row.logs,
    url: row.url,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const store = {
  list(): DeploymentRecord[] {
    const rows = getDb()
      .prepare("SELECT * FROM deployments ORDER BY createdAt DESC")
      .all() as Row[];
    return rows.map(rowToRecord);
  },

  get(id: string): DeploymentRecord | null {
    const row = getDb().prepare("SELECT * FROM deployments WHERE id = ?").get(id) as
      | Row
      | undefined;
    return row ? rowToRecord(row) : null;
  },

  getByDomain(domain: string): DeploymentRecord | null {
    const row = getDb().prepare("SELECT * FROM deployments WHERE domain = ?").get(domain) as
      | Row
      | undefined;
    return row ? rowToRecord(row) : null;
  },

  create(record: DeploymentRecord): void {
    getDb()
      .prepare(
        `INSERT INTO deployments
         (id, name, repoUrl, branch, domain, port, env, imageName, containerId, status, mode, analysis, logs, url, createdAt, updatedAt)
         VALUES (@id, @name, @repoUrl, @branch, @domain, @port, @env, @imageName, @containerId, @status, @mode, @analysis, @logs, @url, @createdAt, @updatedAt)`
      )
      .run({
        ...record,
        env: JSON.stringify(record.env),
        analysis: record.analysis ? JSON.stringify(record.analysis) : null,
        containerId: record.containerId ?? null,
      });
  },

  update(id: string, patch: Partial<DeploymentRecord>): void {
    const current = this.get(id);
    if (!current) return;
    const next: DeploymentRecord = { ...current, ...patch, updatedAt: Date.now() };
    getDb()
      .prepare(
        `UPDATE deployments SET
          name=@name, repoUrl=@repoUrl, branch=@branch, domain=@domain, port=@port,
          env=@env, imageName=@imageName, containerId=@containerId, status=@status,
          mode=@mode, analysis=@analysis, logs=@logs, url=@url, updatedAt=@updatedAt
         WHERE id=@id`
      )
      .run({
        ...next,
        env: JSON.stringify(next.env),
        analysis: next.analysis ? JSON.stringify(next.analysis) : null,
        containerId: next.containerId ?? null,
      });
  },

  appendLog(id: string, chunk: string): void {
    getDb()
      .prepare("UPDATE deployments SET logs = logs || ?, updatedAt = ? WHERE id = ?")
      .run(chunk, Date.now(), id);
  },

  remove(id: string): void {
    getDb().prepare("DELETE FROM deployments WHERE id = ?").run(id);
  },
};

// --- multideploy: a stack is several deployments (each a normal DeploymentRecord,
// created and run through the same engine.ts pipeline) plus the ordering/env-wiring
// between them. Members live in their own table so a stack can be listed/updated
// without touching the deployments table's shape at all. ---

type StackRow = { id: string; name: string; status: string; createdAt: number; updatedAt: number };
type StackMemberRow = {
  stackId: string;
  key: string;
  repoUrl: string;
  branch: string;
  name: string | null;
  domain: string | null;
  port: number | null;
  envTemplate: string;
  memberOrder: number;
  status: string;
  deploymentId: string | null;
  error: string | null;
};

export interface StackMemberInsert {
  key: string;
  repoUrl: string;
  branch: string;
  name?: string;
  domain?: string;
  port?: number;
  envTemplate: Record<string, string>;
  order: number;
}

function memberRowToRecord(row: StackMemberRow): StackMemberRecord {
  return {
    key: row.key,
    repoUrl: row.repoUrl,
    branch: row.branch,
    order: row.memberOrder,
    status: row.status as StackMemberRecord["status"],
    deploymentId: row.deploymentId,
    error: row.error,
  };
}

function loadMembers(stackId: string): StackMemberRecord[] {
  const rows = getDb()
    .prepare("SELECT * FROM stack_members WHERE stackId = ? ORDER BY memberOrder ASC")
    .all(stackId) as StackMemberRow[];
  return rows.map(memberRowToRecord);
}

function stackRowToRecord(row: StackRow): StackRecord {
  return {
    id: row.id,
    name: row.name,
    status: row.status as StackPhase,
    members: loadMembers(row.id),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const stackStore = {
  create(name: string, members: StackMemberInsert[]): StackRecord {
    const db = getDb();
    const id = `stack_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const insertStack = db.prepare(
      "INSERT INTO stacks (id, name, status, createdAt, updatedAt) VALUES (?, ?, 'queued', ?, ?)"
    );
    const insertMember = db.prepare(
      `INSERT INTO stack_members
       (stackId, key, repoUrl, branch, name, domain, port, envTemplate, memberOrder, status)
       VALUES (@stackId, @key, @repoUrl, @branch, @name, @domain, @port, @envTemplate, @memberOrder, 'pending')`
    );
    db.transaction(() => {
      insertStack.run(id, name, now, now);
      for (const m of members) {
        insertMember.run({
          stackId: id,
          key: m.key,
          repoUrl: m.repoUrl,
          branch: m.branch,
          name: m.name ?? null,
          domain: m.domain ?? null,
          port: m.port ?? null,
          envTemplate: JSON.stringify(m.envTemplate),
          memberOrder: m.order,
        });
      }
    })();
    return this.get(id)!;
  },

  list(): StackRecord[] {
    const rows = getDb().prepare("SELECT * FROM stacks ORDER BY createdAt DESC").all() as StackRow[];
    return rows.map(stackRowToRecord);
  },

  get(id: string): StackRecord | null {
    const row = getDb().prepare("SELECT * FROM stacks WHERE id = ?").get(id) as StackRow | undefined;
    return row ? stackRowToRecord(row) : null;
  },

  /** Raw env template for a member, parsed — used by the stack engine to resolve placeholders. */
  getMemberEnvTemplate(stackId: string, key: string): Record<string, string> {
    const row = getDb()
      .prepare("SELECT envTemplate FROM stack_members WHERE stackId = ? AND key = ?")
      .get(stackId, key) as { envTemplate: string } | undefined;
    return row ? JSON.parse(row.envTemplate) : {};
  },

  getMemberRaw(stackId: string, key: string): StackMemberRow | null {
    const row = getDb()
      .prepare("SELECT * FROM stack_members WHERE stackId = ? AND key = ?")
      .get(stackId, key) as StackMemberRow | undefined;
    return row ?? null;
  },

  updateStatus(id: string, status: StackPhase): void {
    getDb().prepare("UPDATE stacks SET status = ?, updatedAt = ? WHERE id = ?").run(status, Date.now(), id);
  },

  updateMember(
    stackId: string,
    key: string,
    patch: Partial<{ status: string; deploymentId: string | null; error: string | null }>
  ): void {
    const current = getDb()
      .prepare("SELECT status, deploymentId, error FROM stack_members WHERE stackId = ? AND key = ?")
      .get(stackId, key) as { status: string; deploymentId: string | null; error: string | null } | undefined;
    if (!current) return;
    const next = { ...current, ...patch };
    getDb()
      .prepare("UPDATE stack_members SET status = ?, deploymentId = ?, error = ? WHERE stackId = ? AND key = ?")
      .run(next.status, next.deploymentId, next.error, stackId, key);
    getDb().prepare("UPDATE stacks SET updatedAt = ? WHERE id = ?").run(Date.now(), stackId);
  },

  remove(id: string): void {
    getDb().transaction(() => {
      getDb().prepare("DELETE FROM stack_members WHERE stackId = ?").run(id);
      getDb().prepare("DELETE FROM stacks WHERE id = ?").run(id);
    })();
  },
};

// --- simple key/value settings, re-exported so callers can use db.ts alone ---
import { getSetting as _getSetting, setSetting as _setSetting } from "./settings";
export const getSetting = _getSetting;
export const setSetting = _setSetting;
