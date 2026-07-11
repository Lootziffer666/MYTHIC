import Link from "next/link";
import Wizard from "@/components/Wizard";

const deploySteps = [
  ["Ingress", "Clone a Git repo, resolve the branch, and prepare an isolated worktree."],
  ["Analysis", "Prefer nixpacks plans, then fall back to MYTHIC's framework heuristics."],
  ["Build", "Create a Docker image with generated build/start metadata when needed."],
  ["Resurrection", "Attach Traefik labels, issue TLS, and bring the app back as a live URL."],
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05030a]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.22),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(34,211,238,0.16),transparent_28%),linear-gradient(180deg,rgba(5,3,10,0),#05030a_78%)]" />
        <video className="absolute left-1/2 top-[-4rem] h-[34rem] w-[60rem] -translate-x-1/2 opacity-45 mix-blend-screen" autoPlay muted loop playsInline aria-hidden="true">
          <source src="/mythic-videos/volumetric-clouds-alpha.webm" type="video/webm" />
        </video>
        <video className="absolute left-1/2 top-28 h-[30rem] w-[54rem] -translate-x-1/2 opacity-55 mix-blend-screen" autoPlay muted loop playsInline aria-hidden="true">
          <source src="/mythic-videos/golden-gate-alpha.webm" type="video/webm" />
        </video>
        <video className="absolute bottom-24 left-1/2 h-[28rem] w-[52rem] -translate-x-1/2 opacity-60 mix-blend-screen" autoPlay muted loop playsInline aria-hidden="true">
          <source src="/mythic-videos/soul-return-alpha.webm" type="video/webm" />
        </video>
        <div className="absolute left-1/2 top-16 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full border border-amber-200/10 shadow-[0_0_120px_rgba(251,191,36,0.16)]" />
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
        <div className="flex items-center gap-3 text-lg font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-amber-200/20 bg-amber-200/10 text-amber-200 shadow-[0_0_30px_rgba(251,191,36,0.25)]">✦</span>
          <span className="text-gradient">MYTHIC</span>
        </div>
        <nav className="flex items-center gap-3 text-sm text-neutral-400">
          <a href="#ritual" className="hidden hover:text-white sm:inline">Ritual</a>
          <Link href="/dashboard" className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-1.5 hover:border-neutral-600 hover:text-white">Dashboard</Link>
          <Link href="/settings" className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-1.5 hover:border-neutral-600 hover:text-white">Settings</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-4 pb-8 pt-8 text-center sm:pt-16">
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/15 bg-neutral-950/70 px-4 py-1 text-xs uppercase tracking-[0.28em] text-amber-100/80">
          Resurrection deploys for vibe-coded apps
        </span>
        <h1 className="mt-6 text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl">
          Bring any Git repo <span className="text-gradient">back to life</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-neutral-300 sm:text-lg">
          MYTHIC is the self-hosted deployment altar: clone, detect, build, and route through Traefik with TLS.
          You keep the Docker host, the LLM keys, and the blast-radius boundaries.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3 text-xs text-neutral-400">
          {['Docker socket aware', 'Nixpacks first', 'BYOK AI fixes', 'Traefik TLS'].map((item) => (
            <span key={item} className="rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1">{item}</span>
          ))}
        </div>
      </section>

      <Wizard />

      <section id="ritual" className="mx-auto max-w-6xl px-4 pb-24 pt-10">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">The ritual</p>
            <h2 className="mt-2 text-2xl font-bold">Four phases from source to sovereign URL</h2>
          </div>
          <Link href="/dashboard" className="hidden rounded-lg border border-neutral-800 px-3 py-2 text-sm text-neutral-300 hover:border-neutral-600 hover:text-white sm:inline-flex">View deployments</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {deploySteps.map(([title, description], index) => (
            <div key={title} className="glass group relative overflow-hidden rounded-2xl p-5">
              <div className="absolute right-4 top-4 text-4xl font-black text-white/[0.03]">0{index + 1}</div>
              <div className="text-sm font-semibold text-cyan-200">{title}</div>
              <p className="mt-3 text-sm leading-6 text-neutral-400">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
