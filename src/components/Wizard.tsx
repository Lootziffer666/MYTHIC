"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AnalysisResult, DeploymentRecord } from "@/lib/types";

const STEPS = ["Connect", "Detect", "Deploy", "Live"] as const;

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function repoName(url: string) {
  return url.replace(/\.git$/, "").replace(/\/+$/, "").split("/").pop() || "app";
}

const PHASE_ORDER: DeploymentRecord["status"][] = [
  "queued",
  "cloning",
  "analyzing",
  "building",
  "deploying",
  "running",
];

export default function Wizard() {
  const [step, setStep] = useState(0);
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [port, setPort] = useState(3000);
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string }[]>([]);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [deploying, setDeploying] = useState(false);
  const [deployment, setDeployment] = useState<DeploymentRecord | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || "localtest.me";

  useEffect(() => {
    if (repoUrl) {
      const n = repoName(repoUrl);
      if (!name) setName(slug(n));
      if (!domain) setDomain(`${slug(n)}.${baseDomain}`);
    }
  }, [repoUrl, name, domain, baseDomain]);

  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/deployments/${id}`);
        if (!res.ok) return;
        const { deployment } = await res.json();
        setDeployment(deployment);
        if (["running", "failed", "stopped"].includes(deployment.status)) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        /* ignore transient */
      }
    }, 1500);
  }, []);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalysis(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, branch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setAnalysis(data.analysis);
      if (data.analysis.port) setPort(data.analysis.port);
      setStep(1);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleDeploy() {
    setDeploying(true);
    setDeployError(null);
    try {
      const env: Record<string, string> = {};
      for (const { key, value } of envPairs) {
        if (key.trim()) env[key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_")] = value;
      }
      const res = await fetch("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, branch, name, domain, port, env }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deploy failed");
      setDeployment(data.deployment);
      setStep(3);
      startPolling(data.deployment.id);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeploying(false);
    }
  }

  async function handleRedeploy() {
    if (!deployment) return;
    const res = await fetch(`/api/deployments/${deployment.id}/redeploy`, {
      method: "POST",
    });
    const data = await res.json();
    if (res.ok) {
      setDeployment(data.deployment);
      startPolling(data.deployment.id);
    }
  }

  async function handleStop() {
    if (!deployment) return;
    await fetch(`/api/deployments/${deployment.id}`, { method: "DELETE" });
    const res = await fetch(`/api/deployments/${deployment.id}`);
    const data = await res.json();
    setDeployment(data.deployment);
  }

  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  async function handleAiFix() {
    if (!deployment) return;
    setAiBusy(true);
    setAiMessage(null);
    try {
      const res = await fetch(`/api/deployments/${deployment.id}/ai-fix`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI fix failed");
      setAiMessage(data.fix ? `🤖 ${data.fix.diagnosis}\n${data.fix.explanation}` : data.error || "No fix.");
    } catch (err) {
      setAiMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <Stepper current={step} />

      {step === 0 && (
        <Card title="Connect your repository" subtitle="Paste any public Git URL — GitHub, GitLab, or any HTTPS clone URL.">
          <Label>Repository URL</Label>
          <input
            className="input"
            placeholder="https://github.com/user/my-app.git"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Branch</Label>
              <input className="input" value={branch} onChange={(e) => setBranch(e.target.value)} />
            </div>
            <div>
              <Label>Project name (optional)</Label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-app" />
            </div>
          </div>
          {analyzeError && <ErrorBox>{analyzeError}</ErrorBox>}
          <Button disabled={!repoUrl || analyzing} onClick={handleAnalyze}>
            {analyzing ? "Analyzing…" : "Detect stack →"}
          </Button>
        </Card>
      )}

      {step === 1 && analysis && (
        <Card title="Stack detected" subtitle="We inspected your repository and generated a build plan — just like nixpacks.">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Language / Framework" value={`${analysis.language ?? "Unknown"}${analysis.framework ? ` · ${analysis.framework}` : ""}`} />
            <Field label="Base image" value={analysis.baseImage ?? "auto"} />
            <Field label="Build command" value={analysis.buildCommand ?? "(none)"} mono />
            <Field label="Start command" value={analysis.startCommand ?? "(none)"} mono />
          </div>
          <p className="text-xs text-neutral-500">Detection: {analysis.provider}</p>

          <Divider />
          <Label>Domain</Label>
          <input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Port</Label>
              <input
                type="number"
                className="input"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Environment variables</Label>
              <EnvEditor pairs={envPairs} onChange={setEnvPairs} />
            </div>
          </div>
          {deployError && <ErrorBox>{deployError}</ErrorBox>}
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setStep(0)}>← Back</Button>
            <Button disabled={!domain || deploying} onClick={handleDeploy}>
              {deploying ? "Deploying…" : "Deploy to magic ✨"}
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && deployment && (
        <Card title="Deployment live" subtitle="Your pipeline ran end-to-end: clone → detect → build → route.">
          <StatusBadge status={deployment.status} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Mode" value={deployment.mode} />
            <Field label="Image" value={deployment.imageName} mono />
            <Field label="Container" value={deployment.containerId || "—"} mono />
            <Field label="URL" value={deployment.url} mono />
          </div>

          <Divider />
          <Label>Pipeline logs</Label>
          <pre className="logbox">{deployment.logs || "Waiting for logs…"}</pre>

          {aiMessage && (
            <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 p-3 text-sm text-fuchsia-200">
              {aiMessage}
            </pre>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard" className="btn-ghost">View dashboard →</Link>
            {deployment.status === "failed" && (
              <Button onClick={handleAiFix} disabled={aiBusy}>
                {aiBusy ? "Asking AI…" : "✨ Ask AI to fix"}
              </Button>
            )}
            <Button variant="ghost" onClick={handleRedeploy}>↻ Redeploy</Button>
            <Button variant="danger" onClick={handleStop}>■ Stop</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex items-center justify-between">
      {STEPS.map((label, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${
                  active
                    ? "border-cyan-400 text-cyan-300 magic-border"
                    : done
                      ? "border-emerald-400 text-emerald-300"
                      : "border-neutral-700 text-neutral-500"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={active ? "text-sm font-medium text-white" : "text-sm text-neutral-500"}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && <span className="mx-3 h-px flex-1 bg-neutral-800" />}
          </li>
        );
      })}
    </ol>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="glass magic-border rounded-2xl p-6 shadow-2xl">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <p className="mb-5 mt-1 text-sm text-neutral-400">{subtitle}</p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">{children}</label>;
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-1 break-all text-sm text-neutral-200 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function Divider() {
  return <hr className="border-neutral-800" />;
}

function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
}) {
  const styles =
    variant === "primary"
      ? "btn-primary"
      : variant === "danger"
        ? "btn-danger"
        : "btn-ghost";
  return (
    <button onClick={onClick} disabled={disabled} className={`${styles} ${disabled ? "opacity-50" : ""}`}>
      {children}
    </button>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{children}</div>;
}

function StatusBadge({ status }: { status: DeploymentRecord["status"] }) {
  const color =
    status === "running"
      ? "text-emerald-300 border-emerald-400/40 bg-emerald-400/10"
      : status === "failed"
        ? "text-red-300 border-red-400/40 bg-red-400/10"
        : "text-cyan-300 border-cyan-400/40 bg-cyan-400/10";
  return (
    <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${color} animate-pulse-glow`}>
      {status}
    </span>
  );
}

function EnvEditor({
  pairs,
  onChange,
}: {
  pairs: { key: string; value: string }[];
  onChange: (p: { key: string; value: string }[]) => void;
}) {
  return (
    <div className="space-y-2">
      {pairs.map((p, i) => (
        <div key={i} className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="KEY"
            value={p.key}
            onChange={(e) => {
              const next = [...pairs];
              next[i].key = e.target.value;
              onChange(next);
            }}
          />
          <input
            className="input flex-1"
            placeholder="value"
            value={p.value}
            onChange={(e) => {
              const next = [...pairs];
              next[i].value = e.target.value;
              onChange(next);
            }}
          />
          <button className="btn-ghost px-2" onClick={() => onChange(pairs.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button className="btn-ghost text-xs" onClick={() => onChange([...pairs, { key: "", value: "" }])}>
        + Add variable
      </button>
    </div>
  );
}
