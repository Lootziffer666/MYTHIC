import { NextResponse } from "next/server";
import { getGithubToken } from "@/lib/settings";
import { listOwnRepos } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const token = getGithubToken();
  if (!token) {
    return NextResponse.json(
      { error: "No GitHub token configured. Add one in Settings to list your own repos for multideploy." },
      { status: 400 }
    );
  }
  try {
    const repos = await listOwnRepos(token);
    return NextResponse.json({ repos });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
