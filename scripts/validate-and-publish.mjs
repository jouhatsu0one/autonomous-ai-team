import { createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [task] = process.argv.slice(2);
const { AI_TEAM_WORKER_URL, AI_TEAM_ADMIN_TOKEN, AI_TEAM_VALIDATION_SECRET, AI_TEAM_VALIDATOR_IMAGE } = process.env;
if (!/^[a-zA-Z0-9-]{1,100}$/.test(task ?? "") || !AI_TEAM_WORKER_URL || !AI_TEAM_ADMIN_TOKEN ||
    (AI_TEAM_VALIDATION_SECRET?.length ?? 0) < 32 || !/^[\w./:-]+@sha256:[a-f0-9]{64}$/.test(AI_TEAM_VALIDATOR_IMAGE ?? "")) {
  throw new Error("Configure the Worker URL, admin and validation secrets, and a digest-pinned trusted validator image.");
}
const origin = new URL(AI_TEAM_WORKER_URL);
if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/") throw new Error("Use the HTTPS Worker origin.");

const headers = { authorization: "Bearer " + AI_TEAM_ADMIN_TOKEN };
const response = await fetch(new URL("/api/replay/" + task, origin), { headers, redirect: "error", signal: AbortSignal.timeout(10000) });
if (!response.ok) throw new Error("Candidate lookup failed (" + response.status + ")");
const detail = (await response.json()).task;
if (detail.status !== "awaiting-validation" || !/^[\w.-]+\/[\w.-]+$/.test(detail.repository)) throw new Error("Task is ineligible");
const { head, candidate } = JSON.parse(detail.result);
if (!/^[a-f0-9]{40}$/.test(head) || !Array.isArray(candidate?.changes) || candidate.changes.length < 1 ||
    candidate.changes.length > 3) throw new Error("Invalid candidate");

const scratch = mkdtempSync(join(tmpdir(), "ai-team-validator-"));
const source = join(scratch, "source");
const cleanEnv = { PATH: process.env.PATH, LANG: "C.UTF-8", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
function run(program, args, cwd = scratch, timeout = 180000) {
  execFileSync(program, args, { cwd, env: cleanEnv, stdio: ["ignore", "inherit", "inherit"], timeout });
}
try {
  run("git", ["-c", "core.hooksPath=/dev/null", "clone", "--quiet", "--no-checkout", "--",
    "https://github.com/" + detail.repository + ".git", source]);
  run("git", ["-c", "core.hooksPath=/dev/null", "checkout", "--quiet", "--detach", head], source);
  for (const { path, content } of candidate.changes) {
    if (!/^(?:src|app|lib)\/(?:[\w-]+\/)*[\w][\w.-]*\.(?:ts|tsx|js|jsx|css)$/.test(path) ||
        /(?:config|lock|secret|credential|token|\.test\.|\.spec\.)/i.test(path) ||
        typeof content !== "string" || !content || content.length > 9000) {
      throw new Error("The validator blocks changes to tests, configuration, and dependencies.");
    }
    let destination = source;
    const parts = path.split("/");
    for (const [index, part] of parts.entries()) {
      destination = join(destination, part);
      const stat = lstatSync(destination);
      if (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory()) {
        throw new Error("Candidate paths must refer to regular existing files.");
      }
    }
    writeFileSync(destination, content);
  }

  // OSV reads manifests; it does not execute candidate scripts.
  run("osv-scanner", ["scan", "source", "-r", "."], source);

  // Pull the trusted image separately. The actual candidate runner has no network or secrets.
  run("docker", ["pull", AI_TEAM_VALIDATOR_IMAGE]);
  run("docker", ["run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--user", "65532:65532", "--pids-limit", "128",
    "--memory", "768m", "--cpus", "1", "--tmpfs", "/tmp:rw,nosuid,nodev,size=256m",
    "--mount", "type=bind,source=" + source + ",target=/candidate,readonly", AI_TEAM_VALIDATOR_IMAGE]);

  const receipt = JSON.stringify({ task, base: head,
    candidateSha256: createHash("sha256").update(JSON.stringify(candidate)).digest("hex"),
    issuedAt: Date.now(), sandbox: "passed", dependencyScan: "passed" });
  const signature = "sha256=" + createHmac("sha256", AI_TEAM_VALIDATION_SECRET).update(receipt).digest("hex");
  const published = await fetch(new URL("/api/validated-draft", origin), {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(90000),
    headers: { ...headers, "content-type": "application/json", "x-validation-signature": signature }, body: receipt,
  });
  if (!published.ok) throw new Error("Draft publication failed (" + published.status + ")");
  console.log(await published.text());
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
