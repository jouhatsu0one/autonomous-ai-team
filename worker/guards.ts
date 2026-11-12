import { z } from "zod";

export const agents = ["Architect", "Developer", "Security", "Reviewer", "Meta-Improver"] as const;
export const agentSchema = z.enum(agents);
export type Agent = z.infer<typeof agentSchema>;

export const issueEvent = z.object({
  action: z.literal("labeled"),
  label: z.object({ name: z.enum(["ai-fix", "ai-security-review"]) }),
  repository: z.object({ full_name: z.string().max(180), private: z.literal(false) }),
  installation: z.object({ id: z.number().int().positive() }),
  issue: z.object({
    number: z.number().int().positive(),
    title: z.string().max(300),
    author_association: z.string(),
  }),
  sender: z.object({ login: z.string().max(100), type: z.literal("User") }),
});

export const identifier = z.string().regex(/^[a-zA-Z0-9-]{1,100}$/);
export const repositoryName = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
export const safePath = /^(?:src|app|lib|tests?)\/(?:[\w-]+\/)*[\w.-]+\.(?:ts|tsx|js|jsx|css)$/;

export function isSafePath(path: string) {
  return path.length <= 180 && safePath.test(path) &&
    !path.split("/").some(part => part.startsWith(".")) &&
    !/(?:config|lock|secret|credential|token)/i.test(path.split("/").at(-1) ?? "");
}

export async function boundedBody(request: Request, maxBytes: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new RangeError("Body exceeds the configured limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) {
    data.set(chunk, position);
    position += chunk.length;
  }
  return data;
}

export function readJson(text: string): unknown {
  return JSON.parse(text.trim().replace(/^\x60\x60\x60(?:json)?\s*([\s\S]*?)\s*\x60\x60\x60$/i, "$1"));
}
