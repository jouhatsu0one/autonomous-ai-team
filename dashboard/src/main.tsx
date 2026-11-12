import { useEffect, useState, type FormEvent } from "react";
import { Activity, ArrowUpLeft, Bot, Cable, CircleGauge, Command, GitPullRequest, LockKeyhole, MessageSquare, Plus, Radio, RefreshCw, ShieldCheck, Sparkles, Boxes, ChevronLeft, Cloud, Code2, Database, Eye, ListFilter, Search, Terminal, X } from "lucide-react";
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

const examples: Task[] = [
  { id: "sample-1", title: "إصلاح التحقق من توقيع Webhook", repository: "example/edge-api", issue: 42, status: "awaiting-validation" },
  { id: "sample-2", title: "تحديث معالجة أخطاء الاتصال بقاعدة البيانات", repository: "example/data-worker", issue: 38, status: "running" },
  { id: "sample-3", title: "مراجعة إعدادات النشر وحماية الفرع", repository: "example/edge-api", issue: 35, status: "draft-opened" },
  { id: "sample-4", title: "فحص تبعيات لوحة التحكم", repository: "example/dashboard", issue: 31, status: "queued" },
];

const team = [
  [Boxes, "Architect", "تخطيط التغيير"],
  [Code2, "Developer", "اقتراح الكود"],
  [ShieldCheck, "Security", "فحص المخاطر"],
  [Eye, "Reviewer", "مراجعة النتائج"],
  [Sparkles, "Meta-Improver", "تحسين سير العمل"],
] as const;
const activeStates = ["running", "queued"];

