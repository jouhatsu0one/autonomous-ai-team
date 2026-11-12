import { repositoryName, isSafePath } from "./guards";
import type { Env, Task } from "./env";

function b64(bytes: Uint8Array) {
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join("")).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export async function github<T>(env: Env, token: string, path: string, body?: unknown): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid GitHub path");
  const response = await fetch("https://api.github.com" + path, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    headers: {
      authorization: "Bearer " + token, accept: "application/vnd.github+json",
      "content-type": "application/json", "user-agent": "autonomous-ai-team",
      "x-github-api-version": "2022-11-28",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("GitHub request failed (" + response.status + ")");
  return response.json() as Promise<T>;
}

export async function installationToken(env: Env, repository: string, write = false) {
  if (!repositoryName.test(repository) || repository !== env.ALLOWED_REPOSITORY ||
      !env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY || !/^\d+$/.test(env.GITHUB_APP_INSTALLATION_ID)) {
    throw new Error("GitHub App or repository scope is missing");
  }
  const der = Uint8Array.from(atob(env.GITHUB_APP_PRIVATE_KEY.replace(/-----[^-]+-----|\s/g, "")), char => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const encoder = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = [
    { alg: "RS256", typ: "JWT" }, { iat: now - 30, exp: now + 540, iss: env.GITHUB_APP_ID },
  ].map(value => b64(encoder.encode(JSON.stringify(value)))).join(".");
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned));
  const jwt = unsigned + "." + b64(new Uint8Array(signature));
  const result = await github<{ token: string }>(env, jwt, "/app/installations/" + env.GITHUB_APP_INSTALLATION_ID + "/access_tokens", {
    repositories: [repository.split("/")[1]],
    permissions: { contents: write ? "write" : "read", issues: "read", pull_requests: write ? "write" : "read" },
  });
  return result.token;
}

export async function trustedActor(env: Env, token: string, repository: string, actor: string) {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(actor)) return false;
  const access = await github<{ permission: string }>(env, token, "/repos/" + repository + "/collaborators/" + actor + "/permission");
  return ["admin", "maintain", "write"].includes(access.permission);
}

interface TreeEntry { path: string; type: string; sha: string; size?: number; mode: string }
export async function readContext(env: Env, task: Task) {
  const token = await installationToken(env, task.repository);
  if (!await trustedActor(env, token, task.repository, task.actor)) throw new Error("Label actor lacks write access");
  const root = "/repos/" + task.repository;
  const repo = await github<{ private: boolean; default_branch: string }>(env, token, root);
  if (repo.private) throw new Error("Repository is private");
  const issue = await github<{ title: string; body: string | null; state: string }>(env, token, root + "/issues/" + task.issue);
  if (issue.state !== "open") throw new Error("Issue is closed");
  const commit = await github<{ sha: string; commit: { tree: { sha: string } } }>(env, token, root + "/commits/" + encodeURIComponent(repo.default_branch));
  const tree = await github<{ tree: TreeEntry[]; truncated: boolean }>(env, token, root + "/git/trees/" + commit.commit.tree.sha + "?recursive=1");
  const terms = new Set((issue.title + " " + (issue.body ?? "").slice(0, 3000)).toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) ?? []);
  const files = tree.tree.filter(file => file.type === "blob" && file.mode === "100644" && (file.size ?? Infinity) <= 2200 && isSafePath(file.path));
  const rank = (path: string) => path.toLowerCase().split(/[\/._-]/).filter(word => terms.has(word)).length;
  files.sort((left, right) => rank(right.path) - rank(left.path) || left.path.localeCompare(right.path));
  const selected = await Promise.all(files.slice(0, 5).map(async file => {
    const blob = await github<{ content: string; encoding: string }>(env, token, root + "/git/blobs/" + file.sha);
    if (blob.encoding !== "base64") throw new Error("Unsupported GitHub blob encoding");
    const content = new TextDecoder().decode(Uint8Array.from(atob(blob.content), char => char.charCodeAt(0)));
    const imports = Array.from(content.matchAll(/(?:from\s*|import\s*\()(['"])(\.\.?\/[^'"]+)\1/g), match => match[2]).slice(0, 30);
    return { path: file.path, content, imports };
  }));
  return {
    issue: { title: issue.title, body: (issue.body ?? "").slice(0, 4000) },
    base: repo.default_branch, head: commit.sha, tree: commit.commit.tree.sha,
    treeTruncated: tree.truncated || files.length > selected.length,
    files: selected,
  };
}
