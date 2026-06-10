import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bot, Building2, LogOut, MessageSquare, Send, Settings, Upload, Users, Workflow } from "lucide-react";
import "./styles.css";

type User = { id: string; email: string; name: string; role: "platform_admin" | "merchant_admin" | "merchant_operator"; merchantId: string | null };
type Merchant = { id: string; name: string; status: string };
type Conversation = { id: string; merchantId: string; customerPhone: string; a2cAccountPhone: string; nickname: string; language: string; stage: string; extractedPhone: string; extractedTelegram: string; status: string; handoffStatus: string };
type Sample = { id: number; customerMessage: string; standardReply: string; stage: string; intent: string; language: string; keywords: string; priority: number };

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
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
    ? [["dashboard", "总览", Bot], ["merchants", "商户", Building2], ["users", "用户", Users], ["config", "配置", Settings], ["conversations", "会话", MessageSquare], ["samples", "样本", Upload], ["handoffs", "接管", Workflow]]
    : [["dashboard", "总览", Bot], ["samples", "样本", Upload], ["conversations", "会话", MessageSquare], ["handoffs", "接管", Workflow], ["config", "设置", Settings]];
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
        {view === "samples" && <Samples />}
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
  return <section><div className="toolbar"><input placeholder="商户名称" value={name} onChange={(e) => setName(e.target.value)} /><button onClick={async () => { await api("/api/admin/merchants", { method: "POST", body: JSON.stringify({ name }) }); setName(""); setRows(await loadRows("/api/admin/merchants")); }}>新增商户</button></div><Table rows={rows} columns={["name", "status", "id"]} /></section>;
}

function UsersPage() {
  const [rows, setRows] = useRows<Record<string, string>>("/api/admin/users");
  const [form, setForm] = useState({ email: "", name: "", password: "Admin123456", role: "merchant_admin", merchantId: "default" });
  return <section><div className="toolbar wrap">{["email","name","password","merchantId"].map((k) => <input key={k} placeholder={k} value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />)}<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option>merchant_admin</option><option>merchant_operator</option><option>platform_admin</option></select><button onClick={async () => { await api("/api/admin/users", { method: "POST", body: JSON.stringify(form) }); setRows(await loadRows("/api/admin/users")); }}>新增用户</button></div><Table rows={rows} columns={["email", "name", "role", "merchantId", "status"]} /></section>;
}

function Config({ platform }: { platform: boolean }) {
  const [merchants] = useRows<Merchant>("/api/admin/merchants");
  const [merchantId, setMerchantId] = useState("default");
  const [form, setForm] = useState<Record<string, string>>({});
  const url = platform ? `/api/admin/merchants/${merchantId}/config` : "/api/merchant/config";
  useEffect(() => { api<Record<string, string>>(url).then(setForm).catch(() => null); }, [url]);
  const fields = ["a2cBaseUrl", "a2cAppId", "a2cAppSecret", "a2cAccountPhone", "openaiApiKey", "openaiModel", "telegramBotToken", "telegramHandoffChatId", "platformRegisterUrl", "tgRegisterGuideUrl"];
  return <section>{platform && <select value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>{merchants.map((m) => <option value={m.id} key={m.id}>{m.name}</option>)}</select>}<div className="form-grid">{fields.map((f) => <label key={f}>{label(f)}<input value={form[f] || ""} onChange={(e) => setForm({ ...form, [f]: e.target.value })} /></label>)}</div><button onClick={async () => setForm(await api(url, { method: "PATCH", body: JSON.stringify(form) }))}>保存配置</button></section>;
}

function Samples() {
  const [rows, setRows] = useRows<Sample>("/api/merchant/training-samples?enabled=true");
  const [file, setFile] = useState<File | null>(null);
  return <section><div className="toolbar"><input type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} /><button onClick={async () => { if (!file) return; const body = new FormData(); body.append("file", file); await fetch("/api/merchant/training-samples/import", { method: "POST", body }); setRows(await loadRows("/api/merchant/training-samples?enabled=true")); }}>上传样本</button></div><Table rows={rows} columns={["customerMessage", "standardReply", "intent", "stage", "language", "priority"]} /></section>;
}

