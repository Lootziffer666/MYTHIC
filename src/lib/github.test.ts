import { describe, it, expect, vi, afterEach } from "vitest";
import { listOwnRepos, verifyOwnRepos } from "./github";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response;
}

const ownedRepo = {
  full_name: "someone/owned-repo",
  clone_url: "https://github.com/someone/owned-repo.git",
  private: false,
  default_branch: "main",
  pushed_at: "2026-07-01T00:00:00Z",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("listOwnRepos", () => {
  it("requests affiliation=owner and maps the response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse([ownedRepo])).mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const repos = await listOwnRepos("tok_123");

    expect(fetchMock.mock.calls[0][0]).toContain("affiliation=owner");
    expect(fetchMock.mock.calls[0][1]?.headers?.Authorization).toBe("Bearer tok_123");
    expect(repos).toEqual([
      {
        fullName: "someone/owned-repo",
        cloneUrl: "https://github.com/someone/owned-repo.git",
        private: false,
        defaultBranch: "main",
        pushedAt: "2026-07-01T00:00:00Z",
      },
    ]);
  });

  it("paginates until a short page", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ ...ownedRepo, full_name: `someone/r${i}` }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(fullPage))
      .mockResolvedValueOnce(jsonResponse([ownedRepo]));
    vi.stubGlobal("fetch", fetchMock);

    const repos = await listOwnRepos("tok_123");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(repos).toHaveLength(101);
  });

  it("throws with the GitHub error body on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ message: "Bad credentials" }, false)));
    await expect(listOwnRepos("bad-token")).rejects.toThrow(/GitHub API error 404/);
  });
});

describe("verifyOwnRepos", () => {
  it("passes when every requested repo is in the owner's list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse([ownedRepo])).mockResolvedValueOnce(jsonResponse([]))
    );
    const result = await verifyOwnRepos("tok", ["someone/owned-repo"]);
    expect(result).toEqual({ ok: true });
  });

  it("rejects a repo that is not in the owner's list — the actual own-repos boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse([ownedRepo])).mockResolvedValueOnce(jsonResponse([]))
    );
    const result = await verifyOwnRepos("tok", ["someone/owned-repo", "someone-else/their-repo"]);
    expect(result).toEqual({ ok: false, unauthorized: ["someone-else/their-repo"] });
  });
});
