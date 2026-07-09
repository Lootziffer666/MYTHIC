import Link from "next/link";
import { store } from "@/lib/db";
import { StatusPill } from "@/components/StatusPill";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const deployments = store.list();

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Deployments</h1>
          <p className="mt-1 text-sm text-neutral-400">Everything routed through your reverse proxy.</p>
        </div>
        <Link href="/" className="btn-primary">+ New deployment</Link>
      </div>

      {deployments.length === 0 ? (
        <div className="glass mt-8 rounded-2xl p-10 text-center text-neutral-400">
          No deployments yet.{" "}
          <Link href="/" className="text-cyan-300 underline">
            Start the wizard
          </Link>
          .
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {deployments.map((d) => (
            <Link
              key={d.id}
              href={`/deployments/${d.id}`}
              className="glass block rounded-xl p-4 transition hover:border-neutral-600"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">{d.name}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">{d.repoUrl}</div>
                </div>
                <StatusPill status={d.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-400">
                <span className="font-mono">{d.domain}</span>
                <span className="rounded-full border border-neutral-800 px-2 py-0.5 uppercase">
                  {d.mode}
                </span>
                <span>{new Date(d.createdAt).toLocaleString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
