import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bot, Building2, Contact, FileText, LogOut, MessageSquare, Send, Settings, Upload, Users, Workflow } from "lucide-react";
import "./styles.css";

type User = { id: string; email: string; name: string; role: "platform_admin" | "merchant_admin" | "merchant_operator"; merchantId: string | null };
type Merchant = { id: string; name: string; status: string };
type Conversation = { id: string; merchantId: string; customerPhone: string; a2cAccountPhone: string; nickname: string; language: string; stage: string; extractedPhone: string; extractedTelegram: string; status: string; handoffStatus: string };
type Customer = { id: number; merchantId: string; customerKey: string; nickname: string; firstA2CAccountPhone: string; lastA2CAccountPhone: string; language: string; stage: string; extractedPhone: string; extractedTelegram: string; status: string; conversationCount: number; lastConversationId: string; firstSeenAt: string; lastSeenAt: string };
type Sample = { id: number; customerMessage: string; standardReply: string; stage: string; intent: string; language: string; keywords: string; priority: number; enabled?: boolean };
type Knowledge = { id: number; merchantId: string; type: string; title: string; content: string; language: string; priority: number; enabled: boolean };
type CustomerMemory = { id: number; summary: string; facts: Record<string, unknown>; operatorNotes: string; updatedAt: string };
type TrainingMaterial = { id: number; merchantId: string; sourceType: string; filename: string; status: string; itemCount: number; sampleCount: number; knowledgeCount: number; warnings: string[]; createdAt: string; rawText?: string };
type TrainingMaterialItem = { id: number; kind: string; title: string; content: string; intent: string; stage: string; language: string; enabled: boolean };
type A2CAccount = { id: number; merchantId: string; apiPhone: string; wabaId: string; status: number; numberStatus: number; qualityRating: number; messagingLimit: number; verifiedName: string; enabled: boolean; syncedAt: string };
type Filters = Record<string, string>;

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = { ...(options.body === undefined ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || response.statusText);
  return response.json() as Promise<T>;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dashboard");

  useEffect(() => {
    api<{ user: User }>("/api/auth/me").then((res) => setUser(res.user)).catch(() => null).finally(() => setLoading(false));
  }, []);

  if (loading) return <Shell><p>加载中...</p></Shell>;
  if (!user) return <Login onLogin={setUser} />;
  return <Portal user={user} view={view} setView={setView} onLogout={() => setUser(null)} />;
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("Admin123456");
  const [error, setError] = useState("");
  return (
    <Shell>
      <main className="login">
        <section className="login-panel">
          <h1>A2C AI 自动客服</h1>
          <p>平台管理端 / 商户端</p>
          <label>邮箱<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>密码<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error && <div className="error">{error}</div>}
          <button onClick={async () => {
            try {
              const res = await api<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
              onLogin(res.user);
            } catch (err) {
              setError(err instanceof Error ? err.message : "登录失败");
            }
          }}>登录</button>
          <small>首次登录默认账号来自环境变量 DEFAULT_ADMIN_EMAIL / DEFAULT_ADMIN_PASSWORD。</small>
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
        <h2>A2C AI</h2>
        {nav.map(([key, label, Icon]) => <button key={key as string} className={view === key ? "active" : ""} onClick={() => setView(key as string)}><Icon size={17}/>{label as string}</button>)}
        <button className="logout" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); onLogout(); }}><LogOut size={17}/>退出</button>
      </aside>
      <main>
        <header><div><h1>{nav.find((item) => item[0] === view)?.[1] || "总览"}</h1><p>{user.name} · {roleName(user.role)}</p></div></header>
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
  return <div className="grid metrics">{Object.entries(data).map(([k, v]) => <section key={k}><span>{label(k)}</span><strong>{v}</strong></section>)}</div>;
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
  return <div className="split"><section><div className="toolbar wrap"><input placeholder="按商户ID筛选" value={filters.merchantId} onChange={(e) => setFilters({ merchantId: e.target.value })} /><button onClick={async () => setRows(await loadRows(usersUrl))}>筛选</button></div><div className="toolbar wrap">{["email","name","password","merchantId"].map((k) => <input key={k} placeholder={k} value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />)}<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option>merchant_admin</option><option>merchant_operator</option><option>platform_admin</option></select><button onClick={async () => { await api("/api/admin/users", { method: "POST", body: JSON.stringify(form) }); setRows(await loadRows(usersUrl)); }}>新增用户</button></div><Table rows={rows} columns={["email", "name", "role", "merchantId", "status"]} onRow={setSelected} /></section><section>{selected ? <Editor title="用户设置" value={{ name: selected.name, status: selected.status, role: selected.role, merchantId: selected.merchantId || "", password: "" }} fields={["name", "status", "role", "merchantId", "password"]} selects={{ status: ["active", "disabled"], role: ["platform_admin", "merchant_admin", "merchant_operator"] }} onSave={async (patch) => { if (!patch.password) delete patch.password; await api(`/api/admin/users/${selected.id}`, { method: "PATCH", body: JSON.stringify(patch) }); setRows(await loadRows(usersUrl)); }} /> : <p>选择用户后可停用、改角色或重置密码。</p>}</section></div>;
}

