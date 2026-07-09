import { NextResponse } from "next/server";
import { redeploy } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deployment = redeploy(id);
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }
  return NextResponse.json({ deployment });
}
