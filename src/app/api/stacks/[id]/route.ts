import { NextResponse } from "next/server";
import { stackStore, store } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const stack = stackStore.get(id);
  if (!stack) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Enrich each member with its own deployment's live status/url when it has one,
  // so the stack detail view can show real progress without a second round-trip.
  const members = stack.members.map((m) => ({
    ...m,
    deployment: m.deploymentId ? store.get(m.deploymentId) : null,
  }));

  return NextResponse.json({ stack: { ...stack, members } });
}
