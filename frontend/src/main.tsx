import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bot, Building2, CheckCircle2, ChevronsLeft, ChevronsRight, Contact, Copy, FileText, Lightbulb, Loader2, LogOut, MessageSquare, Plus, RefreshCw, Search, Send, Settings, Upload, Users, Workflow, X } from "lucide-react";
import "./styles.css";

type User = { id: string; email: string; name: string; role: "platform_admin" | "merchant_admin" | "merchant_operator"; merchantId: string | null };
type Merchant = { id: string; name: string; status: string };
type Conversation = { id: string; merchantId: string; countryId: string; countryCode: string; countryName: string; customerPhone: string; a2cAccountPhone: string; nickname: string; language: string; stage: string; flowStep?: string; extractedPhone: string; extractedTelegram: string; extractedWhatsApp: string; status: string; handoffStatus: string; unreadCount: number };
type Customer = { id: number; merchantId: string; countryId: string; countryCode: string; countryName: string; customerKey: string; nickname: string; firstA2CAccountPhone: string; lastA2CAccountPhone: string; language: string; stage: string; extractedPhone: string; extractedTelegram: string; extractedWhatsApp: string; status: string; conversationCount: number; lastConversationId: string; firstSeenAt: string; lastSeenAt: string };
type Sample = { id: number; customerMessage: string; standardReply: string; stage: string; intent: string; language: string; keywords: string; priority: number; enabled?: boolean };
type Knowledge = { id: number; merchantId: string; type: string; title: string; content: string; language: string; priority: number; enabled: boolean };
type CustomerMemory = { id: number; summary: string; facts: Record<string, unknown>; operatorNotes: string; updatedAt: string };
type TrainingMaterial = { id: number; merchantId: string; sourceType: string; filename: string; status: string; itemCount: number; sampleCount: number; knowledgeCount: number; warnings: string[]; createdAt: string; rawText?: string };
type TrainingMaterialItem = { id: number; kind: string; title: string; content: string; intent: string; stage: string; language: string; enabled: boolean };
type A2CAccount = { id: number; merchantId: string; countryId: string; countryCode: string; countryName: string; defaultLanguage: string; apiPhone: string; wabaId: string; status: number; numberStatus: number; qualityRating: number; messagingLimit: number; verifiedName: string; enabled: boolean; syncedAt: string };
type InviteCode = { id: number; merchantId: string; countryId: string; countryName: string; a2cAccountId: number; a2cAccountPhone: string; code: string; registerUrl: string; status: string; assignedCustomerKey: string; assignedConversationId: string; platformAccount: string; assignedAt: string; usedAt: string; createdAt: string; updatedAt: string };
type MerchantCountry = { id: string; merchantId: string; code: string; name: string; defaultLanguage: string; platformRegisterUrl: string; tgRegisterGuideUrl: string; requirePlatformAccount: boolean; requirePhone: boolean; requireTelegram: boolean; requireWhatsApp: boolean; status: string };
type ScriptFlow = { id: number; merchantId: string; countryId: string; countryName: string; name: string; status: string; active: boolean; version: number; sourceFilename: string; stepCount: number; createdAt: string; updatedAt: string };
type ScriptFlowStep = { id: number; flowId: number; flowCode: string; flowName: string; flowStep: string; goal: string; triggerCondition: string; customerExpressions: string; standardReply: string; collectInfo: string; sendLink: boolean; sendInvite: boolean; nextCondition: string; nextFlowCode: string; nextFlowStep: string; forbidden: string; notes: string; sortOrder: number; enabled: boolean };
type ScriptFlowVersion = { id: number; flowId: number; version: number; note: string; createdBy: string; createdAt: string };
type IntentLearningEvent = { id: number; merchantId: string; countryId: string; conversationId: string; messageId: number | null; candidateKey: string; suggestedIntent: string; displayName: string; description: string; customerText: string; language: string; detectedIntent: string; inferredIntent: string; contextualIntent: string; flowStep: string; status: "candidate" | "reviewed" | "ignored" | "promoted"; occurrenceCount: number; examples: Array<Record<string, unknown>>; lastSeenAt: string; createdAt: string; updatedAt: string };
type UnreadSummary = { a2cAccountPhone: string; unreadCount: number; conversations: Array<{ conversationId: string; customerPhone: string; unreadCount: number }> };
type ChatMessage = { id: number; direction: string; content: string; msgType: string; language: string; intent: string; createdAt: string; rawPayload?: { originalContent?: string; translatedContent?: string; targetLanguage?: string; translationStatus?: "translated" | "skipped" | "failed"; translationError?: string; operatorTranslatedContent?: string; operatorTranslationTargetLanguage?: string; operatorTranslationStatus?: "translated" | "skipped" | "failed"; operatorTranslationError?: string; manual?: boolean; replyMode?: "strict_flow" | "gemini" | "fallback" | "manual"; strictFlow?: boolean; strictFlowEnabled?: boolean; strictFlowStep?: string; a2cSendStatus?: string; a2cSendError?: string } };
type AgentProfile = { merchantId: string; agentName: string; roleDefinition: string; toneStyle: string; coreGoal: string; mustFollow: string; forbidden: string; uncertaintyPolicy: string; handoffPolicy: string; enabled: boolean; updatedAt: string };
type ConversationReviewItem = { id: number; reviewId: number; itemType: "sample" | "knowledge"; title: string; content: string; status: "candidate" | "applied" | "ignored"; appliedTargetType: string; appliedTargetId: string };
type ConversationReview = { id: number; score: number; goalCompleted: boolean; summary: string; mainConcerns: string[]; mistakes: string[]; goodReplies: string[]; suggestedSamples: Array<Record<string, unknown>>; suggestedKnowledge: Array<Record<string, unknown>>; improvementActions: string[]; status: string; updatedAt: string };
type ConversationReviewResponse = { review: ConversationReview | null; items: ConversationReviewItem[] };
type SimulatorResponse = { status: string; conversation?: Conversation; rows: ChatMessage[] };
type ConfigCheck = { key: string; label: string; ok: boolean; status: "ok" | "missing" | "error" | "waiting"; detail: string };
type Filters = Record<string, string>;
type Toast = { id: number; type: "success" | "error" | "info"; title: string; detail?: string };

let emitToast: (toast: Omit<Toast, "id">) => void = () => undefined;

function notify(type: Toast["type"], title: string, detail?: string) {
  emitToast({ type, title, detail });
}

const MESSAGE_TYPE_OPTIONS = [
  { value: "text", label: "文本" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
  { value: "document", label: "文件" }
];

const COUNTRY_PRESETS = [
  { name: "巴西", aliases: ["brazil", "br"], code: "br", defaultLanguage: "pt-BR" },
  { name: "菲律宾", aliases: ["philippines", "ph"], code: "ph", defaultLanguage: "en" },
  { name: "日本", aliases: ["japan", "jp"], code: "jp", defaultLanguage: "ja" },
  { name: "泰国", aliases: ["thailand", "th"], code: "th", defaultLanguage: "th" },
  { name: "越南", aliases: ["vietnam", "vn"], code: "vn", defaultLanguage: "vi" },
  { name: "印尼", aliases: ["indonesia", "id", "印度尼西亚"], code: "id", defaultLanguage: "id" },
  { name: "马来西亚", aliases: ["malaysia", "my"], code: "my", defaultLanguage: "ms" },
  { name: "中国", aliases: ["china", "cn"], code: "cn", defaultLanguage: "zh" },
  { name: "美国", aliases: ["united states", "usa", "us", "america"], code: "us", defaultLanguage: "en" },
  { name: "玻利维亚", aliases: ["bolivia", "bo"], code: "bo", defaultLanguage: "es" },
  { name: "墨西哥", aliases: ["mexico", "mx"], code: "mx", defaultLanguage: "es" },
  { name: "西班牙", aliases: ["spain", "es"], code: "es", defaultLanguage: "es" }
];
const BEIJING_TIME_ZONE = "Asia/Shanghai";

const STRICT_STEP_OPTIONS = [
  "interest_screening",
  "registration_intent",
  "wait_registration",
  "telegram_confirm",
  "telegram_download",
  "collect_telegram",
  "human_handoff",
  "ended"
];

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = { ...(options.body === undefined ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) throw new Error(translateSystemMessage((await response.json().catch(() => ({}))).error || response.statusText));
  return response.json() as Promise<T>;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => window.location.hash.replace("#", "") || window.localStorage.getItem("a2c_view") || "dashboard");

  useEffect(() => {
    api<{ user: User }>("/api/auth/me").then((res) => setUser(res.user)).catch(() => null).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    window.localStorage.setItem("a2c_view", view);
    if (window.location.hash.replace("#", "") !== view) window.history.replaceState(null, "", `#${view}`);
  }, [user, view]);

  if (loading) return <Shell><ToastHost /><div className="boot-screen"><Loader2 size={22} className="spin" />正在进入后台...</div></Shell>;
  if (!user) return <><ToastHost /><Login onLogin={setUser} /></>;
  return <><ToastHost /><Portal user={user} view={view} setView={setView} onLogout={() => setUser(null)} /></>;
}

function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    emitToast = (toast) => {
      const id = Date.now() + Math.random();
      setItems((current) => [...current, { ...toast, id }].slice(-4));
      window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 3600);
    };
    return () => { emitToast = () => undefined; };
  }, []);
  return <div className="toast-host">{items.map((item) => <article key={item.id} className={`toast ${item.type}`}><strong>{item.title}</strong>{item.detail && <p>{item.detail}</p>}<button className="ghost icon-only" onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))}><X size={15}/></button></article>)}</div>;
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("Admin123456");
  const [error, setError] = useState("");
  return (
    <Shell>
      <main className="login">
        <section className="login-panel">
          <div className="brand-lockup"><span>AI</span><div><h1>A2C AI 自动客服</h1><p>平台管理端 / 商户端</p></div></div>
          <label>邮箱<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>密码<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error && <div className="error">{error}</div>}
          <button className="primary wide" onClick={async () => {
            try {
              const res = await api<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
              onLogin(res.user);
            } catch (err) {
              setError(err instanceof Error ? err.message : "登录失败");
            }
          }}>登录</button>
          <small>首次登录默认账号由系统环境配置提供。</small>
        </section>
      </main>
    </Shell>
  );
}

function Portal({ user, view, setView, onLogout }: { user: User; view: string; setView: (v: string) => void; onLogout: () => void }) {
  const merchantTrainingViews = ["materials", "knowledge", "samples"];
  const nav = user.role === "platform_admin"
    ? [["dashboard", "总览", Bot], ["merchants", "商户", Building2], ["users", "后台账号", Users], ["config", "配置", Settings], ["agentProfile", "Agent配置", Bot], ["customers", "客户", Contact], ["scriptFlows", "话本流程", Workflow], ["intentLearning", "意图学习", Lightbulb], ["materials", "素材", FileText], ["knowledge", "知识库", Workflow], ["samples", "样本", Upload], ["conversations", "会话", MessageSquare], ["handoffs", "接管", Workflow]]
    : [["dashboard", "总览", Bot], ["training", "训练中心", Upload], ["simulator", "模拟训练", MessageSquare], ["agentProfile", "Agent配置", Bot], ["scriptFlows", "话本流程", Workflow], ["intentLearning", "意图学习", Lightbulb], ["customers", "客户", Contact], ["conversations", "会话", MessageSquare], ["handoffs", "接管", Workflow], ["config", "设置", Settings]];
  const activeView = user.role !== "platform_admin" && merchantTrainingViews.includes(view) ? "training" : view;
  useEffect(() => {
    if (user.role !== "platform_admin" && merchantTrainingViews.includes(view)) setView("training");
  }, [user.role, view, setView]);
  return (
    <div className="app">
      <aside>
        <div className="side-brand"><span>AI</span><div><h2>A2C AI</h2><small>智能客服工作台</small></div></div>
        <div className="side-user"><strong>{user.name}</strong><span>{roleName(user.role)}</span></div>
        <nav>{nav.map(([key, label, Icon]) => <button key={key as string} className={activeView === key ? "active" : ""} onClick={() => setView(key as string)}><Icon size={17}/>{label as string}</button>)}</nav>
        <button className="logout" onClick={async () => { if (!window.confirm("确认退出当前账号？")) return; await api("/api/auth/logout", { method: "POST" }); notify("success", "已退出登录"); onLogout(); }}><LogOut size={17}/>退出</button>
      </aside>
      <main>
        <header><div><h1>{nav.find((item) => item[0] === activeView)?.[1] || "总览"}</h1><p>{user.name} · {roleName(user.role)}</p></div><span className="live-pill"><CheckCircle2 size={15}/>线上服务已连接</span></header>
        {activeView === "dashboard" && <Dashboard platform={user.role === "platform_admin"} />}
        {activeView === "merchants" && <Merchants />}
        {activeView === "users" && <UsersPage />}
        {activeView === "config" && <Config platform={user.role === "platform_admin"} />}
        {activeView === "agentProfile" && <AgentProfilePage platform={user.role === "platform_admin"} canEdit={user.role !== "merchant_operator"} />}
        {activeView === "customers" && <Customers platform={user.role === "platform_admin"} />}
        {activeView === "scriptFlows" && <ScriptFlows platform={user.role === "platform_admin"} />}
        {activeView === "intentLearning" && <IntentLearning platform={user.role === "platform_admin"} />}
        {activeView === "training" && <TrainingMaterials platform={false} simple />}
        {activeView === "simulator" && <TrainingSimulator />}
        {activeView === "materials" && <TrainingMaterials platform={user.role === "platform_admin"} />}
        {activeView === "knowledge" && <KnowledgePage platform={user.role === "platform_admin"} />}
        {activeView === "samples" && <Samples platform={user.role === "platform_admin"} />}
        {activeView === "conversations" && <Conversations platform={user.role === "platform_admin"} />}
        {activeView === "handoffs" && <Conversations platform={user.role === "platform_admin"} handoffs />}
      </main>
    </div>
  );
}

function TrainingSimulator() {
  const [accounts] = useRows<A2CAccount>("/api/merchant/a2c/accounts");
  const [form, setForm] = useState({
    customerPhone: `sim-${Date.now().toString().slice(-6)}`,
    nickname: "模拟客户",
    a2cAccountPhone: "",
    content: "你好"
  });
  const [rows, setRows] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!form.a2cAccountPhone && accounts[0]?.apiPhone) setForm((current) => ({ ...current, a2cAccountPhone: accounts[0].apiPhone }));
  }, [accounts, form.a2cAccountPhone]);
  const send = async () => {
    setError("");
    const res = await api<SimulatorResponse>("/api/merchant/training-simulator/messages", {
      method: "POST",
      body: JSON.stringify({
        customerPhone: form.customerPhone,
        nickname: form.nickname,
        a2cAccountPhone: form.a2cAccountPhone || undefined,
        content: form.content,
        msgType: "text"
      })
    });
    setRows(res.rows || []);
    setConversation(res.conversation || null);
    setStatus(res.status);
    setForm({ ...form, content: "" });
    notify("success", "已完成内部模拟", "回复只记录在系统内，不会发送给真实客户。");
  };
  const resetCustomer = () => {
    setRows([]);
    setConversation(null);
    setStatus("");
    setForm({ ...form, customerPhone: `sim-${Date.now().toString().slice(-6)}`, nickname: "模拟客户", content: "你好" });
  };
  return <section className="simulator-layout">
    <div className="memory simulator-panel">
      <h3>内部模拟对话</h3>
      <p>用于训练和验话术：系统会按真实 webhook 流程生成回复、推进话本和记忆，但不会真实调用 A2C 发送。</p>
      <label>选择客服账号
        <select value={form.a2cAccountPhone} onChange={(e) => setForm({ ...form, a2cAccountPhone: e.target.value })}>
          {accounts.map((item) => <option key={item.id} value={item.apiPhone}>{item.verifiedName || "客服账号"} · {item.apiPhone}</option>)}
          {!accounts.length && <option value="">未同步账号，使用模拟账号</option>}
        </select>
      </label>
      <label>模拟客户号码<input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} /></label>
      <label>模拟客户昵称<input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} /></label>
      <label>客户消息<textarea rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="输入客户会发来的内容，例如：你好 / 链接打不开 / 我没有 Telegram" /></label>
      <div className="toolbar">
        <AsyncButton onClick={send} busyText="训练中..." disabled={!form.content.trim()}><Send size={16}/>发送到内部训练</AsyncButton>
        <button onClick={resetCustomer}>换一个模拟客户</button>
      </div>
      {status && <div className="notice">本轮结果：{displayValue("status", status)}{conversation ? ` · 当前步骤：${displayValue("flowStep", conversation.flowStep || conversation.stage)}` : ""}</div>}
      {error && <div className="error">{error}</div>}
    </div>
    <div className="memory simulator-chat">
      <div className="section-title"><div><h3>模拟对话记录</h3><p>{conversation ? `${conversation.customerPhone} · ${conversation.a2cAccountPhone}` : "还没有开始模拟"}</p></div><span className="pill">不会真实发送 A2C</span></div>
      <div className="simulator-messages">
        {rows.length ? rows.map((msg) => <article key={msg.id} className={`sim-message ${msg.direction}`}>
          <div className="sim-message-meta"><strong>{msg.direction === "inbound" ? "客户" : "客服"}</strong><span>{formatDateTime(msg.createdAt)}</span></div>
          <p>{msg.content}</p>
          {msg.rawPayload?.a2cSendStatus === "simulated" && <small>模拟发送：已生成回复，未调用 A2C</small>}
          {msg.rawPayload?.strictFlowStep && <small>话本步骤：{displayValue("flowStep", msg.rawPayload.strictFlowStep)}</small>}
        </article>) : <div className="empty-state">输入一条客户消息开始训练。生成结果会显示在这里。</div>}
      </div>
    </div>
  </section>;
}

