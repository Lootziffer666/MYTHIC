import { getDb } from "./db";
import { encrypt, decrypt, type EncryptedValue } from "./crypto";

/**
 * Local settings store. Two kinds of data:
 *  - simple key/value (e.g. "defaultProvider", UI prefs)
 *  - LLM providers (BYOK): base URL, model + an ENCRYPTED api key at rest.
 *
 * Nothing is transmitted anywhere. The only external traffic MYTHIC ever makes
 * for LLM features is a request to the provider base URL the user configured.
 */

export interface LlmProviderInput {
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  isDefault?: boolean;
}

export interface LlmProvider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  isDefault: boolean;
  createdAt: number;
}

function rowToProvider(row: any): LlmProvider {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    model: row.model,
    isDefault: !!row.is_default,
    createdAt: row.created_at,
  };
}

// ---- simple key/value ----
export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
}

// ---- LLM providers (BYOK) ----
export function listProviders(): LlmProvider[] {
  const rows = getDb()
    .prepare("SELECT id, name, base_url, model, is_default, created_at FROM llm_providers ORDER BY created_at ASC")
    .all();
  return (rows as any[]).map(rowToProvider);
}

export function getProvider(id: string): LlmProvider | null {
  const row = getDb()
    .prepare("SELECT id, name, base_url, model, is_default, created_at FROM llm_providers WHERE id = ?")
    .get(id);
  return row ? rowToProvider(row) : null;
}

export function getDefaultProvider(): LlmProvider | null {
  const row = getDb()
    .prepare("SELECT id, name, base_url, model, is_default, created_at FROM llm_providers WHERE is_default = 1 LIMIT 1")
    .get();
  return row ? rowToProvider(row) : null;
}

export function getProviderSecret(id: string): string | null {
  const row = getDb()
    .prepare("SELECT api_key_iv, api_key_tag, api_key_data FROM llm_providers WHERE id = ?")
    .get(id) as
    | { api_key_iv: string; api_key_tag: string; api_key_data: string }
    | undefined;
  if (!row) return null;
  return decrypt({ iv: row.api_key_iv, tag: row.api_key_tag, data: row.api_key_data });
}

export function createProvider(input: LlmProviderInput): LlmProvider {
  const id = `prov_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const enc: EncryptedValue = encrypt(input.apiKey);
  const db = getDb();
  if (input.isDefault) db.prepare("UPDATE llm_providers SET is_default = 0").run();
  db.prepare(
    `INSERT INTO llm_providers (id, name, base_url, model, api_key_iv, api_key_tag, api_key_data, is_default, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.baseUrl,
    input.model,
    enc.iv,
    enc.tag,
    enc.data,
    input.isDefault ? 1 : 0,
    Date.now()
  );
  return getProvider(id)!;
}

export function updateProvider(id: string, patch: Partial<LlmProviderInput>): LlmProvider | null {
  const existing = getProvider(id);
  if (!existing) return null;
  const db = getDb();
  if (patch.isDefault) db.prepare("UPDATE llm_providers SET is_default = 0").run();
  const name = patch.name ?? existing.name;
  const baseUrl = patch.baseUrl ?? existing.baseUrl;
  const model = patch.model ?? existing.model;
  const isDefault = patch.isDefault ? 1 : existing.isDefault ? 1 : 0;
  let iv = null as any;
  let tag = null as any;
  let data = null as any;
  if (patch.apiKey) {
    const enc = encrypt(patch.apiKey);
    iv = enc.iv;
    tag = enc.tag;
    data = enc.data;
  } else {
    const cur = db.prepare("SELECT api_key_iv, api_key_tag, api_key_data FROM llm_providers WHERE id = ?").get(id) as any;
    iv = cur.api_key_iv;
    tag = cur.api_key_tag;
    data = cur.api_key_data;
  }
  db.prepare(
    `UPDATE llm_providers SET name = ?, base_url = ?, model = ?, is_default = ?, api_key_iv = ?, api_key_tag = ?, api_key_data = ? WHERE id = ?`
  ).run(name, baseUrl, model, isDefault, iv, tag, data, id);
  return getProvider(id);
}

export function deleteProvider(id: string): void {
  getDb().prepare("DELETE FROM llm_providers WHERE id = ?").run(id);
}
