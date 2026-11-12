import { DurableObject } from "cloudflare:workers";
import { infer } from "./ai-router";
import { readContext } from "./github-app";
import type { Env, Task } from "./env";
import type { Agent } from "./guards";

export class Compute extends DurableObject<Env> {
  context(task: Task) {
    return readContext(this.env, task);
  }
  model(task: string, step: string, agent: Agent | "Judge" | "Quick", system: string, input: string) {
    return infer(this.env, task, step, agent, system, input);
  }
}

export function compute(env: Env, task: string) {
  return env.COMPUTE.get(env.COMPUTE.idFromName(task));
}