function Dashboard({ platform }: { platform: boolean }) {
  const [data, setData] = useState<Record<string, number>>({});
  useEffect(() => { api<Record<string, number>>(platform ? "/api/admin/dashboard" : "/api/merchant/dashboard").then(setData); }, [platform]);
  return <div className="grid metrics">{Object.entries(data).map(([k, v]) => { const Icon = metricIcon(k); return <section key={k} className="metric-card"><div className="metric-top"><span>{merchantDashboardLabel(k, platform)}</span><i><Icon size={19}/></i></div><strong>{v}</strong><small>{merchantDashboardHint(k, platform)}</small></section>; })}</div>;
}

function Merchants() {
  const [rows, setRows] = useRows<Merchant>("/api/admin/merchants");
  const [form, setForm] = useState({
    name: "",
    countryCode: "br",
    countryName: "巴西",
    defaultLanguage: "pt-BR",
    platformRegisterUrl: "",
    tgRegisterGuideUrl: "",
    requirePlatformAccount: "true",
    requirePhone: "true",
    requireTelegram: "true",
    requireWhatsApp: "false",
    adminEmail: "",
    adminName: "",
    adminPassword: "Merchant123456"
  });
  const [createdLogin, setCreatedLogin] = useState("");
  const [selected, setSelected] = useState<Merchant | null>(null);
  const [countries, setCountries] = useState<MerchantCountry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<MerchantCountry | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({ email: "", name: "", password: "Merchant123456", role: "merchant_admin" });
  const update = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value });
  const updateCountryName = (value: string) => {
    const inferred = inferCountryProfile(value);
    setForm({ ...form, countryName: value, countryCode: inferred.code, defaultLanguage: inferred.defaultLanguage });
  };
  const reloadMerchantDetail = async (merchantId = selected?.id) => {
    if (!merchantId) {
      setCountries([]);
      setUsers([]);
      return;
    }
    const [nextCountries, nextUsers] = await Promise.all([
      loadRows<MerchantCountry>(`/api/admin/merchants/${merchantId}/countries`),
      loadRows<User>(withQuery("/api/admin/users", { merchantId }))
    ]);
    setCountries(nextCountries);
    setUsers(nextUsers);
    setSelectedCountry((current) => nextCountries.find((item) => item.id === current?.id) || nextCountries[0] || null);
    setSelectedUser((current) => nextUsers.find((item) => item.id === current?.id) || null);
  };
  useEffect(() => { reloadMerchantDetail().catch(() => null); }, [selected?.id]);
  const createMerchant = async () => {
    const payload = {
      name: form.name.trim(),
      country: {
        code: form.countryCode.trim() || "default",
        name: form.countryName.trim() || "默认国家",
        defaultLanguage: form.defaultLanguage,
        platformRegisterUrl: form.platformRegisterUrl.trim(),
        tgRegisterGuideUrl: form.tgRegisterGuideUrl.trim(),
        requirePlatformAccount: form.requirePlatformAccount === "true",
        requirePhone: form.requirePhone === "true",
        requireTelegram: form.requireTelegram === "true",
        requireWhatsApp: form.requireWhatsApp === "true"
      },
      adminUser: form.adminEmail.trim() ? {
        email: form.adminEmail.trim(),
        name: form.adminName.trim() || `${form.name.trim()}管理员`,
        password: form.adminPassword
      } : undefined
    };
    const result = await api<{ merchant?: Merchant; adminUser?: User } | Merchant>("/api/admin/merchants", { method: "POST", body: JSON.stringify(payload) });
    const merchant = "merchant" in result ? result.merchant : result;
    setCreatedLogin(payload.adminUser ? `商户已创建。商户端登录邮箱：${payload.adminUser.email}；初始密码：${payload.adminUser.password}` : "商户已创建，暂未创建商户端登录账号。");
    setSelected(merchant || null);
    setForm({ ...form, name: "", adminEmail: "", adminName: "", adminPassword: "Merchant123456" });
    setRows(await loadRows("/api/admin/merchants"));
    if (merchant?.id) await reloadMerchantDetail(merchant.id);
  };
  return <div className="split merchant-admin-layout"><CountryPresetDatalist />
    <section className="work-panel">
      <div className="merchant-create-panel">
        <div className="panel-heading">
          <div><h3>新增商户开户</h3><p>一次填写商户、国家/市场和商户端管理员账号，创建后商户可直接登录配置。</p></div>
        </div>
        <div className="form-section">
          <h4>商户基础信息</h4>
          <div className="form-grid compact-fields">
            <label>商户名称<input placeholder="例如：阿斯顿" value={form.name} onChange={(e) => update("name", e.target.value)} /></label>
          </div>
        </div>
        <div className="form-section">
          <h4>国家 / 市场</h4>
          <div className="form-grid compact-fields">
            <label>国家<input list="merchant-country-presets" placeholder="输入或选择国家，例如：巴西" value={form.countryName} onChange={(e) => updateCountryName(e.target.value)} /></label>
            <label>国家代码<input readOnly value={form.countryCode} /></label>
            <label>默认语言<input readOnly value={languageName(form.defaultLanguage)} /></label>
            <label>开户链接<input placeholder="开户链接，可后续在配置页修改" value={form.platformRegisterUrl} onChange={(e) => update("platformRegisterUrl", e.target.value)} /></label>
            <label>TG注册说明<input placeholder="Telegram 下载或注册说明链接" value={form.tgRegisterGuideUrl} onChange={(e) => update("tgRegisterGuideUrl", e.target.value)} /></label>
          </div>
          <div className="target-grid">
            {[
              ["requirePlatformAccount", "要求平台开户"],
              ["requirePhone", "要求手机号"],
              ["requireTelegram", "要求Telegram"],
              ["requireWhatsApp", "要求WhatsApp"]
            ].map(([key, text]) => <label key={key}>{text}<select value={(form as any)[key]} onChange={(e) => update(key as keyof typeof form, e.target.value)}><option value="true">需要</option><option value="false">不需要</option></select></label>)}
          </div>
        </div>
        <div className="form-section">
          <h4>商户端登录账号</h4>
          <div className="form-grid compact-fields">
            <label>登录邮箱<input placeholder="merchant@example.com" value={form.adminEmail} onChange={(e) => update("adminEmail", e.target.value)} /></label>
            <label>管理员姓名<input placeholder="默认用“商户名管理员”" value={form.adminName} onChange={(e) => update("adminName", e.target.value)} /></label>
            <label>初始密码<input value={form.adminPassword} onChange={(e) => update("adminPassword", e.target.value)} /></label>
          </div>
        </div>
        <div className="toolbar sticky-actions merchant-create-actions">
          <AsyncButton disabled={!form.name.trim() || Boolean(form.adminEmail.trim()) && form.adminPassword.length < 8} busyText="创建中..." onClick={createMerchant}><Plus size={16}/>创建商户</AsyncButton>
          {createdLogin && <span className="success-text">{createdLogin}</span>}
        </div>
      </div>
      <Table rows={rows} columns={["name", "status", "id"]} onRow={setSelected} selectedKey={selected?.id} rowKey={(row) => row.id} />
    </section>
    <section className="detail-panel">{selected ? <div className="merchant-detail">
      <Editor title="商户设置" value={selected} fields={["name", "status"]} selects={{ status: ["active", "disabled"] }} onSave={async (patch) => {
        const saved = await api<Merchant>(`/api/admin/merchants/${selected.id}`, { method: "PATCH", body: JSON.stringify(patch) });
        setSelected(saved);
        setRows(await loadRows("/api/admin/merchants"));
      }} onDelete={selected.id === "default" ? undefined : async () => {
        if (!window.confirm(`确认彻底删除商户“${selected.name}”？该商户的账号、国家、客户、会话、样本、知识库、素材和配置都会被删除。`)) return;
        await api(`/api/admin/merchants/${selected.id}`, { method: "DELETE" });
        setSelected(null);
        setSelectedCountry(null);
        setSelectedUser(null);
        await setRows(await loadRows("/api/admin/merchants"));
        notify("success", "商户已彻底删除");
      }} />
      <div className="form-section">
        <h4>国家 / 市场配置</h4>
        {selectedCountry ? <CountrySettingsEditor value={selectedCountry} onSave={async (patch) => {
          const saved = await api<MerchantCountry>(`/api/admin/merchants/${selected.id}/countries/${selectedCountry.id}`, { method: "PATCH", body: JSON.stringify(coercePatch(patch)) });
          setSelectedCountry(saved);
          await reloadMerchantDetail(selected.id);
        }} /> : <div className="empty-state compact">暂无国家配置</div>}
      </div>
      <div className="form-section">
        <h4>商户登录账号</h4>
        <div className="toolbar wrap compact-create">
          <input placeholder="登录邮箱" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
          <input placeholder="姓名" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
          <input placeholder="初始密码" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
          <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}><option value="merchant_admin">商户管理员</option><option value="merchant_operator">商户运营</option></select>
          <AsyncButton disabled={!userForm.email.trim() || !userForm.name.trim() || userForm.password.length < 8} busyText="新增中..." onClick={async () => {
            await api("/api/admin/users", { method: "POST", body: JSON.stringify({ ...userForm, merchantId: selected.id }) });
            setUserForm({ email: "", name: "", password: "Merchant123456", role: "merchant_admin" });
            await reloadMerchantDetail(selected.id);
          }}><Plus size={16}/>新增账号</AsyncButton>
        </div>
        <Table rows={users as any[]} columns={["email", "name", "role", "status"]} onRow={(row) => setSelectedUser(row as User)} selectedKey={selectedUser?.id} rowKey={(row) => row.id} />
        {selectedUser && <Editor title="账号设置" value={{ name: selectedUser.name, role: selectedUser.role, status: (selectedUser as any).status || "active", merchantId: selected.id, password: "" }} fields={["name", "role", "status", "password"]} selects={{ role: ["merchant_admin", "merchant_operator"], status: ["active", "disabled"] }} onSave={async (patch) => {
          if (!patch.password) delete patch.password;
          const saved = await api<User>(`/api/admin/users/${selectedUser.id}`, { method: "PATCH", body: JSON.stringify({ ...patch, merchantId: selected.id }) });
          setSelectedUser(saved);
          await reloadMerchantDetail(selected.id);
        }} onDelete={async () => {
          if (!window.confirm(`确认删除账号 ${selectedUser.email}？`)) return;
          await api(`/api/admin/users/${selectedUser.id}`, { method: "DELETE" });
          setSelectedUser(null);
          await reloadMerchantDetail(selected.id);
          notify("success", "账号已删除");
        }} />}
      </div>
      <div className="notice">A2C、Gemini 和 TG 密钥仍在“配置”页维护；这里负责商户、国家和登录账号的增删改查。</div>
    </div> : <div className="empty-state">选择商户后可修改名称和状态。新增商户时可以同时创建国家和商户端登录账号。</div>}</section>
  </div>;
}

function UsersPage() {
  const [filters, setFilters] = useState<Filters>({ merchantId: "" });
  const usersUrl = withQuery("/api/admin/users", filters);
  const [rows, setRows] = useRows<Record<string, string>>(usersUrl);
  const [form, setForm] = useState({ email: "", name: "", password: "Admin123456", role: "merchant_admin", merchantId: "default" });
  const [selected, setSelected] = useState<Record<string, string> | null>(null);
  return <div className="split"><section><div className="toolbar wrap"><input placeholder="按商户ID筛选" value={filters.merchantId} onChange={(e) => setFilters({ merchantId: e.target.value })} /><button onClick={async () => setRows(await loadRows(usersUrl))}>筛选</button></div><div className="toolbar wrap">{["email","name","password","merchantId"].map((k) => <input key={k} placeholder={label(k)} value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />)}<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="merchant_admin">{label("merchant_admin")}</option><option value="merchant_operator">{label("merchant_operator")}</option><option value="platform_admin">{label("platform_admin")}</option></select><button onClick={async () => { await api("/api/admin/users", { method: "POST", body: JSON.stringify(form) }); setRows(await loadRows(usersUrl)); }}>新增用户</button></div><Table rows={rows} columns={["email", "name", "role", "merchantId", "status"]} onRow={setSelected} /></section><section>{selected ? <Editor title="用户设置" value={{ name: selected.name, status: selected.status, role: selected.role, merchantId: selected.merchantId || "", password: "" }} fields={["name", "status", "role", "merchantId", "password"]} selects={{ status: ["active", "disabled"], role: ["platform_admin", "merchant_admin", "merchant_operator"] }} onSave={async (patch) => { if (!patch.password) delete patch.password; await api(`/api/admin/users/${selected.id}`, { method: "PATCH", body: JSON.stringify(patch) }); setRows(await loadRows(usersUrl)); }} /> : <p>选择用户后可停用、改角色或重置密码。</p>}</section></div>;
}

