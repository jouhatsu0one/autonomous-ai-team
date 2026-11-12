CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, repository TEXT NOT NULL, issue INTEGER NOT NULL,
  title TEXT NOT NULL, flow TEXT NOT NULL, status TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, result TEXT
);
CREATE INDEX IF NOT EXISTS tasks_recent ON tasks(created_at DESC);
CREATE TABLE IF NOT EXISTS steps (
  task_id TEXT NOT NULL, name TEXT NOT NULL, input TEXT NOT NULL,
  output TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(task_id,name)
);
CREATE TABLE IF NOT EXISTS cost_ledger (
  call_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, step_name TEXT NOT NULL,
  agent TEXT NOT NULL, model TEXT NOT NULL, provider TEXT NOT NULL,
  tokens INTEGER, cost_usd REAL NOT NULL DEFAULT 0, outcome TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cost_recent ON cost_ledger(created_at DESC);
CREATE TABLE IF NOT EXISTS policy_decisions (
  task_id TEXT NOT NULL, name TEXT NOT NULL, allowed INTEGER NOT NULL,
  reason TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(task_id,name)
);
CREATE INDEX IF NOT EXISTS policy_recent ON policy_decisions(created_at DESC);
CREATE TABLE IF NOT EXISTS agent_memory (
  id TEXT PRIMARY KEY, repository TEXT NOT NULL, keywords TEXT NOT NULL, pattern TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS memory_recent ON agent_memory(repository,created_at DESC);
CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, task_id TEXT REFERENCES tasks(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT NOT NULL REFERENCES chat_threads(id),
  role TEXT NOT NULL, agent TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS chat_by_thread ON chat_messages(thread_id,id);
CREATE TABLE IF NOT EXISTS improvement_proposals (
  id TEXT PRIMARY KEY, proposal TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'proposed',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS improvement_attempts (
  id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL REFERENCES improvement_proposals(id),
  regression_result TEXT, benchmark_result TEXT, human_approval INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS connections (
  provider TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, iv TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS github_installations (
  id TEXT PRIMARY KEY, repository TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
