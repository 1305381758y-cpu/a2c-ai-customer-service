import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bot, Building2, CheckCircle2, ChevronsLeft, ChevronsRight, Contact, Copy, FileText, Loader2, LogOut, MessageSquare, Plus, RefreshCw, Search, Send, Settings, Upload, Users, Workflow, X } from "lucide-react";
import "./styles.css";

type User = { id: string; email: string; name: string; role: "platform_admin" | "merchant_admin" | "merchant_operator"; merchantId: string | null };
type Merchant = { id: string; name: string; status: string };
type Conversation = { id: string; merchantId: string; countryId: string; countryCode: string; countryName: string; customerPhone: string; a2cAccountPhone: string; nickname: string; language: string; stage: string; extractedPhone: string; extractedTelegram: string; extractedWhatsApp: string; status: string; handoffStatus: string; unreadCount: number };
type Customer = { id: number; merchantId: string; countryId: string; countryCode: string; countryName: string; customerKey: string; nickname: string; firstA2CAccountPhone: string; lastA2CAccountPhone: string; language: string; stage: string; extractedPhone: string; extractedTelegram: string; extractedWhatsApp: string; status: string; conversationCount: number; lastConversationId: string; firstSeenAt: string; lastSeenAt: string };
type Sample = { id: number; customerMessage: string; standardReply: string; stage: string; intent: string; language: string; keywords: string; priority: number; enabled?: boolean };
type Knowledge = { id: number; merchantId: string; type: string; title: string; content: string; language: string; priority: number; enabled: boolean };
type CustomerMemory = { id: number; summary: string; facts: Record<string, unknown>; operatorNotes: string; updatedAt: string };
type TrainingMaterial = { id: number; merchantId: string; sourceType: string; filename: string; status: string; itemCount: number; sampleCount: number; knowledgeCount: number; warnings: string[]; createdAt: string; rawText?: string };
type TrainingMaterialItem = { id: number; kind: string; title: string; content: string; intent: string; stage: string; language: string; enabled: boolean };
type A2CAccount = { id: number; merchantId: string; countryId: string; countryCode: string; countryName: string; defaultLanguage: string; apiPhone: string; wabaId: string; status: number; numberStatus: number; qualityRating: number; messagingLimit: number; verifiedName: string; enabled: boolean; syncedAt: string };
type InviteCode = { id: number; merchantId: string; countryId: string; countryName: string; a2cAccountId: number; a2cAccountPhone: string; code: string; registerUrl: string; status: string; assignedCustomerKey: string; assignedConversationId: string; platformAccount: string; assignedAt: string; usedAt: string; createdAt: string; updatedAt: string };
type MerchantCountry = { id: string; merchantId: string; code: string; name: string; defaultLanguage: string; platformRegisterUrl: string; tgRegisterGuideUrl: string; requirePlatformAccount: boolean; requirePhone: boolean; requireTelegram: boolean; requireWhatsApp: boolean; status: string };
type UnreadSummary = { a2cAccountPhone: string; unreadCount: number; conversations: Array<{ conversationId: string; customerPhone: string; unreadCount: number }> };
type ChatMessage = { id: number; direction: string; content: string; msgType: string; language: string; intent: string; createdAt: string; rawPayload?: { originalContent?: string; translatedContent?: string; targetLanguage?: string; translationStatus?: "translated" | "skipped" | "failed"; translationError?: string; manual?: boolean } };
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
  const nav = user.role === "platform_admin"
    ? [["dashboard", "总览", Bot], ["merchants", "商户", Building2], ["users", "后台账号", Users], ["config", "配置", Settings], ["customers", "客户", Contact], ["materials", "素材", FileText], ["knowledge", "知识库", Workflow], ["samples", "样本", Upload], ["conversations", "会话", MessageSquare], ["handoffs", "接管", Workflow]]
    : [["dashboard", "总览", Bot], ["customers", "客户", Contact], ["materials", "素材", FileText], ["knowledge", "知识库", Workflow], ["samples", "样本", Upload], ["conversations", "会话", MessageSquare], ["handoffs", "接管", Workflow], ["config", "设置", Settings]];
  return (
    <div className="app">
      <aside>
        <div className="side-brand"><span>AI</span><div><h2>A2C AI</h2><small>智能客服工作台</small></div></div>
        <div className="side-user"><strong>{user.name}</strong><span>{roleName(user.role)}</span></div>
        <nav>{nav.map(([key, label, Icon]) => <button key={key as string} className={view === key ? "active" : ""} onClick={() => setView(key as string)}><Icon size={17}/>{label as string}</button>)}</nav>
        <button className="logout" onClick={async () => { if (!window.confirm("确认退出当前账号？")) return; await api("/api/auth/logout", { method: "POST" }); notify("success", "已退出登录"); onLogout(); }}><LogOut size={17}/>退出</button>
      </aside>
      <main>
        <header><div><h1>{nav.find((item) => item[0] === view)?.[1] || "总览"}</h1><p>{user.name} · {roleName(user.role)}</p></div><span className="live-pill"><CheckCircle2 size={15}/>线上服务已连接</span></header>
        {view === "dashboard" && <Dashboard platform={user.role === "platform_admin"} />}
        {view === "merchants" && <Merchants />}
        {view === "users" && <UsersPage />}
        {view === "config" && <Config platform={user.role === "platform_admin"} />}
        {view === "customers" && <Customers platform={user.role === "platform_admin"} />}
        {view === "materials" && <TrainingMaterials platform={user.role === "platform_admin"} />}
        {view === "knowledge" && <KnowledgePage platform={user.role === "platform_admin"} />}
        {view === "samples" && <Samples platform={user.role === "platform_admin"} />}
        {view === "conversations" && <Conversations platform={user.role === "platform_admin"} />}
        {view === "handoffs" && <Conversations platform={user.role === "platform_admin"} handoffs />}
      </main>
    </div>
  );
}