function Config({ platform }: { platform: boolean }) {
  const [merchants] = useRows<Merchant>("/api/admin/merchants");
  const [merchantId, setMerchantId] = useState("default");
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [a2cAccounts, setA2CAccounts] = useState<A2CAccount[]>([]);
  const [countries, setCountries] = useState<MerchantCountry[]>([]);
  const [countryDraft, setCountryDraft] = useState({ code: "br", name: "巴西", defaultLanguage: "pt-BR", platformRegisterUrl: "", tgRegisterGuideUrl: "", requirePlatformAccount: "true", requirePhone: "true", requireTelegram: "true", requireWhatsApp: "false" });
  const url = platform ? `/api/admin/merchants/${merchantId}/config` : "/api/merchant/config";
  const countriesUrl = platform ? `/api/admin/merchants/${merchantId}/countries` : "/api/merchant/countries";
  const a2cAccountsUrl = platform ? `/api/admin/merchants/${merchantId}/a2c/accounts` : "/api/merchant/a2c/accounts";
  const a2cSyncUrl = platform ? `/api/admin/merchants/${merchantId}/a2c/accounts/sync` : "/api/merchant/a2c/accounts/sync";
  const checkUrl = platform ? `/api/admin/merchants/${merchantId}/config/check` : "/api/merchant/config/check";
  const a2cWebhookUrl = `${window.location.origin}/webhooks/a2c/${platform ? merchantId : String(form.merchantId || "default")}`;
  const [checks, setChecks] = useState<ConfigCheck[]>([]);
  const [tutorialImageFile, setTutorialImageFile] = useState<File | null>(null);
  const [accountKeyword, setAccountKeyword] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [accountCountryId, setAccountCountryId] = useState("");
  const reloadConfig = async () => setForm(await api<Record<string, string | boolean>>(url));
  useEffect(() => { reloadConfig().catch(() => null); }, [url]);
  useEffect(() => { loadRows<MerchantCountry>(countriesUrl).then(setCountries).catch(() => setCountries([])); }, [countriesUrl]);
  useEffect(() => { loadRows<A2CAccount>(a2cAccountsUrl).then(setA2CAccounts).catch(() => setA2CAccounts([])); }, [a2cAccountsUrl]);
  useEffect(() => { setChecks([]); }, [merchantId]);
  useEffect(() => {
    const country = countries[0];
    if (!country) return;
    setCountryDraft({
      code: country.code || "default",
      name: country.name || "默认国家",
      defaultLanguage: country.defaultLanguage || "unknown",
      platformRegisterUrl: country.platformRegisterUrl || "",
      tgRegisterGuideUrl: country.tgRegisterGuideUrl || "",
      requirePlatformAccount: String(country.requirePlatformAccount),
      requirePhone: String(country.requirePhone),
      requireTelegram: String(country.requireTelegram),
      requireWhatsApp: String(country.requireWhatsApp)
    });
  }, [countries]);
  const filteredA2CAccounts = useMemo(() => {
    const keyword = accountKeyword.trim().toLowerCase();
    return a2cAccounts.filter((account) => {
      const haystack = [account.apiPhone, account.verifiedName, account.countryName, account.countryCode, account.wabaId].join(" ").toLowerCase();
      if (keyword && !haystack.includes(keyword)) return false;
      if (accountStatus === "enabled" && !account.enabled) return false;
      if (accountStatus === "disabled" && account.enabled) return false;
      if (accountCountryId && account.countryId !== accountCountryId) return false;
      return true;
    });
  }, [a2cAccounts, accountKeyword, accountStatus, accountCountryId]);
  const accountPager = useClientPagination(filteredA2CAccounts, 12);
  const fields = ["a2cBaseUrl", "a2cAppId", "a2cAppSecret", "a2cAccountPhone", "googleAiApiKey", "googleAiModel", "telegramBotToken", "platformRegisterUrl", "tgRegisterGuideUrl"];
  const reloadCountries = async () => setCountries(await loadRows<MerchantCountry>(countriesUrl));
  const reloadA2CAccounts = async () => {
    setA2CAccounts(await loadRows<A2CAccount>(a2cAccountsUrl));
    accountPager.setPage(1);
  };
  const uploadTutorialImage = async () => {
    if (!tutorialImageFile) return;
    setMessage("");
    setError("");
    const body = new FormData();
    body.append("file", tutorialImageFile);
    const endpoint = platform ? `/api/admin/merchants/${merchantId}/config/registration-tutorial-image` : "/api/merchant/config/registration-tutorial-image";
    const response = await fetch(endpoint, { method: "POST", body });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(translateSystemMessage(payload.message || payload.error || "注册教程图片上传失败"));
    }
    const result = await response.json() as { imageUrl: string; config: Record<string, string | boolean> };
    setForm(result.config);
    setTutorialImageFile(null);
    setMessage("注册教程图片已上传。客户问怎么注册、不会注册、有教程吗时会自动发送这张图片。");
    notify("success", "注册教程图片已保存");
  };
  const runConfigCheck = async () => {
    setError("");
    setMessage("正在检测配置...");
    try {
      const result = await api<{ rows: ConfigCheck[]; checkedAt: string }>(checkUrl);
      setChecks(result.rows);
      setMessage("配置检测完成。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "配置检测失败");
      setMessage("");
    }
  };
  const saveConfig = async () => {
    setMessage("");
    setError("");
    try {
      const saved = await api<Record<string, string | boolean>>(url, { method: "PATCH", body: JSON.stringify(form) });
      setForm(saved);
      if (!saved.a2cAppId || !saved.a2cAppSecret) {
        setMessage("配置已保存。填写 A2C App ID 和密钥后，可手动点击“同步A2C客服账号”。");
        return;
      }
      setMessage("配置已保存。为避免 A2C 认证频繁，保存配置不会自动同步账号；需要刷新客服账号时请手动点击“同步A2C客服账号”。");
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存配置失败");
    }
  };
  const syncA2CAccounts = async (skipSave = false) => {
    setMessage("");
    setError("");
    try {
      if (!skipSave) await api(url, { method: "PATCH", body: JSON.stringify(form) });
      const result = await api<{ imported: number; rows: A2CAccount[]; config: Record<string, string | boolean>; stale?: boolean; warning?: string }>(a2cSyncUrl, { method: "POST" });
      setA2CAccounts(result.rows);
      accountPager.setPage(1);
      setForm(result.config);
      setMessage(result.stale ? result.warning || "A2C 暂时限频，已继续使用本地保存的客服账号。" : `已同步 ${result.imported} 个 A2C 客服账号，已自动写入接收账号。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步 A2C 客服账号失败");
    }
  };
  const toggleA2CAccount = async (row: A2CAccount) => {
    const endpoint = platform ? `/api/admin/a2c/accounts/${row.id}` : `/api/merchant/a2c/accounts/${row.id}`;
    const result = await api<{ config: Record<string, string | boolean> }>(endpoint, { method: "PATCH", body: JSON.stringify({ enabled: !row.enabled }) });
    setForm(result.config);
    await reloadA2CAccounts();
  };
  const saveCountry = async () => {
    const payload = coercePatch(countryDraft);
    await api(countriesUrl, { method: "POST", body: JSON.stringify(payload) });
    await reloadCountries();
    await reloadA2CAccounts();
    notify("success", "国家设置已保存", "所有客服账号会自动归属到这个国家。");
  };
  const updateCountryDraftName = (value: string) => {
    const inferred = inferCountryProfile(value);
    setCountryDraft({ ...countryDraft, name: value, code: inferred.code, defaultLanguage: inferred.defaultLanguage });
  };
  const setupTelegram = async () => {
    setMessage("");
    setError("");
    try {
      await api(url, { method: "PATCH", body: JSON.stringify(form) });
      const endpoint = platform ? `/api/admin/merchants/${merchantId}/telegram/setup-webhook` : "/api/merchant/telegram/setup-webhook";
      const result = await api<{ config: Record<string, string | boolean>; webhookUrl?: string }>(endpoint, { method: "POST" });
      setForm(result.config);
      setMessage(`TG绑定已开启${result.webhookUrl ? `：${result.webhookUrl}` : ""}。请把机器人拉进唯一接管群，并在群里发送 /bind；发送后点“刷新TG状态”。`);
      window.setTimeout(() => reloadConfig().catch(() => null), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "TG 绑定失败");
    }
  };
  return <section>
    {platform && <select value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>{merchants.map((m) => <option value={m.id} key={m.id}>{m.name}</option>)}</select>}
    <div className="setup-strip"><div><span>1</span><strong>填写密钥</strong><small>A2C / Gemini / TG</small></div><div><span>2</span><strong>设置国家</strong><small>商户单国家</small></div><div><span>3</span><strong>同步账号</strong><small>自动归属国家</small></div><div><span>4</span><strong>接入回调</strong><small>填写 Webhook</small></div></div>
    <div className="memory highlighted"><h3>A2C Webhook地址</h3><p>把这个地址填写到该商户的 A2C Webhook 配置里。</p><div className="copy-row"><label>{label("a2cWebhookUrl")}<input readOnly value={a2cWebhookUrl} onFocus={(e) => e.currentTarget.select()} /></label><AsyncButton onClick={async () => { await navigator.clipboard.writeText(a2cWebhookUrl); setMessage("Webhook 地址已复制。"); notify("success", "已复制 Webhook 地址"); }} busyText="复制中..."><Copy size={16}/>复制</AsyncButton></div></div>
    <div className={`smart-reply-card ${form.smartReplyEnabled === false ? "off" : "on"}`}>
      <div><h3>智能自动回复</h3><p>{form.smartReplyEnabled === false ? "已关闭：系统只接收消息、翻译、更新记忆和触发接管，不会自动回复客户。" : "已开启：客户消息会自动调用 AI，并通过当前 A2C 客服账号回复。"}</p></div>
      <button className={form.smartReplyEnabled === false ? "" : "ghost"} onClick={() => setForm({ ...form, smartReplyEnabled: form.smartReplyEnabled === false })}>{form.smartReplyEnabled === false ? "开启智能回复" : "关闭智能回复"}</button>
    </div>
    <div className={`smart-reply-card ${form.trainingSimulationEnabled ? "on" : "off"}`}>
      <div><h3>模拟训练模式</h3><p>{form.trainingSimulationEnabled ? "已开启：真实 A2C 消息只会进入内部训练并生成记录，不会真实回复客户，也不会通知接管群。" : "已关闭：真实 A2C 消息会按当前配置正常自动回复客户。"}</p></div>
      <button className={form.trainingSimulationEnabled ? "ghost" : ""} onClick={() => setForm({ ...form, trainingSimulationEnabled: !form.trainingSimulationEnabled })}>{form.trainingSimulationEnabled ? "关闭模拟训练" : "开启模拟训练"}</button>
    </div>
    <div className={`smart-reply-card ${form.strictScriptFlowEnabled ? "on" : "off"}`}>
      <div><h3>严格话本流程</h3><p>{form.strictScriptFlowEnabled ? "已开启：客户每回复一次，系统会按话本主动推进到下一步，不会掉到普通自由回复。" : "已关闭：非指定商户可能走普通回复；如要固定按开户注册话本推进，请开启。"}</p></div>
      <button className={form.strictScriptFlowEnabled ? "ghost" : ""} onClick={() => setForm({ ...form, strictScriptFlowEnabled: !form.strictScriptFlowEnabled })}>{form.strictScriptFlowEnabled ? "关闭严格流程" : "开启严格流程"}</button>
    </div>
    <div className="form-grid elevated-form">{fields.map((f) => <label key={f}>{label(f)}<input value={form[f] || ""} onChange={(e) => setForm({ ...form, [f]: e.target.value })} /></label>)}</div>
    <div className="memory tutorial-upload-card">
      <div>
        <h3>注册教程图片</h3>
        <p>商户只需要上传图片。客户问“怎么注册”“我不会”“有教程吗”时，系统会自动把这张图发给客户。</p>
      </div>
      <div className="tutorial-upload-layout">
        <div className="tutorial-preview">
          {form.registrationTutorialImageUrl ? <img src={String(form.registrationTutorialImageUrl)} alt="注册教程图片预览" /> : <span>还未上传注册教程图片</span>}
        </div>
        <div className="tutorial-upload-actions">
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setTutorialImageFile(e.target.files?.[0] || null)} />
          <AsyncButton disabled={!tutorialImageFile} busyText="上传中..." onClick={uploadTutorialImage}><Upload size={16}/>上传图片</AsyncButton>
          <small>{tutorialImageFile ? `已选择：${tutorialImageFile.name}` : "支持 PNG、JPG、WEBP、GIF；上传后会替换当前教程图。"}</small>
        </div>
      </div>
    </div>
    <div className="toolbar sticky-actions"><AsyncButton onClick={saveConfig} busyText="保存中...">保存配置</AsyncButton><AsyncButton onClick={() => syncA2CAccounts()} busyText="同步中..."><RefreshCw size={16}/>同步A2C客服账号</AsyncButton><AsyncButton onClick={runConfigCheck} busyText="检测中..."><CheckCircle2 size={16}/>检测配置</AsyncButton></div>
    {error && <div className="error">{error}</div>}{message && <div className="notice">{message}</div>}
    {checks.length > 0 && <div className="config-checks">{checks.map((item) => <article key={item.key} className={item.ok ? "ok" : item.status}><strong>{item.label}</strong><span>{label(item.status)}</span><p>{item.detail}</p></article>)}</div>}
    <div className="memory"><h3>商户国家/市场</h3><p>商户只需要填写国家，国家代码和默认语言会自动带入。当前版本每个商户只维护一个国家。</p><div className="toolbar wrap"><CountryPresetDatalist /><label className="inline-field">国家<input list="merchant-country-presets" placeholder="输入或选择国家，例如：巴西" value={countryDraft.name} onChange={(e) => updateCountryDraftName(e.target.value)} /></label><label className="inline-field">国家代码<input readOnly value={countryDraft.code} /></label><label className="inline-field">默认语言<input readOnly value={languageName(countryDraft.defaultLanguage)} /></label><input placeholder={label("platformRegisterUrl")} value={countryDraft.platformRegisterUrl} onChange={(e) => setCountryDraft({ ...countryDraft, platformRegisterUrl: e.target.value })} /><input placeholder={label("tgRegisterGuideUrl")} value={countryDraft.tgRegisterGuideUrl} onChange={(e) => setCountryDraft({ ...countryDraft, tgRegisterGuideUrl: e.target.value })} /><select value={countryDraft.requirePlatformAccount} onChange={(e) => setCountryDraft({ ...countryDraft, requirePlatformAccount: e.target.value })}><option value="true">需要开户注册</option><option value="false">不需要开户注册</option></select><select value={countryDraft.requirePhone} onChange={(e) => setCountryDraft({ ...countryDraft, requirePhone: e.target.value })}><option value="true">需要手机号</option><option value="false">不需要手机号</option></select><select value={countryDraft.requireTelegram} onChange={(e) => setCountryDraft({ ...countryDraft, requireTelegram: e.target.value })}><option value="true">需要TG</option><option value="false">不需要TG</option></select><select value={countryDraft.requireWhatsApp} onChange={(e) => setCountryDraft({ ...countryDraft, requireWhatsApp: e.target.value })}><option value="false">不需要WS</option><option value="true">需要WS</option></select><AsyncButton onClick={saveCountry} busyText="保存中...">保存国家设置</AsyncButton></div><Table rows={countries} columns={["code", "name", "defaultLanguage", "platformRegisterUrl", "tgRegisterGuideUrl", "requirePhone", "requireTelegram", "requireWhatsApp", "status"]} rowKey={(row) => row.id} /></div>
    <div className="memory"><div className="account-section-head"><div><h3>A2C客服账号与邀请码池</h3><p>客服账号会自动归属到商户国家。每个客服账号可以绑定多个邀请码，客户注册后邀请码会从可用池里移除。</p></div><span>已保存 {a2cAccounts.length} 个账号</span></div><div className="account-filter-bar"><label>搜索账号<input value={accountKeyword} onChange={(e) => { setAccountKeyword(e.target.value); accountPager.setPage(1); }} placeholder="手机号、名称、WABA ID" /></label><label>状态<select value={accountStatus} onChange={(e) => { setAccountStatus(e.target.value); accountPager.setPage(1); }}><option value="">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label><label>国家<select value={accountCountryId} onChange={(e) => { setAccountCountryId(e.target.value); accountPager.setPage(1); }}><option value="">全部国家</option>{countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}</select></label></div><div className="account-list-meta">当前筛选 {filteredA2CAccounts.length} 个账号，显示第 {(accountPager.page - 1) * accountPager.pageSize + (accountPager.total ? 1 : 0)} - {Math.min(accountPager.page * accountPager.pageSize, accountPager.total)} 个。</div><div className="account-grid">{accountPager.rows.map((row) => <A2CAccountCard key={row.id} account={row} countries={countries} platform={platform} onToggle={() => toggleA2CAccount(row)} onCountry={async () => undefined} />)}{!a2cAccounts.length && <div className="empty-state">填写并保存 A2C 密钥后，点击“同步A2C客服账号”。同步成功后这里会出现每个客服账号的邀请码池。</div>}{a2cAccounts.length > 0 && !filteredA2CAccounts.length && <div className="empty-state">没有符合筛选条件的客服账号，换个手机号、状态或国家试试。</div>}</div><Pagination pager={accountPager} /></div>
    <div className="memory"><h3>TG接管群绑定</h3><p>状态：{displayValue("status", form.telegramHandoffChatStatus || "unbound")} · 群：{form.telegramHandoffChatTitle || form.telegramHandoffChatId || "未绑定"}</p>{form.telegramHandoffChatError && <div className="warning">{form.telegramHandoffChatError}</div>}<div className="toolbar"><AsyncButton onClick={setupTelegram} busyText="设置中...">设置TG绑定</AsyncButton><AsyncButton onClick={async () => { setError(""); setMessage("正在刷新TG状态..."); await reloadConfig(); setMessage("TG状态已刷新。"); notify("success", "TG 状态已刷新"); }} busyText="刷新中..."><RefreshCw size={16}/>刷新TG状态</AsyncButton></div><p>保存 TG机器人 Token 后点击设置绑定，再把机器人拉进唯一接管群并发送 /bind；系统会自动保存群ID。</p></div>
  </section>;
}

function AgentProfilePage({ platform, canEdit }: { platform: boolean; canEdit: boolean }) {
  const [merchants] = useRows<Merchant>("/api/admin/merchants");
  const [merchantId, setMerchantId] = useState("default");
  const [form, setForm] = useState<AgentProfile | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const url = platform ? `/api/admin/merchants/${merchantId}/agent-profile` : "/api/merchant/agent-profile";
  const load = async () => setForm(await api<AgentProfile>(url));
  useEffect(() => { load().catch((err) => setError(err instanceof Error ? err.message : "加载 Agent 配置失败")); }, [url]);
  const fields: Array<[keyof AgentProfile, string, string]> = [
    ["agentName", "Agent名称", "例如：开户注册接待专员"],
    ["roleDefinition", "角色定义", "说明这个客服是谁，有什么经验，负责什么"],
    ["toneStyle", "语气风格", "例如：简短、口语化、耐心、像真人聊天"],
    ["coreGoal", "核心目标", "这个 Agent 最终要帮客户完成什么"],
    ["mustFollow", "必须遵守", "流程、回答方式、资料收集顺序等"],
    ["forbidden", "禁止事项", "不能承诺、不能收集、不能暴露的内容"],
    ["uncertaintyPolicy", "不确定问题口径", "遇到未配置规则时怎么回答"],
    ["handoffPolicy", "转人工条件", "什么时候停止自动引导并通知人工"]
  ];
  const save = async () => {
    if (!form) return;
    setMessage("");
    setError("");
    try {
      const saved = await api<AgentProfile>(url, { method: "PATCH", body: JSON.stringify(form) });
      setForm(saved);
      setMessage("Agent 配置已保存，后续严格流程、普通回复和模拟训练都会使用这份设定。");
      notify("success", "Agent 配置已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  };
  return <section className="single-column">
    <div className="work-panel">
      <div className="section-title"><div><h2>商户 Agent 配置</h2><p>流程仍由话本状态机控制，这里只控制人设、语气、边界和转人工口径。</p></div>{form && <span className={`status-pill ${form.enabled ? "ok" : "neutral"}`}>{form.enabled ? "已启用" : "已停用"}</span>}</div>
      {platform && <select value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>{merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select>}
      {error && <div className="error">{error}</div>}
      {message && <div className="notice">{message}</div>}
      {form ? <>
        <div className="smart-reply-card on"><div><h3>表达边界</h3><p>客户可见回复仍禁止暴露 AI、机器人、模型、自动客服身份；业务不确定时，以页面或人工确认为准。</p></div><button className={form.enabled ? "ghost" : ""} disabled={!canEdit} onClick={() => setForm({ ...form, enabled: !form.enabled })}>{form.enabled ? "停用配置" : "启用配置"}</button></div>
        <div className="form-grid elevated-form agent-profile-grid">
          {fields.map(([key, title, help]) => <label key={key}>{title}<textarea disabled={!canEdit} value={String(form[key] ?? "")} placeholder={help} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /><small>{help}</small></label>)}
        </div>
        <div className="toolbar sticky-actions"><AsyncButton disabled={!canEdit} onClick={save} busyText="保存中...">保存 Agent 配置</AsyncButton><AsyncButton onClick={load} busyText="刷新中..."><RefreshCw size={16}/>刷新</AsyncButton></div>
      </> : <div className="empty-state">正在加载 Agent 配置...</div>}
    </div>
  </section>;
}

function A2CAccountCard({ account, countries, platform, onToggle, onCountry }: { account: A2CAccount; countries: MerchantCountry[]; platform: boolean; onToggle: () => Promise<void>; onCountry: (countryId: string) => Promise<void> }) {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [draft, setDraft] = useState({ codes: "", registerUrl: "" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const endpoint = platform ? `/api/admin/a2c/accounts/${account.id}/invite-codes` : `/api/merchant/a2c/accounts/${account.id}/invite-codes`;
  const codeEndpoint = platform ? "/api/admin/invite-codes" : "/api/merchant/invite-codes";
  const reload = async () => setCodes(await loadRows<InviteCode>(endpoint));
  useEffect(() => { reload().catch(() => setCodes([])); }, [endpoint]);
  const selectedCode = codes.find((item) => item.id === selectedId) || codes[0] || null;
  useEffect(() => {
    if (!codes.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !codes.some((item) => item.id === selectedId)) setSelectedId(codes[0].id);
  }, [codes, selectedId]);
  const stats = {
    available: codes.filter((item) => item.status === "available").length,
    reserved: codes.filter((item) => item.status === "reserved").length,
    used: codes.filter((item) => item.status === "used").length,
    disabled: codes.filter((item) => item.status === "disabled").length
  };
  return <article className="account-panel">
    <div className="account-panel-head">
      <div><strong>{account.verifiedName || account.apiPhone}</strong><span>{account.apiPhone} · {countryLabel(account.countryName)} · {account.enabled ? "启用" : "停用"}</span></div>
      <AsyncButton busyText="处理中..." onClick={onToggle}>{account.enabled ? "停用账号" : "启用账号"}</AsyncButton>
    </div>
    <div className="account-settings-row">
      <div className="account-country">归属国家：{countryLabel(account.countryName || countries[0]?.name || "默认国家")}</div>
      <div className="invite-stats"><span>可用 {stats.available}</span><span>已分配 {stats.reserved}</span><span>已使用 {stats.used}</span><span>停用 {stats.disabled}</span></div>
    </div>
    <details className="invite-panel">
      <summary>管理邀请码池</summary>
      <div className="invite-console">
        <div className="invite-import">
          <label>批量导入<textarea placeholder="一行一个邀请码；也支持逗号、空格分隔" value={draft.codes} onChange={(e) => setDraft({ ...draft, codes: e.target.value })} /></label>
          <label>注册链接模板<input placeholder="例如 https://example.com/register?code={code}" value={draft.registerUrl} onChange={(e) => setDraft({ ...draft, registerUrl: e.target.value })} /></label>
          <AsyncButton disabled={!draft.codes.trim()} busyText="保存中..." onClick={async () => { const result = await api<{ imported: number; rows: InviteCode[] }>(`${endpoint}/import`, { method: "POST", body: JSON.stringify(draft) }); setCodes(result.rows); setDraft({ codes: "", registerUrl: draft.registerUrl }); notify("success", "邀请码池已保存", `已处理 ${result.imported} 个邀请码`); }}><Plus size={16}/>导入</AsyncButton>
        </div>
        <div className="invite-manager">
          <div className="invite-list">
            <div className="invite-list-head"><span>邀请码</span><span>状态</span><span>客户</span></div>
            {codes.map((code) => <button key={code.id} className={selectedCode?.id === code.id ? "active" : ""} onClick={() => setSelectedId(code.id)}>
              <strong>{code.code}</strong>
              {displayValue("status", code.status)}
              <small>{code.assignedCustomerKey || "未绑定"}</small>
            </button>)}
            {!codes.length && <div className="empty-state compact">暂无邀请码，先在上方批量导入。</div>}
          </div>
          <div className="invite-detail">
            {selectedCode ? <InviteCodeEditor code={selectedCode} endpoint={codeEndpoint} reload={reload} /> : <div className="empty-state compact">选择一个邀请码后可编辑注册链接、状态和删除。</div>}
          </div>
        </div>
      </div>
    </details>
  </article>;
}

function InviteCodeEditor({ code, endpoint, reload }: { code: InviteCode; endpoint: string; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState({ code: code.code, registerUrl: code.registerUrl, status: code.status });
  useEffect(() => setDraft({ code: code.code, registerUrl: code.registerUrl, status: code.status }), [code.id, code.code, code.registerUrl, code.status]);
  return <div className="invite-editor">
    <div className="invite-editor-title"><div><strong>{code.code}</strong><span>{displayValue("status", code.status)}</span></div><small>{code.updatedAt ? `更新于 ${formatDateTime(code.updatedAt)}` : ""}</small></div>
    <div className="invite-editor-grid">
      <label>邀请码<input aria-label="邀请码" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} /></label>
      <label>状态<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="available">{label("available")}</option><option value="reserved">{label("reserved")}</option><option value="used">{label("used")}</option><option value="disabled">{label("disabled")}</option></select></label>
      <label className="wide">注册链接<input aria-label="注册链接" value={draft.registerUrl} placeholder="不填时使用国家/商户开户链接；可包含 {code}" onChange={(e) => setDraft({ ...draft, registerUrl: e.target.value })} /></label>
    </div>
    <div className="invite-meta">
      <span>绑定客户：{code.assignedCustomerKey || "未绑定"}</span>
      <span>注册账号：{code.platformAccount || "未填写"}</span>
      <span>使用时间：{code.usedAt ? formatDateTime(code.usedAt) : "未使用"}</span>
    </div>
    <div className="invite-editor-actions">
      <AsyncButton busyText="保存中..." onClick={async () => { await api(`${endpoint}/${code.id}`, { method: "PATCH", body: JSON.stringify(draft) }); await reload(); notify("success", "邀请码已保存"); }}>保存修改</AsyncButton>
      <AsyncButton className="danger" busyText="删除中..." onClick={async () => { if (!window.confirm("确认彻底删除这个邀请码？")) return; await api(`${endpoint}/${code.id}`, { method: "DELETE" }); await reload(); notify("success", "邀请码已彻底删除"); }}>彻底删除</AsyncButton>
    </div>
  </div>;
}

function Samples({ platform = false }: { platform?: boolean }) {
  const base = platform ? "/api/admin/training-samples" : "/api/merchant/training-samples";
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", language: "", intent: "", stage: "", enabled: "" });
  const rowsUrl = withQuery(base, platform ? filters : { countryId: filters.countryId, language: filters.language, intent: filters.intent, stage: filters.stage, enabled: filters.enabled });
  const [rows, setRows] = useRows<Sample>(rowsUrl);
  const pager = useClientPagination(rows, 20);
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<Sample | null>(null);
  const reload = async () => { setRows(await loadRows(rowsUrl)); pager.setPage(1); };
  return <div className={selected ? "split work-split" : "single-column work-split"}><section className="work-panel"><FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "countryId", "language", "intent", "stage", "enabled"] : ["countryId", "language", "intent", "stage", "enabled"]} selects={{ countryId: ["", ...countries.map((country) => country.id)], enabled: ["", "true", "false"] }} onApply={reload} />{!platform && <div className="material-uploader compact-uploader"><div className="toolbar"><select value={filters.countryId} onChange={(e) => setFilters({ ...filters, countryId: e.target.value })}>{countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}</select><input type="file" accept=".csv,.xlsx,.xls,.docx,.txt,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /><AsyncButton disabled={!file} busyText="上传中..." onClick={async () => { if (!file) return; const body = new FormData(); body.append("file", file); body.append("countryId", filters.countryId || countries[0]?.id || ""); const response = await fetch("/api/merchant/training-materials/import", { method: "POST", body }); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "上传失败"); const result = await response.json() as { imported: number; samples: number; knowledge: number; warnings?: string[] }; notify("success", "训练文件已导入", `样本 ${result.samples} 条，知识 ${result.knowledge} 条${result.warnings?.length ? `；${result.warnings.join("；")}` : ""}`); setFile(null); await reload(); }}><Upload size={16}/>上传训练文件</AsyncButton></div><small>支持 CSV、Excel、Word、TXT、截图/图片。表格直接生成样本；文本、Word、截图会自动提取话术。</small></div>}<Table rows={pager.rows} columns={["countryId", "customerMessage", "standardReply", "intent", "stage", "language", "priority", "enabled"]} onRow={setSelected} /><Pagination pager={pager} /></section>{selected && <section className="detail-panel"><Editor title="样本编辑" value={selected as any} fields={["countryId", "customerMessage", "standardReply", "intent", "stage", "language", "keywords", "priority", "enabled"]} selects={{ enabled: ["true", "false"] }} onSave={async (patch) => { await api(`${base}/${selected.id}`, { method: "PATCH", body: JSON.stringify(coercePatch(patch)) }); await reload(); }} onDelete={async () => { if (!window.confirm("确认彻底删除这个样本？删除后 AI 不会再引用它。")) return; await api(`${base}/${selected.id}`, { method: "DELETE" }); setSelected(null); await reload(); notify("success", "样本已彻底删除"); }} /></section>}</div>;
}

function ScriptFlows({ platform = false }: { platform?: boolean }) {
  const base = platform ? "/api/admin/script-flows" : "/api/merchant/script-flows";
  const stepBase = platform ? "/api/admin/script-flow-steps" : "/api/merchant/script-flow-steps";
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", status: "" });
  const rowsUrl = withQuery(base, platform ? filters : { countryId: filters.countryId, status: filters.status });
  const [rows, setRows] = useRows<ScriptFlow>(rowsUrl);
  const [selected, setSelected] = useState<ScriptFlow | null>(null);
  const [detail, setDetail] = useState<{ flow: ScriptFlow; steps: ScriptFlowStep[]; versions: ScriptFlowVersion[] } | null>(null);
  const [selectedStep, setSelectedStep] = useState<ScriptFlowStep | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [flowName, setFlowName] = useState("");
  const reload = async () => setRows(await loadRows(rowsUrl));
  const loadDetail = async (flow: ScriptFlow) => {
    setSelected(flow);
    const next = await api<{ flow: ScriptFlow; steps: ScriptFlowStep[]; versions: ScriptFlowVersion[] }>(`${base}/${flow.id}`);
    setDetail(next);
    setSelectedStep(next.steps[0] || null);
  };
  const upload = async () => {
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    const params = new URLSearchParams();
    const countryId = filters.countryId || countries[0]?.id || "";
    if (flowName.trim()) params.set("name", flowName.trim());
    if (countryId) params.set("countryId", countryId);
    if (platform && filters.merchantId.trim()) params.set("merchantId", filters.merchantId.trim());
    const response = await fetch(`${base}/import${params.toString() ? `?${params}` : ""}`, { method: "POST", body });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || "上传失败");
    const result = await response.json() as { flow: ScriptFlow; imported: number };
    notify("success", "话本流程已导入", `已生成 ${result.imported} 个流程节点`);
    setFile(null);
    setFlowName("");
    await reload();
  };
  const refreshDetail = async () => {
    if (!selected) return;
    const next = await api<{ flow: ScriptFlow; steps: ScriptFlowStep[]; versions: ScriptFlowVersion[] }>(`${base}/${selected.id}`);
    setDetail(next);
    setSelected(next.flow);
    setSelectedStep((current) => next.steps.find((step) => step.id === current?.id) || next.steps[0] || null);
    await reload();
  };
  const addStep = async () => {
    if (!detail) return;
    const order = detail.steps.length + 1;
    const created = await api<ScriptFlowStep>(`${base}/${detail.flow.id}/steps`, {
      method: "POST",
      body: JSON.stringify({
        flowCode: `step_${order}`,
        flowName: "新流程节点",
        flowStep: "interest_screening",
        standardReply: "请在这里填写客服标准话术。",
        sortOrder: order,
        enabled: true
      })
    });
    setSelectedStep(created);
    await refreshDetail();
  };
  const deleteFlow = async () => {
    if (!selected) return;
    if (!window.confirm("确认删除这个话本流程？删除后不可恢复。当前启用的话本需要先启用其他话本后再删除。")) return;
    await api(`${base}/${selected.id}`, { method: "DELETE" });
    notify("success", "话本流程已删除");
    setSelected(null);
    setDetail(null);
    setSelectedStep(null);
    await reload();
  };
  return <div className="script-flow-page work-split">
    <section className="script-flow-list work-panel">
      <div className="training-center-hero compact">
        <div><h3>话本流程</h3><p>这里维护“客户下一步该怎么走”。上传 Excel 或 Word 后可直接编辑节点，启用后客户会话优先按该流程推进。</p></div>
      </div>
      <FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "countryId", "status"] : ["countryId", "status"]} selects={{ countryId: ["", ...countries.map((country) => country.id)], status: ["", "draft", "active", "disabled"] }} onApply={reload} />
      <div className="material-uploader compact-uploader">
        <div className="toolbar wrap">
          <input placeholder="话本名称，可选" value={flowName} onChange={(event) => setFlowName(event.target.value)} />
          <input type="file" accept=".xlsx,.xls,.docx" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <AsyncButton disabled={!file || platform && !filters.merchantId.trim()} busyText="导入中..." onClick={upload}><Upload size={16}/>导入话本流程</AsyncButton>
        </div>
        <small>Excel 表头需包含“客服标准话术”；Word 会按段落自动拆成流程节点，导入后可在右侧继续编辑。</small>
      </div>
      <Table rows={rows} columns={["name", "countryName", "status", "active", "version", "stepCount", "updatedAt"]} onRow={loadDetail} selectedKey={selected?.id} rowKey={(row) => row.id} />
    </section>
    <section className="script-flow-detail detail-panel">
      {detail ? <div className="script-flow-editor">
        <div className="detail-title-row">
          <div>
            <h3>{detail.flow.name}</h3>
            <p>{countryLabel(detail.flow.countryName)} · 版本 {detail.flow.version} · {detail.flow.active ? "当前启用" : label(detail.flow.status)}</p>
          </div>
          <div className="toolbar">
            <AsyncButton busyText="启用中..." onClick={async () => { await api(`${base}/${detail.flow.id}/enable`, { method: "POST" }); notify("success", "话本流程已启用"); await refreshDetail(); }}>启用流程</AsyncButton>
            <AsyncButton className="danger" busyText="删除中..." onClick={deleteFlow}>删除流程</AsyncButton>
          </div>
        </div>
        <Editor title="流程基础信息" value={{ name: detail.flow.name, status: detail.flow.status, countryId: detail.flow.countryId }} fields={["name", "status", "countryId"]} selects={{ status: ["draft", "active", "disabled"], countryId: countries.map((country) => country.id) }} onSave={async (patch) => { await api(`${base}/${detail.flow.id}`, { method: "PATCH", body: JSON.stringify(patch) }); notify("success", "流程信息已保存"); await refreshDetail(); }} />
        <div className="script-flow-columns">
          <div className="script-step-list">
            <div className="panel-title"><h3>流程节点</h3><AsyncButton busyText="新增中..." onClick={addStep}><Plus size={16}/>新增节点</AsyncButton></div>
            {detail.steps.map((step) => <button key={step.id} className={`script-step-card ${selectedStep?.id === step.id ? "active" : ""}`} onClick={() => setSelectedStep(step)}>
              <strong>{step.flowCode} · {step.flowName || label(step.flowStep)}</strong>
              <span>{label(step.flowStep)} · 顺序 {step.sortOrder} · {step.enabled ? "启用" : "停用"}</span>
              <small>{step.standardReply}</small>
            </button>)}
            {!detail.steps.length && <div className="empty-state">还没有流程节点，请新增或重新导入 Excel。</div>}
          </div>
          <div className="script-step-editor">
            {selectedStep ? <ScriptFlowStepEditor step={selectedStep} endpoint={stepBase} onSaved={refreshDetail} /> : <div className="empty-state">选择左侧节点后编辑话术和跳转规则。</div>}
          </div>
        </div>
        <details className="version-panel">
          <summary>版本记录</summary>
          <div className="stack-list">
            {detail.versions.map((version) => <div key={version.id} className="version-row"><span>版本 {version.version}</span><span>{version.note || "保存"}</span><span>{version.createdBy || "系统"} · {formatDateTime(version.createdAt)}</span><AsyncButton busyText="恢复中..." onClick={async () => { if (!window.confirm(`确认恢复到版本 ${version.version}？`)) return; await api(`${base}/${detail.flow.id}/versions/${version.id}/restore`, { method: "POST" }); notify("success", "版本已恢复"); await refreshDetail(); }}>恢复</AsyncButton></div>)}
          </div>
        </details>
      </div> : <div className="empty-chat"><h3>选择话本流程</h3><p>上传或选择一个流程后，可以在这里编辑每一步话术、触发条件和下一步规则。</p></div>}
    </section>
  </div>;
}

function ScriptFlowStepEditor({ step, endpoint, onSaved }: { step: ScriptFlowStep; endpoint: string; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<ScriptFlowStep>(step);
  useEffect(() => setDraft(step), [step]);
  const set = (key: keyof ScriptFlowStep, value: string | boolean | number) => setDraft({ ...draft, [key]: value } as ScriptFlowStep);
  const save = async () => {
    await api(`${endpoint}/${step.id}`, { method: "PATCH", body: JSON.stringify(coercePatch(draft as unknown as Record<string, any>)) });
    notify("success", "流程节点已保存");
    await onSaved();
  };
  const duplicate = async () => {
    await api(`${endpoint}/${step.id}/duplicate`, { method: "POST" });
    notify("success", "流程节点已复制");
    await onSaved();
  };
  const remove = async () => {
    if (!window.confirm("确认删除这个流程节点？如果有其他节点引用它，需要先修改引用。")) return;
    await api(`${endpoint}/${step.id}`, { method: "DELETE" });
    notify("success", "流程节点已删除");
    await onSaved();
  };
  return <div className="script-node-form">
    <div className="form-grid compact-fields">
      <label>流程编号<input value={draft.flowCode} onChange={(e) => set("flowCode", e.target.value)} /></label>
      <label>流程名称<input value={draft.flowName} onChange={(e) => set("flowName", e.target.value)} /></label>
      <label>系统步骤<select value={draft.flowStep} onChange={(e) => set("flowStep", e.target.value)}>{STRICT_STEP_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
      <label>顺序<input type="number" value={draft.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value || 0))} /></label>
      <label>是否发链接<select value={String(draft.sendLink)} onChange={(e) => set("sendLink", e.target.value === "true")}><option value="false">否</option><option value="true">是</option></select></label>
      <label>是否发邀请码<select value={String(draft.sendInvite)} onChange={(e) => set("sendInvite", e.target.value === "true")}><option value="false">否</option><option value="true">是</option></select></label>
      <label>启用<select value={String(draft.enabled)} onChange={(e) => set("enabled", e.target.value === "true")}><option value="true">启用</option><option value="false">停用</option></select></label>
      <label>下一流程编号<input value={draft.nextFlowCode} onChange={(e) => set("nextFlowCode", e.target.value)} /></label>
      <label>下一系统步骤<select value={draft.nextFlowStep || ""} onChange={(e) => set("nextFlowStep", e.target.value)}><option value="">按默认流程</option>{STRICT_STEP_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
    </div>
    <div className="form-grid">
      <label>当前节点目标<textarea value={draft.goal} onChange={(e) => set("goal", e.target.value)} /></label>
      <label>触发条件<textarea value={draft.triggerCondition} onChange={(e) => set("triggerCondition", e.target.value)} /></label>
      <label>客户常见表达<textarea value={draft.customerExpressions} onChange={(e) => set("customerExpressions", e.target.value)} /></label>
      <label>客服标准话术<textarea value={draft.standardReply} onChange={(e) => set("standardReply", e.target.value)} /></label>
      <label>需要收集的信息<textarea value={draft.collectInfo} onChange={(e) => set("collectInfo", e.target.value)} /></label>
      <label>下一步条件<textarea value={draft.nextCondition} onChange={(e) => set("nextCondition", e.target.value)} /></label>
      <label>禁止事项<textarea value={draft.forbidden} onChange={(e) => set("forbidden", e.target.value)} /></label>
      <label>备注<textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} /></label>
    </div>
    <div className="notice">变量：{"{{REGISTER_URL}}"} 注册链接，{"{{INVITE_CODE}}"} 邀请码，{"{{INVITE_DISPLAY}}"} 链接和邀请码完整文本。</div>
    <div className="toolbar"><AsyncButton busyText="保存中..." onClick={save}>保存节点</AsyncButton><AsyncButton busyText="复制中..." onClick={duplicate}><Copy size={16}/>复制节点</AsyncButton><AsyncButton className="danger" busyText="删除中..." onClick={remove}>删除节点</AsyncButton></div>
  </div>;
}

function IntentLearning({ platform = false }: { platform?: boolean }) {
  const base = platform ? "/api/admin/intent-learning" : "/api/merchant/intent-learning";
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", status: "candidate", suggestedIntent: "", limit: "100" });
  const rowsUrl = withQuery(base, platform ? filters : { countryId: filters.countryId, status: filters.status, suggestedIntent: filters.suggestedIntent, limit: filters.limit });
  const [rows, setRows] = useRows<IntentLearningEvent>(rowsUrl);
  const pager = useClientPagination(rows, 20);
  const [selected, setSelected] = useState<IntentLearningEvent | null>(null);
  const [detailDraft, setDetailDraft] = useState({ status: "candidate", displayName: "", description: "" });
  useEffect(() => {
    if (!selected) return;
    setDetailDraft({ status: selected.status, displayName: selected.displayName, description: selected.description });
  }, [selected]);
  const reload = async () => {
    const next = await loadRows<IntentLearningEvent>(rowsUrl);
    setRows(next);
    pager.setPage(1);
    setSelected((current) => current ? next.find((item) => item.id === current.id) || null : null);
  };
  const patchSelected = async (patch: Record<string, unknown>, message = "意图候选已更新") => {
    if (!selected) return;
    const saved = await api<IntentLearningEvent>(`${base}/${selected.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    setRows((current) => current.map((item) => item.id === saved.id ? saved : item));
    setSelected(saved);
    notify("success", message);
  };
  const metrics = {
    candidate: rows.filter((item) => item.status === "candidate").length,
    reviewed: rows.filter((item) => item.status === "reviewed").length,
    promoted: rows.filter((item) => item.status === "promoted").length,
    ignored: rows.filter((item) => item.status === "ignored").length
  };
  return <div className="intent-learning-page work-split">
    <section className="work-panel">
      <div className="training-center-hero compact">
        <div>
          <h3>意图学习</h3>
          <p>系统会把没识别准、规则库没有覆盖、或需要靠上下文判断的客户表达自动沉淀到这里。运营处理后，再把高频意图补进话本或规则。</p>
        </div>
      </div>
      <div className="learning-metrics">
        <span>待处理 <strong>{metrics.candidate}</strong></span>
        <span>已确认 <strong>{metrics.reviewed}</strong></span>
        <span>已沉淀 <strong>{metrics.promoted}</strong></span>
        <span>已忽略 <strong>{metrics.ignored}</strong></span>
      </div>
      <FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "countryId", "status", "suggestedIntent", "limit"] : ["countryId", "status", "suggestedIntent", "limit"]} selects={{ countryId: ["", ...countries.map((country) => country.id)], status: ["", "candidate", "reviewed", "promoted", "ignored"] }} onApply={reload} />
      <Table rows={pager.rows} columns={["displayName", "suggestedIntent", "occurrenceCount", "customerText", "flowStep", "status", "lastSeenAt"]} onRow={setSelected} selectedKey={selected?.id} rowKey={(row) => row.id} />
      <Pagination pager={pager} />
    </section>
    <section className="detail-panel">
      {selected ? <div className="intent-learning-detail">
        <div className="detail-title-row">
          <div>
            <h3>{selected.displayName || selected.suggestedIntent}</h3>
            <p>{countryLabel(selected.countryId)} · 出现 {selected.occurrenceCount} 次 · 最近 {formatDateTime(selected.lastSeenAt)}</p>
          </div>
          <span className={`status-pill ${statusTone(selected.status)}`}>{label(selected.status)}</span>
        </div>
        <div className="learning-summary">
          <strong>客户原话</strong>
          <p>{selected.customerText}</p>
        </div>
        <div className="learning-facts">
          <span>系统识别：{label(selected.detectedIntent || "unknown")}</span>
          <span>上下文识别：{label(selected.contextualIntent || "unknown")}</span>
          <span>建议意图：{label(selected.suggestedIntent || "unknown")}</span>
          <span>流程节点：{label(selected.flowStep || "unknown")}</span>
          <span>语言：{languageName(selected.language)}</span>
        </div>
        <div className="form-grid">
          <label>意图名称<input value={detailDraft.displayName} onChange={(event) => setDetailDraft({ ...detailDraft, displayName: event.target.value })} /></label>
          <label>处理状态<select value={detailDraft.status} onChange={(event) => setDetailDraft({ ...detailDraft, status: event.target.value })}>{["candidate", "reviewed", "promoted", "ignored"].map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
          <label className="wide-field">处理说明<textarea value={detailDraft.description} onChange={(event) => setDetailDraft({ ...detailDraft, description: event.target.value })} /></label>
        </div>
        <div className="toolbar">
          <AsyncButton busyText="保存中..." onClick={() => patchSelected(detailDraft, "意图处理结果已保存")}>保存处理</AsyncButton>
          <AsyncButton busyText="标记中..." onClick={() => patchSelected({ status: "reviewed" }, "已标记为已确认")}>标记已确认</AsyncButton>
          <AsyncButton busyText="沉淀中..." onClick={() => patchSelected({ status: "promoted" }, "已标记为已沉淀")}>标记已沉淀</AsyncButton>
          <AsyncButton className="danger" busyText="忽略中..." onClick={() => patchSelected({ status: "ignored" }, "已忽略该候选")}>忽略</AsyncButton>
        </div>
        <details className="version-panel" open>
          <summary>样例记录</summary>
          <div className="learning-examples">
            {selected.examples?.length ? selected.examples.map((example, index) => <article key={index}>
              <strong>{String(example.customerText || selected.customerText)}</strong>
              <p>流程：{label(String(example.flowStep || selected.flowStep || "unknown"))} · 原识别：{label(String(example.detectedIntent || "unknown"))} · 时间：{formatDateTime(String(example.at || ""))}</p>
            </article>) : <div className="empty-state compact">暂无样例</div>}
          </div>
        </details>
        <div className="notice">下一步建议：高频候选先标记“已确认”，再把对应表达补到“话本流程”的客户常见表达或规则里。系统后续就会更稳定地识别这类客户意图。</div>
      </div> : <div className="empty-chat"><h3>选择一个候选意图</h3><p>左侧显示的是系统自动发现的识别盲区。选择后可以查看样例、确认它属于什么意图，并标记处理状态。</p></div>}
    </section>
  </div>;
}

function TrainingMaterials({ platform = false, simple = false }: { platform?: boolean; simple?: boolean }) {
  const base = platform ? "/api/admin/training-materials" : "/api/merchant/training-materials";
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", sourceType: "", status: "", limit: "100" });
  const rowsUrl = withQuery(base, platform ? filters : { countryId: filters.countryId, sourceType: filters.sourceType, status: filters.status, limit: filters.limit });
  const [rows, setRows] = useRows<TrainingMaterial>(rowsUrl);
  const pager = useClientPagination(rows, 20);
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [selected, setSelected] = useState<TrainingMaterial | null>(null);
  const [detail, setDetail] = useState<{ material: TrainingMaterial; items: TrainingMaterialItem[] } | null>(null);
  const [message, setMessage] = useState("");
  const reload = async () => { setRows(await loadRows(rowsUrl)); pager.setPage(1); };
  const loadDetail = async (row: TrainingMaterial) => {
    setSelected(row);
    setDetail(await api<{ material: TrainingMaterial; items: TrainingMaterialItem[] }>(`${base}/${row.id}`));
  };
  const uploadFile = async (upload: File) => {
    const body = new FormData();
    body.append("file", upload);
    body.append("countryId", filters.countryId || countries[0]?.id || "");
    const response = await fetch("/api/merchant/training-materials/import", { method: "POST", body });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "上传失败");
    const result = await response.json() as { imported: number; samples: number; knowledge: number; warnings?: string[] };
    setMessage(simple ? `已学习 ${result.imported} 条内容，后续回复会自动参考${result.warnings?.length ? `；${result.warnings.join("；")}` : ""}` : `已导入 ${result.imported} 条：样本 ${result.samples}，知识 ${result.knowledge}${result.warnings?.length ? `；${result.warnings.join("；")}` : ""}`);
    await reload();
  };
  const columns = platform
    ? ["merchantId", "countryName", "filename", "sourceType", "itemCount", "sampleCount", "knowledgeCount", "status", "createdAt"]
    : simple
      ? ["countryName", "filename", "sourceType", "itemCount", "status", "createdAt"]
      : ["countryName", "filename", "sourceType", "itemCount", "sampleCount", "knowledgeCount", "status", "createdAt"];
  return <div className={selected && detail ? "split work-split" : "single-column work-split"}><section className="work-panel">{simple && <div className="training-center-hero"><div><h3>上传资料，系统自动学习</h3><p>把聊天记录、话本、FAQ、业务规则、Word、TXT、Excel 或截图上传到这里。系统会自动拆解、打标签、整理成后续回复可参考的内容。</p></div><div className="training-steps"><span>1 选择国家</span><span>2 上传或粘贴资料</span><span>3 自动学习并生效</span></div></div>}<FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "countryId", "sourceType", "status", "limit"] : ["countryId", "sourceType", "status", "limit"]} selects={{ countryId: ["", ...countries.map((country) => country.id)], sourceType: ["", "csv", "xlsx", "docx", "txt", "image"], status: ["", "enabled", "disabled"] }} onApply={reload} />{!platform && <div className="material-uploader compact-uploader training-uploader"><div className="toolbar"><select value={filters.countryId} onChange={(e) => setFilters({ ...filters, countryId: e.target.value })}>{countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}</select><input type="file" accept=".csv,.xlsx,.xls,.docx,.txt,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /><AsyncButton disabled={!file} busyText="学习中..." onClick={async () => { if (file) await uploadFile(file); }}><Upload size={16}/>{simple ? "上传并学习" : "上传素材"}</AsyncButton></div><textarea placeholder={simple ? "也可以直接粘贴真实聊天记录、话本、问答或业务规则，系统会自动学习" : "粘贴聊天记录、话术、问答或业务规则"} value={pasted} onChange={(e) => setPasted(e.target.value)} /><AsyncButton disabled={!pasted.trim()} busyText="学习中..." onClick={async () => { if (!pasted.trim()) return; await uploadFile(new File([pasted], "pasted-material.txt", { type: "text/plain" })); setPasted(""); }}><FileText size={16}/>{simple ? "学习粘贴内容" : "导入粘贴文本"}</AsyncButton>{message && <div className="notice" role="status">{message}</div>}</div>}<Table rows={pager.rows} columns={columns} onRow={loadDetail} /><Pagination pager={pager} /></section>{selected && detail && <section className="detail-panel"><div><h3>{detail.material.filename}</h3><p>{countryLabel(detail.material.countryName)} · {label(detail.material.sourceType)} · {simple ? `已学习 ${detail.material.itemCount} 条内容` : `生成 ${detail.material.itemCount} 条 · 样本 ${detail.material.sampleCount} · 知识 ${detail.material.knowledgeCount}`}</p><div className="toolbar"><AsyncButton className="danger" busyText="删除中..." onClick={async () => { if (!window.confirm(simple ? "确认彻底删除这份学习资料？删除后系统不会再参考它。" : "确认彻底删除这个素材？它生成的样本和知识会一起删除。")) return; await api(`${base}/${detail.material.id}`, { method: "DELETE" }); setSelected(null); setDetail(null); await reload(); notify("success", simple ? "学习资料已彻底删除" : "素材已彻底删除"); }}>{simple ? "彻底删除资料" : "彻底删除素材"}</AsyncButton></div>{detail.material.warnings?.length ? <div className="warning">{detail.material.warnings.join("；")}</div> : null}<div className="messages material-items">{detail.items.map((item) => <article key={item.id}><strong>{simple ? "学习内容" : item.kind === "sample" ? "样本" : "知识"} · {languageName(item.language)}</strong><span>{item.title}</span><small>{label(item.intent || item.stage)}</small><p>{item.content}</p></article>)}</div><pre>{detail.material.rawText || ""}</pre></div></section>}</div>;
}

