import { NextResponse } from "next/server";
import {
  listProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  getProviderSecret,
  hasGithubToken,
  setGithubToken,
  clearGithubToken,
} from "@/lib/settings";
import { getSetting, setSetting } from "@/lib/db";
import { encryptionReady } from "@/lib/crypto";
import { aiConfigSource } from "@/lib/ai";

// Runtime: Node (uses better-sqlite3 + crypto). Never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const providers = listProviders().map((p) => ({
    ...p,
    hasKey: !!getProviderSecret(p.id),
  }));
  return NextResponse.json({
    encryptedAtRest: encryptionReady(),
    aiSource: aiConfigSource(),
    providers,
    defaultProviderId: providers.find((p) => p.isDefault)?.id ?? null,
    hasGithubToken: hasGithubToken(),
    settings: {
      baseDomain: getSetting("baseDomain"),
      autoFix: getSetting("autoFix"),
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // --- create LLM provider (BYOK) ---
  if (body.action === "createProvider") {
    const { name, baseUrl, model, apiKey, isDefault } = body;
    if (!name || !baseUrl || !model || !apiKey) {
      return NextResponse.json(
        { error: "name, baseUrl, model and apiKey are required" },
        { status: 400 }
      );
    }
    const provider = createProvider({ name, baseUrl, model, apiKey, isDefault });
    return NextResponse.json({ provider });
  }

  // --- update provider ---
  if (body.action === "updateProvider") {
    const { id, name, baseUrl, model, apiKey, isDefault } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const updated = updateProvider(id, { name, baseUrl, model, apiKey, isDefault });
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ provider: updated });
  }

  // --- delete provider ---
  if (body.action === "deleteProvider") {
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    deleteProvider(body.id);
    return NextResponse.json({ ok: true });
  }

  // --- save a simple key/value setting ---
  if (body.action === "setSetting") {
    const { key, value } = body;
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
    setSetting(String(key), String(value));
    return NextResponse.json({ ok: true });
  }

  // --- GitHub token (multideploy's own-repos listing + private-repo clones) ---
  if (body.action === "setGithubToken") {
    if (!body.token || typeof body.token !== "string") {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }
    setGithubToken(body.token);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "clearGithubToken") {
    clearGithubToken();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
