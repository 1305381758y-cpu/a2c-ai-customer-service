import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bot, Building2, CheckCircle2, Contact, FileText, Lightbulb, Loader2, LogOut, MessageSquare, Plus, Settings, Sparkles, Upload, Users, Workflow } from "lucide-react";
import { AgentProfilePage } from "./agent/AgentProfilePage.js";
import { api, loadRows, useRows, withQuery } from "./app/api.js";
import { ConversationDetail, Conversations } from "./conversations/ConversationsPage.js";
import { CustomersPage } from "./customers/CustomersPage.js";
import { Dashboard } from "./dashboard/Dashboard.js";
import { IntentLearningPage } from "./intent-learning/IntentLearningPage.js";
import { KnowledgePage } from "./knowledge/KnowledgePage.js";
import { AiCallsPage } from "./model-calls/AiCallsPage.js";
import { SamplesPage } from "./samples/SamplesPage.js";
import { ScriptFlowsPage } from "./script-flows/ScriptFlowsPage.js";
import { Config } from "./settings/ConfigPage.js";
import { TrainingMaterialsPage } from "./training/TrainingMaterialsPage.js";
import { TrainingSimulator } from "./simulator/TrainingSimulator.js";
import { UsersPage } from "./users/UsersPage.js";
import type { Merchant, MerchantCountry, User } from "./types.js";
import { AsyncButton, ConfirmActionButton, CountryPresetDatalist, CountrySettingsEditor, Editor, FilterBar, Table } from "./ui/components.js";
import { coercePatch } from "./ui/form.js";
import { countryLabel, displayValue, formatDateTime, getTimeDisplayMode, inferCountryProfile, label, languageName, setTimeDisplayMode, timeDisplayModeLabel, type TimeDisplayMode } from "./ui/formatters.js";
import { notify, ToastHost } from "./ui/toast.js";
import "./styles.css";
import "./styles/final-overrides.css";

