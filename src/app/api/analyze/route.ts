import { NextResponse } from "next/server";
import { cloneRepo } from "@/lib/git";
import { analyzeRepo } from "@/lib/analyzer";
import { randomId } from "@/lib/format";
import { repoPath } from "@/lib/config";
import fs from "node:fs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: { repoUrl?: string; branch?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.repoUrl || typeof body.repoUrl !== "string") {
    return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
  }

  const id = randomId("probe");
  try {
    await cloneRepo(id, body.repoUrl, { branch: body.branch }, () => {});
    const analysis = await analyzeRepo(repoPath(id));
    return NextResponse.json({ analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 422 });
  } finally {
    fs.rmSync(repoPath(id), { recursive: true, force: true });
  }
}