function Customers({ platform = false }: { platform?: boolean }) {
  const base = platform ? "/api/admin/customers" : "/api/merchant/customers";
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", status: "", language: "", limit: "100" });
  const rowsUrl = withQuery(base, platform ? filters : { countryId: filters.countryId, status: filters.status, language: filters.language, limit: filters.limit });
  const [rows, setRows] = useRows<Customer>(rowsUrl);
  const pager = useClientPagination(rows, 20);
  const [selected, setSelected] = useState<Customer | null>(null);
  const columns = platform
    ? ["merchantId", "countryName", "customerKey", "nickname", "lastA2CAccountPhone", "language", "stage", "extractedPhone", "extractedTelegram", "extractedWhatsApp", "status", "conversationCount", "lastSeenAt"]
    : ["countryName", "customerKey", "nickname", "lastA2CAccountPhone", "language", "stage", "extractedPhone", "extractedTelegram", "extractedWhatsApp", "status", "conversationCount", "lastSeenAt"];
  const reload = async () => { setRows(await loadRows(rowsUrl)); pager.setPage(1); };
  const deleteSelected = async () => {
    if (!selected) return;
    if (!window.confirm(`确认彻底删除客户 ${selected.customerKey}？该客户的所有会话、聊天记录、记忆和接管记录都会一起删除。`)) return;
    const url = platform
      ? `/api/admin/customers/${encodeURIComponent(selected.customerKey)}?merchantId=${encodeURIComponent(selected.merchantId || "default")}`
      : `/api/merchant/customers/${encodeURIComponent(selected.customerKey)}`;
    const result = await api<{ conversationsDeleted: number; messagesDeleted: number }>(url, { method: "DELETE" });
    notify("success", "客户已彻底删除", `已删除 ${result.conversationsDeleted} 个会话、${result.messagesDeleted} 条消息`);
    setSelected(null);
    await reload();
  };
  return <div className={selected ? "split work-split" : "single-column work-split"}><section className="work-panel"><FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "countryId", "status", "language", "limit"] : ["countryId", "status", "language", "limit"]} selects={{ countryId: ["", ...countries.map((country) => country.id)], status: ["", "active", "human_handoff"] }} onApply={reload} /><Table rows={pager.rows} columns={columns} onRow={setSelected} /><Pagination pager={pager} /></section>{selected && <section className="detail-panel"><div><div className="detail-title-row"><div><h3>{selected.customerKey}</h3><p>{countryLabel(selected.countryName)} · {selected.nickname || "无昵称"} · {label(selected.status)} · {languageName(selected.language)}</p></div><AsyncButton className="danger" busyText="删除中..." onClick={deleteSelected}>删除客户</AsyncButton></div><div className="form-grid"><label>首次接收账号<input readOnly value={selected.firstA2CAccountPhone || ""} /></label><label>最近接收账号<input readOnly value={selected.lastA2CAccountPhone || ""} /></label><label>手机号<input readOnly value={selected.extractedPhone || ""} /></label><label>Telegram<input readOnly value={selected.extractedTelegram || ""} /></label><label>WhatsApp<input readOnly value={selected.extractedWhatsApp || ""} /></label><label>会话数<input readOnly value={String(selected.conversationCount || 0)} /></label><label>最近会话ID<input readOnly value={selected.lastConversationId || ""} /></label></div><p>客户档案由回调自动创建和更新；删除客户会同步清理该客户所有会话、消息、记忆和接管记录。</p></div></section>}</div>;
}