function Config({ platform }: { platform: boolean }) {
  const [merchants] = useRows<Merchant>("/api/admin/merchants");
  const [merchantId, setMerchantId] = useState("default");
  const [form, setForm] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [a2cAccounts, setA2CAccounts] = useState<A2CAccount[]>([]);
  const url = platform ? `/api/admin/merchants/${merchantId}/config` : "/api/merchant/config";
  const a2cAccountsUrl = platform ? `/api/admin/merchants/${merchantId}/a2c/accounts` : "/api/merchant/a2c/accounts";
  const a2cSyncUrl = platform ? `/api/admin/merchants/${merchantId}/a2c/accounts/sync` : "/api/merchant/a2c/accounts/sync";
  useEffect(() => { api<Record<string, string>>(url).then(setForm).catch(() => null); }, [url]);
  useEffect(() => { loadRows<A2CAccount>(a2cAccountsUrl).then(setA2CAccounts).catch(() => setA2CAccounts([])); }, [a2cAccountsUrl]);
  const fields = ["a2cBaseUrl", "a2cAppId", "a2cAppSecret", "a2cAccountPhone", "openaiApiKey", "openaiModel", "telegramBotToken", "platformRegisterUrl", "tgRegisterGuideUrl"];
  const reloadA2CAccounts = async () => setA2CAccounts(await loadRows<A2CAccount>(a2cAccountsUrl));
  const saveConfig = async () => {
    setMessage("");
    const saved = await api<Record<string, string>>(url, { method: "PATCH", body: JSON.stringify(form) });
    setForm(saved);
    if (!saved.a2cAppId || !saved.a2cAppSecret) {
      setMessage("配置已保存。填写 A2C App ID 和密钥后会自动同步客服账号。");
      return;
    }
    try {
      await syncA2CAccounts(true);
    } catch (error) {
      setMessage(`配置已保存，A2C账号同步失败：${error instanceof Error ? error.message : "请检查 App ID 和密钥"}`);
    }
  };
  const syncA2CAccounts = async (skipSave = false) => {
    setMessage("");
    if (!skipSave) await api(url, { method: "PATCH", body: JSON.stringify(form) });
    const result = await api<{ imported: number; rows: A2CAccount[]; config: Record<string, string> }>(a2cSyncUrl, { method: "POST" });
    setA2CAccounts(result.rows);
    setForm(result.config);
    setMessage(`已同步 ${result.imported} 个 A2C 客服账号，已自动写入接收账号。`);
  };
  const toggleA2CAccount = async (row: A2CAccount) => {
    const endpoint = platform ? `/api/admin/a2c/accounts/${row.id}` : `/api/merchant/a2c/accounts/${row.id}`;
    const result = await api<{ config: Record<string, string> }>(endpoint, { method: "PATCH", body: JSON.stringify({ enabled: !row.enabled }) });
    setForm(result.config);
    await reloadA2CAccounts();
  };
  const setupTelegram = async () => {
    setMessage("");
    await api(url, { method: "PATCH", body: JSON.stringify(form) });
    const endpoint = platform ? `/api/admin/merchants/${merchantId}/telegram/setup-webhook` : "/api/merchant/telegram/setup-webhook";
    const result = await api<{ config: Record<string, string> }>(endpoint, { method: "POST" });
    setForm(result.config);
    setMessage("TG绑定已开启。请把机器人拉进唯一接管群，并在群里发送 /bind。");
  };
  return <section>{platform && <select value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>{merchants.map((m) => <option value={m.id} key={m.id}>{m.name}</option>)}</select>}<div className="form-grid">{fields.map((f) => <label key={f}>{label(f)}<input value={form[f] || ""} onChange={(e) => setForm({ ...form, [f]: e.target.value })} /></label>)}</div><div className="toolbar"><button onClick={saveConfig}>保存配置</button><button onClick={() => syncA2CAccounts()}>同步A2C客服账号</button></div><div className="memory"><h3>A2C客服账号</h3><p>填写 A2C App ID 和密钥并保存后，系统会自动拉取账号内可发送的客服账号；启用的账号会自动用于 webhook 归属和手动发送。</p><Table rows={a2cAccounts} columns={["apiPhone", "verifiedName", "status", "numberStatus", "qualityRating", "messagingLimit", "enabled", "syncedAt"]} /><div className="account-actions">{a2cAccounts.map((row) => <button key={row.id} onClick={() => toggleA2CAccount(row)}>{row.apiPhone} · {row.enabled ? "停用" : "启用"}</button>)}</div></div><div className="memory"><h3>TG接管群绑定</h3><p>状态：{label(form.telegramHandoffChatStatus || "unbound")} · 群：{form.telegramHandoffChatTitle || form.telegramHandoffChatId || "未绑定"}</p>{form.telegramHandoffChatError && <div className="warning">{form.telegramHandoffChatError}</div>}<button onClick={setupTelegram}>设置TG绑定</button><p>保存 TG机器人 Token 后点击设置绑定，再把机器人拉入唯一接管群并发送 /bind；系统会自动保存群ID。</p>{message && <div className="notice">{message}</div>}</div></section>;
}

