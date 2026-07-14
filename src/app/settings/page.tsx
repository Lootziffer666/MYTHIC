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

// Order matters here: Google + OpenAI first, Anthropic right below, then everyone
// else led by OpenRouter and Kilo — the ranking asked for when this was scoped.
const LLM_KEY_LINKS: { name: string; href: string }[] = [
  { name: "Google AI Studio", href: "https://aistudio.google.com/apikey" },
  { name: "OpenAI", href: "https://platform.openai.com/api-keys" },
  { name: "Anthropic", href: "https://console.anthropic.com/settings/keys" },
  { name: "OpenRouter", href: "https://openrouter.ai/keys" },
  { name: "Kilo Code", href: "https://kilocode.ai" },
  { name: "Groq", href: "https://console.groq.com/keys" },
  { name: "Mistral", href: "https://console.mistral.ai/api-keys" },
  { name: "Together AI", href: "https://api.together.ai/settings/api-keys" },
  { name: "DeepSeek", href: "https://platform.deepseek.com/api_keys" },
];

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

  const [hasGithubToken, setHasGithubToken] = useState(false);
  const [githubToken, setGithubTokenInput] = useState("");
  const [githubBusy, setGithubBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setProviders(data.providers || []);
    setEncryptedAtRest(!!data.encryptedAtRest);
    setAiSource(data.aiSource || "none");
    setHasGithubToken(!!data.hasGithubToken);
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
        setHasGithubToken(!!data.hasGithubToken);
      })
      .catch(() => {
        if (!cancelled) setAiSource("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveGithubToken(e: React.FormEvent) {
    e.preventDefault();
    setGithubBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setGithubToken", token: githubToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setGithubTokenInput("");
      setMsg("GitHub token saved (encrypted at rest). Multideploy can now list your own repos.");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setGithubBusy(false);
    }
  }

  async function clearGithubToken() {
    setGithubBusy(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clearGithubToken" }),
    });
    setGithubBusy(false);
    await load();
  }

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

      <section className="glass mt-6 rounded-2xl p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">AI change scope</h2>
        <p className="mt-2 text-sm text-neutral-300">
          MYTHIC&apos;s AI assist is bounded: one-click repair may patch deployment metadata or minimal application source files that caused the failed build,
          but it must not touch host-level Docker/Traefik configuration without an explicit operator action.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3">
            <div className="text-sm font-semibold text-emerald-200">Allowed</div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-emerald-100/80">
              <li>build command, start command, app port</li>
              <li>runtime environment suggestions</li>
              <li>Dockerfile fallback hints for the deployed repo</li>
              <li>minimal source patches for build-blocking app errors</li>
            </ul>
          </div>
          <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3">
            <div className="text-sm font-semibold text-rose-200">Blocked by default</div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-rose-100/80">
              <li>host Docker socket, Traefik, DNS provider tokens</li>
              <li>broad refactors unrelated to the failed build</li>
              <li>secrets, API keys, or database contents</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="glass mt-6 rounded-2xl p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Multideploy &middot; GitHub access
        </h2>
        <p className="mt-2 text-sm text-neutral-300">
          Multideploy only ever lists and deploys repos <strong>you own</strong> — enforced by
          GitHub&apos;s own <code className="rounded bg-black/30 px-1">affiliation=owner</code> filter,
          re-checked server-side on every stack you create, never a repo picked from someone else&apos;s
          account. A{" "}
          <a className="text-cyan-300 underline" href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noreferrer">
            fine-grained personal access token
          </a>{" "}
          with read-only <code className="rounded bg-black/30 px-1">Contents</code> and{" "}
          <code className="rounded bg-black/30 px-1">Metadata</code> permission is enough — it is
          stored encrypted the same way as your LLM keys and only ever sent to api.github.com.
        </p>
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className={`rounded-full border px-3 py-1 ${hasGithubToken ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/40 text-amber-300"}`}>
            {hasGithubToken ? "🔒 Token saved" : "No token yet"}
          </span>
        </div>
        <form onSubmit={saveGithubToken} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[16rem]">
            <Label>GitHub token</Label>
            <input
              className="input"
              type="password"
              value={githubToken}
              onChange={(e) => setGithubTokenInput(e.target.value)}
              placeholder="github_pat_…"
            />
          </div>
          <button className="btn-primary" disabled={githubBusy || !githubToken}>
            {githubBusy ? "Saving…" : "Save token"}
          </button>
          {hasGithubToken && (
            <button type="button" className="btn-danger" disabled={githubBusy} onClick={clearGithubToken}>
              Clear
            </button>
          )}
        </form>
        <Link href="/stacks/new" className="btn-ghost mt-4 inline-flex text-sm">
          Go to Multideploy →
        </Link>
      </section>

      <section className="glass mt-6 rounded-2xl p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Where to get an LLM API key
        </h2>
        <p className="mt-2 text-sm text-neutral-300">
          Reference only — MYTHIC never auto-registers you anywhere. Pick one, get a key, paste it above.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {LLM_KEY_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-neutral-200 backdrop-blur hover:border-white/25 hover:text-white"
            >
              {l.name}
            </a>
          ))}
        </div>
      </section>

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
