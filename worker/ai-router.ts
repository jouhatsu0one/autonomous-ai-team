import type { Env } from "./env";
import type { Agent } from "./guards";
import { reserve } from "./budget";

const models = {
  Architect: ["@cf/openai/gpt-oss-120b", 32, 69],
  Developer: ["@cf/qwen/qwen2.5-coder-32b-instruct", 60, 91],
  Security: ["@cf/zai-org/glm-4.7-flash", 6, 37],
  Reviewer: ["@cf/google/gemma-4-26b-a4b-it", 10, 28],
  "Meta-Improver": ["@cf/ibm-granite/granite-4.0-h-micro", 2, 11],
  Judge: ["@cf/openai/gpt-oss-20b", 19, 28],
  Quick: ["@cf/meta/llama-3.1-8b-instruct-fp8-fast", 5, 35],
} as const;

export async function infer(env: Env, task: string, step: string, agent: Agent | "Judge" | "Quick", system: string, input: string) {
  if (env.FREE_PROVIDERS_VERIFIED !== "true" || !env.AI_GATEWAY_TOKEN || !env.WORKERS_AI_API_TOKEN || !env.GROQ_API_KEY ||
      !env.GOOGLE_AI_STUDIO_KEY || !/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID) ||
      !/^[a-z0-9-]+$/.test(env.AI_GATEWAY_ID)) {
    throw new Error("Free-only provider setup has not been verified");
  }
  const [model, inputRate, outputRate] = models[agent];
  const maxTokens = agent === "Developer" ? 1800 : 650;
  const safeInput = input.slice(0, 13500);
  const messages = [{ role: "system", content: system }, { role: "user", content: safeInput }];
  const metadata = { task_id: task, agent_name: agent, step_name: step };
  const base = "https://gateway.ai.cloudflare.com/v1/" + env.CLOUDFLARE_ACCOUNT_ID + "/" + env.AI_GATEWAY_ID;
  const headers = {
    "content-type": "application/json",
    "cf-aig-authorization": "Bearer " + env.AI_GATEWAY_TOKEN,
    "cf-aig-metadata": JSON.stringify(metadata),
    "cf-aig-skip-cache": "true",
    "cf-aig-collect-log-payload": "false",
    "cf-aig-require-provider-credentials": "true",
  };
  const request = async (url: string, extra: Record<string, string>, body: unknown) => {
    const response = await fetch(url, {
      method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify(body),
      redirect: "error", signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error("Gateway returned " + response.status);
    return response.json();
  };
  const candidates = [
    { bucket: "workers", name: model, units: Math.ceil(((new TextEncoder().encode(system + safeInput).length + 200) * inputRate + maxTokens * outputRate) / 1000),
      run: async () => {
        const endpoint = "https://api.cloudflare.com/client/v4/accounts/" + env.CLOUDFLARE_ACCOUNT_ID + "/ai/v1/chat/completions";
        const result = await request(endpoint, {
          authorization: "Bearer " + env.WORKERS_AI_API_TOKEN, "cf-aig-gateway-id": env.AI_GATEWAY_ID,
        }, { model, messages, max_tokens: maxTokens }) as {
          choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number };
        };
        return { text: result.choices?.[0]?.message?.content, tokens: result.usage?.total_tokens };
      } },
    { bucket: "groq", name: "llama-3.3-70b-versatile", units: 1,
      run: async () => {
        const result = await request(base + "/groq/chat/completions", { authorization: "Bearer " + env.GROQ_API_KEY }, {
          model: "llama-3.3-70b-versatile", messages, max_completion_tokens: maxTokens,
        }) as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } };
        return { text: result.choices?.[0]?.message?.content, tokens: result.usage?.total_tokens };
      } },
    { bucket: "google", name: "gemini-2.5-flash-lite", units: 1,
      run: async () => {
        const result = await request(base + "/google-ai-studio/v1beta/models/gemini-2.5-flash-lite:generateContent",
          { "x-goog-api-key": env.GOOGLE_AI_STUDIO_KEY! }, {
            systemInstruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: safeInput }] }],
            generationConfig: { maxOutputTokens: maxTokens },
          }) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]; usageMetadata?: { totalTokenCount?: number } };
        return { text: result.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text ?? "").join(""),
          tokens: result.usageMetadata?.totalTokenCount };
      } },
  ] as const;
  for (const provider of candidates) {
    if (agent === "Judge" && provider.bucket === "groq") continue;
    if (agent === "Judge" && provider.bucket === "google") continue;
    if (!await reserve(env, provider.bucket, provider.units)) continue;
    const callId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO cost_ledger(call_id,task_id,step_name,agent,model,provider,outcome) VALUES(?,?,?,?,?,?,?)")
      .bind(callId, task, step, agent, provider.name, provider.bucket, "started").run();
    let result: { text?: string; tokens?: number } | undefined;
    try {
      result = await provider.run();
    } catch {
      await env.DB.prepare("UPDATE cost_ledger SET outcome = 'provider_error' WHERE call_id = ?").bind(callId).run();
      continue;
    }
    await env.DB.prepare("UPDATE cost_ledger SET tokens=?,outcome=? WHERE call_id=?")
      .bind(result.tokens ?? null, result.text?.trim() ? "completed" : "empty", callId).run();
    if (result.text?.trim()) return result.text.trim().slice(0, 16000);
  }
  throw new Error("Free inference budget exhausted or providers unavailable");
}