function Dashboard({ platform }: { platform: boolean }) {
  const [data, setData] = useState<Record<string, number>>({});
  useEffect(() => { api<Record<string, number>>(platform ? "/api/admin/dashboard" : "/api/merchant/dashboard").then(setData); }, [platform]);
  return <div className="grid metrics">{Object.entries(data).map(([k, v]) => { const Icon = metricIcon(k); return <section key={k} className="metric-card"><div className="metric-top"><span>{label(k)}</span><i><Icon size={19}/></i></div><strong>{v}</strong><small>{metricHint(k)}</small></section>; })}</div>;
}

function Merchants() {
  const [rows, setRows] = useRows<Merchant>("/api/admin/merchants");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Merchant | null>(null);
  return <div className="split"><section><div className="toolbar"><input placeholder="商户名称" value={name} onChange={(e) => setName(e.target.value)} /><button onClick={async () => { await api("/api/admin/merchants", { method: "POST", body: JSON.stringify({ name }) }); setName(""); setRows(await loadRows("/api/admin/merchants")); }}>新增商户</button></div><Table rows={rows} columns={["name", "status", "id"]} onRow={setSelected} /></section><section>{selected ? <Editor title="商户设置" value={selected} fields={["name", "status"]} selects={{ status: ["active", "disabled"] }} onSave={async (patch) => { await api(`/api/admin/merchants/${selected.id}`, { method: "PATCH", body: JSON.stringify(patch) }); setRows(await loadRows("/api/admin/merchants")); }} /> : <p>选择商户后可修改名称和状态。</p>}</section></div>;
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
  const [form, setForm] = useState<Record<string, string>>({});
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
  const a2cWebhookUrl = `${window.location.origin}/webhooks/a2c/${platform ? merchantId : form.merchantId || "default"}`;
  const [checks, setChecks] = useState<ConfigCheck[]>([]);
  const reloadConfig = async () => setForm(await api<Record<string, string>>(url));
  useEffect(() => { reloadConfig().catch(() => null); }, [url]);
  useEffect(() => { loadRows<MerchantCountry>(countriesUrl).then(setCountries).catch(() => setCountries([])); }, [countriesUrl]);
  useEffect(() => { loadRows<A2CAccount>(a2cAccountsUrl).then(setA2CAccounts).catch(() => setA2CAccounts([])); }, [a2cAccountsUrl]);
  useEffect(() => { setChecks([]); }, [merchantId]);
  const fields = ["a2cBaseUrl", "a2cAppId", "a2cAppSecret", "a2cAccountPhone", "googleAiApiKey", "googleAiModel", "telegramBotToken", "platformRegisterUrl", "tgRegisterGuideUrl"];
  const reloadCountries = async () => setCountries(await loadRows<MerchantCountry>(countriesUrl));
  const reloadA2CAccounts = async () => setA2CAccounts(await loadRows<A2CAccount>(a2cAccountsUrl));
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
      const saved = await api<Record<string, string>>(url, { method: "PATCH", body: JSON.stringify(form) });
      setForm(saved);
      if (!saved.a2cAppId || !saved.a2cAppSecret) {
        setMessage("配置已保存。填写 A2C App ID 和密钥后会自动同步客服账号。");
        return;
      }
      await syncA2CAccounts(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存配置失败");
    }
  };
  const syncA2CAccounts = async (skipSave = false) => {
    setMessage("");
    setError("");
    try {
      if (!skipSave) await api(url, { method: "PATCH", body: JSON.stringify(form) });
      const result = await api<{ imported: number; rows: A2CAccount[]; config: Record<string, string> }>(a2cSyncUrl, { method: "POST" });
      setA2CAccounts(result.rows);
      setForm(result.config);
      setMessage(`已同步 ${result.imported} 个 A2C 客服账号，已自动写入接收账号。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步 A2C 客服账号失败");
    }
  };
  const toggleA2CAccount = async (row: A2CAccount) => {
    const endpoint = platform ? `/api/admin/a2c/accounts/${row.id}` : `/api/merchant/a2c/accounts/${row.id}`;
    const result = await api<{ config: Record<string, string> }>(endpoint, { method: "PATCH", body: JSON.stringify({ enabled: !row.enabled }) });
    setForm(result.config);
    await reloadA2CAccounts();
  };
  const setA2CAccountCountry = async (row: A2CAccount, countryId: string) => {
    const endpoint = platform ? `/api/admin/a2c/accounts/${row.id}` : `/api/merchant/a2c/accounts/${row.id}`;
    await api<{ config: Record<string, string> }>(endpoint, { method: "PATCH", body: JSON.stringify({ countryId }) });
    await reloadA2CAccounts();
  };
  const createCountry = async () => {
    const payload = coercePatch(countryDraft);
    await api(countriesUrl, { method: "POST", body: JSON.stringify(payload) });
    await reloadCountries();
  };
  const setupTelegram = async () => {
    setMessage("");
    setError("");
    try {
      await api(url, { method: "PATCH", body: JSON.stringify(form) });
      const endpoint = platform ? `/api/admin/merchants/${merchantId}/telegram/setup-webhook` : "/api/merchant/telegram/setup-webhook";
      const result = await api<{ config: Record<string, string>; webhookUrl?: string }>(endpoint, { method: "POST" });
      setForm(result.config);
      setMessage(`TG绑定已开启${result.webhookUrl ? `：${result.webhookUrl}` : ""}。请把机器人拉进唯一接管群，并在群里发送 /bind；发送后点“刷新TG状态”。`);
      window.setTimeout(() => reloadConfig().catch(() => null), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "TG 绑定失败");
    }
  };
  return <section>{platform && <select value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>{merchants.map((m) => <option value={m.id} key={m.id}>{m.name}</option>)}</select>}<div className="setup-strip"><div><span>1</span><strong>填写密钥</strong><small>A2C / Gemini / TG</small></div><div><span>2</span><strong>同步账号</strong><small>绑定国家市场</small></div><div><span>3</span><strong>检测配置</strong><small>确认可用状态</small></div><div><span>4</span><strong>接入回调</strong><small>填写 Webhook</small></div></div><div className="memory highlighted"><h3>A2C Webhook地址</h3><p>把这个地址填写到该商户的 A2C Webhook 配置里。</p><div className="copy-row"><label>{label("a2cWebhookUrl")}<input readOnly value={a2cWebhookUrl} onFocus={(e) => e.currentTarget.select()} /></label><AsyncButton onClick={async () => { await navigator.clipboard.writeText(a2cWebhookUrl); setMessage("Webhook 地址已复制。"); notify("success", "已复制 Webhook 地址"); }} busyText="复制中..."><Copy size={16}/>复制</AsyncButton></div></div><div className="form-grid elevated-form">{fields.map((f) => <label key={f}>{label(f)}<input value={form[f] || ""} onChange={(e) => setForm({ ...form, [f]: e.target.value })} /></label>)}</div><div className="toolbar sticky-actions"><AsyncButton onClick={saveConfig} busyText="保存中...">保存配置</AsyncButton><AsyncButton onClick={() => syncA2CAccounts()} busyText="同步中..."><RefreshCw size={16}/>同步A2C客服账号</AsyncButton><AsyncButton onClick={runConfigCheck} busyText="检测中..."><CheckCircle2 size={16}/>检测配置</AsyncButton></div>{error && <div className="error">{error}</div>}{message && <div className="notice">{message}</div>}{checks.length > 0 && <div className="config-checks">{checks.map((item) => <article key={item.key} className={item.ok ? "ok" : item.status}><strong>{item.label}</strong><span>{label(item.status)}</span><p>{item.detail}</p></article>)}</div>}<div className="memory"><h3>国家/市场</h3><div className="toolbar wrap">{["code","name","defaultLanguage","platformRegisterUrl","tgRegisterGuideUrl"].map((key) => <input key={key} placeholder={label(key)} value={(countryDraft as any)[key]} onChange={(e) => setCountryDraft({ ...countryDraft, [key]: e.target.value })} />)}<select value={countryDraft.requireTelegram} onChange={(e) => setCountryDraft({ ...countryDraft, requireTelegram: e.target.value })}><option value="true">需要TG</option><option value="false">不需要TG</option></select><select value={countryDraft.requireWhatsApp} onChange={(e) => setCountryDraft({ ...countryDraft, requireWhatsApp: e.target.value })}><option value="false">不需要WS</option><option value="true">需要WS</option></select><AsyncButton onClick={createCountry} busyText="新增中..."><Plus size={16}/>新增国家</AsyncButton></div><Table rows={countries} columns={["code", "name", "defaultLanguage", "platformRegisterUrl", "tgRegisterGuideUrl", "requirePhone", "requireTelegram", "requireWhatsApp", "status"]} rowKey={(row) => row.id} /></div><div className="memory"><h3>A2C客服账号与邀请码池</h3><p>这里就是客服号绑定邀请码的位置。每个客服账号可以绑定多个邀请码，客户注册后邀请码会从可用池里移除。</p><div className="account-grid">{a2cAccounts.map((row) => <A2CAccountCard key={row.id} account={row} countries={countries} platform={platform} onToggle={() => toggleA2CAccount(row)} onCountry={(countryId) => setA2CAccountCountry(row, countryId)} />)}{!a2cAccounts.length && <div className="empty-state">填写并保存 A2C 密钥后，点击“同步A2C客服账号”。同步成功后这里会出现每个客服账号的邀请码池。</div>}</div></div><div className="memory"><h3>TG接管群绑定</h3><p>状态：{displayValue("status", form.telegramHandoffChatStatus || "unbound")} · 群：{form.telegramHandoffChatTitle || form.telegramHandoffChatId || "未绑定"}</p>{form.telegramHandoffChatError && <div className="warning">{form.telegramHandoffChatError}</div>}<div className="toolbar"><AsyncButton onClick={setupTelegram} busyText="设置中...">设置TG绑定</AsyncButton><AsyncButton onClick={async () => { setError(""); setMessage("正在刷新TG状态..."); await reloadConfig(); setMessage("TG状态已刷新。"); notify("success", "TG 状态已刷新"); }} busyText="刷新中..."><RefreshCw size={16}/>刷新TG状态</AsyncButton></div><p>保存 TG机器人 Token 后点击设置绑定，再把机器人拉进唯一接管群并发送 /bind；系统会自动保存群ID。</p></div></section>;
}

function A2CAccountCard({ account, countries, platform, onToggle, onCountry }: { account: A2CAccount; countries: MerchantCountry[]; platform: boolean; onToggle: () => Promise<void>; onCountry: (countryId: string) => Promise<void> }) {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [draft, setDraft] = useState({ codes: "", registerUrl: "" });
  const endpoint = platform ? `/api/admin/a2c/accounts/${account.id}/invite-codes` : `/api/merchant/a2c/accounts/${account.id}/invite-codes`;
  const codeEndpoint = platform ? "/api/admin/invite-codes" : "/api/merchant/invite-codes";
  const reload = async () => setCodes(await loadRows<InviteCode>(endpoint));
  useEffect(() => { reload().catch(() => setCodes([])); }, [endpoint]);
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
      <label>绑定国家<select value={account.countryId} onChange={(e) => onCountry(e.target.value)}>{countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)} · {country.code}</option>)}</select></label>
      <div className="invite-stats"><span>可用 {stats.available}</span><span>已分配 {stats.reserved}</span><span>已使用 {stats.used}</span><span>停用 {stats.disabled}</span></div>
    </div>
    <details className="invite-panel">
      <summary>管理邀请码池</summary>
      <div className="invite-import">
        <textarea placeholder="批量粘贴邀请码，一行一个；也支持逗号、空格分隔" value={draft.codes} onChange={(e) => setDraft({ ...draft, codes: e.target.value })} />
        <input placeholder="注册链接模板，可选。可包含 {code}" value={draft.registerUrl} onChange={(e) => setDraft({ ...draft, registerUrl: e.target.value })} />
        <AsyncButton disabled={!draft.codes.trim()} busyText="保存中..." onClick={async () => { const result = await api<{ imported: number; rows: InviteCode[] }>(`${endpoint}/import`, { method: "POST", body: JSON.stringify(draft) }); setCodes(result.rows); setDraft({ codes: "", registerUrl: draft.registerUrl }); notify("success", "邀请码池已保存", `已处理 ${result.imported} 个邀请码`); }}><Plus size={16}/>保存邀请码池</AsyncButton>
      </div>
      <Table rows={codes.map((item) => ({ ...item, inviteCode: item.code }))} columns={["inviteCode", "registerUrl", "status", "assignedCustomerKey", "platformAccount", "usedAt"]} rowKey={(row) => row.id} />
      <div className="invite-actions">{codes.map((code) => <InviteCodeEditor key={code.id} code={code} endpoint={codeEndpoint} reload={reload} />)}</div>
    </details>
  </article>;
}

function InviteCodeEditor({ code, endpoint, reload }: { code: InviteCode; endpoint: string; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState({ code: code.code, registerUrl: code.registerUrl, status: code.status });
  useEffect(() => setDraft({ code: code.code, registerUrl: code.registerUrl, status: code.status }), [code.id, code.code, code.registerUrl, code.status]);
  return <div className="invite-action-row">
    <input aria-label="邀请码" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
    <input aria-label="注册链接" value={draft.registerUrl} placeholder="注册链接模板，可包含 {code}" onChange={(e) => setDraft({ ...draft, registerUrl: e.target.value })} />
    <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="available">{label("available")}</option><option value="reserved">{label("reserved")}</option><option value="used">{label("used")}</option><option value="disabled">{label("disabled")}</option></select>
    <AsyncButton busyText="保存中..." onClick={async () => { await api(`${endpoint}/${code.id}`, { method: "PATCH", body: JSON.stringify(draft) }); await reload(); notify("success", "邀请码已保存"); }}>保存</AsyncButton>
    <AsyncButton className="danger" busyText="删除中..." onClick={async () => { if (!window.confirm("确认彻底删除这个邀请码？")) return; await api(`${endpoint}/${code.id}`, { method: "DELETE" }); await reload(); notify("success", "邀请码已彻底删除"); }}>删除</AsyncButton>
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

function TrainingMaterials({ platform = false }: { platform?: boolean }) {
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
    setMessage(`已导入 ${result.imported} 条：样本 ${result.samples}，知识 ${result.knowledge}${result.warnings?.length ? `；${result.warnings.join("；")}` : ""}`);
    await reload();
  };
  return <div className={selected && detail ? "split work-split" : "single-column work-split"}><section className="work-panel"><FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "countryId", "sourceType", "status", "limit"] : ["countryId", "sourceType", "status", "limit"]} selects={{ countryId: ["", ...countries.map((country) => country.id)], sourceType: ["", "csv", "xlsx", "docx", "txt", "image"], status: ["", "enabled", "disabled"] }} onApply={reload} />{!platform && <div className="material-uploader compact-uploader"><div className="toolbar"><select value={filters.countryId} onChange={(e) => setFilters({ ...filters, countryId: e.target.value })}>{countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}</select><input type="file" accept=".csv,.xlsx,.xls,.docx,.txt,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /><AsyncButton disabled={!file} busyText="上传中..." onClick={async () => { if (file) await uploadFile(file); }}><Upload size={16}/>上传素材</AsyncButton></div><textarea placeholder="粘贴聊天记录、话术、问答或业务规则" value={pasted} onChange={(e) => setPasted(e.target.value)} /><AsyncButton disabled={!pasted.trim()} busyText="导入中..." onClick={async () => { if (!pasted.trim()) return; await uploadFile(new File([pasted], "pasted-material.txt", { type: "text/plain" })); setPasted(""); }}><FileText size={16}/>导入粘贴文本</AsyncButton>{message && <div className="notice" role="status">{message}</div>}</div>}<Table rows={pager.rows} columns={platform ? ["merchantId", "countryName", "filename", "sourceType", "itemCount", "sampleCount", "knowledgeCount", "status", "createdAt"] : ["countryName", "filename", "sourceType", "itemCount", "sampleCount", "knowledgeCount", "status", "createdAt"]} onRow={loadDetail} /><Pagination pager={pager} /></section>{selected && detail && <section className="detail-panel"><div><h3>{detail.material.filename}</h3><p>{countryLabel(detail.material.countryName)} · {label(detail.material.sourceType)} · 生成 {detail.material.itemCount} 条 · 样本 {detail.material.sampleCount} · 知识 {detail.material.knowledgeCount}</p><div className="toolbar"><AsyncButton className="danger" busyText="删除中..." onClick={async () => { if (!window.confirm("确认彻底删除这个素材？它生成的样本和知识会一起删除。")) return; await api(`${base}/${detail.material.id}`, { method: "DELETE" }); setSelected(null); setDetail(null); await reload(); notify("success", "素材已彻底删除"); }}>彻底删除素材</AsyncButton></div>{detail.material.warnings?.length ? <div className="warning">{detail.material.warnings.join("；")}</div> : null}<div className="messages material-items">{detail.items.map((item) => <article key={item.id}><strong>{item.kind === "sample" ? "样本" : "知识"} · {languageName(item.language)}</strong><span>{item.title}</span><small>{label(item.intent || item.stage)}</small><p>{item.content}</p></article>)}</div><pre>{detail.material.rawText || ""}</pre></div></section>}</div>;
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
  return <div className={selected ? "split work-split" : "single-column work-split"}><section className="work-panel"><FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "countryId", "status", "language", "limit"] : ["countryId", "status", "language", "limit"]} selects={{ countryId: ["", ...countries.map((country) => country.id)], status: ["", "active", "human_handoff"] }} onApply={reload} /><Table rows={pager.rows} columns={columns} onRow={setSelected} /><Pagination pager={pager} /></section>{selected && <section className="detail-panel"><div><h3>{selected.customerKey}</h3><p>{countryLabel(selected.countryName)} · {selected.nickname || "无昵称"} · {label(selected.status)} · {languageName(selected.language)}</p><div className="form-grid"><label>首次接收账号<input readOnly value={selected.firstA2CAccountPhone || ""} /></label><label>最近接收账号<input readOnly value={selected.lastA2CAccountPhone || ""} /></label><label>手机号<input readOnly value={selected.extractedPhone || ""} /></label><label>Telegram<input readOnly value={selected.extractedTelegram || ""} /></label><label>WhatsApp<input readOnly value={selected.extractedWhatsApp || ""} /></label><label>会话数<input readOnly value={String(selected.conversationCount || 0)} /></label><label>最近会话ID<input readOnly value={selected.lastConversationId || ""} /></label></div><p>客户档案由 A2C 回调自动创建和更新；后台账号仍在“后台账号”里单独管理。</p></div></section>}</div>;
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

function PlatformConversations({ handoffs = false }: { handoffs?: boolean }) {
  const base = "/api/admin/conversations";
  const [filters, setFilters] = useState<Filters>({ merchantId: "", status: handoffs ? "human_handoff" : "", handoffStatus: "", language: "", limit: "100" });
  const rowsUrl = withQuery(base, filters);
  const [rows, setRows] = useRows<Conversation>(rowsUrl);
  const pager = useClientPagination(rows, 20);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const reload = async () => { setRows(await loadRows(rowsUrl)); pager.setPage(1); };
  return <div className={selected ? "split conversation-admin-layout work-split" : "single-column work-split"}><section className="work-panel"><FilterBar filters={filters} setFilters={setFilters} fields={["merchantId", "status", "handoffStatus", "language", "limit"]} selects={{ status: ["", "active", "human_handoff"], handoffStatus: ["", "pending", "processing", "done"] }} onApply={reload} /><Table rows={pager.rows} columns={["merchantId", "countryName", "customerPhone", "nickname", "language", "stage", "status", "handoffStatus"]} onRow={setSelected} selectedKey={selected?.id} rowKey={(row) => row.id} /><Pagination pager={pager} /></section>{selected && <section className="detail-panel"><ConversationDetail platform conversation={selected} refresh={async () => setRows(await loadRows(rowsUrl))} onDeleted={async () => { setSelected(null); await reload(); }} /></section>}</div>;
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
  const [error, setError] = useState("");
  const rowsUrl = selectedAccount
    ? withQuery("/api/merchant/conversations", { ...filters, a2cAccountPhone: selectedAccount.apiPhone })
    : "";
  const [rows, setRows] = useRows<Conversation>(rowsUrl || "/api/merchant/conversations?limit=1&a2cAccountPhone=__none__");
  const pager = useClientPagination(rows, 20);

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

  const reloadAccounts = async () => setAccounts(await loadRows("/api/merchant/a2c/accounts"));
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
      <div className="panel-title">
        <h3>客服账号</h3>
        <AsyncButton busyText="同步中..." onClick={async () => { await api("/api/merchant/a2c/accounts/sync", { method: "POST" }); await reloadAccounts(); }}>同步账号</AsyncButton>
      </div>
      {accounts.length ? accounts.map((account) => <button key={account.id} className={`list-item account-card ${selectedAccount?.id === account.id ? "active" : ""}`} onClick={() => setSelectedAccount(account)}>
        <strong title={account.verifiedName || account.apiPhone}>{account.verifiedName || account.apiPhone}{accountUnread(account.apiPhone) > 0 && <span className="badge">{accountUnread(account.apiPhone)}</span>}</strong>
        <span title={account.apiPhone}>{account.apiPhone}</span>
        <small>{countryLabel(account.countryName)} · {account.enabled ? "启用" : "停用"}</small>
      </button>) : <div className="empty-state">配置 A2C 密钥后点击同步账号；同步后可从这里选择客服账号主动发消息。</div>}
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
    <section className="chat-pane">{selected ? <ConversationDetail conversation={selected} refresh={async () => { await reloadRows(); const res = await api<{ rows: UnreadSummary[] }>("/api/merchant/conversations/unread-summary"); setUnread(res.rows); }} onDeleted={async () => { setSelected(null); await reloadRows(); const res = await api<{ rows: UnreadSummary[] }>("/api/merchant/conversations/unread-summary"); setUnread(res.rows); }} /> : selectedAccount && draftCustomer ? <ProactiveConversationDetail account={selectedAccount} target={draftCustomer} onCreated={async (conversation) => { setSelected(conversation); setDraftCustomer(null); setNewCustomer({ customerPhone: "", nickname: "" }); await reloadRows(); }} /> : <div className="empty-chat"><h3>选择客户开始对话</h3><p>左侧选择客服账号，中间选择客户；也可以填写新客户号码后主动发送第一条消息。</p></div>}</section>
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
  const memoryUrl = `${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/memory`;
  return <div className="conversation-detail"><div className="chat-header"><div><h3>{conversation.nickname || conversation.customerPhone}</h3><div className="header-meta"><span>{countryLabel(conversation.countryName)}</span><span>{languageName(conversation.language)}</span><span>手机：{conversation.extractedPhone || "未识别"}</span><span>TG：{conversation.extractedTelegram || "未识别"}</span><span>WS：{conversation.extractedWhatsApp || "未识别"}</span></div></div><div className="chat-actions">{!platform && <select value={conversation.handoffStatus} onChange={async (e) => { setError(""); setStatusMessage("正在更新接管状态..."); await api(`/api/merchant/handoffs/${conversation.id}`, { method: "PATCH", body: JSON.stringify({ handoffStatus: e.target.value }) }); setStatusMessage("接管状态已更新。"); refresh(); }}><option value="pending">待处理</option><option value="processing">处理中</option><option value="done">已完成</option></select>}<AsyncButton className="danger" busyText="删除中..." onClick={async () => { if (!window.confirm("确认彻底删除这个会话？聊天记录和接管记录会一起删除。")) return; await api(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}`, { method: "DELETE" }); notify("success", "会话已彻底删除"); await onDeleted?.(); }}>删除会话</AsyncButton></div></div>{error && <div className="error" role="alert">{error}</div>}{statusMessage && <div className="notice" role="status">{statusMessage}</div>}<div className="memory compact-memory"><h3>客户记忆文件</h3><p>{localizeSystemText(memory?.summary || "暂无记忆，收到客户消息后会自动生成。")}</p><textarea placeholder="人工备注，会被 AI 作为客户记忆参考" value={notes} onChange={(e) => setNotes(e.target.value)} /><AsyncButton busyText="保存中..." onClick={async () => { setError(""); const item = await api<CustomerMemory>(memoryUrl, { method: "PATCH", body: JSON.stringify({ operatorNotes: notes }) }); setMemory(item); setNotes(item.operatorNotes || ""); setStatusMessage("客户记忆已保存。"); }}>保存记忆</AsyncButton></div><div className="chat-window" ref={messagesRef}>{messages.length ? messages.map((m, i) => <ChatBubble key={`${m.id || m.createdAt}-${i}`} message={m} />) : <div className="empty-state">暂无聊天记录</div>}</div>{!platform && <div className="send chat-composer"><select value={send.type} onChange={(e) => setSend({ ...send, type: e.target.value })}>{MESSAGE_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><input placeholder="客服原文" value={send.content} onChange={(e) => setSend({ ...send, content: e.target.value })} /><input placeholder="媒体链接" value={send.url} onChange={(e) => setSend({ ...send, url: e.target.value })} /><input placeholder="说明/文件名" value={send.caption} onChange={(e) => setSend({ ...send, caption: e.target.value })} /><AsyncButton disabled={!canSendMessage(send)} busyText="发送中..." onClick={async () => { setError(""); setStatusMessage(""); try { await api(`/api/merchant/conversations/${conversation.id}/send`, { method: "POST", body: JSON.stringify(send) }); setSend({ ...send, content: "", url: "", caption: "" }); setStatusMessage("消息已发送。"); await loadMessages(); } catch (err) { setError(err instanceof Error ? err.message : "发送失败"); } }}><Send size={16}/>发送</AsyncButton></div>}</div>;
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const payload = message.rawPayload || {};
  const original = payload.originalContent || "";
  const translated = payload.translatedContent || "";
  const translationStatus = payload.translationStatus || (original && translated && normalizeText(original) !== normalizeText(translated) ? "translated" : undefined);
  const canShowTranslation = Boolean(original && translated && translationStatus === "translated" && normalizeText(original) !== normalizeText(translated));
  const translationIssue = original && !canShowTranslation ? payload.translationError || (translationStatus === "skipped" ? "无需翻译或翻译配置未完成" : "译文未生成，请先检查 Google AI Studio 配置") : "";
  const isOutbound = message.direction === "outbound";
  const sendIssue = isOutbound && payload.a2cSendStatus === "failed" ? `A2C发送失败：${translateSystemMessage(payload.a2cSendError || "未知错误")}` : "";
  return <article className={`chat-bubble ${message.direction}`}><div className="bubble-meta"><span>{isOutbound ? "客服" : "客户"}</span><time>{formatTime(message.createdAt)}</time></div>{original ? <div className="translation-block"><strong>{isOutbound ? "客服原文" : "客户原文"}</strong><p>{original}</p>{canShowTranslation ? <><strong>{isOutbound ? "发送译文" : "中文译文"}{payload.targetLanguage ? ` · ${languageName(payload.targetLanguage)}` : ""}</strong><p>{translated}</p></> : <div className="translation-warning">{translateSystemMessage(translationIssue)}</div>}</div> : <p>{message.content}</p>}{sendIssue && <div className="translation-warning">{sendIssue}</div>}<small>{label(message.intent)} · {languageName(message.language)}</small></article>;
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
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
    "vn": "越南"
  };
  return dictionary[normalized] || text;
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
  if (["active", "enabled", "ok", "bound", "done", "ready_for_handoff", "available"].includes(value)) return "success";
  if (["pending", "processing", "waiting", "need_platform_register", "need_phone_or_tg", "reserved"].includes(value)) return "warning";
  if (["disabled", "error", "invalid", "human_handoff", "irrelevant_or_spam"].includes(value)) return "danger";
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
    ms: "马来语",
    id: "印尼语",
    th: "泰语",
    vi: "越南语",
    unknown: "未知"
  } as Record<string, string>)[String(code || "")] || String(code || "");
}

