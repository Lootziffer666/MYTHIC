import { StatusBadge } from "@/components/StatusBadge";

export function StatusPill({ status }: { status: string }) {
  return <StatusBadge status={status as never} />;
}