function KnowledgePage({ platform }: { platform: boolean }) {
  const base = platform ? "/api/admin/knowledge" : "/api/merchant/knowledge";
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", type: "", enabled: "" });
  const rowsUrl = withQuery(base, platform ? filters : { countryId: filters.countryId, type: filters.type, enabled: filters.enabled });
  const [rows, setRows] = useRows<Knowledge>(rowsUrl);
  const pager = useClientPagination(rows, 20);
  const [form, setForm] = useState<Record<string, string>>({ merchantId: "default", countryId: "", type: "faq", title: "", content: "", language: "zh", priority: "0" });
  const [selected, setSelected] = useState<Knowledge | null>(null);
  const reload = async () => { setRows(await loadRows(rowsUrl)); pager.setPage(1); };
  return <div className={selected ? "split work-split" : "single-column work-split"}><section className="work-panel"><FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "countryId", "type", "enabled"] : ["countryId", "type", "enabled"]} selects={{ countryId: ["", ...countries.map((country) => country.id)], type: ["", "faq", "script", "rule", "forbidden"], enabled: ["", "true", "false"] }} onApply={reload} /><div className="toolbar wrap compact-create">{platform && <input placeholder={label("merchantId")} value={form.merchantId} onChange={(e) => setForm({ ...form, merchantId: e.target.value })} />}<select value={form.countryId || filters.countryId || countries[0]?.id || ""} onChange={(e) => setForm({ ...form, countryId: e.target.value })}>{countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}</select><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="faq">{label("faq")}</option><option value="script">{label("script")}</option><option value="rule">{label("rule")}</option><option value="forbidden">{label("forbidden")}</option></select><input placeholder="标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><input placeholder="内容" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /><AsyncButton disabled={!form.title.trim() || !form.content.trim()} busyText="新增中..." onClick={async () => { await api(base, { method: "POST", body: JSON.stringify(coercePatch({ ...form, countryId: form.countryId || filters.countryId || countries[0]?.id || "" })) }); setForm({ ...form, title: "", content: "" }); await reload(); }}><Plus size={16}/>新增知识</AsyncButton></div><Table rows={pager.rows} columns={["countryId", "type", "title", "content", "language", "priority", "enabled"]} onRow={setSelected} /><Pagination pager={pager} /></section>{selected && <section className="detail-panel"><Editor title="知识库编辑" value={selected as any} fields={["countryId", "type", "title", "content", "language", "priority", "enabled"]} selects={{ type: ["faq", "script", "rule", "forbidden"], enabled: ["true", "false"] }} onSave={async (patch) => { await api(`${base}/${selected.id}`, { method: "PATCH", body: JSON.stringify(coercePatch(patch)) }); await reload(); }} onDelete={async () => { if (!window.confirm("确认彻底删除这条知识？删除后 AI 不会再引用它。")) return; await api(`${base}/${selected.id}`, { method: "DELETE" }); setSelected(null); await reload(); notify("success", "知识已彻底删除"); }} /></section>}</div>;
}