function label(key: string) {
  return ({
    merchants: "商户", conversations: "会话", handoffs: "接管", samples: "样本", knowledge: "知识库", materials: "素材", customers: "客户", active: "活跃", disabled: "停用", enabled: "启用", pendingHandoffs: "待接管",
    name: "名称", status: "状态", id: "ID", email: "邮箱", role: "角色", merchantId: "商户ID", customerPhone: "客户", customerKey: "客户", nickname: "昵称",
    language: "语言", stage: "阶段", handoffStatus: "接管状态", customerMessage: "客户问题", standardReply: "标准回复", intent: "意图",
    priority: "优先级", a2cBaseUrl: "A2C地址", a2cAppId: "A2C应用ID", a2cAppSecret: "A2C密钥", a2cAccountPhone: "A2C接收账号", a2cWebhookUrl: "A2C回调地址",
    googleAiApiKey: "谷歌AI密钥", googleAiModel: "谷歌AI模型", openaiApiKey: "旧版AI密钥", openaiModel: "旧版AI模型", telegramBotToken: "TG机器人", telegramHandoffChatId: "TG群ID",
    platformRegisterUrl: "开户链接", tgRegisterGuideUrl: "TG注册说明", type: "类型", title: "标题", content: "内容", password: "新密码",
    inviteCode: "邀请码", registerUrl: "注册链接", assignedCustomerKey: "绑定客户", assignedConversationId: "绑定会话", platformAccount: "注册账号", assignedAt: "分配时间", usedAt: "使用时间", updatedAt: "更新时间",
    limit: "数量", true: "启用", false: "停用", faq: "问答", script: "话术", rule: "规则", forbidden: "禁用表达", human_handoff: "已接管",
    pending: "待处理", processing: "处理中", done: "已完成", sourceType: "素材类型", filename: "文件名", itemCount: "生成数", sampleCount: "样本数",
    knowledgeCount: "知识数", createdAt: "导入时间", csv: "表格", xlsx: "表格", docx: "文档", txt: "文本", image: "图片",
    lastA2CAccountPhone: "最近接收账号", firstA2CAccountPhone: "首次接收账号", extractedPhone: "手机号", extractedTelegram: "Telegram",
    extractedWhatsApp: "WhatsApp", countryId: "国家", countryName: "国家", countryCode: "国家代码", code: "国家代码", defaultLanguage: "默认语言",
    requirePlatformAccount: "需平台开户", requirePhone: "需手机号", requireTelegram: "需TG", requireWhatsApp: "需WS",
    conversationCount: "会话数", lastSeenAt: "最近消息时间", firstSeenAt: "首次消息时间", lastConversationId: "最近会话ID",
    ok: "正常", missing: "未配置", error: "异常", unbound: "未绑定", waiting: "等待入群", bound: "已绑定", invalid: "已失效", apiPhone: "客服账号", verifiedName: "显示名称",
    wabaId: "业务账号ID", numberStatus: "号码状态", qualityRating: "质量评分", messagingLimit: "消息额度", syncedAt: "同步时间",
    platform_admin: "平台管理员", merchant_admin: "商户管理员", merchant_operator: "商户运营",
    text: "文本", video: "视频", audio: "音频", document: "文件", sample: "样本", item: "条目", available: "可用", reserved: "已分配", used: "已使用",
    inbound: "客户", outbound: "客服", unknown: "未知",
    need_platform_register: "待开户注册", need_phone_or_tg: "待补联系方式", ready_for_handoff: "可接管",
    greeting: "打招呼", ask_platform_register: "询问开户注册", platform_register_done: "开户注册完成", ask_tg_register: "询问TG注册",
    provide_phone: "提供手机号", provide_telegram: "提供TG", provide_phone_and_telegram: "提供手机号和TG", ask_link: "索要链接",
    ask_promotion: "询问活动", trust_concern: "信任疑虑", need_help: "需要协助", human_request: "要求人工", irrelevant_or_spam: "无关或垃圾消息"
  } as Record<string, string>)[key] || key;
}

createRoot(document.getElementById("root")!).render(<App />);