function App() {
  const [token, setToken] = useState("");
  const [draft, setDraft] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authPending, setAuthPending] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskState, setTaskState] = useState("");
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
        setAuthOpen(false);
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
    if (authPending || !draft.trim()) return;
    setError("");
    setAuthPending(true);
    try {
      const config = await api<Connections>("connections", undefined, draft.trim());
      setConnections(config);
      setToken(draft.trim());
      setDraft("");
      setAuthOpen(false);
    } catch (failure) {
      if (failure instanceof TypeError || failure instanceof SyntaxError) setError("تعذّر الوصول إلى Worker. تحقق من نشره وإعداد عنوان الواجهة.");
      else showError(failure);
    } finally {
      setAuthPending(false);
    }
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
  const visibleTasks = token ? tasks : examples;
  const filteredTasks = visibleTasks.filter(item => {
    const searchable = [item.title, item.repository, String(item.issue)].join(" ").toLowerCase();
    return (!taskState || taskState === item.status) && searchable.includes(taskSearch.trim().toLowerCase());
  });
  const metrics = [
    [GitPullRequest, "إجمالي المهام", visibleTasks.length, "violet"],
    [Radio, "قيد المعالجة", visibleTasks.filter(item => activeStates.includes(item.status)).length, "blue"],
    [ShieldCheck, "بانتظار التحقق", visibleTasks.filter(item => item.status === "awaiting-validation").length, "amber"],
    [GitPullRequest, "مسودات PR", visibleTasks.filter(item => item.status === "draft-opened").length, "green"],
  ] as const;

  function openAuth() {
    setError("");
    setAuthOpen(true);
  }

  function openReplay(item: Task) {
    if (token) {
      void api<Replay>("replay/" + item.id).then(setReplay).catch(showError);
      return;
    }
    setReplay({ task: item, policy: [], steps: [{ name: "معاينة سجل المهمة", input: item.repository + " #" + item.issue, output: status[item.status] }] });
  }

  return <div className="shell">
    <aside className="nav">
      <button className="brand" onClick={() => navigate("/")} aria-label="CF-Agents، نظرة عامة"><span className="logo"><Boxes size={23}/></span><span><strong dir="ltr">CF-Agents</strong><small>منصة الفريق الهندسي</small></span></button>
      <nav aria-label="التنقل الرئيسي">{pages.map(([path, label, Icon]) => <button key={path} className={route === path ? "nav-item active" : "nav-item"} aria-current={route === path ? "page" : undefined} onClick={() => navigate(path)}><Icon size={18}/><span>{label}</span>{route === path && <ChevronLeft size={15} className="nav-arrow"/>}</button>)}</nav>
      <div className="nav-bottom"><Cloud size={18}/><span>Cloudflare Pages</span></div>
    </aside>
    <main>
      <header className="topbar"><div className="breadcrumb"><span>مساحة العمل</span><ChevronLeft size={14}/><strong>{page?.[1] ?? "نظرة عامة"}</strong></div><div className="top-actions">
        {token && <div className="integration-status">
          <span title={connections?.githubConfigured ? "GitHub متصل" : "GitHub غير مهيأ"}><i className={connections?.githubConfigured ? "connected" : ""}/>GitHub</span>
          <span title={connections?.cloudflareTokenVerified ? "Cloudflare متصل" : "Cloudflare غير مهيأ"}><i className={connections?.cloudflareTokenVerified ? "connected" : ""}/>Cloudflare</span>
        </div>}
        <button className="command-button" aria-label="لوحة الأوامر" onClick={() => setPalette(true)}><Search size={16}/><span>بحث سريع</span><kbd dir="ltr"><Command size={12}/> K</kbd></button>
        {!token && <button className="top-login" onClick={openAuth}><LockKeyhole size={15}/> دخول الإدارة</button>}
        {token && <button className="top-login" onClick={() => navigate("/connections")}><Cable size={15}/> الاتصالات</button>}
      </div></header>
      <div className="content">
        {error && !authOpen && !showToken && <div className="alert" role="alert">{error}</div>}
        {notice && <div className="notice" role="status">{notice}</div>}
        {!token && route !== "/" ? <section className="panel gated">
          <span className="logo"><LockKeyhole size={23}/></span><h1>{page?.[1] ?? "مساحة العمل"}</h1>
          <p>سجّل الدخول لعرض بيانات المشروع واستخدام هذه الصفحة.</p>
          <button className="primary" onClick={openAuth}>دخول الإدارة <ArrowUpLeft size={16}/></button>
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
          <section className="hero">
            <div className="hero-copy">
              <span className="mode"><span className="signal"/>{token ? "مساحة العمل" : "معاينة · بيانات تجريبية"}</span>
              <h1>غرفة العمليات</h1>
              <p>تابع مهام GitHub من استقبال المشكلة إلى مراجعة الإصلاح وفتح مسودة Pull Request.</p>
              <div className="hero-actions">
                <button className="primary" onClick={token ? () => navigate("/chat") : openAuth}>{token ? <MessageSquare size={17}/> : <LockKeyhole size={17}/>} {token ? "دردشة الفريق" : "دخول الإدارة"}</button>
                <button className="hero-secondary" onClick={token ? () => void refresh().catch(showError) : () => document.getElementById("task-list")?.scrollIntoView({ behavior: "smooth" })}>{token ? <RefreshCw size={16}/> : <ListFilter size={16}/>} {token ? "تحديث البيانات" : "استعراض المهام"}</button>
              </div>
            </div>
            <div className="hero-visual" aria-hidden="true">
              <div className="orbital ring-one"/><div className="orbital ring-two"/><div className="orbital ring-three"/>
              <div className="hero-core"><Boxes size={49} strokeWidth={1.35}/></div>
              <span className="orbit-node node-git"><GitPullRequest size={23}/></span>
              <span className="orbit-node node-cloud"><Cloud size={23}/></span>
              <span className="orbit-node node-db"><Database size={21}/></span>
              <span className="orbit-node node-code"><Terminal size={21}/></span>
            </div>
          </section>
          <div className="metrics">
            {metrics.map(([Icon, label, count, color]) => <section className={"panel metric " + color} key={label}>
              <span className="metric-icon"><Icon size={18}/></span><div><p>{label}</p><strong>{count}</strong></div>
            </section>)}
          </div>
          <div className="overview-grid">
            <section className="panel tasks-panel" id="task-list">
              <div className="section-heading"><div><h2>مهام GitHub</h2><p>{token ? "أحدث المهام من المستودع المتصل" : "أمثلة توضح حالات المهام داخل المنصة"}</p></div><span className="section-icon"><GitPullRequest size={19}/></span></div>
              <div className="filters">
                <label className="task-search"><Search size={16}/><input aria-label="بحث في المهام" placeholder="ابحث بالعنوان أو المستودع…" value={taskSearch} onChange={event => setTaskSearch(event.target.value)}/></label>
                <select aria-label="تصفية بحسب الحالة" value={taskState} onChange={event => setTaskState(event.target.value)}><option value="">كل الحالات</option>{Object.entries(status).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              </div>
              {filteredTasks.length ? <ul className="task-items">{filteredTasks.map(item => <li className="task-item" key={item.id}>
                <span className="task-icon"><GitPullRequest size={17}/></span>
                <div className="task-label"><strong>{item.title}</strong><small dir="ltr">{item.repository} · #{item.issue}</small></div>
                <span className={"chip task-status state-" + item.status}>{status[item.status] ?? item.status}</span>
                <button className="task-detail" aria-label={"سجل المهمة " + item.issue} title="عرض سجل المهمة" onClick={() => openReplay(item)}><ChevronLeft size={17}/></button>
              </li>)}</ul> : <div className="empty"><GitPullRequest size={24}/><p>{visibleTasks.length ? "لا توجد مهام تطابق البحث." : "ستظهر المهام عند إضافة التصنيف ai-fix أو ai-security-review في GitHub."}</p></div>}
            </section>
            <section className="panel team-panel">
              <div className="section-heading"><div><h2>الفريق الهندسي</h2><p>أدوار الوكلاء في سير العمل</p></div><span className="section-icon"><Bot size={20}/></span></div>
              <ul className="team-items">{team.map(([Icon, name, role]) => <li key={name}><span className="agent-icon"><Icon size={17}/></span><div><strong dir="ltr">{name}</strong><small>{role}</small></div></li>)}</ul>
            </section>
          </div>
        </>}
      </div>
    </main>
    {authOpen && <div className="overlay" onClick={() => setAuthOpen(false)}><form className="dialog panel" onSubmit={unlock} role="dialog" aria-modal="true" aria-labelledby="admin-heading" onClick={event => event.stopPropagation()}>
      <div className="section-heading"><span className="logo"><LockKeyhole size={22}/></span><button type="button" className="icon-button" aria-label="إغلاق" onClick={() => setAuthOpen(false)}><X size={18}/></button></div>
      <div><h2 id="admin-heading">دخول الإدارة</h2><p>أدخل رمز الإدارة للوصول إلى بيانات مشروعك.</p></div>
      {error && <p className="alert" role="alert">{error}</p>}
      <label htmlFor="admin-token">رمز الإدارة</label>
      <input id="admin-token" type="password" autoFocus autoComplete="off" value={draft} onChange={event => setDraft(event.target.value)} required/>
      <button className="primary" disabled={authPending}>{authPending ? "جارٍ الاتصال…" : "اتصال"}</button>
    </form></div>}
    {palette && <div className="overlay" onClick={() => setPalette(false)}><section className="dialog panel" role="dialog" aria-modal="true" aria-label="لوحة الأوامر" onClick={event => event.stopPropagation()}>
      <input autoFocus aria-label="ابحث عن صفحة" placeholder="ابحث عن صفحة…" value={filter} onChange={event => setFilter(event.target.value)}/>{pages.filter(([path, label]) => (path + label).includes(filter)).map(([path, label, Icon]) =>
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
