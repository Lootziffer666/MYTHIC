/**
 * GitHub repo listing, strictly scoped to repos the authenticated token's user
 * OWNS (`affiliation=owner`) — enforced server-side by the GitHub API itself,
 * not just a UI convention. Multideploy only ever offers repos from this list;
 * deploying arbitrary third-party repos in a batch was deliberately ruled out
 * (abuse risk flagged during the pipeline-gap survey, user agreed to scope
 * auto-deploy to their own repos only).
 */

export interface GithubRepo {
  fullName: string;
  cloneUrl: string;
  private: boolean;
  defaultBranch: string;
  pushedAt: string;
}

const MAX_PAGES = 20; // 2000 repos at 100/page — generous ceiling, not a real limit

export async function listOwnRepos(token: string): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await fetch(
      `https://api.github.com/user/repos?affiliation=owner&per_page=100&page=${page}&sort=pushed`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GitHub API error ${res.status}: ${body.slice(0, 300)}`);
    }
    const batch = (await res.json()) as Array<{
      full_name: string;
      clone_url: string;
      private: boolean;
      default_branch: string;
      pushed_at: string;
    }>;
    if (batch.length === 0) break;
    for (const r of batch) {
      repos.push({
        fullName: r.full_name,
        cloneUrl: r.clone_url,
        private: !!r.private,
        defaultBranch: r.default_branch || "main",
        pushedAt: r.pushed_at,
      });
    }
    if (batch.length < 100) break;
  }
  return repos;
}

/** True iff every fullName in `selected` is present in a fresh listOwnRepos() call —
 *  re-validated server-side at stack-creation time, not trusted from client input alone. */
export async function verifyOwnRepos(token: string, fullNames: string[]): Promise<{ ok: true } | { ok: false; unauthorized: string[] }> {
  const owned = new Set((await listOwnRepos(token)).map((r) => r.fullName));
  const unauthorized = fullNames.filter((f) => !owned.has(f));
  return unauthorized.length === 0 ? { ok: true } : { ok: false, unauthorized };
}
