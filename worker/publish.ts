import { z } from "zod";
import type { Env } from "./env";
import { reserve } from "./budget";
import { candidateSchema } from "./workflows";
import { github, installationToken } from "./github-app";
import { boundedBody, identifier } from "./guards";
import { verifyHmac } from "./hmac";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const receiptSchema = z.object({
  task: identifier,
  base: sha,
  candidateSha256: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: z.number().int(),
  sandbox: z.literal("passed"),
  dependencyScan: z.literal("passed"),
});

export async function publishValidated(request: Request, env: Env) {
  const respond = (body: unknown, status: number) =>
    Response.json(body, { status, headers: { "cache-control": "no-store" } });
  if (!env.VALIDATION_SECRET || env.VALIDATION_SECRET.length < 32) return respond({ error: "Trusted validator is disabled" }, 503);
  const raw = await boundedBody(request, 2048);
  if (!await verifyHmac(env.VALIDATION_SECRET, raw, request.headers.get("x-validation-signature") ?? "")) {
    return respond({ error: "Invalid validator signature" }, 401);
  }
  const receipt = receiptSchema.parse(JSON.parse(new TextDecoder().decode(raw)));
  if (Math.abs(Date.now() - receipt.issuedAt) > 15 * 60 * 1000) return respond({ error: "Validation receipt expired" }, 400);
  const task = await env.DB.prepare("SELECT * FROM tasks WHERE id=?").bind(receipt.task)
    .first<{ repository: string; issue: number; status: string; result: string }>();
  if (!task || task.repository !== env.ALLOWED_REPOSITORY) return respond({ error: "Task not found" }, 404);
  if (task.status === "draft-opened") return respond({ status: task.status }, 200);
  if (task.status !== "awaiting-validation") return respond({ error: "Task is not ready for validation" }, 409);
  const result = z.object({ head: sha, candidate: candidateSchema }).passthrough().parse(JSON.parse(task.result));
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(result.candidate)));
  const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
  if (digest !== receipt.candidateSha256 || result.head !== receipt.base) return respond({ error: "Receipt does not match the stored candidate" }, 409);
  if (!await reserve(env, "draft")) return respond({ error: "Daily publication limit reached" }, 429);

  const token = await installationToken(env, task.repository, true);
  const root = "/repos/" + task.repository;
  const repo = await github<{ default_branch: string; private: boolean }>(env, token, root);
  if (repo.private) return respond({ error: "Repository visibility changed" }, 409);
  const base = await github<{ sha: string; commit: { tree: { sha: string } } }>(
    env, token, root + "/commits/" + encodeURIComponent(repo.default_branch),
  );
  if (base.sha !== result.head) return respond({ error: "Default branch moved after validation" }, 409);
  const branch = "ai-team/" + receipt.task + "-" + digest.slice(0, 16);
  const issue = await github<{ state: string }>(env, token, root + "/issues/" + task.issue);
  if (issue.state !== "open") return respond({ error: "Issue closed after validation" }, 409);

  const tree = await github<{ sha: string }>(env, token, root + "/git/trees", {
    base_tree: base.commit.tree.sha,
    tree: result.candidate.changes.map(change => ({ path: change.path, mode: "100644", type: "blob", content: change.content })),
  });
  const commit = await github<{ sha: string }>(env, token, root + "/git/commits", {
    message: "Propose fix for issue #" + task.issue, tree: tree.sha, parents: [base.sha],
  });
  try {
    await github(env, token, root + "/git/refs", { ref: "refs/heads/" + branch, sha: commit.sha });
  } catch (error) {
    const existing = await github<{ object: { sha: string } }>(env, token, root + "/git/ref/heads/" + branch).catch(() => null);
    if (!existing) throw error;
    const branchCommit = await github<{ tree: { sha: string }; parents: { sha: string }[] }>(
      env, token, root + "/git/commits/" + existing.object.sha,
    );
    if (branchCommit.tree.sha !== tree.sha || branchCommit.parents.length !== 1 || branchCommit.parents[0].sha !== base.sha) {
      return respond({ error: "Draft branch contains unexpected changes" }, 409);
    }
  }

  type Pull = { html_url: string; draft: boolean };
  const query = "?state=open&base=" + encodeURIComponent(repo.default_branch) +
    "&head=" + encodeURIComponent(task.repository.split("/")[0] + ":" + branch);
  const find = () => github<Pull[]>(env, token, root + "/pulls" + query);
  let pull: Pull | undefined = (await find())[0];
  if (!pull) {
    try {
      pull = await github<Pull>(env, token, root + "/pulls", {
        title: "Draft fix for issue #" + task.issue,
        body: "Related issue #" + task.issue + ".\n\nValidation receipt verified. Human review is required before marking ready.",
        head: branch, base: repo.default_branch, draft: true,
      });
    } catch (error) {
      pull = (await find())[0];
      if (!pull) throw error;
    }
  }
  if (!pull.draft) return respond({ error: "Existing PR is no longer a draft" }, 409);
  await env.DB.batch([
    env.DB.prepare("UPDATE tasks SET status='draft-opened',result=? WHERE id=?").bind(JSON.stringify({ ...result, pull: pull.html_url }), receipt.task),
    env.DB.prepare("INSERT OR REPLACE INTO policy_decisions(task_id,name,allowed,reason) VALUES(?,'publish-gate',1,?)")
      .bind(receipt.task, "Signed sandbox and dependency scan receipt matched exact candidate and base"),
  ]);
  return respond({ status: "draft-opened", url: pull.html_url }, 201);
}
