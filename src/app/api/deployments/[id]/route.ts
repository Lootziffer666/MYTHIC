import { NextResponse } from "next/server";
import { store } from "@/lib/db";
import { teardown } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deployment = store.get(id);
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }
  return NextResponse.json({ deployment });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = await teardown(id);
  if (!ok) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