function Samples({ platform = false }: { platform?: boolean }) {
  const base = platform ? "/api/admin/training-samples" : "/api/merchant/training-samples";
  const [filters, setFilters] = useState<Filters>({ merchantId: "", language: "", intent: "", stage: "", enabled: "" });
  const rowsUrl = withQuery(base, platform ? filters : { language: filters.language, intent: filters.intent, stage: filters.stage, enabled: filters.enabled });
  const [rows, setRows] = useRows<Sample>(rowsUrl);
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<Sample | null>(null);
  return <div className="split"><section><FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "language", "intent", "stage", "enabled"] : ["language", "intent", "stage", "enabled"]} selects={{ enabled: ["", "true", "false"] }} onApply={async () => setRows(await loadRows(rowsUrl))} />{!platform && <div className="toolbar"><input type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} /><button onClick={async () => { if (!file) return; const body = new FormData(); body.append("file", file); await fetch("/api/merchant/training-samples/import", { method: "POST", body }); setRows(await loadRows(rowsUrl)); }}>上传样本</button></div>}<Table rows={rows} columns={["customerMessage", "standardReply", "intent", "stage", "language", "priority", "enabled"]} onRow={setSelected} /></section><section>{selected ? <Editor title="样本编辑" value={selected as any} fields={["customerMessage", "standardReply", "intent", "stage", "language", "keywords", "priority", "enabled"]} selects={{ enabled: ["true", "false"] }} onSave={async (patch) => { await api(`${base}/${selected.id}`, { method: "PATCH", body: JSON.stringify(coercePatch(patch)) }); setRows(await loadRows(rowsUrl)); }} /> : <p>{platform ? "平台端可查看和编辑全局样本；上传请在商户端完成。" : "选择样本后可编辑标准回复、意图、阶段和启用状态。"}</p>}</section></div>;
}

