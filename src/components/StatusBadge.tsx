import type { DeploymentRecord } from "@/lib/types";

const color: Record<string, string> = {
  running: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10",
  failed: "text-red-300 border-red-400/40 bg-red-400/10",
  stopped: "text-neutral-400 border-neutral-600/40 bg-neutral-600/10",
  queued: "text-neutral-400 border-neutral-600/40 bg-neutral-600/10",
};
const fallback = "text-cyan-300 border-cyan-400/40 bg-cyan-400/10";

export function StatusBadge({ status }: { status: DeploymentRecord["status"] }) {
  return (
    <span
      className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
        color[status] ?? fallback
      }`}
    >
      {status}
    </span>
  );
}
