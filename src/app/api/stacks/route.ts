import { NextResponse } from "next/server";
import { stackStore } from "@/lib/db";
import { getGithubToken } from "@/lib/settings";
import { verifyOwnRepos } from "@/lib/github";
import { createStack, StackValidationError } from "@/lib/stack-engine";
import type { CreateStackInput, StackMemberInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ stacks: stackStore.list() });
}

/** "https://github.com/owner/repo.git" -> "owner/repo". Returns null if it doesn't parse as a GitHub URL. */
function fullNameFromCloneUrl(url: string): string | null {
  const match = url.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?\/?$/i);
  return match ? match[1] : null;
}

export async function POST(request: Request) {
  let body: { name?: string; members?: StackMemberInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!Array.isArray(body.members) || body.members.length === 0) {
    return NextResponse.json({ error: "members (non-empty array) is required" }, { status: 400 });
  }
  for (const m of body.members) {
    if (!m.key || !m.repoUrl) {
      return NextResponse.json({ error: "every member needs key and repoUrl" }, { status: 400 });
    }
  }

  // Own-repos-only, re-verified server-side against a fresh GitHub call — the repo
  // picker UI only ever shows the user's own repos, but this is the actual boundary:
  // a tampered/forged client request must not be able to smuggle in someone else's repo.
  const token = getGithubToken();
  if (!token) {
    return NextResponse.json(
      { error: "No GitHub token configured. Add one in Settings before running multideploy." },
      { status: 400 }
    );
  }
  const fullNames = body.members.map((m) => fullNameFromCloneUrl(m.repoUrl));
  if (fullNames.some((f) => f === null)) {
    return NextResponse.json({ error: "All member repoUrls must be github.com clone URLs." }, { status: 400 });
  }
  let verification: Awaited<ReturnType<typeof verifyOwnRepos>>;
  try {
    verification = await verifyOwnRepos(token, fullNames as string[]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Could not verify repo ownership: ${message}` }, { status: 502 });
  }
  if (!verification.ok) {
    return NextResponse.json(
      { error: `Not in your own repos: ${verification.unauthorized.join(", ")}` },
      { status: 403 }
    );
  }

  const input: CreateStackInput = { name: body.name, members: body.members };
  try {
    const stack = createStack(input, token);
    return NextResponse.json({ stack }, { status: 201 });
  } catch (err) {
    if (err instanceof StackValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