function TrainingMaterials({ platform = false }: { platform?: boolean }) {
  const base = platform ? "/api/admin/training-materials" : "/api/merchant/training-materials";
  const [filters, setFilters] = useState<Filters>({ merchantId: "", sourceType: "", status: "", limit: "100" });
  const rowsUrl = withQuery(base, platform ? filters : { sourceType: filters.sourceType, status: filters.status, limit: filters.limit });
  const [rows, setRows] = useRows<TrainingMaterial>(rowsUrl);
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [selected, setSelected] = useState<TrainingMaterial | null>(null);
  const [detail, setDetail] = useState<{ material: TrainingMaterial; items: TrainingMaterialItem[] } | null>(null);
  const [message, setMessage] = useState("");
  const reload = async () => setRows(await loadRows(rowsUrl));
  const loadDetail = async (row: TrainingMaterial) => {
    setSelected(row);
    setDetail(await api<{ material: TrainingMaterial; items: TrainingMaterialItem[] }>(`${base}/${row.id}`));
  };
  const uploadFile = async (upload: File) => {
    const body = new FormData();
    body.append("file", upload);
    const response = await fetch("/api/merchant/training-materials/import", { method: "POST", body });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "上传失败");
    const result = await response.json() as { imported: number; samples: number; knowledge: number; warnings?: string[] };
    setMessage(`已导入 ${result.imported} 条：样本 ${result.samples}，知识 ${result.knowledge}${result.warnings?.length ? `；${result.warnings.join("；")}` : ""}`);
    await reload();
  };
  return <div className="split"><section><FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "sourceType", "status", "limit"] : ["sourceType", "status", "limit"]} selects={{ sourceType: ["", "csv", "xlsx", "docx", "txt", "image"], status: ["", "enabled", "disabled"] }} onApply={reload} />{!platform && <div className="material-uploader"><div className="toolbar"><input type="file" accept=".csv,.xlsx,.xls,.docx,.txt,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg" onChange={(e) => setFile(e.target.files?.[0] || null)} /><button onClick={async () => { if (file) await uploadFile(file); }}>上传素材</button></div><textarea placeholder="粘贴聊天记录、话术、FAQ 或业务规则" value={pasted} onChange={(e) => setPasted(e.target.value)} /><button onClick={async () => { if (!pasted.trim()) return; await uploadFile(new File([pasted], "pasted-material.txt", { type: "text/plain" })); setPasted(""); }}>导入粘贴文本</button>{message && <div className="notice">{message}</div>}</div>}<Table rows={rows} columns={platform ? ["merchantId", "filename", "sourceType", "itemCount", "sampleCount", "knowledgeCount", "status", "createdAt"] : ["filename", "sourceType", "itemCount", "sampleCount", "knowledgeCount", "status", "createdAt"]} onRow={loadDetail} /></section><section>{selected && detail ? <div><h3>{detail.material.filename}</h3><p>{detail.material.sourceType} · 生成 {detail.material.itemCount} 条 · 样本 {detail.material.sampleCount} · 知识 {detail.material.knowledgeCount}</p>{detail.material.warnings?.length ? <div className="warning">{detail.material.warnings.join("；")}</div> : null}<div className="messages material-items">{detail.items.map((item) => <article key={item.id}><strong>{item.kind === "sample" ? "样本" : "知识"} · {item.language}</strong><span>{item.title}</span><small>{item.intent || item.stage}</small><p>{item.content}</p></article>)}</div><pre>{detail.material.rawText || ""}</pre></div> : <p>{platform ? "选择素材查看生成内容。平台端可查看所有商户素材。" : "上传 CSV/XLSX/DOCX/TXT/图片后会立即学习，并自动启用生成内容。"}</p>}</section></div>;
}

