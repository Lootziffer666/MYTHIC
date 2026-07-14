import { NextResponse } from "next/server";
import { startManualAiFixDeployment } from "@/lib/manual-ai-fix";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await startManualAiFixDeployment(id);

  if (!result.deployment) {
    return NextResponse.json({ error: result.error || "Deployment not found" }, { status: 404 });
  }

  if (!result.fix) {
    return NextResponse.json(
      { error: result.error || "AI returned no actionable repair", deployment: result.deployment },
      { status: 422 }
    );
  }

  return NextResponse.json(result, { status: 202 });
}
