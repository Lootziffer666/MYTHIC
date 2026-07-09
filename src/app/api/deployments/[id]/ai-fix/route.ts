import { NextResponse } from "next/server";
import { aiFixDeployment } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await aiFixDeployment(id);
  if (!result.deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
