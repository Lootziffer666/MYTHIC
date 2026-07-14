import Link from "next/link";
import { store, stackStore } from "@/lib/db";
import { listDockerContainers } from "@/lib/docker";
import { StatusPill } from "@/components/StatusPill";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const deployments = store.list();
  const stacks = stackStore.list();
  const docker = await listDockerContainers();
  const managed = docker.containers.filter((c) => c.managedByMythic);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Deployments</h1>
          <p className="mt-1 text-sm text-neutral-400">Everything routed through your reverse proxy.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/stacks/new" className="btn-ghost">Multideploy</Link>
          <Link href="/" className="btn-primary">+ New deployment</Link>
        </div>
      </div>

      {stacks.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">Stacks</h2>
          <div className="space-y-3">
            {stacks.map((s) => (
              <Link key={s.id} href={`/stacks/${s.id}`} className="glass block rounded-xl p-4 transition hover:border-neutral-600">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-white">{s.name}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">{s.members.length} repo(s)</div>
                  </div>
                  <StatusPill status={s.status} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white">Installed Docker containers</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Host visibility is read-only here. Stop/redeploy actions stay on MYTHIC deployments.
              </p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs ${docker.available ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/40 text-amber-300"}`}>
              {docker.available ? `${docker.containers.length} containers` : "simulation"}
            </span>
          </div>
          {!docker.available ? (
            <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
              Docker is not reachable: {docker.error}. Mount the Docker socket only on hosts you trust.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {(managed.length ? managed : docker.containers.slice(0, 8)).map((c) => (
                <div key={c.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-mono text-sm text-white">{c.name}</div>
                      <div className="mt-0.5 text-xs text-neutral-500">{c.image}</div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${c.state === "running" ? "bg-emerald-500/15 text-emerald-300" : "bg-neutral-800 text-neutral-300"}`}>
                      {c.state}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-400">
                    {c.domains.map((domain) => <span key={domain} className="font-mono text-cyan-300">{domain}</span>)}
                    {c.ports.map((port) => <span key={port} className="font-mono">{port}</span>)}
                    {c.managedByMythic && <span className="rounded-full border border-fuchsia-400/30 px-2 py-0.5 text-fuchsia-200">MYTHIC/Traefik</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass rounded-2xl p-5">
          <h2 className="font-semibold text-white">DNS readiness</h2>
          <p className="mt-2 text-sm text-neutral-400">
            For Hetzner-hosted servers MYTHIC can safely suggest simple A-records to this server IP. For external DNS providers, automate only with a narrowly scoped DNS token — never with a full account token.
          </p>
          <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-xs text-neutral-400">
            <div className="font-semibold text-neutral-200">Recommended records</div>
            <div className="mt-2 font-mono">deploy.&lt;base-domain&gt; → A → &lt;server-ip&gt;</div>
            <div className="font-mono">*.&lt;base-domain&gt; → A → &lt;server-ip&gt;</div>
          </div>
        </div>
      </section>

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