function Customers({ platform = false }: { platform?: boolean }) {
  const base = platform ? "/api/admin/customers" : "/api/merchant/customers";
  const [filters, setFilters] = useState<Filters>({ merchantId: "", status: "", language: "", limit: "100" });
  const rowsUrl = withQuery(base, platform ? filters : { status: filters.status, language: filters.language, limit: filters.limit });
  const [rows, setRows] = useRows<Customer>(rowsUrl);
  const [selected, setSelected] = useState<Customer | null>(null);
  const columns = platform
    ? ["merchantId", "customerKey", "nickname", "lastA2CAccountPhone", "language", "stage", "extractedPhone", "extractedTelegram", "status", "conversationCount", "lastSeenAt"]
    : ["customerKey", "nickname", "lastA2CAccountPhone", "language", "stage", "extractedPhone", "extractedTelegram", "status", "conversationCount", "lastSeenAt"];
  return <div className="split"><section><FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "status", "language", "limit"] : ["status", "language", "limit"]} selects={{ status: ["", "active", "human_handoff"] }} onApply={async () => setRows(await loadRows(rowsUrl))} /><Table rows={rows} columns={columns} onRow={setSelected} /></section><section>{selected ? <div><h3>{selected.customerKey}</h3><p>{selected.nickname || "无昵称"} · {selected.status} · {selected.language}</p><div className="form-grid"><label>首次接收账号<input readOnly value={selected.firstA2CAccountPhone || ""} /></label><label>最近接收账号<input readOnly value={selected.lastA2CAccountPhone || ""} /></label><label>手机号<input readOnly value={selected.extractedPhone || ""} /></label><label>Telegram<input readOnly value={selected.extractedTelegram || ""} /></label><label>会话数<input readOnly value={String(selected.conversationCount || 0)} /></label><label>最近会话ID<input readOnly value={selected.lastConversationId || ""} /></label></div><p>客户档案由 A2C Webhook 自动创建和更新；后台账号仍在“后台账号”里单独管理。</p></div> : <p>客户第一次发消息后会自动出现在这里，不需要手动创建。</p>}</section></div>;
}

function KnowledgePage({ platform }: { platform: boolean }) {
  const base = platform ? "/api/admin/knowledge" : "/api/merchant/knowledge";
  const [filters, setFilters] = useState<Filters>({ merchantId: "", type: "", enabled: "" });
  const rowsUrl = withQuery(base, platform ? filters : { type: filters.type, enabled: filters.enabled });
  const [rows, setRows] = useRows<Knowledge>(rowsUrl);
  const [form, setForm] = useState<Record<string, string>>({ merchantId: "default", type: "faq", title: "", content: "", language: "zh", priority: "0" });
  const [selected, setSelected] = useState<Knowledge | null>(null);
  const reload = async () => setRows(await loadRows(rowsUrl));
  return <div className="split"><section><FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "type", "enabled"] : ["type", "enabled"]} selects={{ type: ["", "faq", "script", "rule", "forbidden"], enabled: ["", "true", "false"] }} onApply={reload} /><div className="toolbar wrap">{platform && <input placeholder="merchantId" value={form.merchantId} onChange={(e) => setForm({ ...form, merchantId: e.target.value })} />}<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>faq</option><option>script</option><option>rule</option><option>forbidden</option></select><input placeholder="标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><input placeholder="内容" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /><button onClick={async () => { await api(base, { method: "POST", body: JSON.stringify(coercePatch(form)) }); setForm({ ...form, title: "", content: "" }); reload(); }}>新增知识</button></div><Table rows={rows} columns={["type", "title", "content", "language", "priority", "enabled"]} onRow={setSelected} /></section><section>{selected ? <Editor title="知识库编辑" value={selected as any} fields={["type", "title", "content", "language", "priority", "enabled"]} selects={{ type: ["faq", "script", "rule", "forbidden"], enabled: ["true", "false"] }} onSave={async (patch) => { await api(`${base}/${selected.id}`, { method: "PATCH", body: JSON.stringify(coercePatch(patch)) }); reload(); }} /> : <p>FAQ、话术、规则、禁用表达会在 AI 回复时被引用。</p>}</section></div>;
}

function Conversations({ platform = false, handoffs = false }: { platform?: boolean; handoffs?: boolean }) {
  const base = platform ? "/api/admin/conversations" : "/api/merchant/conversations";
  const [filters, setFilters] = useState<Filters>({ merchantId: "", status: handoffs ? "human_handoff" : "", handoffStatus: "", language: "", limit: "100" });
  const rowsUrl = withQuery(base, platform ? filters : { status: filters.status, handoffStatus: filters.handoffStatus, language: filters.language, limit: filters.limit });
  const [rows, setRows] = useRows<Conversation>(rowsUrl);
  const [selected, setSelected] = useState<Conversation | null>(null);
  return <div className="split"><section><FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "status", "handoffStatus", "language", "limit"] : ["status", "handoffStatus", "language", "limit"]} selects={{ status: ["", "active", "human_handoff"], handoffStatus: ["", "pending", "processing", "done"] }} onApply={async () => setRows(await loadRows(rowsUrl))} /><Table rows={rows} columns={platform ? ["merchantId", "customerPhone", "nickname", "language", "stage", "status", "handoffStatus"] : ["customerPhone", "nickname", "language", "stage", "status", "handoffStatus"]} onRow={setSelected} /></section><section>{selected ? <ConversationDetail platform={platform} conversation={selected} refresh={async () => setRows(await loadRows(rowsUrl))} /> : <p>选择一个会话查看详情</p>}</section></div>;
}