function Conversations({ platform = false, handoffs = false }: { platform?: boolean; handoffs?: boolean }) {
  return platform ? <PlatformConversations handoffs={handoffs} /> : <MerchantConversations handoffs={handoffs} />;
}

const EXPORT_ALL_FILTERS: Filters = { limit: "50000" };

function ConversationExportBar({
  base,
  allFilters = EXPORT_ALL_FILTERS,
  scopedFilters,
  scopedLabel = "当前筛选",
  compact = false,
}: {
  base: string;
  allFilters?: Filters;
  scopedFilters?: Filters;
  scopedLabel?: string;
  compact?: boolean;
}) {
  return <div className={`conversation-export-bar ${compact ? "compact" : ""}`}>
    <div className="conversation-export-copy">
      <strong>对话数据导出</strong>
      <span>导出客户消息、客服回复、译文、意图、流程步骤、发送状态和客户资料。</span>
    </div>
    <div className="conversation-export-actions">
      <button className="export-primary" onClick={() => downloadExport(base, allFilters, "csv")}><FileText size={15}/>一键导出全部对话</button>
      {scopedFilters && <button onClick={() => downloadExport(base, scopedFilters, "csv")}><FileText size={15}/>{scopedLabel} CSV</button>}
      <button onClick={() => downloadExport(base, allFilters, "jsonl")}><FileText size={15}/>全部 JSONL</button>
      {scopedFilters && <button onClick={() => downloadExport(base, scopedFilters, "jsonl")}><FileText size={15}/>{scopedLabel} JSONL</button>}
    </div>
  </div>;
}

function PlatformConversations({ handoffs = false }: { handoffs?: boolean }) {
  const base = "/api/admin/conversations";
  const [filters, setFilters] = useState<Filters>({ merchantId: "", status: handoffs ? "human_handoff" : "", handoffStatus: "", language: "", limit: "100" });
  const rowsUrl = withQuery(base, filters);
  const [rows, setRows] = useRows<Conversation>(rowsUrl);
  const pager = useClientPagination(rows, 20);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const reload = async () => { setRows(await loadRows(rowsUrl)); pager.setPage(1); };
  return <div className={selected ? "split conversation-admin-layout work-split" : "single-column work-split"}><section className="work-panel"><ConversationExportBar base="/api/admin/conversations/export" scopedFilters={{ ...filters, limit: "50000" }} scopedLabel="当前筛选" /><FilterBar filters={filters} setFilters={setFilters} fields={["merchantId", "status", "handoffStatus", "language", "limit"]} selects={{ status: ["", "active", "human_handoff"], handoffStatus: ["", "pending", "processing", "done"] }} onApply={reload} /><Table rows={pager.rows} columns={["merchantId", "countryName", "customerPhone", "nickname", "language", "stage", "status", "handoffStatus"]} onRow={setSelected} selectedKey={selected?.id} rowKey={(row) => row.id} /><Pagination pager={pager} /></section>{selected && <section className="detail-panel"><ConversationDetail platform conversation={selected} refresh={async () => setRows(await loadRows(rowsUrl))} onDeleted={async () => { setSelected(null); await reload(); }} /></section>}</div>;
}

