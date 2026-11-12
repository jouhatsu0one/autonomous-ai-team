import { DurableObject } from "cloudflare:workers";
import type { Env, Task } from "./env";

const limits = { task: 12, workers: 7500, groq: 75, google: 50, chat: 25, draft: 12 } as const;
type Bucket = keyof typeof limits;

export class Budget extends DurableObject<Env> {
  enqueue(task: Task) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const day = new Date().toISOString().slice(0, 10);
      const previous = await this.ctx.storage.get<{ day: string; tasks: string[] }>("admission");
      const tasks = previous?.day === day ? previous.tasks : [];
      if (tasks.includes(task.id)) return "duplicate";
      if (tasks.length >= limits.task) return "limited";
      await this.env.TASK_QUEUE.send(task);
      await this.ctx.storage.put("admission", { day, tasks: [...tasks, task.id] });
      return "queued";
    });
  }

  async reserve(bucket: Bucket, units = 1) {
    if (!Number.isSafeInteger(units) || units < 1) return false;
    const day = new Date().toISOString().slice(0, 10);
    return this.ctx.storage.transaction(async tx => {
      const current = await tx.get<{ day: string; count: number }>(bucket);
      const used = current?.day === day ? current.count : 0;
      if (used + units > limits[bucket]) return false;
      await tx.put(bucket, { day, count: used + units });
      return true;
    });
  }
}

export function budget(env: Env) {
  return env.BUDGET.get(env.BUDGET.idFromName("daily-quotas"));
}

export function reserve(env: Env, bucket: Bucket, units?: number) {
  return budget(env).reserve(bucket, units);
}
