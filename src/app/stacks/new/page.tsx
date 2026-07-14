"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface GithubRepo {
  fullName: string;
  cloneUrl: string;
  private: boolean;
  defaultBranch: string;
  pushedAt: string;
}

interface MemberDraft {
  key: string;
  repoUrl: string;
  fullName: string;
  branch: string;
  envPairs: { k: string; v: string }[];
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function NewStackPage() {
  const router = useRouter();
  const [repos, setRepos] = useState<GithubRepo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, MemberDraft>>({});
  const [stackName, setStackName] = useState("my-stack");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/repos")
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error || "Could not list your repos.");
          return;
        }
        setRepos(data.repos);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const memberKeys = useMemo(() => Object.values(selected).map((m) => m.key), [selected]);

  function toggle(repo: GithubRepo) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[repo.fullName]) {
        delete next[repo.fullName];
      } else {
        const base = slug(repo.fullName.split("/")[1] || repo.fullName);
        let key = base;
        let n = 2;
        while (Object.values(next).some((m) => m.key === key)) key = `${base}-${n++}`;
        next[repo.fullName] = { key, repoUrl: repo.cloneUrl, fullName: repo.fullName, branch: repo.defaultBranch, envPairs: [] };
      }
      return next;
    });
  }

  function updateMember(fullName: string, patch: Partial<MemberDraft>) {
    setSelected((prev) => ({ ...prev, [fullName]: { ...prev[fullName], ...patch } }));
  }

  function addEnvPair(fullName: string) {
    updateMember(fullName, { envPairs: [...selected[fullName].envPairs, { k: "", v: "" }] });
  }

  function updateEnvPair(fullName: string, i: number, patch: Partial<{ k: string; v: string }>) {
    const pairs = selected[fullName].envPairs.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    updateMember(fullName, { envPairs: pairs });
  }

  function removeEnvPair(fullName: string, i: number) {
    updateMember(fullName, { envPairs: selected[fullName].envPairs.filter((_, idx) => idx !== i) });
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const members = Object.values(selected).map((m) => ({
        key: m.key,
        repoUrl: m.repoUrl,
        branch: m.branch,
        env: Object.fromEntries(m.envPairs.filter((p) => p.k.trim()).map((p) => [p.k.trim(), p.v])),
      }));
      const res = await fetch("/api/stacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: stackName, members }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create stack");
      router.push(`/stacks/${data.stack.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Multideploy</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Pick several of your own repos, deploy them in one run, wire them together.
          </p>
        </div>
        <Link href="/dashboard" className="btn-ghost">← Dashboard</Link>
      </div>

      {loadError && (
        <div className="glass mt-6 rounded-2xl p-6 text-sm text-amber-200">
          {loadError}{" "}
          <Link href="/settings" className="text-cyan-300 underline">
            Add a GitHub token in Settings
          </Link>
          .
        </div>
      )}

      {!loadError && repos === null && (
        <div className="glass mt-6 rounded-2xl p-6 text-sm text-neutral-400">Loading your repos…</div>
      )}

      {repos && repos.length === 0 && (
        <div className="glass mt-6 rounded-2xl p-6 text-sm text-neutral-400">
          No repos found for this token. Multideploy only ever shows repos you own.
        </div>
      )}

      {repos && repos.length > 0 && (
        <>
          <section className="glass mt-6 rounded-2xl p-5">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
              Stack name
            </label>
            <input className="input" value={stackName} onChange={(e) => setStackName(e.target.value)} />
          </section>

          <section className="mt-6 space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              Your repos ({repos.length})
            </h2>
            {repos.map((repo) => {
              const draft = selected[repo.fullName];
              return (
                <div key={repo.fullName} className="glass rounded-xl p-4">
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <input type="checkbox" checked={!!draft} onChange={() => toggle(repo)} />
                      <span className="font-mono text-sm text-white">{repo.fullName}</span>
                      {repo.private && (
                        <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400">private</span>
                      )}
                    </span>
                    <span className="text-xs text-neutral-500">{repo.defaultBranch}</span>
                  </label>

                  {draft && (
                    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs text-neutral-500">Local key (for ${"{"}key.url{"}"} refs)</label>
                          <input
                            className="input"
                            value={draft.key}
                            onChange={(e) => updateMember(repo.fullName, { key: slug(e.target.value) })}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-neutral-500">Branch</label>
                          <input
                            className="input"
                            value={draft.branch}
                            onChange={(e) => updateMember(repo.fullName, { branch: e.target.value })}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-xs text-neutral-500">
                            Environment — use <code className="rounded bg-black/30 px-1">{"${otherKey.url}"}</code> to
                            reference another selected repo once it&apos;s live
                            {memberKeys.filter((k) => k !== draft.key).length > 0 && (
                              <> (available: {memberKeys.filter((k) => k !== draft.key).join(", ")})</>
                            )}
                          </label>
                          <button type="button" className="btn-ghost text-xs" onClick={() => addEnvPair(repo.fullName)}>
                            + env var
                          </button>
                        </div>
                        {draft.envPairs.map((p, i) => (
                          <div key={i} className="mt-1 flex gap-2">
                            <input
                              className="input flex-1"
                              placeholder="KEY"
                              value={p.k}
                              onChange={(e) => updateEnvPair(repo.fullName, i, { k: e.target.value })}
                            />
                            <input
                              className="input flex-[2]"
                              placeholder="value or ${otherKey.url}/v1"
                              value={p.v}
                              onChange={(e) => updateEnvPair(repo.fullName, i, { v: e.target.value })}
                            />
                            <button type="button" className="btn-danger text-xs" onClick={() => removeEnvPair(repo.fullName, i)}>
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {submitError && (
            <pre className="glass mt-6 whitespace-pre-wrap rounded-xl p-3 text-sm text-rose-300">{submitError}</pre>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button
              className="btn-primary"
              disabled={submitting || Object.keys(selected).length === 0}
              onClick={submit}
            >
              {submitting ? "Starting…" : `Deploy ${Object.keys(selected).length} repo(s)`}
            </button>
            <span className="text-xs text-neutral-500">
              Deploys run in dependency order, one at a time, so ${"{"}key.url{"}"} refs resolve for real.
            </span>
          </div>
        </>
      )}
    </main>
  );
}
