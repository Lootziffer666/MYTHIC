"use client";

import { useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";

interface MemberView {
  key: string;
  repoUrl: string;
  branch: string;
  order: number;
  status: string;
  deploymentId: string | null;
  error: string | null;
  deployment: { url: string; domain: string; status: string } | null;
}

interface StackView {
  id: string;
  name: string;
  status: string;
  members: MemberView[];
  createdAt: number;
  updatedAt: number;
}

const TERMINAL = ["complete", "failed"];

export default function StackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [stack, setStack] = useState<StackView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/stacks/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "not found");
        return;
      }
      setStack(data.stack);
      if (TERMINAL.includes(data.stack.status) && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    load();
    pollRef.current = setInterval(load, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="glass rounded-2xl p-6 text-rose-300">{error}</div>
        <Link href="/dashboard" className="btn-ghost mt-4 inline-flex">← Dashboard</Link>
      </main>
    );
  }

  if (!stack) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="glass rounded-2xl p-6 text-neutral-400">Loading…</div>
      </main>
    );
  }

  const done = stack.members.filter((m) => m.status === "done").length;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{stack.name}</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {done}/{stack.members.length} deployed &middot; {new Date(stack.createdAt).toLocaleString()}
          </p>
        </div>
        <StatusPill status={stack.status} />
      </div>

      <div className="mt-8 space-y-3">
        {stack.members.map((m) => (
          <div key={m.key} className="glass rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-mono text-sm text-white">{m.key}</div>
                <div className="mt-0.5 text-xs text-neutral-500">{m.repoUrl} ({m.branch})</div>
              </div>
              <StatusPill status={m.status} />
            </div>
            {m.error && <div className="mt-2 text-xs text-rose-300">{m.error}</div>}
            {m.deployment && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-400">
                <span className="font-mono text-cyan-300">{m.deployment.domain}</span>
                <StatusPill status={m.deployment.status} />
              </div>
            )}
            {m.deploymentId && (
              <Link href={`/deployments/${m.deploymentId}`} className="btn-ghost mt-3 inline-flex text-xs">
                Open deployment — logs, redeploy, AI fix →
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 flex gap-3">
        <Link href="/stacks/new" className="btn-ghost">+ New stack</Link>
        <Link href="/dashboard" className="btn-ghost">← Dashboard</Link>
      </div>
    </main>
  );
}
