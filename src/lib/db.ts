import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config";
import type { DeploymentRecord } from "./types";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(CONFIG.workDir, { recursive: true });
  const file = path.join(CONFIG.workDir, "magic-deploy.db");
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
  `);
  return db;
}

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