function Conversations({ platform = false, handoffs = false }: { platform?: boolean; handoffs?: boolean }) {
  const base = platform ? "/api/admin/conversations" : "/api/merchant/conversations";
  const [rows, setRows] = useRows<Conversation>(`${base}?limit=100${handoffs ? "&status=human_handoff" : ""}`);
  const [selected, setSelected] = useState<Conversation | null>(null);
  return <div className="split"><section><Table rows={rows} columns={platform ? ["merchantId", "customerPhone", "nickname", "language", "stage", "status", "handoffStatus"] : ["customerPhone", "nickname", "language", "stage", "status", "handoffStatus"]} onRow={setSelected} /></section><section>{selected ? <ConversationDetail platform={platform} conversation={selected} refresh={async () => setRows(await loadRows(`${base}?limit=100${handoffs ? "&status=human_handoff" : ""}`))} /> : <p>选择一个会话查看详情</p>}</section></div>;
}

function ConversationDetail({ platform = false, conversation, refresh }: { platform?: boolean; conversation: Conversation; refresh: () => void }) {
  const [messages, setMessages] = useState<Array<Record<string, string>>>([]);
  const [send, setSend] = useState({ type: "text", content: "", url: "", caption: "", fileName: "" });
  useEffect(() => { api<{ rows: Array<Record<string, string>> }>(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/messages`).then((r) => setMessages(r.rows)); }, [conversation.id, platform]);
  return <div><h3>{conversation.customerPhone}</h3><p>TG: {conversation.extractedTelegram || "-"} · 手机: {conversation.extractedPhone || "-"}</p>{!platform && <div className="toolbar"><select value={conversation.handoffStatus} onChange={async (e) => { await api(`/api/merchant/handoffs/${conversation.id}`, { method: "PATCH", body: JSON.stringify({ handoffStatus: e.target.value }) }); refresh(); }}><option value="pending">待处理</option><option value="processing">处理中</option><option value="done">已完成</option></select></div>}<div className="messages">{messages.map((m, i) => <article key={i} className={m.direction}>{m.content}<small>{m.intent}</small></article>)}</div>{!platform && <div className="send"><select value={send.type} onChange={(e) => setSend({ ...send, type: e.target.value })}><option>text</option><option>image</option><option>video</option><option>audio</option><option>document</option></select><input placeholder="文本内容" value={send.content} onChange={(e) => setSend({ ...send, content: e.target.value })} /><input placeholder="媒体URL" value={send.url} onChange={(e) => setSend({ ...send, url: e.target.value })} /><input placeholder="说明/文件名" value={send.caption} onChange={(e) => setSend({ ...send, caption: e.target.value })} /><button onClick={async () => { await api(`/api/merchant/conversations/${conversation.id}/send`, { method: "POST", body: JSON.stringify(send) }); setSend({ ...send, content: "", url: "", caption: "" }); }}><Send size={16}/>发送</button></div>}</div>;
}

function Table<T extends Record<string, any>>({ rows, columns, onRow }: { rows: T[]; columns: string[]; onRow?: (row: T) => void }) {
  return <div className="table"><table><thead><tr>{columns.map((c) => <th key={c}>{label(c)}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} onClick={() => onRow?.(row)}>{columns.map((c) => <td key={c}>{String(row[c] ?? "")}</td>)}</tr>)}</tbody></table></div>;
}

function useRows<T>(url: string): [T[], (rows: T[]) => void] {
  const [rows, setRows] = useState<T[]>([]);
  useEffect(() => { loadRows<T>(url).then(setRows).catch(() => setRows([])); }, [url]);
  return [rows, setRows];
}

async function loadRows<T>(url: string): Promise<T[]> {
  return (await api<{ rows: T[] }>(url)).rows;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function roleName(role: string) {
  return ({ platform_admin: "平台管理员", merchant_admin: "商户管理员", merchant_operator: "商户运营" } as Record<string, string>)[role] || role;
}

function label(key: string) {
  return ({
    merchants: "商户", conversations: "会话", handoffs: "接管", samples: "样本", active: "活跃会话", pendingHandoffs: "待接管",
    name: "名称", status: "状态", id: "ID", email: "邮箱", role: "角色", merchantId: "商户ID", customerPhone: "客户", nickname: "昵称",
    language: "语言", stage: "阶段", handoffStatus: "接管状态", customerMessage: "客户问题", standardReply: "标准回复", intent: "意图",
    priority: "优先级", a2cBaseUrl: "A2C地址", a2cAppId: "A2C App ID", a2cAppSecret: "A2C密钥", a2cAccountPhone: "A2C接收账号",
    openaiApiKey: "OpenAI Key", openaiModel: "OpenAI模型", telegramBotToken: "TG机器人", telegramHandoffChatId: "TG群ID",
    platformRegisterUrl: "开户链接", tgRegisterGuideUrl: "TG注册说明"
  } as Record<string, string>)[key] || key;
}

createRoot(document.getElementById("root")!).render(<App />);
