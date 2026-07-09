import Link from "next/link";
import Wizard from "@/components/Wizard";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[480px] w-[680px] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div className="absolute right-[10%] top-[30%] h-[360px] w-[360px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-[5%] left-[10%] h-[300px] w-[300px] rounded-full bg-emerald-500/20 blur-[120px]" />
      </div>

      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-6">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="text-gradient">✦ MYTHIC</span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-neutral-400">
          <a href="#how" className="hover:text-white">How it works</a>
          <Link href="/dashboard" className="rounded-lg border border-neutral-800 px-3 py-1.5 hover:border-neutral-600 hover:text-white">
            Dashboard
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-4 pb-10 pt-6 text-center">
        <span className="inline-block rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-xs text-neutral-400">
          Self-hosted · like Vercel & Railway, but yours
        </span>
        <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Ship any Git repo with <span className="text-gradient">zero config</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-neutral-400">
          Paste a repository URL. We clone it, detect the stack with nixpacks, build a Docker
          image, and route it through Traefik with automatic TLS. No YAML, no Dockerfiles.
        </p>
      </section>

      <Wizard />

      <section id="how" className="mx-auto max-w-5xl px-4 pb-20 pt-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["1 · Ingest", "Clone the repo and wire up webhooks for future pushes."],
            ["2 · Analyze", "nixpacks detects language, framework, build & start commands."],
            ["3 · Build", "Produce a Docker image — even without a Dockerfile."],
            ["4 · Deploy", "Start the container; Traefik routes the domain with Let's Encrypt TLS."],
          ].map(([t, d]) => (
            <div key={t} className="glass rounded-xl p-4">
              <div className="text-sm font-semibold text-cyan-300">{t}</div>
              <p className="mt-1 text-xs text-neutral-400">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
