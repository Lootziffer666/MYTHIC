import { execFileAsync } from "./format";
import { repoPath } from "./config";
import fs from "node:fs";

export interface CloneOptions {
  branch?: string;
  depth?: number;
  /**
   * For private repos: a GitHub token injected via a redacted `http.extraheader`
   * git config, never embedded in the clone URL and never logged in plaintext
   * (both would otherwise leak it into DeploymentRecord.repoUrl / .logs, which
   * are persisted and shown in the UI).
   */
  authToken?: string;
}

function authArgsFor(authToken: string | undefined): string[] {
  if (!authToken) return [];
  const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${authToken}`).toString("base64")}`;
  return ["-c", `http.extraheader=${header}`];
}

function redactedForLog(args: string[]): string {
  return args
    .map((a) => (a.startsWith("http.extraheader=") ? "http.extraheader=AUTHORIZATION: basic ***" : a))
    .join(" ");
}

export async function cloneRepo(
  id: string,
  repoUrl: string,
  options: CloneOptions = {},
  onLog?: (line: string) => void
): Promise<string> {
  const target = repoPath(id);

  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }

  const authArgs = authArgsFor(options.authToken);
  const args = [...authArgs, "clone", "--single-branch"];
  if (options.branch) args.push("--branch", options.branch);
  if (options.depth) args.push("--depth", String(options.depth));

  // Clone into a temp name then rename, so a failed clone never leaves a partial dir behind.
  const tmp = `${target}.tmp`;
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  args.push(repoUrl, tmp);

  onLog?.(`$ git ${redactedForLog(args)}`);
  try {
    const { stdout, stderr } = await execFileAsync("git", args, { maxBuffer: 1024 * 1024 * 20 });
    if (stdout.trim()) onLog?.(stdout);
    if (stderr.trim()) onLog?.(stderr);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The requested branch may not exist (e.g. default is `master`). Retry on the
    // repository's default branch without forcing a specific one.
    const branchMissing =
      /Remote branch .* not found|not found in upstream|unknown revision/i.test(message);
    if (branchMissing && options.branch) {
      onLog?.(`Branch "${options.branch}" not found, cloning default branch instead.`);
      fs.rmSync(tmp, { recursive: true, force: true });
      const fallback = [...authArgs, "clone", repoUrl, tmp];
      onLog?.(`$ git ${redactedForLog(fallback)}`);
      const { stdout, stderr } = await execFileAsync("git", fallback, {
        maxBuffer: 1024 * 1024 * 20,
      });
      if (stdout.trim()) onLog?.(stdout);
      if (stderr.trim()) onLog?.(stderr);
    } else {
      fs.rmSync(tmp, { recursive: true, force: true });
      onLog?.(`git clone failed: ${message}`);
      throw new Error(`Failed to clone repository: ${message}`);
    }
  }

  fs.renameSync(tmp, target);
  onLog?.(`Cloned ${repoUrl} -> ${target}`);
  return target;
}
