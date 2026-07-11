import Link from "next/link";
import MythicWebGLHero from "@/components/MythicWebGLHero";
import Wizard from "@/components/Wizard";

const deploySteps = [
  ["Ingress", "Clone a Git repo, resolve the branch, and prepare an isolated worktree."],
  ["Analysis", "Prefer nixpacks plans, then fall back to MYTHIC's framework heuristics."],
  ["Build", "Create a Docker image with generated build/start metadata when needed."],
  ["Resurrection", "Attach Traefik labels, issue TLS, and bring the app back as a live URL."],
];

const proofPoints = [
  ["Zero-config", "nixpacks + heuristics detect the stack before you write YAML."],
  ["Sovereign", "Your Docker host, your Traefik edge, your encrypted BYOK providers."],
  ["Repairable", "AI-assisted failure diagnosis can patch build/start/env mistakes."],
];

export default function Home() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#04020a]">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(251,191,36,0.16),transparent_24%),radial-gradient(circle_at_24%_24%,rgba(168,85,247,0.22),transparent_30%),radial-gradient(circle_at_82%_30%,rgba(34,211,238,0.16),transparent_28%),linear-gradient(180deg,rgba(4,2,10,0),#04020a_76%)]" />
        <MythicWebGLHero />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-[#04020a] via-[#04020a]/85 to-transparent" />
        <div className="absolute left-1/2 top-28 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full border border-amber-200/10 shadow-[0_0_180px_rgba(251,191,36,0.20),inset_0_0_120px_rgba(168,85,247,0.08)]" />
      </div>

      <div className="relative z-10">
        <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6 sm:px-6">
          <div className="flex items-center gap-3 text-lg font-semibold">
            <span className="grid h-10 w-10 place-items-center rounded-2xl border border-amber-200/25 bg-amber-200/10 text-amber-100 shadow-[0_0_38px_rgba(251,191,36,0.28)]">✦</span>
            <span className="text-gradient">MYTHIC</span>
          </div>
          <nav className="flex items-center gap-3 text-sm text-neutral-300">
            <a href="#ritual" className="hidden hover:text-white sm:inline">Ritual</a>
            <a href="#forge" className="hidden hover:text-white sm:inline">Forge</a>
            <Link href="/dashboard" className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 shadow-2xl backdrop-blur hover:border-white/25 hover:text-white">Dashboard</Link>
            <Link href="/settings" className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 shadow-2xl backdrop-blur hover:border-white/25 hover:text-white">Settings</Link>
          </nav>
        </header>

        <section className="mx-auto max-w-6xl px-4 pb-8 pt-10 text-center sm:px-6 sm:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-black/35 px-4 py-1.5 text-xs uppercase tracking-[0.32em] text-amber-100/90 shadow-[0_0_44px_rgba(251,191,36,0.12)] backdrop-blur">
            Resurrection deploys for vibe-coded apps
          </span>
          <h1 className="mx-auto mt-7 max-w-5xl text-6xl font-black leading-[0.9] tracking-[-0.06em] text-white sm:text-8xl lg:text-9xl">
            Deploys should feel <span className="text-gradient drop-shadow-[0_0_42px_rgba(34,211,238,0.28)]">MYTHIC</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-base leading-8 text-neutral-200 sm:text-xl">
            Paste a Git repo. MYTHIC opens the gate: clone, detect, build, route, TLS, and live logs — with AI repair when the mortal build scripts betray you.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3 text-sm text-neutral-300">
            {['Docker socket aware', 'Nixpacks first', 'BYOK AI fixes', 'Traefik TLS', 'Simulation fallback'].map((item) => (
              <span key={item} className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 shadow-2xl backdrop-blur-md">{item}</span>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-8 sm:grid-cols-3 sm:px-6">
          {proofPoints.map(([title, description]) => (
            <div key={title} className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_100px_rgba(0,0,0,0.32)] backdrop-blur-xl">
              <div className="text-sm font-semibold text-amber-100">{title}</div>
              <p className="mt-2 text-sm leading-6 text-neutral-300">{description}</p>
            </div>
          ))}
        </section>

        <section id="forge" className="relative mx-auto max-w-5xl px-4 sm:px-6">
          <div className="absolute inset-x-6 top-10 h-32 rounded-full bg-cyan-400/10 blur-3xl" />
          <Wizard />
        </section>

        <section id="ritual" className="mx-auto max-w-7xl px-4 pb-28 pt-16 sm:px-6">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/70">The ritual</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Four phases from source to sovereign URL</h2>
            </div>
            <Link href="/dashboard" className="hidden rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-neutral-300 backdrop-blur hover:border-white/25 hover:text-white sm:inline-flex">View deployments</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {deploySteps.map(([title, description], index) => (
              <div key={title} className="group relative min-h-48 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.075] to-white/[0.025] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.34)] backdrop-blur-xl">
                <div className="absolute -right-7 -top-7 h-28 w-28 rounded-full bg-cyan-300/10 blur-2xl transition group-hover:bg-amber-200/15" />
                <div className="absolute right-5 top-4 text-5xl font-black text-white/[0.04]">0{index + 1}</div>
                <div className="text-base font-bold text-cyan-100">{title}</div>
                <p className="mt-4 text-sm leading-6 text-neutral-300">{description}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