function MerchantConversations({ handoffs = false }: { handoffs?: boolean }) {
  const [accounts, setAccounts] = useRows<A2CAccount>("/api/merchant/a2c/accounts");
  const [unread, setUnread] = useState<UnreadSummary[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<A2CAccount | null>(null);
  const [filters, setFilters] = useState<Filters>({ status: handoffs ? "human_handoff" : "", handoffStatus: "", language: "", limit: "100" });
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [draftCustomer, setDraftCustomer] = useState<{ customerPhone: string; nickname: string } | null>(null);
  const [newCustomer, setNewCustomer] = useState({ customerPhone: "", nickname: "" });
  const [customerCollapsed, setCustomerCollapsed] = useState(false);
  const [accountKeyword, setAccountKeyword] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [error, setError] = useState("");
  const rowsUrl = selectedAccount
    ? withQuery("/api/merchant/conversations", { ...filters, a2cAccountPhone: selectedAccount.apiPhone })
    : "";
  const [rows, setRows] = useRows<Conversation>(rowsUrl || "/api/merchant/conversations?limit=1&a2cAccountPhone=__none__");
  const pager = useClientPagination(rows, 20);
  const filteredAccounts = useMemo(() => {
    const keyword = accountKeyword.trim().toLowerCase();
    return accounts.filter((account) => {
      const text = [account.verifiedName, account.apiPhone, account.countryName, account.countryCode, account.wabaId].join(" ").toLowerCase();
      if (keyword && !text.includes(keyword)) return false;
      if (accountStatus === "enabled" && !account.enabled) return false;
      if (accountStatus === "disabled" && account.enabled) return false;
      return true;
    });
  }, [accounts, accountKeyword, accountStatus]);
  const accountPager = useClientPagination(filteredAccounts, 10);

  useEffect(() => {
    if (!selectedAccount && accounts.length) setSelectedAccount(accounts.find((account) => account.enabled) || accounts[0]);
  }, [accounts, selectedAccount]);
  useEffect(() => {
    const loadUnread = () => api<{ rows: UnreadSummary[] }>("/api/merchant/conversations/unread-summary").then((res) => setUnread(res.rows)).catch(() => null);
    loadUnread();
    const timer = window.setInterval(loadUnread, 4000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSelected(null);
    setDraftCustomer(null);
  }, [selectedAccount?.apiPhone]);

  const reloadAccounts = async () => {
    setAccounts(await loadRows("/api/merchant/a2c/accounts"));
    accountPager.setPage(1);
  };
  const reloadRows = async () => {
    if (!selectedAccount) return;
    setRows(await loadRows(rowsUrl));
  };
  const accountUnread = (apiPhone: string) => unread.find((item) => item.a2cAccountPhone === apiPhone)?.unreadCount || 0;
  const conversationUnread = (conversationId: string) => unread.flatMap((item) => item.conversations).find((item) => item.conversationId === conversationId)?.unreadCount || 0;
  const openNewCustomer = () => {
    setError("");
    const customerPhone = newCustomer.customerPhone.trim();
    if (!customerPhone) {
      setError("请先填写客户号码。");
      return;
    }
    setSelected(null);
    setDraftCustomer({ customerPhone, nickname: newCustomer.nickname.trim() });
  };

  return <div className={`conversation-workspace ${customerCollapsed ? "customers-collapsed" : ""}`}>
    <section className="account-list">
      <div className="account-list-head">
        <div>
          <h3>客服账号</h3>
          <span>{accounts.length ? `共 ${accounts.length} 个` : "未同步"}</span>
        </div>
        <AsyncButton className="sync-compact-button" busyText="同步中..." onClick={async () => { await api("/api/merchant/a2c/accounts/sync", { method: "POST" }); await reloadAccounts(); }}><RefreshCw size={14}/>同步</AsyncButton>
      </div>
      {accounts.length ? <>
        <div className="account-list-filter">
          <input value={accountKeyword} onChange={(e) => { setAccountKeyword(e.target.value); accountPager.setPage(1); }} placeholder="搜索账号/名称" />
          <select value={accountStatus} onChange={(e) => { setAccountStatus(e.target.value); accountPager.setPage(1); }}>
            <option value="">全部</option>
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </select>
        </div>
        <div className="account-list-meta">筛选 {filteredAccounts.length} 个 · 第 {accountPager.page}/{accountPager.totalPages} 页</div>
        <div className="stack-list account-scroll-list">
          {accountPager.rows.map((account) => <button key={account.id} className={`list-item account-card ${selectedAccount?.id === account.id ? "active" : ""}`} onClick={() => setSelectedAccount(account)}>
            <strong title={account.verifiedName || account.apiPhone}>{account.verifiedName || account.apiPhone}{accountUnread(account.apiPhone) > 0 && <span className="badge">{accountUnread(account.apiPhone)}</span>}</strong>
            <span title={account.apiPhone}>{account.apiPhone}</span>
            <small>{countryLabel(account.countryName)} · {account.enabled ? "启用" : "停用"}</small>
          </button>)}
          {!filteredAccounts.length && <div className="empty-state">没有符合筛选条件的客服账号。</div>}
        </div>
        <AccountPagination pager={accountPager} />
      </> : <div className="empty-state">配置 A2C 密钥后点击同步账号；同步后可从这里选择客服账号主动发消息。</div>}
    </section>
    <section className="customer-list">
      <div className="panel-title">
        <h3>客户</h3>
        {!customerCollapsed && <span>{selectedAccount ? `${countryLabel(selectedAccount.countryName)} · ${selectedAccount.apiPhone}` : "未选择客服账号"}</span>}
        <button className="ghost icon-only" title={customerCollapsed ? "展开客户列表" : "收起客户列表"} onClick={() => setCustomerCollapsed(!customerCollapsed)}>{customerCollapsed ? <ChevronsRight size={16}/> : <ChevronsLeft size={16}/>}</button>
      </div>
      {!customerCollapsed && <>
        <details className="conversation-tools">
          <summary>筛选客户</summary>
          <FilterBar filters={filters} setFilters={setFilters} fields={["status", "handoffStatus", "language", "limit"]} selects={{ status: ["", "active", "human_handoff"], handoffStatus: ["", "pending", "processing", "done"] }} onApply={reloadRows} />
        </details>
        <ConversationExportBar base="/api/merchant/conversations/export" scopedFilters={selectedAccount ? { ...filters, a2cAccountPhone: selectedAccount.apiPhone, limit: "50000" } : undefined} scopedLabel="当前账号" compact />
        <details className="conversation-tools">
          <summary>主动新建对话</summary>
          <div className="proactive-panel compact">
            <input placeholder="客户号码 / A2C 客户标识" value={newCustomer.customerPhone} onChange={(e) => setNewCustomer({ ...newCustomer, customerPhone: e.target.value })} />
            <input placeholder="昵称，可选" value={newCustomer.nickname} onChange={(e) => setNewCustomer({ ...newCustomer, nickname: e.target.value })} />
            <button disabled={!selectedAccount} onClick={openNewCustomer}>打开对话框</button>
            {error && <div className="error">{error}</div>}
          </div>
        </details>
        <div className="stack-list conversation-list">
          {pager.rows.map((row) => {
            const unreadCount = conversationUnread(row.id);
            return <button key={row.id} className={`conversation-row ${selected?.id === row.id ? "active" : ""}`} onClick={() => { setSelected(row); setDraftCustomer(null); }}>
              <span className="conversation-row-main">
                <strong title={row.nickname || row.customerPhone}>{row.nickname || row.customerPhone}</strong>
                {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
              </span>
              <span className="conversation-row-phone" title={row.customerPhone}>{row.customerPhone || "未记录客户号"}</span>
              <span className="conversation-row-meta">
                <span>{countryLabel(row.countryName)}</span>
                <span>{languageName(row.language)}</span>
                <span>{label(row.stage)}</span>
                <span>{label(row.handoffStatus)}</span>
              </span>
            </button>;
          })}
          {!rows.length && <div className="empty-state">这个客服账号下还没有客户会话。可以等待客户发消息，或主动打开新客户对话框。</div>}
        </div>
        <Pagination pager={pager} />
      </>}
    </section>
    <section className="chat-pane">{selected ? <ConversationDetail conversation={selected} refresh={async () => { await reloadRows(); const res = await api<{ rows: UnreadSummary[] }>("/api/merchant/conversations/unread-summary"); setUnread(res.rows); }} onDeleted={async () => { setSelected(null); await reloadRows(); const res = await api<{ rows: UnreadSummary[] }>("/api/merchant/conversations/unread-summary"); setUnread(res.rows); }} /> : selectedAccount && draftCustomer ? <ProactiveConversationDetail account={selectedAccount} target={draftCustomer} onCreated={async (conversation) => { setSelected(conversation); setDraftCustomer(null); setNewCustomer({ customerPhone: "", nickname: "" }); await reloadRows(); }} /> : <div className="empty-chat export-empty-state"><h3>选择客户开始对话</h3><p>左侧选择客服账号，中间选择客户；也可以先一键导出全部线上对话用于复盘、训练或交给同事分析。</p><ConversationExportBar base="/api/merchant/conversations/export" scopedFilters={selectedAccount ? { ...filters, a2cAccountPhone: selectedAccount.apiPhone, limit: "50000" } : undefined} scopedLabel="当前账号" /></div>}</section>
  </div>;
}

function ProactiveConversationDetail({ account, target, onCreated }: { account: A2CAccount; target: { customerPhone: string; nickname: string }; onCreated: (conversation: Conversation) => Promise<void> }) {
  const [send, setSend] = useState({ type: "text", content: "", url: "", caption: "", fileName: "" });
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  return <div className="conversation-detail proactive-chat"><div className="chat-header"><div><h3>{target.customerPhone}</h3><p>通过客服账号 {account.verifiedName || account.apiPhone} 主动发送</p></div><span className="status-pill neutral">{countryLabel(account.countryName)}</span></div>{error && <div className="error" role="alert">{error}</div>}{statusMessage && <div className="notice" role="status">{statusMessage}</div>}<div className="empty-chat compact"><h3>新对话</h3><p>发送第一条消息后，系统会自动创建客户档案和会话记录。</p></div><div className="send chat-composer"><select value={send.type} onChange={(e) => setSend({ ...send, type: e.target.value })}>{MESSAGE_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><input placeholder="客服原文" value={send.content} onChange={(e) => setSend({ ...send, content: e.target.value })} /><input placeholder="媒体链接" value={send.url} onChange={(e) => setSend({ ...send, url: e.target.value })} /><input placeholder="说明/文件名" value={send.caption} onChange={(e) => setSend({ ...send, caption: e.target.value })} /><AsyncButton disabled={!canSendMessage(send)} busyText="发送中..." onClick={async () => { setError(""); setStatusMessage(""); try { const res = await api<{ conversation: Conversation }>(`/api/merchant/a2c/accounts/${encodeURIComponent(account.apiPhone)}/send`, { method: "POST", body: JSON.stringify({ ...send, customerPhone: target.customerPhone, nickname: target.nickname }) }); setStatusMessage("消息已发送，会话已创建。"); await onCreated(res.conversation); } catch (err) { setError(err instanceof Error ? err.message : "发送失败"); } }}><Send size={16}/>发送</AsyncButton></div></div>;
}

function ConversationDetail({ platform = false, conversation, refresh, onDeleted }: { platform?: boolean; conversation: Conversation; refresh: () => void; onDeleted?: () => Promise<void> | void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [memory, setMemory] = useState<CustomerMemory | null>(null);
  const [review, setReview] = useState<ConversationReviewResponse>({ review: null, items: [] });
  const [notes, setNotes] = useState("");
  const [send, setSend] = useState({ type: "text", content: "", url: "", caption: "", fileName: "" });
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const loadMessages = async () => {
    const res = await api<{ rows: ChatMessage[] }>(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/messages?limit=100`);
    setMessages(res.rows);
  };
  useEffect(() => {
    if (!platform) api(`/api/merchant/conversations/${conversation.id}/read`, { method: "POST" }).then(() => refresh()).catch(() => null);
    loadMessages().catch(() => null);
    const timer = window.setInterval(() => loadMessages().catch(() => null), 3000);
    return () => window.clearInterval(timer);
  }, [conversation.id, platform]);
  useEffect(() => {
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, conversation.id]);
  useEffect(() => { api<CustomerMemory>(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/memory`).then((item) => { setMemory(item); setNotes(item.operatorNotes || ""); }).catch(() => { setMemory(null); setNotes(""); }); }, [conversation.id, platform]);
  const loadReview = async () => setReview(await api<ConversationReviewResponse>(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/review`));
  useEffect(() => { loadReview().catch(() => setReview({ review: null, items: [] })); }, [conversation.id, platform]);
  const memoryUrl = `${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/memory`;
  const lastOutboundPayload = [...messages].reverse().find((item) => item.direction === "outbound")?.rawPayload || {};
  const strictEnabled = lastOutboundPayload.strictFlowEnabled;
  const flowStep = conversation.flowStep || lastOutboundPayload.strictFlowStep || "未识别";
  return <div className="conversation-detail"><div className="chat-header"><div><h3>{conversation.nickname || conversation.customerPhone}</h3><div className="header-meta"><span>{countryLabel(conversation.countryName)}</span><span>{languageName(conversation.language)}</span><span>客服账号：{conversation.a2cAccountPhone || "未识别"}</span><span>流程：{label(flowStep)}</span><span>回复模式：{replyModeLabel(lastOutboundPayload.replyMode)}</span><span>{strictEnabled === true ? "严格流程已命中" : strictEnabled === false ? "未启用严格流程" : "严格流程待判断"}</span><span>手机：{conversation.extractedPhone || "未识别"}</span><span>TG：{conversation.extractedTelegram || "未识别"}</span><span>WS：{conversation.extractedWhatsApp || "未识别"}</span></div>{strictEnabled === false && <div className="warning compact">当前会话未启用严格话本流程，可能走普通回复。</div>}</div><div className="chat-actions">{!platform && <select value={conversation.handoffStatus} onChange={async (e) => { setError(""); setStatusMessage("正在更新接管状态..."); await api(`/api/merchant/handoffs/${conversation.id}`, { method: "PATCH", body: JSON.stringify({ handoffStatus: e.target.value }) }); setStatusMessage("接管状态已更新。"); await loadReview().catch(() => null); refresh(); }}><option value="pending">待处理</option><option value="processing">处理中</option><option value="done">已完成</option></select>}<AsyncButton className="danger" busyText="删除中..." onClick={async () => { if (!window.confirm("确认彻底删除这个会话？聊天记录和接管记录会一起删除。")) return; await api(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}`, { method: "DELETE" }); notify("success", "会话已彻底删除"); await onDeleted?.(); }}>删除会话</AsyncButton></div></div>{error && <div className="error" role="alert">{error}</div>}{statusMessage && <div className="notice" role="status">{statusMessage}</div>}<div className="memory compact-memory"><h3>客户记忆文件</h3><p>{localizeSystemText(memory?.summary || "暂无记忆，收到客户消息后会自动生成。")}</p><textarea placeholder="人工备注，会被 AI 作为客户记忆参考" value={notes} onChange={(e) => setNotes(e.target.value)} /><AsyncButton busyText="保存中..." onClick={async () => { setError(""); const item = await api<CustomerMemory>(memoryUrl, { method: "PATCH", body: JSON.stringify({ operatorNotes: notes }) }); setMemory(item); setNotes(item.operatorNotes || ""); setStatusMessage("客户记忆已保存。"); }}>保存记忆</AsyncButton></div><ConversationReviewCard platform={platform} conversationId={conversation.id} data={review} reload={loadReview} setStatusMessage={setStatusMessage} setError={setError} /><div className="chat-window" ref={messagesRef}>{messages.length ? messages.map((m, i) => <ChatBubble key={`${m.id || m.createdAt}-${i}`} message={m} />) : <div className="empty-state">暂无聊天记录</div>}</div>{!platform && <div className="send chat-composer"><select value={send.type} onChange={(e) => setSend({ ...send, type: e.target.value })}>{MESSAGE_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><input placeholder="客服原文" value={send.content} onChange={(e) => setSend({ ...send, content: e.target.value })} /><input placeholder="媒体链接" value={send.url} onChange={(e) => setSend({ ...send, url: e.target.value })} /><input placeholder="说明/文件名" value={send.caption} onChange={(e) => setSend({ ...send, caption: e.target.value })} /><AsyncButton disabled={!canSendMessage(send)} busyText="发送中..." onClick={async () => { setError(""); setStatusMessage(""); try { await api(`/api/merchant/conversations/${conversation.id}/send`, { method: "POST", body: JSON.stringify(send) }); setSend({ ...send, content: "", url: "", caption: "" }); setStatusMessage("消息已发送。"); await loadMessages(); } catch (err) { setError(err instanceof Error ? err.message : "发送失败"); } }}><Send size={16}/>发送</AsyncButton></div>}</div>;
}

function ConversationReviewCard({ platform, conversationId, data, reload, setStatusMessage, setError }: { platform: boolean; conversationId: string; data: ConversationReviewResponse; reload: () => Promise<void>; setStatusMessage: (value: string) => void; setError: (value: string) => void }) {
  const generate = async () => {
    setError("");
    setStatusMessage("正在生成对话复盘...");
    await api(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversationId}/review`, { method: "POST" });
    await reload();
    setStatusMessage("对话复盘已生成。");
  };
  const apply = async (itemId: number) => {
    setError("");
    setStatusMessage("正在加入训练中心...");
    await api(`/api/merchant/conversations/${conversationId}/review/apply`, { method: "POST", body: JSON.stringify({ itemId }) });
    await reload();
    setStatusMessage("候选内容已加入训练中心。");
    notify("success", "已加入训练中心");
  };
  const review = data.review;
  return <details className="memory review-card review-card-collapsible">
    <summary className="review-summary"><div><h3>对话复盘</h3><p>{review ? review.summary : "默认收起，需要查看质量分析或沉淀样本时再展开。"}</p></div><div className="review-score compact">{review ? <><strong>{review.score}</strong><span>分</span></> : <span>未生成</span>}</div></summary>
    <div className="review-card-body">
      <div className="toolbar"><AsyncButton onClick={generate} busyText="生成中...">生成复盘</AsyncButton>{review?.goalCompleted && <span className="status-pill ok">目标已完成</span>}</div>
      {review && <div className="review-grid">
        <ReviewList title="客户主要疑虑" rows={review.mainConcerns} />
        <ReviewList title="发现的问题" rows={review.mistakes} />
        <ReviewList title="优秀回复" rows={review.goodReplies} />
        <ReviewList title="优化建议" rows={review.improvementActions} />
      </div>}
      {data.items.length > 0 && <div className="review-items"><h4>候选学习内容</h4>{data.items.map((item) => <article key={item.id}><div><strong>{item.title}</strong><small>{item.itemType === "sample" ? "样本候选" : "知识候选"} · {item.status === "applied" ? "已加入" : "待审核"}</small></div>{!platform && item.status !== "applied" && <AsyncButton onClick={() => apply(item.id)} busyText="加入中...">加入训练中心</AsyncButton>}</article>)}</div>}
    </div>
  </details>;
}

function ReviewList({ title, rows }: { title: string; rows: string[] }) {
  return <div><strong>{title}</strong>{rows.length ? <ul>{rows.slice(0, 4).map((row, index) => <li key={`${title}-${index}`}>{row}</li>)}</ul> : <p>暂无</p>}</div>;
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const payload = message.rawPayload || {};
  const original = payload.originalContent || "";
  const translated = payload.translatedContent || "";
  const operatorTranslated = payload.operatorTranslatedContent || "";
  const translationStatus = payload.translationStatus || (original && translated && normalizeText(original) !== normalizeText(translated) ? "translated" : undefined);
  const canShowTranslation = Boolean(original && translated && translationStatus === "translated" && normalizeText(original) !== normalizeText(translated));
  const translationIssue = original && !canShowTranslation ? payload.translationError || (translationStatus === "skipped" ? "无需翻译或翻译配置未完成" : "译文未生成，请先检查 Google AI Studio 配置") : "";
  const isOutbound = message.direction === "outbound";
  const operatorTranslationStatus = payload.operatorTranslationStatus || (operatorTranslated && normalizeText(operatorTranslated) !== normalizeText(message.content) ? "translated" : undefined);
  const canShowOperatorTranslation = Boolean(isOutbound && operatorTranslated && operatorTranslationStatus === "translated" && normalizeText(operatorTranslated) !== normalizeText(message.content));
  const operatorTranslationIssue = isOutbound && payload.operatorTranslationError && !canShowOperatorTranslation ? payload.operatorTranslationError : "";
  const sendIssue = isOutbound && payload.a2cSendStatus === "failed" ? `A2C发送失败：${translateSystemMessage(payload.a2cSendError || "未知错误")}` : "";
  const mediaUrl = mediaUrlFromMessage(message);
  return <article className={`chat-bubble ${message.direction}`}><div className="bubble-meta"><span>{isOutbound ? "客服" : "客户"}</span><time>{formatTime(message.createdAt)}</time></div>{mediaUrl ? <MediaPreview type={message.msgType} url={mediaUrl} caption={message.content} /> : original ? <div className="translation-block"><strong>{isOutbound ? "客服原文" : "客户原文"}</strong><p>{original}</p>{canShowTranslation ? <><strong>{isOutbound ? "发送译文" : "中文译文"}{payload.targetLanguage ? ` · ${languageName(payload.targetLanguage)}` : ""}</strong><p>{translated}</p></> : !isOutbound && <div className="translation-warning">{translateSystemMessage(translationIssue)}</div>}{canShowOperatorTranslation && <><strong>中文译文 · {languageName(payload.operatorTranslationTargetLanguage || "zh-CN")}</strong><p>{operatorTranslated}</p></>}{operatorTranslationIssue && <div className="translation-warning">{translateSystemMessage(operatorTranslationIssue)}</div>}</div> : <div className="translation-block"><strong>{isOutbound ? "发送原文" : "消息内容"}</strong><p>{message.content}</p>{canShowOperatorTranslation && <><strong>中文译文 · {languageName(payload.operatorTranslationTargetLanguage || "zh-CN")}</strong><p>{operatorTranslated}</p></>}{operatorTranslationIssue && <div className="translation-warning">{translateSystemMessage(operatorTranslationIssue)}</div>}</div>}{sendIssue && <div className="translation-warning">{sendIssue}</div>}{isOutbound && <div className="message-diagnostics"><span>{replyModeLabel(payload.replyMode)}</span>{payload.strictFlowStep && <span>{label(payload.strictFlowStep)}</span>}{payload.strictFlowEnabled === true && <span>严格流程</span>}</div>}<small>{label(message.intent)} · {languageName(message.language)}</small></article>;
}

function MediaPreview({ type, url, caption }: { type: string; url: string; caption: string }) {
  if (type === "image") return <div className="media-preview"><a href={url} target="_blank" rel="noreferrer"><img src={url} alt={caption && caption !== "[图片]" ? caption : "客户发送的图片"} loading="lazy" /></a>{caption && caption !== "[图片]" && <p>{caption}</p>}</div>;
  if (type === "video") return <div className="media-preview"><video src={url} controls preload="metadata" />{caption && caption !== "[视频]" && <p>{caption}</p>}</div>;
  if (type === "audio") return <div className="media-preview"><audio src={url} controls />{caption && caption !== "[音频]" && <p>{caption}</p>}</div>;
  return <div className="media-preview file-preview"><a href={url} target="_blank" rel="noreferrer">{caption && caption !== "[文件]" ? caption : "打开文件"}</a></div>;
}

function mediaUrlFromMessage(message: ChatMessage) {
  const payload = message.rawPayload || {};
  const nested = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
  const url = String(payload.mediaUrl || payload.url || nested.url || "");
  if (url) return url;
  if (message.msgType !== "text" && /^https?:\/\//i.test(message.content)) return message.content;
  return "";
}

function useClientPagination<T>(rows: T[], defaultPageSize = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);
  const start = (safePage - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total: rows.length,
    totalPages,
    setPage,
    setPageSize: (next: number) => {
      setPageSize(next);
      setPage(1);
    }
  };
}

function Pagination({ pager }: { pager: { page: number; pageSize: number; total: number; totalPages: number; setPage: (page: number) => void; setPageSize: (pageSize: number) => void } }) {
  if (pager.total <= pager.pageSize && pager.page === 1) return <div className="pagination compact">共 {pager.total} 条</div>;
  return <div className="pagination">
    <span>共 {pager.total} 条 · 第 {pager.page} / {pager.totalPages} 页</span>
    <select value={pager.pageSize} onChange={(e) => pager.setPageSize(Number(e.target.value))}>
      {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} 条/页</option>)}
    </select>
    <button className="ghost" disabled={pager.page <= 1} onClick={() => pager.setPage(pager.page - 1)}>上一页</button>
    <button className="ghost" disabled={pager.page >= pager.totalPages} onClick={() => pager.setPage(pager.page + 1)}>下一页</button>
  </div>;
}

function AccountPagination({ pager }: { pager: { page: number; pageSize: number; total: number; totalPages: number; setPage: (page: number) => void; setPageSize: (pageSize: number) => void } }) {
  if (pager.total <= pager.pageSize && pager.page === 1) return <div className="account-mini-pager single">共 {pager.total} 个账号</div>;
  return <div className="account-mini-pager">
    <button className="ghost" disabled={pager.page <= 1} onClick={() => pager.setPage(pager.page - 1)}>上一页</button>
    <select aria-label="每页客服账号数量" value={pager.pageSize} onChange={(e) => pager.setPageSize(Number(e.target.value))}>
      {[10, 20, 50].map((size) => <option key={size} value={size}>{size}/页</option>)}
    </select>
    <button className="ghost" disabled={pager.page >= pager.totalPages} onClick={() => pager.setPage(pager.page + 1)}>下一页</button>
  </div>;
}

function Table<T extends Record<string, any>>({ rows, columns, onRow, selectedKey, rowKey }: { rows: T[]; columns: string[]; onRow?: (row: T) => void; selectedKey?: string | number; rowKey?: (row: T, index: number) => string | number }) {
  const [internalSelected, setInternalSelected] = useState<string | number | undefined>();
  const activeKey = selectedKey ?? internalSelected;
  return <div className="table"><table><thead><tr>{columns.map((c) => <th key={c}>{label(c)}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, i) => { const key = rowKey?.(row, i) ?? row.id ?? i; return <tr key={key} className={`${onRow ? "clickable" : ""} ${activeKey !== undefined && String(key) === String(activeKey) ? "selected" : ""}`} onClick={() => { if (!onRow) return; setInternalSelected(key); onRow(row); }}>{columns.map((c) => <td key={c}>{displayValue(c, row[c])}</td>)}</tr>; }) : <tr className="empty-row"><td colSpan={columns.length}>暂无数据</td></tr>}</tbody></table></div>;
}

function AsyncButton({ children, busyText, onClick, className, disabled = false }: { children: React.ReactNode; busyText: string; onClick: () => Promise<void>; className?: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return <button className={className} disabled={busy || disabled} aria-busy={busy} onClick={async () => { if (busy || disabled) return; setBusy(true); setDone(false); try { await onClick(); setDone(true); window.setTimeout(() => setDone(false), 900); } catch (err) { notify("error", "操作失败", translateSystemMessage(err instanceof Error ? err.message : "未知错误")); } finally { setBusy(false); } }}>{busy ? <><Loader2 size={16} className="spin"/>{busyText}</> : done ? <><CheckCircle2 size={16}/>已完成</> : children}</button>;
}

function Editor({ title, value, fields, selects, onSave, onDelete }: { title: string; value: Record<string, any>; fields: string[]; selects?: Record<string, string[]>; onSave: (patch: Record<string, any>) => Promise<void>; onDelete?: () => Promise<void> }) {
  const [draft, setDraft] = useState<Record<string, any>>(value);
  useEffect(() => setDraft(value), [value]);
  return <div><h3>{title}</h3><div className="form-grid">{fields.map((field) => <label key={field}>{label(field)}{selects?.[field] ? <select value={String(draft[field] ?? "")} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}>{selects[field].map((option) => <option key={option} value={option}>{label(option)}</option>)}</select> : <input value={String(draft[field] ?? "")} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} />}</label>)}</div><div className="toolbar"><AsyncButton busyText="保存中..." onClick={() => onSave(draft)}>保存</AsyncButton>{onDelete && <AsyncButton className="danger" busyText="删除中..." onClick={onDelete}>删除</AsyncButton>}</div></div>;
}

function CountryPresetDatalist() {
  return <datalist id="merchant-country-presets">{COUNTRY_PRESETS.map((item) => <option key={item.code} value={item.name} />)}</datalist>;
}

function CountrySettingsEditor({ value, onSave }: { value: MerchantCountry; onSave: (patch: Record<string, any>) => Promise<void> }) {
  const [draft, setDraft] = useState<Record<string, any>>(value);
  useEffect(() => setDraft(value), [value]);
  const updateName = (name: string) => {
    const inferred = inferCountryProfile(name);
    setDraft({ ...draft, name, code: inferred.code, defaultLanguage: inferred.defaultLanguage });
  };
  return <div><h3>国家设置</h3><div className="form-grid">
    <label>国家<input list="merchant-country-presets" placeholder="输入或选择国家，例如：巴西" value={String(draft.name ?? "")} onChange={(e) => updateName(e.target.value)} /></label>
    <label>国家代码<input readOnly value={String(draft.code ?? "")} /></label>
    <label>默认语言<input readOnly value={languageName(draft.defaultLanguage)} /></label>
    <label>{label("platformRegisterUrl")}<input value={String(draft.platformRegisterUrl ?? "")} onChange={(e) => setDraft({ ...draft, platformRegisterUrl: e.target.value })} /></label>
    <label>{label("tgRegisterGuideUrl")}<input value={String(draft.tgRegisterGuideUrl ?? "")} onChange={(e) => setDraft({ ...draft, tgRegisterGuideUrl: e.target.value })} /></label>
    <label>{label("requirePlatformAccount")}<select value={String(draft.requirePlatformAccount ?? true)} onChange={(e) => setDraft({ ...draft, requirePlatformAccount: e.target.value })}><option value="true">需要开户注册</option><option value="false">不需要开户注册</option></select></label>
    <label>{label("requirePhone")}<select value={String(draft.requirePhone ?? true)} onChange={(e) => setDraft({ ...draft, requirePhone: e.target.value })}><option value="true">需要手机号</option><option value="false">不需要手机号</option></select></label>
    <label>{label("requireTelegram")}<select value={String(draft.requireTelegram ?? true)} onChange={(e) => setDraft({ ...draft, requireTelegram: e.target.value })}><option value="true">需要TG</option><option value="false">不需要TG</option></select></label>
    <label>{label("requireWhatsApp")}<select value={String(draft.requireWhatsApp ?? false)} onChange={(e) => setDraft({ ...draft, requireWhatsApp: e.target.value })}><option value="false">不需要WS</option><option value="true">需要WS</option></select></label>
    <label>{label("status")}<select value={String(draft.status ?? "active")} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="active">启用</option><option value="disabled">停用</option></select></label>
  </div><div className="toolbar"><AsyncButton busyText="保存中..." onClick={() => onSave(draft)}>保存</AsyncButton></div></div>;
}

function FilterBar({ filters, setFilters, fields, selects = {}, onApply }: { filters: Filters; setFilters: (filters: Filters) => void; fields: string[]; selects?: Record<string, string[]>; onApply: () => Promise<void> }) {
  return <div className="toolbar wrap filters">{fields.map((field) => selects[field] ? <select key={field} value={filters[field] || ""} onChange={(e) => setFilters({ ...filters, [field]: e.target.value })}>{selects[field].map((option) => <option key={option} value={option}>{option ? optionLabel(field, option) : label(field)}</option>)}</select> : <input key={field} placeholder={label(field)} value={filters[field] || ""} onChange={(e) => setFilters({ ...filters, [field]: e.target.value })} />)}<AsyncButton onClick={onApply} busyText="筛选中..."><Search size={16}/>筛选</AsyncButton><button className="ghost" onClick={() => { const reset = Object.fromEntries(Object.keys(filters).map((key) => [key, key === "limit" ? "100" : ""])); setFilters(reset); }}><X size={16}/>重置</button></div>;
}

function canSendMessage(input: { type: string; content: string; url: string }) {
  return input.type === "text" ? Boolean(input.content.trim()) : Boolean(input.url.trim());
}

function coercePatch(input: Record<string, any>) {
  const patch = { ...input };
  if ("priority" in patch) patch.priority = Number(patch.priority || 0);
  if (patch.enabled === "true") patch.enabled = true;
  if (patch.enabled === "false") patch.enabled = false;
  for (const key of ["requirePlatformAccount", "requirePhone", "requireTelegram", "requireWhatsApp"]) {
    if (patch[key] === "true") patch[key] = true;
    if (patch[key] === "false") patch[key] = false;
  }
  return patch;
}

function useRows<T>(url: string): [T[], (rows: T[]) => void] {
  const [rows, setRows] = useState<T[]>([]);
  useEffect(() => { loadRows<T>(url).then(setRows).catch(() => setRows([])); }, [url]);
  return [rows, setRows];
}

async function loadRows<T>(url: string): Promise<T[]> {
  return (await api<{ rows: T[] }>(url)).rows;
}

function downloadExport(base: string, filters: Filters, format: "csv" | "jsonl") {
  const url = withQuery(base, { ...filters, format });
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  notify("success", format === "csv" ? "正在导出 CSV" : "正在导出 JSONL", "浏览器会开始下载对话数据文件。");
}

function withQuery(base: string, filters: Filters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "") params.set(key, value);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function roleName(role: string) {
  return ({ platform_admin: "平台管理员", merchant_admin: "商户管理员", merchant_operator: "商户运营" } as Record<string, string>)[role] || role;
}

function formatTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("zh-CN", { timeZone: BEIJING_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { timeZone: BEIJING_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace(/\//g, "-");
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function displayValue(column: string, value: unknown) {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (value === null || value === undefined || value === "") return "";
  if (["countryId", "countryName", "countryCode"].includes(column)) return countryLabel(value);
  if (["language", "defaultLanguage"].includes(column)) return languageName(String(value));
  if (["status", "enabled", "role", "stage", "intent", "type", "sourceType", "handoffStatus", "msgType", "kind"].includes(column)) {
    const text = label(String(value));
    if (["status", "enabled", "handoffStatus", "stage", "intent"].includes(column)) return <span className={`status-pill ${statusTone(String(value))}`}>{text}</span>;
    return text;
  }
  return String(value);
}

function countryLabel(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = text.toLowerCase();
  if (normalized.includes(":")) {
    const suffix = normalized.split(":").pop() || normalized;
    const translated = countryLabel(suffix);
    if (translated !== suffix) return translated;
  }
  const dictionary: Record<string, string> = {
    "default": "默认国家",
    "default:default": "默认国家",
    "默认国家": "默认国家",
    "brazil": "巴西",
    "br": "巴西",
    "philippines": "菲律宾",
    "ph": "菲律宾",
    "japan": "日本",
    "jp": "日本",
    "malaysia": "马来西亚",
    "my": "马来西亚",
    "indonesia": "印尼",
    "id": "印尼",
    "thailand": "泰国",
    "th": "泰国",
    "vietnam": "越南",
    "vn": "越南",
    "china": "中国",
    "cn": "中国",
    "united states": "美国",
    "usa": "美国",
    "us": "美国",
    "bolivia": "玻利维亚",
    "bo": "玻利维亚",
    "mexico": "墨西哥",
    "mx": "墨西哥",
    "spain": "西班牙",
    "es": "西班牙"
  };
  return dictionary[normalized] || text;
}

function inferCountryProfile(value: string) {
  const text = value.trim();
  const normalized = text.toLowerCase();
  const preset = COUNTRY_PRESETS.find((item) => item.name === text || item.code === normalized || item.aliases.includes(normalized));
  if (preset) return { code: preset.code, defaultLanguage: preset.defaultLanguage };
  const ascii = normalized.replace(/[^a-z]/g, "").slice(0, 2);
  return { code: ascii || "default", defaultLanguage: "en" };
}

function localizeSystemText(value: unknown) {
  return String(value || "")
    .replace(/default:default/gi, "默认国家")
    .replace(/\bBrazil\b/gi, "巴西")
    .replace(/\bPhilippines\b/gi, "菲律宾")
    .replace(/\bJapan\b/gi, "日本")
    .replace(/\bMalaysia\b/gi, "马来西亚")
    .replace(/\bIndonesia\b/gi, "印尼")
    .replace(/\bneed_platform_register\b/g, label("need_platform_register"))
    .replace(/\bneed_phone_or_tg\b/g, label("need_phone_or_tg"))
    .replace(/\bready_for_handoff\b/g, label("ready_for_handoff"))
    .replace(/\btrust_concern\b/g, label("trust_concern"))
    .replace(/\birrelevant_or_spam\b/g, label("irrelevant_or_spam"))
    .replace(/\bgreeting\b/g, label("greeting"))
    .replace(/\bunknown\b/g, label("unknown"));
}

function optionLabel(field: string, option: string) {
  if (field === "countryId" || field === "countryName" || field === "countryCode") return countryLabel(option);
  return label(option);
}

function statusTone(value: string) {
  if (["active", "enabled", "ok", "bound", "done", "ready_for_handoff", "available", "reviewed", "promoted"].includes(value)) return "success";
  if (["pending", "processing", "waiting", "need_platform_register", "need_phone_or_tg", "reserved", "candidate"].includes(value)) return "warning";
  if (["disabled", "error", "invalid", "human_handoff", "irrelevant_or_spam", "ignored"].includes(value)) return "danger";
  return "neutral";
}

function metricIcon(key: string) {
  return ({
    merchants: Building2,
    customers: Contact,
    conversations: MessageSquare,
    handoffs: Workflow,
    samples: Upload,
    users: Users,
    aiReplies: Bot,
    messages: MessageSquare
  } as Record<string, typeof Bot>)[key] || Bot;
}

function metricHint(key: string) {
  return ({
    merchants: "当前平台商户总量",
    customers: "已沉淀客户档案",
    conversations: "累计会话记录",
    handoffs: "需要人工跟进",
    samples: "已启用训练样本",
    users: "后台可登录账号",
    aiReplies: "AI 自动回复次数",
    messages: "今日消息处理量"
  } as Record<string, string>)[key] || "实时运营指标";
}

function merchantDashboardLabel(key: string, platform: boolean) {
  if (!platform && key === "samples") return "学习内容";
  if (!platform && key === "aiReplies") return "智能回复";
  return label(key);
}

function merchantDashboardHint(key: string, platform: boolean) {
  if (!platform && key === "samples") return "已学习并可参考的内容";
  if (!platform && key === "aiReplies") return "自动处理客户消息次数";
  return metricHint(key);
}

function translateSystemMessage(message: unknown) {
  const value = String(message || "");
  if (!value) return "";
  return value
    .replace(/invalid credentials/gi, "账号或密码错误")
    .replace(/A2C auth failed:/gi, "A2C认证失败：")
    .replace(/A2C send failed:/gi, "A2C发送失败：")
    .replace(/Visit too frequently, please try again later/gi, "访问过于频繁，请稍后再试")
    .replace(/A2C credentials are not configured/gi, "A2C配置未完成")
    .replace(/telegram bot token is required/gi, "请先填写TG机器人Token")
    .replace(/not found/gi, "未找到")
    .replace(/send failed/gi, "发送失败")
    .replace(/unknown/gi, "未知");
}

function languageName(code: unknown) {
  return ({
    zh: "中文",
    "zh-CN": "中文",
    en: "英语",
    ja: "日语",
    "pt-BR": "葡语",
    pt: "葡语",
    es: "西语",
    ms: "马来语",
    id: "印尼语",
    th: "泰语",
    vi: "越南语",
    unknown: "未知"
  } as Record<string, string>)[String(code || "")] || String(code || "");
}

function replyModeLabel(mode?: string) {
  return ({
    strict_flow: "严格话本",
    gemini: "普通回复",
    fallback: "兜底回复",
    manual: "人工发送"
  } as Record<string, string>)[String(mode || "")] || "未记录";
}

function label(key: string) {
  return ({
    merchants: "商户", conversations: "会话", handoffs: "接管", samples: "样本", knowledge: "知识库", materials: "素材", training: "训练中心", scriptFlows: "话本流程", intentLearning: "意图学习", customers: "客户", active: "活跃", disabled: "停用", enabled: "启用", pendingHandoffs: "待接管",
    name: "名称", status: "状态", id: "ID", email: "邮箱", role: "角色", merchantId: "商户ID", customerPhone: "客户", customerKey: "客户", nickname: "昵称",
    language: "语言", stage: "阶段", handoffStatus: "接管状态", customerMessage: "客户问题", standardReply: "标准回复", intent: "意图",
    priority: "优先级", a2cBaseUrl: "A2C地址", a2cAppId: "A2C应用ID", a2cAppSecret: "A2C密钥", a2cAccountPhone: "A2C接收账号", a2cWebhookUrl: "A2C回调地址",
    googleAiApiKey: "谷歌AI密钥", googleAiModel: "谷歌AI模型", smartReplyEnabled: "智能回复", strictScriptFlowEnabled: "严格话本流程", openaiApiKey: "旧版AI密钥", openaiModel: "旧版AI模型", telegramBotToken: "TG机器人", telegramHandoffChatId: "TG群ID",
    platformRegisterUrl: "开户链接", tgRegisterGuideUrl: "TG注册说明", registrationTutorialImageUrl: "注册教程图片", type: "类型", title: "标题", content: "内容", password: "新密码",
    inviteCode: "邀请码", registerUrl: "注册链接", assignedCustomerKey: "绑定客户", assignedConversationId: "绑定会话", platformAccount: "注册账号", assignedAt: "分配时间", usedAt: "使用时间", updatedAt: "更新时间",
    candidateKey: "候选键", suggestedIntent: "建议意图", displayName: "意图名称", description: "说明", customerText: "客户表达", detectedIntent: "原始意图", inferredIntent: "推断意图", contextualIntent: "上下文意图", occurrenceCount: "出现次数",
    limit: "数量", version: "版本", stepCount: "节点数", draft: "草稿", true: "启用", false: "停用", faq: "问答", script: "话术", rule: "规则", forbidden: "禁用表达", human_handoff: "已接管",
    pending: "待处理", processing: "处理中", done: "已完成", sourceType: "资料类型", count: "数量", filename: "文件名", itemCount: "学习数", sampleCount: "样本数",
    knowledgeCount: "知识数", createdAt: "导入时间", csv: "表格", xlsx: "表格", docx: "文档", txt: "文本", image: "图片",
    lastA2CAccountPhone: "最近接收账号", firstA2CAccountPhone: "首次接收账号", extractedPhone: "手机号", extractedTelegram: "Telegram",
    extractedWhatsApp: "WhatsApp", countryId: "国家", countryName: "国家", countryCode: "国家代码", code: "国家代码", defaultLanguage: "默认语言",
    requirePlatformAccount: "需平台开户", requirePhone: "需手机号", requireTelegram: "需TG", requireWhatsApp: "需WS",
    conversationCount: "会话数", lastSeenAt: "最近消息时间", firstSeenAt: "首次消息时间", lastConversationId: "最近会话ID",
    ok: "正常", missing: "未配置", error: "异常", unbound: "未绑定", waiting: "等待入群", bound: "已绑定", invalid: "已失效", apiPhone: "客服账号", verifiedName: "显示名称",
    wabaId: "业务账号ID", numberStatus: "号码状态", qualityRating: "质量评分", messagingLimit: "消息额度", syncedAt: "同步时间",
    platform_admin: "平台管理员", merchant_admin: "商户管理员", merchant_operator: "商户运营",
    text: "文本", video: "视频", audio: "音频", document: "文件", sample: "样本", item: "条目", available: "可用", reserved: "已分配", used: "已使用", candidate: "待处理", reviewed: "已确认", promoted: "已沉淀", ignored: "已忽略",
    inbound: "客户", outbound: "客服", unknown: "未知",
    need_platform_register: "待开户注册", need_phone_or_tg: "待补联系方式", ready_for_handoff: "可接管",
    first_greeting: "首次问候", interest_screening: "兴趣筛选", project_intro: "项目介绍", registration_intent: "确认注册意向", send_register_link: "发送链接邀请码",
    wait_registration: "等待完成注册", telegram_confirm: "确认TG", telegram_download: "引导下载TG", collect_telegram: "收集TG用户名", ended: "结束",
    flowCode: "流程编号", flowName: "流程名称", flowStep: "系统步骤", goal: "当前节点目标", triggerCondition: "触发条件", customerExpressions: "客户常见表达",
    collectInfo: "需要收集的信息", sendLink: "发链接", sendInvite: "发邀请码", nextCondition: "下一步条件", nextFlowCode: "下一流程编号", nextFlowStep: "下一系统步骤", sortOrder: "顺序", notes: "备注",
    greeting: "打招呼", ask_platform_register: "询问开户注册", platform_register_done: "开户注册完成", ask_tg_register: "询问TG注册",
    provide_phone: "提供手机号", provide_telegram: "提供TG", provide_phone_and_telegram: "提供手机号和TG", ask_link: "索要链接",
    ask_promotion: "询问活动", trust_concern: "信任疑虑", need_help: "需要协助", human_request: "要求人工", irrelevant_or_spam: "无关或垃圾消息",
    custom_unknown_question: "未知问题", contextual_acknowledgement: "上下文短确认", custom_unclassified_or_noise: "待判断噪声", custom_unclassified: "待识别新意图"
  } as Record<string, string>)[key] || key;
}

createRoot(document.getElementById("root")!).render(<App />);
