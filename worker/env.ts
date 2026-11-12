import type { Compute } from "./compute";
import type { Budget } from "./budget";
export interface Task {
  id: string;
  repository: string;
  issue: number;
  title: string;
  actor: string;
  flow: "repair" | "security-only-review";
}
export interface Env {
  DB: D1Database;
  TASK_QUEUE: Queue<Task>;
  FIX: Workflow<Task>;
  IMPROVE: Workflow<{ id: string }>;
  BUDGET: DurableObjectNamespace<Budget>;
  COMPUTE: DurableObjectNamespace<Compute>;
  AI_GATEWAY_ID: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  DASHBOARD_ORIGIN: string;
  ALLOWED_REPOSITORY: string;
  GITHUB_APP_INSTALLATION_ID: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_APP_SLUG?: string;
  WEBHOOK_SECRET?: string;
  ADMIN_TOKEN?: string;
  ENCRYPTION_KEY?: string;
  AI_GATEWAY_TOKEN?: string;
  WORKERS_AI_API_TOKEN?: string;
  VALIDATION_SECRET?: string;
  GROQ_API_KEY?: string;
  GOOGLE_AI_STUDIO_KEY?: string;
  FREE_PROVIDERS_VERIFIED: string;
}