const STRICT_STEP_OPTIONS = [
  "first_greeting",
  "interest_screening",
  "project_intro",
  "registration_intent",
  "send_register_link",
  "wait_registration",
  "telegram_confirm",
  "telegram_download",
  "collect_telegram",
  "human_handoff",
  "ended"
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => window.location.hash.replace("#", "") || window.localStorage.getItem("a2c_view") || "dashboard");

  useEffect(() => {
    api<{ user: User }>("/api/auth/me").then((res) => setUser(res.user)).catch(() => null).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const syncViewFromHash = () => {
      const nextView = window.location.hash.replace("#", "");
      if (nextView) setView(nextView);
    };
    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
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

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("Admin123456");
  const [error, setError] = useState("");
  return (
    <Shell>
      <main className="login">
        <section className="login-panel">
          <div className="brand-lockup"><span>智</span><div><h1>A2C 智能客服</h1><p>平台管理端 / 商户端</p></div></div>
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
  const [timeMode, setTimeMode] = useState<TimeDisplayMode>(() => getTimeDisplayMode());
  const merchantTrainingViews = ["materials", "knowledge", "samples"];
  const nav = user.role === "platform_admin"
    ? [["dashboard", "总览", Bot], ["aiCalls", "模型调用", Sparkles], ["merchants", "商户", Building2], ["users", "后台账号", Users], ["config", "配置", Settings], ["agentProfile", "智能体配置", Bot], ["customers", "客户", Contact], ["scriptFlows", "话本流程", Workflow], ["intentLearning", "意图学习", Lightbulb], ["materials", "素材", FileText], ["knowledge", "知识库", Workflow], ["samples", "样本", Upload], ["conversations", "会话", MessageSquare], ["handoffs", "接管", Workflow]]
    : [["dashboard", "总览", Bot], ["aiCalls", "模型调用", Sparkles], ["training", "训练中心", Upload], ["simulator", "模拟训练", MessageSquare], ["agentProfile", "智能体配置", Bot], ["scriptFlows", "话本流程", Workflow], ["intentLearning", "意图学习", Lightbulb], ["customers", "客户", Contact], ["conversations", "会话", MessageSquare], ["handoffs", "接管", Workflow], ["config", "设置", Settings]];
  const activeView = user.role !== "platform_admin" && merchantTrainingViews.includes(view) ? "training" : view;
  useEffect(() => {
    if (user.role !== "platform_admin" && merchantTrainingViews.includes(view)) setView("training");
  }, [user.role, view, setView]);
  const changeTimeMode = (mode: TimeDisplayMode) => {
    setTimeDisplayMode(mode);
    setTimeMode(mode);
  };
  return (
    <div className="app">
      <aside>
        <div className="side-brand"><span>智</span><div><h2>A2C 智能客服</h2><small>智能客服工作台</small></div></div>
        <div className="side-user"><strong>{user.name}</strong><span>{roleName(user.role)}</span></div>
        <nav>{nav.map(([key, label, Icon]) => <button key={key as string} className={activeView === key ? "active" : ""} onClick={() => setView(key as string)}><Icon size={17}/>{label as string}</button>)}</nav>
        <ConfirmActionButton className="logout" busyText="退出中..." title="确认退出登录？" detail="退出后需要重新输入账号密码才能进入后台。" confirmText="退出登录" onConfirm={async () => { await api("/api/auth/logout", { method: "POST" }); notify("success", "已退出登录"); onLogout(); }}><LogOut size={17}/>退出</ConfirmActionButton>
      </aside>
      <main>
        <header><div><h1>{nav.find((item) => item[0] === activeView)?.[1] || "总览"}</h1><p>{user.name} · {roleName(user.role)}</p></div><div className="header-actions"><label className="time-zone-toggle"><span>时间</span><select value={timeMode} onChange={(event) => changeTimeMode(event.target.value as TimeDisplayMode)} aria-label="时间显示"><option value="beijing">北京时间</option><option value="country">国家时间</option></select><small>{timeDisplayModeLabel(timeMode)}</small></label><span className="live-pill"><CheckCircle2 size={15}/>线上服务已连接</span></div></header>
        {activeView === "dashboard" && <Dashboard platform={user.role === "platform_admin"} api={api} timeMode={timeMode} />}
        {activeView === "aiCalls" && <AiCallsPage platform={user.role === "platform_admin"} timeMode={timeMode} />}
        {activeView === "merchants" && <Merchants />}
        {activeView === "users" && <UsersPage />}
        {activeView === "config" && <Config platform={user.role === "platform_admin"} />}
        {activeView === "agentProfile" && <AgentProfilePage platform={user.role === "platform_admin"} canEdit={user.role !== "merchant_operator"} api={api} notify={notify} AsyncButton={AsyncButton} loadRows={loadRows} />}
        {activeView === "customers" && <CustomersPage platform={user.role === "platform_admin"} timeMode={timeMode} renderConversation={(conversation, reloadHistory) => <ConversationDetail platform={user.role === "platform_admin"} conversation={conversation} refresh={reloadHistory} onDeleted={async () => { await reloadHistory(); }} />} />}
        {activeView === "scriptFlows" && <ScriptFlowsPage platform={user.role === "platform_admin"} />}
        {activeView === "intentLearning" && <IntentLearningPage platform={user.role === "platform_admin"} timeMode={timeMode} />}
        {activeView === "training" && <TrainingMaterialsPage platform={false} simple />}
        {activeView === "simulator" && <TrainingSimulator api={api} notify={notify} AsyncButton={AsyncButton} formatDateTime={formatDateTime} displayValue={displayValue} countryLabel={countryLabel} />}
        {activeView === "materials" && <TrainingMaterialsPage platform={user.role === "platform_admin"} />}
        {activeView === "knowledge" && <KnowledgePage platform={user.role === "platform_admin"} />}
        {activeView === "samples" && <SamplesPage platform={user.role === "platform_admin"} />}
        {activeView === "conversations" && <Conversations platform={user.role === "platform_admin"} timeMode={timeMode} />}
        {activeView === "handoffs" && <Conversations platform={user.role === "platform_admin"} handoffs timeMode={timeMode} />}
      </main>
    </div>
  );
}

function Merchants() {
  const [rows, setRows] = useState<Merchant[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState("");
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
  const reloadMerchants = async () => {
    setRowsLoading(true);
    setRowsError(null);
    try {
      setRows(await loadRows("/api/admin/merchants"));
    } catch (err) {
      setRows([]);
      setRowsError(err instanceof Error ? err.message : "商户列表加载失败，请稍后重试。");
    } finally {
      setRowsLoading(false);
    }
  };
  useEffect(() => { void reloadMerchants(); }, []);
  const update = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value });
  const updateCountryName = (value: string) => {
    const inferred = inferCountryProfile(value);
    setForm({ ...form, countryName: value, countryCode: inferred.code, defaultLanguage: inferred.defaultLanguage });
  };
  const reloadMerchantDetail = async (merchantId = selected?.id) => {
    setDetailError("");
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
  useEffect(() => {
    reloadMerchantDetail().catch((err) => setDetailError(err instanceof Error ? err.message : "商户详情加载失败"));
  }, [selected?.id]);
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
    await reloadMerchants();
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
      <Table rows={rows} columns={["name", "status", "id"]} onRow={setSelected} selectedKey={selected?.id} rowKey={(row) => row.id} loading={rowsLoading} error={rowsError} onRetry={reloadMerchants} emptyTitle="暂无商户" emptyDetail="创建商户后，会在这里显示商户列表。" />
    </section>
    <section className="detail-panel">{selected ? <div className="merchant-detail">
      {detailError && <div className="error" role="alert">商户详情加载失败：{detailError}</div>}
      <Editor title="商户设置" value={selected} fields={["name", "status"]} selects={{ status: ["active", "disabled"] }} deleteTitle="确认彻底删除商户？" deleteDetail={`商户“${selected.name}”的账号、国家、客户、会话、样本、知识库、素材和配置都会被删除，此操作不可恢复。`} deleteConfirmText="彻底删除" onSave={async (patch) => {
        const saved = await api<Merchant>(`/api/admin/merchants/${selected.id}`, { method: "PATCH", body: JSON.stringify(patch) });
        setSelected(saved);
        await reloadMerchants();
      }} onDelete={selected.id === "default" ? undefined : async () => {
        await api(`/api/admin/merchants/${selected.id}`, { method: "DELETE" });
        setSelected(null);
        setSelectedCountry(null);
        setSelectedUser(null);
        await reloadMerchants();
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
        {selectedUser && <Editor title="账号设置" value={{ name: selectedUser.name, role: selectedUser.role, status: (selectedUser as any).status || "active", merchantId: selected.id, password: "" }} fields={["name", "role", "status", "password"]} selects={{ role: ["merchant_admin", "merchant_operator"], status: ["active", "disabled"] }} deleteTitle="确认删除后台账号？" deleteDetail={`删除账号 ${selectedUser.email} 后，该用户将不能再登录后台。商户数据不会删除。`} deleteConfirmText="删除账号" onSave={async (patch) => {
          if (!patch.password) delete patch.password;
          const saved = await api<User>(`/api/admin/users/${selectedUser.id}`, { method: "PATCH", body: JSON.stringify({ ...patch, merchantId: selected.id }) });
          setSelectedUser(saved);
          await reloadMerchantDetail(selected.id);
        }} onDelete={async () => {
          await api(`/api/admin/users/${selectedUser.id}`, { method: "DELETE" });
          setSelectedUser(null);
          await reloadMerchantDetail(selected.id);
          notify("success", "账号已删除");
        }} />}
      </div>
      <div className="notice">A2C、智能供应商和 TG 密钥仍在“配置”页维护；这里负责商户、国家和登录账号的增删改查。</div>
    </div> : <div className="empty-state">选择商户后可修改名称和状态。新增商户时可以同时创建国家和商户端登录账号。</div>}</section>
  </div>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function roleName(role: string) {
  return ({ platform_admin: "平台管理员", merchant_admin: "商户管理员", merchant_operator: "商户运营" } as Record<string, string>)[role] || role;
}

const rootElement = document.getElementById("root")! as HTMLElement & { a2cRoot?: ReturnType<typeof createRoot> };
rootElement.a2cRoot ||= createRoot(rootElement);
rootElement.a2cRoot.render(<App />);
