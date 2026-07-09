import { NextResponse } from "next/server";
import { store } from "@/lib/db";
import { createDeployment, redeploy, teardown } from "@/lib/engine";
import type { CreateDeploymentInput } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ deployments: store.list() });
}

export async function POST(request: Request) {
  let body: Partial<CreateDeploymentInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.repoUrl || typeof body.repoUrl !== "string") {
    return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
  }

  const env: Record<string, string> = {};
  if (body.env && typeof body.env === "object") {
    for (const [k, v] of Object.entries(body.env)) {
      if (typeof v === "string") env[k] = v;
    }
  }

  const deployment = createDeployment({
    repoUrl: body.repoUrl,
    branch: body.branch,
    name: body.name,
    domain: body.domain,
    port: body.port,
    env,
    buildCommand: body.buildCommand,
    startCommand: body.startCommand,
  });

  return NextResponse.json({ deployment }, { status: 201 });
}
