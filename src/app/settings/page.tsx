"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  isDefault: boolean;
  hasKey: boolean;
}

export default function SettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [encryptedAtRest, setEncryptedAtRest] = useState(false);
  const [aiSource, setAiSource] = useState<string>("none");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [makeDefault, setMakeDefault] = useState(true);

  async function load() {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setProviders(data.providers || []);
    setEncryptedAtRest(!!data.encryptedAtRest);
    setAiSource(data.aiSource || "none");
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setProviders(data.providers || []);
        setEncryptedAtRest(!!data.encryptedAtRest);
        setAiSource(data.aiSource || "none");
      })
      .catch(() => {
        if (!cancelled) setAiSource("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createProvider",
          name,
          baseUrl,
          model,
          apiKey,
          isDefault: makeDefault,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setName("");
      setApiKey("");
      setMsg("Provider saved (API key encrypted at rest).");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteProvider", id }),
    });
    setBusy(false);
    await load();
  }

  async function setDefault(id: string) {
    setBusy(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "updateProvider", id, isDefault: true }),
    });
    setBusy(false);
    await load();
  }

  async function testChat(id: string) {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: id,
          model: providers.find((p) => p.id === id)?.model,
          messages: [{ role: "user", content: "Reply with the single word: ok" }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test failed");
      const reply = data.choices?.[0]?.message?.content ?? JSON.stringify(data).slice(0, 120);
      setMsg(`Connection OK → ${reply}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Bring-your-own-key LLM providers — stored locally, encrypted at rest. No trackers, no telemetry.
          </p>
        </div>
        <Link href="/" className="btn-primary">← Wizard</Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-neutral-400">
        <span className={`rounded-full border px-3 py-1 ${encryptedAtRest ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/40 text-amber-300"}`}>
          {encryptedAtRest ? "🔒 Keys encrypted at rest (AES-256-GCM)" : "⚠ Not encrypted yet"}
        </span>
        <span className="rounded-full border border-neutral-800 px-3 py-1">
          AI fix source: <span className="text-white">{aiSource}</span>
        </span>
        <span className="rounded-full border border-neutral-800 px-3 py-1">
          Providers: <span className="text-white">{providers.length}</span>
        </span>
      </div>

      {msg && (
        <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-sm text-cyan-200">
          {msg}
        </pre>
      )}

      {/* Provider list */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Configured providers
        </h2>
        {providers.length === 0 && (
          <div className="glass rounded-xl p-6 text-sm text-neutral-400">
            No providers yet. Add one below to enable the AI auto-fix and the LLM proxy.
          </div>
        )}
        <div className="space-y-3">
          {providers.map((p) => (
            <div key={p.id} className="glass rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">
                    {p.name} {p.isDefault && <span className="text-xs text-emerald-300">(default)</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {p.baseUrl} · {p.model} · key {p.hasKey ? "✓" : "✗"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-ghost text-xs" disabled={busy} onClick={() => testChat(p.id)}>
                    Test
                  </button>
                  {!p.isDefault && (
                    <button className="btn-ghost text-xs" disabled={busy} onClick={() => setDefault(p.id)}>
                      Make default
                    </button>
                  )}
                  <button className="btn-danger text-xs" disabled={busy} onClick={() => remove(p.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Add provider */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Add provider (BYOK)
        </h2>
        <form onSubmit={save} className="glass space-y-4 rounded-2xl p-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="OpenAI" required />
            </div>
            <div>
              <Label>Model</Label>
              <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" required />
            </div>
          </div>
          <div>
            <Label>Base URL</Label>
            <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" required />
          </div>
          <div>
            <Label>API key</Label>
            <input className="input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" required />
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
            Use as default for AI auto-fix &amp; proxy
          </label>
          <button className="btn-primary" disabled={busy || !name || !apiKey}>
            {busy ? "Saving…" : "Save provider"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">{children}</label>;
}
