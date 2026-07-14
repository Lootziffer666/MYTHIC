"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { DeploymentRecord } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

export default function DeploymentDetail({ id }: { id: string }) {
  const [deployment, setDeployment] = useState<DeploymentRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const poll = useCallback(async () => {
    const res = await fetch(`/api/deployments/${id}`);
    if (!res.ok) {
      setNotFound(true);
      return;
    }
    const { deployment } = await res.json();
    setDeployment(deployment);
  }, [id]);

  useEffect(() => {
    const interval = setInterval(poll, 1500);
    const initial = setTimeout(poll, 0);
    return () => {
      clearInterval(interval);
      clearTimeout(initial);
    };
  }, [poll]);

  async function redeploy() {
    setBusy(true);
    await fetch(`/api/deployments/${id}/redeploy`, { method: "POST" });
    setBusy(false);
    poll();
  }

  async function stop() {
    setBusy(true);
    await fetch(`/api/deployments/${id}`, { method: "DELETE" });
    setBusy(false);
    poll();
  }

  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  async function aiFix() {
    setAiBusy(true);
    setAiMessage(null);
    try {
      const res = await fetch(`/api/deployments/${id}/ai-fix`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI fix failed");
      if (data.fix) {
        const patched = data.fix.sourcePatches?.length
          ? `\nPatched source files: ${data.fix.sourcePatches.map((patch: { path: string }) => patch.path).join(", ")}`
          : "";
        setAiMessage(`🤖 ${data.fix.diagnosis}\n${data.fix.explanation}${patched}`);
      } else {
        setAiMessage(data.error || "AI returned no fix.");
      }
      poll();
    } catch (err) {
      setAiMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setAiBusy(false);
    }
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-neutral-400">Deployment not found.</p>
        <Link href="/dashboard" className="btn-ghost mt-4 inline-block">← Dashboard</Link>
      </main>
    );
  }

  if (!deployment) {
    return <main className="mx-auto max-w-3xl px-4 py-16 text-neutral-400">Loading…</main>;
  }

  const a = deployment.analysis;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/dashboard" className="text-sm text-neutral-400 hover:text-white">← Dashboard</Link>
      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{deployment.name}</h1>
        <StatusBadge status={deployment.status} />
      </div>
      <a href={deployment.url} target="_blank" rel="noreferrer" className="mt-1 inline-block font-mono text-sm text-cyan-300 hover:underline">
        {deployment.url} ↗
      </a>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Field label="Repository" value={deployment.repoUrl} />
        <Field label="Branch" value={deployment.branch} />
        <Field label="Mode" value={deployment.mode} />
        <Field label="Image" value={deployment.imageName} mono />
        <Field label="Container" value={deployment.containerId || "—"} mono />
        <Field label="Port" value={String(deployment.port)} />
      </div>

      {a && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Detected" value={`${a.language ?? "?"}${a.framework ? ` · ${a.framework}` : ""}`} />
          <Field label="Start command" value={a.startCommand ?? "(none)"} mono />
        </div>
      )}

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-neutral-400">Pipeline logs</h2>
      <pre className="logbox">{deployment.logs || "Waiting for logs…"}</pre>

      {aiMessage && (
        <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 p-3 text-sm text-fuchsia-200">
          {aiMessage}
        </pre>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {deployment.status === "failed" && (
          <button className="btn-primary" onClick={aiFix} disabled={aiBusy}>
            {aiBusy ? "Asking AI…" : "✨ One-click AI fix"}
          </button>
        )}
        <button className="btn-ghost" onClick={redeploy} disabled={busy}>↻ Redeploy</button>
        <button className="btn-danger" onClick={stop} disabled={busy}>■ Stop</button>
      </div>
    </main>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-1 break-all text-sm text-neutral-200 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
