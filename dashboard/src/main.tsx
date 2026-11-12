import { useEffect, useState, type FormEvent } from "react";
import { Activity, ArrowUpLeft, Bot, Cable, CircleGauge, Command, GitPullRequest, LockKeyhole, MessageSquare, Plus, Radio, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { createRoot } from "react-dom/client";
import "./style.css";

const pages = [
  ["/", "نظرة عامة", CircleGauge], ["/chat", "الدردشة", MessageSquare], ["/governance", "الحوكمة", ShieldCheck],
  ["/improvements", "التطوير الذاتي", Sparkles], ["/connections", "الاتصالات", Cable],
] as const;
const agents = ["Architect", "Developer", "Security", "Reviewer", "Meta-Improver"];
const status: Record<string, string> = { "draft-opened": "مسودة PR", queued: "في الطابور", running: "قيد التنفيذ", reviewed: "تمت المراجعة",
  "awaiting-validation": "بانتظار التحقق", blocked: "محظورة", failed: "فشلت", rejected: "مرفوضة" };
const base = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
type Task = { id: string; title: string; status: string; issue: number; repository: string; result?: string };
type Step = { name: string; input: string; output: string };
type Thread = { id: string; title: string; task_id: string | null };
type Message = { id: number; role: string; agent: string; content: string };
type Policy = { task_id: string; name: string; allowed: number; reason: string };
type Usage = { call_id: string; agent: string; provider: string; model: string; tokens: number | null; outcome: string };
type Improvement = { id: string; proposal: string; status: string };
type Connections = { githubConfigured: boolean; installationUrl: string | null; cloudflareTokenVerified: boolean; inferenceEnabled: boolean };
type Replay = { task: Task; steps: Step[]; policy: Policy[] };

function App() {
  const [token, setToken] = useState("");
  const [draft, setDraft] = useState("");
  const [route, setRoute] = useState(location.pathname);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [palette, setPalette] = useState(false);
  const [filter, setFilter] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [connections, setConnections] = useState<Connections>();
  const [policy, setPolicy] = useState<Policy[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const [replay, setReplay] = useState<Replay>();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [thread, setThread] = useState("");
  const [task, setTask] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [agent, setAgent] = useState(agents[0]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [cloudflareToken, setCloudflareToken] = useState("");

  async function api<T>(path: string, body?: unknown, auth = token): Promise<T> {
    const response = await fetch(base + "/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: "Bearer " + auth, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error ?? "تعذّر الاتصال بالخادم");
    return data as unknown as T;
  }

  const showError = (failure: unknown) => setError(failure instanceof Error ? failure.message : "حدث خطأ");
  function navigate(next: string) {
    if (next !== location.pathname) history.pushState(null, "", next);
    setRoute(next);
    setPalette(false);
    setFilter("");
    setError("");
    setNotice("");
  }

  async function refresh() {
    const [nextTasks, nextConnections] = await Promise.all([api<Task[]>("tasks"), api<Connections>("connections")]);
    setTasks(nextTasks);
    setConnections(nextConnections);
    if (route === "/chat") setThreads(await api<Thread[]>("chat/threads"));
    if (route === "/governance") {
      const [nextPolicy, nextUsage] = await Promise.all([api<Policy[]>("policy"), api<Usage[]>("usage")]);
      setPolicy(nextPolicy);
      setUsage(nextUsage);
    }
    if (route === "/improvements") setImprovements(await api<Improvement[]>("improvements"));
  }

  useEffect(() => {
    if (!token) return;
    void refresh().catch(showError);
    const timer = setInterval(() => void refresh().catch(showError), 30000);
    return () => clearInterval(timer);
  }, [route, token]);

  useEffect(() => {
    function keys(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette(open => !open);
      }
      if (event.key === "Escape") {
        setPalette(false);
        setReplay(undefined);
        setShowToken(false);
      }
    }
    const pop = () => setRoute(location.pathname);
    addEventListener("keydown", keys);
    addEventListener("popstate", pop);
    return () => { removeEventListener("keydown", keys); removeEventListener("popstate", pop); };
  }, []);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const config = await api<Connections>("connections", undefined, draft.trim());
      setConnections(config);
      setToken(draft.trim());
      setDraft("");
    } catch (failure) { showError(failure); }
  }

  async function openThread(item: Thread) {
    try {
      const history = await api<Message[]>("chat/threads/" + item.id);
      setThread(item.id);
      setTask(item.task_id ?? "");
      setMessages(history);
    } catch (failure) { showError(failure); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!message.trim() || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await api<{ thread: string }>("chat", {
        thread: thread || undefined, task: task || undefined, agent, text: message,
      });
      setThread(result.thread);
      setMessage("");
      const [nextMessages, nextThreads] = await Promise.all([
        api<Message[]>("chat/threads/" + result.thread), api<Thread[]>("chat/threads"),
      ]);
      setMessages(nextMessages);
      setThreads(nextThreads);
    } catch (failure) { showError(failure); }
    finally { setPending(false); }
  }

  async function connect(event: FormEvent) {
    event.preventDefault();
    try {
      await api("connections/cloudflare", { token: cloudflareToken.trim() });
      setCloudflareToken("");
      setShowToken(false);
      setNotice("تم التحقق من رمز Cloudflare وحفظه مشفّراً.");
      await refresh();
    } catch (failure) { showError(failure); }
  }

  const page = pages.find(item => item[0] === route);
  const currentTask = tasks.find(item => item.id === task);
  return <div className="shell">
    <aside className="nav">
      <div className="brand"><span className="logo"><Bot size={23}/></span><div><strong>AI Engineering</strong><small>Autonomous Team</small></div></div>
      <nav>{pages.map(([path, label, Icon]) => <button key={path} className={route === path ? "nav-item active" : "nav-item"} onClick={() => navigate(path)}><Icon size={18}/>{label}</button>)}</nav>
      <div className="nav-bottom"><span className="signal"/><span>Cloudflare Edge</span></div>
    </aside>
    <main>
      <header><span>{page?.[1] ?? "مساحة العمل"}</span><div className="top-actions">
        <span className="chip"><span className={connections?.githubConfigured ? "signal" : "signal muted"}/>GitHub</span>
        <span className="chip"><span className={connections?.cloudflareTokenVerified ? "signal" : "signal muted"}/>Cloudflare</span>
        <button className="icon" aria-label="لوحة الأوامر" onClick={() => setPalette(true)}><Command size={16}/> K</button>
      </div></header>
      <div className="content">
        {error && <div className="alert" role="alert">{error}</div>}
        {notice && <div className="notice" role="status">{notice}</div>}
        {!token ? <section className="auth panel">
          <span className="logo"><LockKeyhole size={23}/></span><h1>ادخل إلى مساحة العمل</h1>
          <p>أدخل رمز الإدارة للاتصال بالـ Worker وتهيئة حسابات الفريق.</p>
          <form onSubmit={unlock}><label htmlFor="admin-token">رمز الإدارة</label><input id="admin-token" type="password" autoComplete="off" value={draft} onChange={event => setDraft(event.target.value)} required/><button className="primary">اتصال <ArrowUpLeft size={16}/></button></form>
        </section> : route === "/chat" ? <>
          <h1>الدردشة مع الفريق</h1>
          <div className="workbench">
            <section className="panel preview"><h2>سياق المهمة</h2><select aria-label="المهمة" disabled={Boolean(thread) || pending} value={task} onChange={event => setTask(event.target.value)}><option value="">دردشة عامة</option>{tasks.map(item => <option key={item.id} value={item.id}>#{item.issue} {item.title}</option>)}</select>
              {currentTask && <p>{currentTask.repository}<br/>{status[currentTask.status] ?? currentTask.status}</p>}</section>
            <section className="panel conversation">
              <div className="chat-top"><Bot size={20}/><select aria-label="الوكيل" value={agent} disabled={pending} onChange={event => setAgent(event.target.value)}>{agents.map(name => <option key={name}>{name}</option>)}</select></div>
              <div className="messages" aria-live="polite">{messages.length === 0 && <p className="empty">ابدأ المحادثة بسؤال للفريق.</p>}
                {messages.map(item => <article key={item.id} className={item.role === "user" ? "message user" : "message"}><small>{item.role === "user" ? "أنت" : item.agent}</small><p>{item.content}</p></article>)}
                {pending && <p className="empty">يجري إعداد الرد…</p>}</div>
              <form className="composer" onSubmit={send}><textarea aria-label="رسالتك" placeholder="اكتب رسالتك…" rows={2} maxLength={2000} value={message} onChange={event => setMessage(event.target.value)}/><button className="primary" disabled={pending || !message.trim()}>إرسال</button></form>
            </section>
            <section className="panel threads"><h2>المحادثات</h2><button disabled={pending} onClick={() => {setThread(""); setTask(""); setMessages([]); setMessage("");}}><Plus size={16}/> محادثة جديدة</button>
              {threads.map(item => <button key={item.id} disabled={pending} className={item.id === thread ? "selected" : ""} onClick={() => void openThread(item)}>{item.title}</button>)}</section>
          </div>
        </> : route === "/connections" ? <>
          <h1>الاتصالات</h1><div className="cards">
            <section className="panel card"><GitPullRequest/><h2>GitHub App</h2><p>{connections?.githubConfigured ? "بيانات التطبيق مضبوطة في Worker" : "أضف بيانات GitHub App إلى Worker"}</p>{connections?.installationUrl && <a className="button primary" href={connections.installationUrl} target="_blank" rel="noreferrer">تثبيت التطبيق <ArrowUpLeft size={16}/></a>}</section>
            <section className="panel card"><Cable/><h2>Cloudflare</h2><p>{connections?.cloudflareTokenVerified ? "تم التحقق من الرمز عند الحفظ" : "أضف رمز API محدود الصلاحيات"}</p><button className="primary" onClick={() => setShowToken(true)}>إضافة رمز</button></section>
            <section className="panel card"><Activity/><h2>AI Gateway</h2><p>{connections?.inferenceEnabled ? "تمكين الاستدعاءات مضبوط في Worker" : "في انتظار التحقق من الخطط المجانية"}</p></section>
          </div>
        </> : route === "/governance" ? <>
          <h1>الحوكمة</h1><section className="panel records"><h2>قرارات السياسة</h2>
            {policy.length === 0 && <p className="empty">لا توجد قرارات مسجلة.</p>}
            {policy.map(item => <div className="record" key={item.task_id + item.name}><strong>{item.name}</strong><span>{item.reason}</span><span className="chip">{item.allowed ? "مسموح" : "محظور"}</span></div>)}</section>
          <section className="panel records"><h2>استهلاك النماذج</h2>
            {usage.length === 0 && <p className="empty">لا توجد استدعاءات مسجلة.</p>}
            {usage.map(item => <div className="record" key={item.call_id}><strong>{item.agent}</strong><span dir="ltr">{item.provider} · {item.model}</span><span className="chip">{item.tokens ?? "—"} tokens · {item.outcome}</span></div>)}</section>
        </> : route === "/improvements" ? <>
          <h1>التطوير الذاتي</h1><section className="panel records"><h2>مقترحات Meta-Improver</h2>{improvements.length === 0 && <p className="empty">لا توجد مقترحات مسجلة.</p>}
            {improvements.map(item => <article className="message" key={item.id}><small>{item.status}</small><p>{item.proposal}</p></article>)}</section>
        </> : <>
          <div className="title-row"><div><h1>غرفة العمليات</h1><p>تابع مهام GitHub وقرارات الفريق الهندسي.</p></div><button onClick={() => void refresh().catch(showError)}><RefreshCw size={17}/> تحديث</button></div>
          <div className="cards metrics">
            <section className="panel card"><GitPullRequest/><span>المهام المعروضة</span><strong>{tasks.length}</strong></section>
            <section className="panel card"><Radio/><span>قيد المعالجة</span><strong>{tasks.filter(item => ["queued", "running"].includes(item.status)).length}</strong></section>
            <section className="panel card"><ShieldCheck/><span>بانتظار التحقق</span><strong>{tasks.filter(item => item.status === "awaiting-validation").length}</strong></section>
          </div>
          <section className="panel records"><h2>مهام GitHub</h2>{!tasks.length && <p className="empty">تظهر المهام هنا عندما يضيف مشرف المستودع التصنيف ai-fix أو ai-security-review.</p>}
            {tasks.map(item => <div className="record" key={item.id}><strong>#{item.issue} {item.title}</strong><span className="chip">{status[item.status] ?? item.status}</span>
              <button onClick={() => void api<Replay>("replay/" + item.id).then(setReplay).catch(showError)}>Replay</button></div>)}</section>
        </>}
      </div>
    </main>
    {palette && <div className="overlay" onClick={() => setPalette(false)}><section className="dialog panel" role="dialog" aria-modal="true" aria-label="لوحة الأوامر" onClick={event => event.stopPropagation()}>
      <input autoFocus placeholder="ابحث عن صفحة…" value={filter} onChange={event => setFilter(event.target.value)}/>{pages.filter(([path, label]) => (path + label).includes(filter)).map(([path, label, Icon]) =>
        <button key={path} onClick={() => navigate(path)}><Icon size={18}/>{label}</button>)}</section></div>}
    {showToken && <div className="overlay"><form className="dialog panel" onSubmit={connect} role="dialog" aria-modal="true" aria-label="رمز Cloudflare">
      <h2>ربط Cloudflare</h2>{error && <p className="alert">{error}</p>}<input type="password" autoFocus aria-label="API Token" autoComplete="off" value={cloudflareToken} onChange={event => setCloudflareToken(event.target.value)} required/>
      <button className="primary">تحقق وحفظ</button><button type="button" onClick={() => {setCloudflareToken(""); setShowToken(false);}}>إلغاء</button></form></div>}
    {replay && <div className="overlay"><section className="dialog panel wide" role="dialog" aria-modal="true" aria-label="Replay">
      <h2>Replay · #{replay.task.issue}</h2><p>{replay.task.title}</p>{replay.steps.map(item => <details key={item.name}><summary>{item.name}</summary><h3>المدخلات</h3><pre>{item.input}</pre><h3>المخرجات</h3><pre>{item.output}</pre></details>)}
      {!replay.steps.length && <p>لا توجد خطوات محفوظة.</p>}{replay.policy.map(item => <p key={item.name}>{item.name} · {item.reason}</p>)}<button onClick={() => setReplay(undefined)}>إغلاق</button></section></div>}
  </div>;
}

createRoot(document.getElementById("root")!).render(<App/>);