function ConversationDetail({ platform = false, conversation, refresh }: { platform?: boolean; conversation: Conversation; refresh: () => void }) {
  const [messages, setMessages] = useState<Array<Record<string, string>>>([]);
  const [memory, setMemory] = useState<CustomerMemory | null>(null);
  const [notes, setNotes] = useState("");
  const [send, setSend] = useState({ type: "text", content: "", url: "", caption: "", fileName: "" });
  useEffect(() => { api<{ rows: Array<Record<string, string>> }>(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/messages`).then((r) => setMessages(r.rows)); }, [conversation.id, platform]);
  useEffect(() => { api<CustomerMemory>(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/memory`).then((item) => { setMemory(item); setNotes(item.operatorNotes || ""); }).catch(() => { setMemory(null); setNotes(""); }); }, [conversation.id, platform]);
  const memoryUrl = `${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/memory`;
  return <div><h3>{conversation.customerPhone}</h3><p>TG: {conversation.extractedTelegram || "-"} · 手机: {conversation.extractedPhone || "-"}</p>{!platform && <div className="toolbar"><select value={conversation.handoffStatus} onChange={async (e) => { await api(`/api/merchant/handoffs/${conversation.id}`, { method: "PATCH", body: JSON.stringify({ handoffStatus: e.target.value }) }); refresh(); }}><option value="pending">待处理</option><option value="processing">处理中</option><option value="done">已完成</option></select></div>}<div className="memory"><h3>客户记忆文件</h3><p>{memory?.summary || "暂无记忆，收到客户消息后会自动生成。"}</p><textarea placeholder="人工备注，会被 AI 作为客户记忆参考" value={notes} onChange={(e) => setNotes(e.target.value)} /><button onClick={async () => { const item = await api<CustomerMemory>(memoryUrl, { method: "PATCH", body: JSON.stringify({ operatorNotes: notes }) }); setMemory(item); setNotes(item.operatorNotes || ""); }}>保存记忆</button>{memory && <pre>{JSON.stringify(memory.facts, null, 2)}</pre>}</div><div className="messages">{messages.map((m, i) => <article key={i} className={m.direction}>{m.content}<small>{m.intent}</small></article>)}</div>{!platform && <div className="send"><select value={send.type} onChange={(e) => setSend({ ...send, type: e.target.value })}><option>text</option><option>image</option><option>video</option><option>audio</option><option>document</option></select><input placeholder="文本内容" value={send.content} onChange={(e) => setSend({ ...send, content: e.target.value })} /><input placeholder="媒体URL" value={send.url} onChange={(e) => setSend({ ...send, url: e.target.value })} /><input placeholder="说明/文件名" value={send.caption} onChange={(e) => setSend({ ...send, caption: e.target.value })} /><button onClick={async () => { await api(`/api/merchant/conversations/${conversation.id}/send`, { method: "POST", body: JSON.stringify(send) }); setSend({ ...send, content: "", url: "", caption: "" }); }}><Send size={16}/>发送</button></div>}</div>;
}

function Table<T extends Record<string, any>>({ rows, columns, onRow }: { rows: T[]; columns: string[]; onRow?: (row: T) => void }) {
  return <div className="table"><table><thead><tr>{columns.map((c) => <th key={c}>{label(c)}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} onClick={() => onRow?.(row)}>{columns.map((c) => <td key={c}>{String(row[c] ?? "")}</td>)}</tr>)}</tbody></table></div>;
}

