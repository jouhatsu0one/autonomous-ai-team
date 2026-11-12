import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import { boundedBody, isSafePath, issueEvent, readJson } from "../worker/guards.ts";
import { verifyBearer, verifyHmac } from "../worker/hmac.ts";

test("verifies the exact GitHub raw body", async () => {
  const raw = new TextEncoder().encode('{"x": 1}');
  const signature = "sha256=" + createHmac("sha256", "secret").update(raw).digest("hex");
  assert.equal(await verifyHmac("secret", raw, signature), true);
  assert.equal(await verifyHmac("secret", new TextEncoder().encode('{"x":1}'), signature), false);
  assert.equal(await verifyHmac("secret", raw, "sha256=no"), false);
});

test("rejects oversized streamed data and accepts the exact limit", async () => {
  const request = (value: string) => new Request("http://localhost", { method: "POST", body: value });
  await assert.rejects(boundedBody(request("12345"), 4), RangeError);
  assert.equal(new TextDecoder().decode(await boundedBody(request("1234"), 4)), "1234");
});

test("authenticates only a correctly formatted strong admin bearer", async () => {
  const token = "0123456789".repeat(4);
  assert.equal(await verifyBearer(token, "Bearer " + token), true);
  assert.equal(await verifyBearer(token, "Bearer " + token + "x"), false);
  assert.equal(await verifyBearer("short", "Bearer short"), false);
  assert.equal(await verifyBearer(token, null), false);
});

test("allows source changes within a narrow existing-file policy", () => {
  assert.equal(isSafePath("src/components/Counter.tsx"), true);
  for (const path of [".github/workflows/deploy.yml", "src/../index.ts", "src/.env.js", "src/app.config.ts", "src/secrets.ts", "package.json"]) {
    assert.equal(isSafePath(path), false, path);
  }
});

test("accepts labeled public issues and rejects private repos and bots", () => {
  const event = { action: "labeled", label: { name: "ai-fix" },
    repository: { full_name: "owner/repo", private: false }, installation: { id: 10 },
    issue: { number: 2, title: "Example", author_association: "NONE" }, sender: { login: "owner", type: "User" } };
  assert.equal(issueEvent.safeParse(event).success, true);
  assert.equal(issueEvent.safeParse({ ...event, repository: { ...event.repository, private: true } }).success, false);
  assert.equal(issueEvent.safeParse({ ...event, sender: { ...event.sender, type: "Bot" } }).success, false);
});

test("accepts JSON or one complete JSON code fence", () => {
  assert.deepEqual(readJson('{"score":70}'), { score: 70 });
  assert.deepEqual(readJson('\x60\x60\x60json\n{"score":70}\n\x60\x60\x60'), { score: 70 });
  assert.throws(() => readJson('invalid'));
});