function Editor({ title, value, fields, selects, onSave }: { title: string; value: Record<string, any>; fields: string[]; selects?: Record<string, string[]>; onSave: (patch: Record<string, any>) => Promise<void> }) {
  const [draft, setDraft] = useState<Record<string, any>>(value);
  useEffect(() => setDraft(value), [value]);
  return <div><h3>{title}</h3><div className="form-grid">{fields.map((field) => <label key={field}>{label(field)}{selects?.[field] ? <select value={String(draft[field] ?? "")} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}>{selects[field].map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input value={String(draft[field] ?? "")} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} />}</label>)}</div><button onClick={() => onSave(draft)}>保存</button></div>;
}

function FilterBar({ filters, setFilters, fields, selects = {}, onApply }: { filters: Filters; setFilters: (filters: Filters) => void; fields: string[]; selects?: Record<string, string[]>; onApply: () => Promise<void> }) {
  return <div className="toolbar wrap filters">{fields.map((field) => selects[field] ? <select key={field} value={filters[field] || ""} onChange={(e) => setFilters({ ...filters, [field]: e.target.value })}>{selects[field].map((option) => <option key={option} value={option}>{option ? label(option) : label(field)}</option>)}</select> : <input key={field} placeholder={label(field)} value={filters[field] || ""} onChange={(e) => setFilters({ ...filters, [field]: e.target.value })} />)}<button onClick={onApply}>筛选</button><button onClick={async () => { const reset = Object.fromEntries(Object.keys(filters).map((key) => [key, key === "limit" ? "100" : ""])); setFilters(reset); }}>重置</button></div>;
}

function coercePatch(input: Record<string, any>) {
  const patch = { ...input };
  if ("priority" in patch) patch.priority = Number(patch.priority || 0);
  if (patch.enabled === "true") patch.enabled = true;
  if (patch.enabled === "false") patch.enabled = false;
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

function label(key: string) {
  return ({
    merchants: "商户", conversations: "会话", handoffs: "接管", samples: "样本", knowledge: "知识库", materials: "素材", customers: "客户", active: "活跃", pendingHandoffs: "待接管",
    name: "名称", status: "状态", id: "ID", email: "邮箱", role: "角色", merchantId: "商户ID", customerPhone: "客户", customerKey: "客户", nickname: "昵称",
    language: "语言", stage: "阶段", handoffStatus: "接管状态", customerMessage: "客户问题", standardReply: "标准回复", intent: "意图",
    priority: "优先级", a2cBaseUrl: "A2C地址", a2cAppId: "A2C App ID", a2cAppSecret: "A2C密钥", a2cAccountPhone: "A2C接收账号",
    openaiApiKey: "OpenAI Key", openaiModel: "OpenAI模型", telegramBotToken: "TG机器人", telegramHandoffChatId: "TG群ID",
    platformRegisterUrl: "开户链接", tgRegisterGuideUrl: "TG注册说明", type: "类型", title: "标题", content: "内容", enabled: "启用", password: "新密码",
    limit: "数量", true: "启用", false: "停用", faq: "FAQ", script: "话术", rule: "规则", forbidden: "禁用表达", human_handoff: "已接管",
    pending: "待处理", processing: "处理中", done: "已完成", sourceType: "素材类型", filename: "文件名", itemCount: "生成数", sampleCount: "样本数",
    knowledgeCount: "知识数", createdAt: "导入时间", csv: "CSV", xlsx: "Excel", docx: "Word", txt: "文本", image: "图片",
    lastA2CAccountPhone: "最近接收账号", firstA2CAccountPhone: "首次接收账号", extractedPhone: "手机号", extractedTelegram: "Telegram",
    conversationCount: "会话数", lastSeenAt: "最近消息时间", firstSeenAt: "首次消息时间", lastConversationId: "最近会话ID",
    unbound: "未绑定", waiting: "等待入群", bound: "已绑定", invalid: "已失效", apiPhone: "客服账号", verifiedName: "显示名称",
    wabaId: "WABA ID", numberStatus: "号码状态", qualityRating: "质量评分", messagingLimit: "消息额度", syncedAt: "同步时间"
  } as Record<string, string>)[key] || key;
}

createRoot(document.getElementById("root")!).render(<App />);
