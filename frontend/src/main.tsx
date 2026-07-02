import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bot, Building2, CheckCircle2, Contact, FileText, Lightbulb, Loader2, LogOut, MessageSquare, Plus, Settings, Upload, Users, Workflow } from "lucide-react";
import { AgentProfilePage } from "./agent/AgentProfilePage.js";
import { api, loadRows, useRows, withQuery } from "./app/api.js";
import { ConversationExportBar } from "./conversations/ConversationExport.js";
import { ConversationAccountList } from "./conversations/ConversationAccountList.js";
import { ConversationCustomerList } from "./conversations/ConversationCustomerList.js";
import { ConversationComposer } from "./conversations/ConversationComposer.js";
import { ConversationDetailHeader } from "./conversations/ConversationDetailHeader.js";
import { ConversationMemoryCard } from "./conversations/ConversationMemoryCard.js";
import { ConversationReviewCard } from "./conversations/ConversationReviewCard.js";
import { MessageTimeline } from "./conversations/MessageTimeline.js";
import { CustomersPage } from "./customers/CustomersPage.js";
import { ConfigPage } from "./config/ConfigPage.js";
import { Dashboard } from "./dashboard/Dashboard.js";
import { ScriptFlowsPage } from "./script-flows/ScriptFlowsPage.js";
import { IntentLearningPage } from "./intent-learning/IntentLearningPage.js";
import { KnowledgePage } from "./knowledge/KnowledgePage.js";
import { SamplesPage } from "./samples/SamplesPage.js";
import { TrainingSimulator } from "./simulator/TrainingSimulator.js";
import { TrainingMaterialsPage } from "./training/TrainingMaterialsPage.js";
import type { A2CAccount, ChatMessage, Conversation, ConversationReview, ConversationReviewItem, ConversationReviewResponse, CustomerMemory, Filters, Merchant, MerchantCountry, UnreadSummary, User } from "./types.js";
import { AsyncButton, CountryPresetDatalist, CountrySettingsEditor, Editor, FilterBar, Table } from "./ui/components.js";
import { coercePatch } from "./ui/form.js";
import { countryLabel, displayValue, formatConversationDate, formatDateTime, formatTime, inferCountryProfile, label, languageName, localizeSystemText, normalizeText, replyModeLabel, translateSystemMessage } from "./ui/formatters.js";
import { Pagination, useClientPagination } from "./ui/Pagination.js";
import { notify, notifyExportStarted, ToastHost } from "./ui/toast.js";
import "./styles.css";

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
        {activeView === "dashboard" && <Dashboard platform={user.role === "platform_admin"} api={api} />}
        {activeView === "merchants" && <Merchants />}
        {activeView === "users" && <UsersPage />}
        {activeView === "config" && <ConfigPage platform={user.role === "platform_admin"} />}
        {activeView === "agentProfile" && <AgentProfilePage platform={user.role === "platform_admin"} canEdit={user.role !== "merchant_operator"} api={api} notify={notify} AsyncButton={AsyncButton} loadRows={loadRows} />}
        {activeView === "customers" && <CustomersPage platform={user.role === "platform_admin"} renderConversation={(conversation, reloadHistory) => <ConversationDetail platform={user.role === "platform_admin"} conversation={conversation} refresh={reloadHistory} onDeleted={async () => { await reloadHistory(); }} />} />}
        {activeView === "scriptFlows" && <ScriptFlowsPage platform={user.role === "platform_admin"} />}
        {activeView === "intentLearning" && <IntentLearningPage platform={user.role === "platform_admin"} />}
        {activeView === "training" && <TrainingMaterialsPage platform={false} simple />}
        {activeView === "simulator" && <TrainingSimulator api={api} notify={notify} AsyncButton={AsyncButton} formatDateTime={formatDateTime} displayValue={displayValue} countryLabel={countryLabel} />}
        {activeView === "materials" && <TrainingMaterialsPage platform={user.role === "platform_admin"} />}
        {activeView === "knowledge" && <KnowledgePage platform={user.role === "platform_admin"} />}
        {activeView === "samples" && <SamplesPage platform={user.role === "platform_admin"} />}
        {activeView === "conversations" && <Conversations platform={user.role === "platform_admin"} />}
        {activeView === "handoffs" && <Conversations platform={user.role === "platform_admin"} handoffs />}
      </main>
    </div>
  );
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
      <div className="notice">A2C、AI供应商 和 TG 密钥仍在“配置”页维护；这里负责商户、国家和登录账号的增删改查。</div>
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

function Conversations({ platform = false, handoffs = false }: { platform?: boolean; handoffs?: boolean }) {
  return platform ? <PlatformConversations handoffs={handoffs} /> : <MerchantConversations handoffs={handoffs} />;
}

function PlatformConversations({ handoffs = false }: { handoffs?: boolean }) {
  const base = "/api/admin/conversations";
  const [filters, setFiltersState] = useState<Filters>({ merchantId: "", status: handoffs ? "human_handoff" : "", handoffStatus: handoffs ? "pending" : "", language: "", limit: "100" });
  const rowsUrl = withQuery(base, filters);
  const [rows, setRows] = useRows<Conversation>(rowsUrl);
  const pager = useClientPagination(rows, 20);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const reload = async () => { setRows(await loadRows(rowsUrl)); pager.setPage(1); };
  const setFilters = (next: Filters) => {
    setFiltersState(handoffs ? { ...next, status: "human_handoff", handoffStatus: "pending" } : next);
  };
  return <div className={selected ? "split conversation-admin-layout work-split" : "single-column work-split"}><section className="work-panel"><ConversationExportBar base="/api/admin/conversations/export" scopedFilters={{ ...filters, limit: "50000" }} scopedLabel="当前筛选" onExportStarted={notifyExportStarted} />{handoffs && <div className="conversation-list-toolbar"><span className="status-pill warning">只显示待接管</span></div>}<FilterBar filters={filters} setFilters={setFilters} fields={handoffs ? ["merchantId", "language", "limit"] : ["merchantId", "status", "handoffStatus", "language", "limit"]} selects={{ status: ["", "active", "human_handoff"], handoffStatus: ["", "pending", "processing", "done"] }} onApply={reload} /><Table rows={pager.rows} columns={["merchantId", "countryName", "customerPhone", "nickname", "language", "stage", "status", "handoffStatus"]} onRow={setSelected} selectedKey={selected?.id} rowKey={(row) => row.id} /><Pagination pager={pager} /></section>{selected && <section className="detail-panel"><ConversationDetail platform conversation={selected} refresh={async () => setRows(await loadRows(rowsUrl))} onDeleted={async () => { setSelected(null); await reload(); }} /></section>}</div>;
}

function MerchantConversations({ handoffs = false }: { handoffs?: boolean }) {
  const [accounts, setAccounts] = useRows<A2CAccount>("/api/merchant/a2c/accounts");
  const [unread, setUnread] = useState<UnreadSummary[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<A2CAccount | null>(null);
  const [filters, setFiltersState] = useState<Filters>({ status: handoffs ? "human_handoff" : "", handoffStatus: handoffs ? "pending" : "", language: "", limit: "100" });
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
  const pager = useClientPagination(rows, 10);
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
  const reloadUnread = async () => {
    const res = await api<{ rows: UnreadSummary[] }>("/api/merchant/conversations/unread-summary");
    setUnread(res.rows);
  };
  const reloadRows = async () => {
    if (!selectedAccount) return;
    const nextRows = await loadRows<Conversation>(rowsUrl);
    setRows(nextRows);
    setSelected((current) => current ? nextRows.find((row) => row.id === current.id) || current : current);
  };
  useEffect(() => {
    if (!selectedAccount) return;
    let cancelled = false;
    const pollRows = async () => {
      const nextRows = await loadRows<Conversation>(rowsUrl).catch(() => null);
      if (!nextRows || cancelled) return;
      setRows(nextRows);
      setSelected((current) => current ? nextRows.find((row) => row.id === current.id) || current : current);
    };
    const timer = window.setInterval(() => void pollRows(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [rowsUrl, selectedAccount?.apiPhone]);
  const markAllRead = async () => {
    if (!selectedAccount) return;
    const result = await api<{ updated: number }>("/api/merchant/conversations/read-all", {
      method: "POST",
      body: JSON.stringify({ a2cAccountPhone: selectedAccount.apiPhone })
    });
    notify("success", "已全部标为已读", `已处理 ${result.updated} 个未读会话`);
    await reloadRows();
    await reloadUnread();
  };
  const togglePin = async (conversation: Conversation) => {
    const pinned = !conversation.pinnedAt;
    await api(`/api/merchant/conversations/${conversation.id}/pin`, { method: "POST", body: JSON.stringify({ pinned }) });
    notify("success", pinned ? "会话已置顶" : "已取消置顶");
    await reloadRows();
  };
  const accountUnread = (apiPhone: string) => unread.find((item) => item.a2cAccountPhone === apiPhone)?.unreadCount || 0;
  const conversationUnread = (conversationId: string) => unread.flatMap((item) => item.conversations).find((item) => item.conversationId === conversationId)?.unreadCount || 0;
  const markConversationRead = async (conversationId: string) => {
    await api(`/api/merchant/conversations/${conversationId}/read`, { method: "POST" });
    await reloadRows();
    await reloadUnread();
  };
  const openConversation = (conversation: Conversation) => {
    setSelected(conversation);
    setDraftCustomer(null);
    if (conversationUnread(conversation.id) > 0 || conversation.unreadCount > 0) {
      void markConversationRead(conversation.id).catch(() => null);
    }
  };
  const selectedUnread = selected ? conversationUnread(selected.id) : 0;
  useEffect(() => {
    if (!selected?.id || selectedUnread <= 0) return;
    void markConversationRead(selected.id).catch(() => null);
  }, [selected?.id, selectedUnread]);
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

  const exportFilters = selectedAccount ? { ...filters, a2cAccountPhone: selectedAccount.apiPhone, limit: "50000" } : undefined;
  const setFilters = (next: Filters) => {
    setFiltersState(handoffs ? { ...next, status: "human_handoff", handoffStatus: "pending" } : next);
  };
  const exportBase = "/api/merchant/conversations/export";

  return <div className={`conversation-workspace ${customerCollapsed ? "customers-collapsed" : ""}`}>
    <ConversationAccountList
      accounts={accounts}
      filteredAccounts={filteredAccounts}
      selectedAccount={selectedAccount}
      accountKeyword={accountKeyword}
      accountStatus={accountStatus}
      pager={accountPager}
      accountUnread={accountUnread}
      countryLabel={countryLabel}
      onKeywordChange={(value) => {
        setAccountKeyword(value);
        accountPager.setPage(1);
      }}
      onStatusChange={(value) => {
        setAccountStatus(value);
        accountPager.setPage(1);
      }}
      onSelectAccount={setSelectedAccount}
      renderSyncButton={(children) => <AsyncButton className="sync-compact-button" busyText="同步中..." onClick={async () => { await api("/api/merchant/a2c/accounts/sync", { method: "POST" }); await reloadAccounts(); }}>{children}</AsyncButton>}
    />
    <ConversationCustomerList
      handoffs={handoffs}
      collapsed={customerCollapsed}
      selectedAccount={selectedAccount}
      selectedConversation={selected}
      exportBase={exportBase}
      exportFilters={exportFilters}
      pager={pager}
      totalRows={rows.length}
      newCustomer={newCustomer}
      error={error}
      accountUnread={accountUnread}
      conversationUnread={conversationUnread}
      countryLabel={countryLabel}
      languageName={languageName}
      label={label}
      formatConversationDate={formatConversationDate}
      onToggleCollapsed={() => setCustomerCollapsed(!customerCollapsed)}
      onMarkAllRead={markAllRead}
      onTogglePin={togglePin}
      onOpenConversation={openConversation}
      onNewCustomerChange={setNewCustomer}
      onOpenNewCustomer={openNewCustomer}
      onExportStarted={notifyExportStarted}
      renderFilterBar={() => <FilterBar filters={filters} setFilters={setFilters} fields={handoffs ? ["language", "limit"] : ["status", "handoffStatus", "language", "limit"]} selects={{ status: ["", "active", "human_handoff"], handoffStatus: ["", "pending", "processing", "done"] }} onApply={reloadRows} />}
    />
    <section className="chat-pane">{selected ? <ConversationDetail conversation={selected} refresh={async () => { await reloadRows(); await reloadUnread(); }} onDeleted={async () => { setSelected(null); await reloadRows(); await reloadUnread(); }} /> : selectedAccount && draftCustomer ? <ProactiveConversationDetail account={selectedAccount} target={draftCustomer} onCreated={async (conversation) => { setSelected(conversation); setDraftCustomer(null); setNewCustomer({ customerPhone: "", nickname: "" }); await reloadRows(); await reloadUnread(); }} /> : <div className="empty-chat export-empty-state"><h3>选择客户开始对话</h3><p>左侧选择客服账号，中间选择客户；也可以使用顶部工具条一键导出全部线上对话用于复盘、训练或交给同事分析。</p></div>}</section>
  </div>;
}

function ProactiveConversationDetail({ account, target, onCreated }: { account: A2CAccount; target: { customerPhone: string; nickname: string }; onCreated: (conversation: Conversation) => Promise<void> }) {
  const [send, setSend] = useState({ type: "text", content: "", url: "", caption: "", fileName: "" });
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  return <div className="conversation-detail proactive-chat"><div className="chat-header"><div><h3>{target.customerPhone}</h3><p>通过客服账号 {account.verifiedName || account.apiPhone} 主动发送</p></div><span className="status-pill neutral">{countryLabel(account.countryName)}</span></div>{error && <div className="error" role="alert">{error}</div>}{statusMessage && <div className="notice" role="status">{statusMessage}</div>}<div className="empty-chat compact"><h3>新对话</h3><p>发送第一条消息后，系统会自动创建客户档案和会话记录。</p></div><ConversationComposer value={send} onChange={setSend} renderSendAction={(disabled, children) => <AsyncButton disabled={disabled} busyText="发送中..." onClick={async () => { setError(""); setStatusMessage(""); try { const res = await api<{ conversation: Conversation }>(`/api/merchant/a2c/accounts/${encodeURIComponent(account.apiPhone)}/send`, { method: "POST", body: JSON.stringify({ ...send, customerPhone: target.customerPhone, nickname: target.nickname }) }); setStatusMessage("消息已发送，会话已创建。"); await onCreated(res.conversation); } catch (err) { setError(err instanceof Error ? err.message : "发送失败"); } }}>{children}</AsyncButton>} /></div>;
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
  const generate = async () => {
    setError("");
    setStatusMessage("正在生成对话复盘...");
    await api(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/review`, { method: "POST" });
    await loadReview();
    setStatusMessage("对话复盘已生成。");
  };
  const apply = async (itemId: number) => {
    setError("");
    setStatusMessage("正在加入训练中心...");
    await api(`/api/merchant/conversations/${conversation.id}/review/apply`, { method: "POST", body: JSON.stringify({ itemId }) });
    await loadReview();
    setStatusMessage("候选内容已加入训练中心。");
    notify("success", "已加入训练中心");
  };
  return <div className="conversation-detail"><ConversationDetailHeader
    platform={platform}
    conversation={conversation}
    lastOutboundPayload={lastOutboundPayload}
    flowStep={flowStep}
    strictEnabled={strictEnabled}
    countryLabel={countryLabel}
    languageName={languageName}
    label={label}
    replyModeLabel={replyModeLabel}
    onHandoffStatusChange={async (handoffStatus) => {
      setError("");
      setStatusMessage("正在更新接管状态...");
      await api(`/api/merchant/handoffs/${conversation.id}`, { method: "PATCH", body: JSON.stringify({ handoffStatus }) });
      setStatusMessage("接管状态已更新。");
      await loadReview().catch(() => null);
      refresh();
    }}
    renderDeleteAction={() => <AsyncButton className="danger" busyText="删除中..." onClick={async () => { if (!window.confirm("确认彻底删除这个会话？聊天记录和接管记录会一起删除。")) return; await api(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}`, { method: "DELETE" }); notify("success", "会话已彻底删除"); await onDeleted?.(); }}>删除会话</AsyncButton>}
  />{error && <div className="error" role="alert">{error}</div>}{statusMessage && <div className="notice" role="status">{statusMessage}</div>}<ConversationMemoryCard
    memory={memory}
    notes={notes}
    localizeSystemText={localizeSystemText}
    onNotesChange={setNotes}
    renderSaveAction={() => <AsyncButton busyText="保存中..." onClick={async () => { setError(""); const item = await api<CustomerMemory>(memoryUrl, { method: "PATCH", body: JSON.stringify({ operatorNotes: notes }) }); setMemory(item); setNotes(item.operatorNotes || ""); setStatusMessage("客户记忆已保存。"); }}>保存记忆</AsyncButton>}
  /><ConversationReviewCard platform={platform} data={review} onGenerate={generate} onApply={apply} renderAction={({ children, busyText, onClick }) => <AsyncButton onClick={onClick} busyText={busyText}>{children}</AsyncButton>} /><div className="chat-window" ref={messagesRef}>{messages.length ? <MessageTimeline messages={messages} helpers={{ formatDate: formatConversationDate, formatTime, label, languageName, normalizeText, replyModeLabel, translateSystemMessage }} /> : <div className="empty-state">暂无聊天记录</div>}</div>{!platform && <ConversationComposer value={send} onChange={setSend} renderSendAction={(disabled, children) => <AsyncButton disabled={disabled} busyText="发送中..." onClick={async () => { setError(""); setStatusMessage(""); try { await api(`/api/merchant/conversations/${conversation.id}/send`, { method: "POST", body: JSON.stringify(send) }); setSend({ ...send, content: "", url: "", caption: "" }); setStatusMessage("消息已发送。"); await loadMessages(); } catch (err) { setError(err instanceof Error ? err.message : "发送失败"); } }}>{children}</AsyncButton>} />}</div>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function roleName(role: string) {
  return ({ platform_admin: "平台管理员", merchant_admin: "商户管理员", merchant_operator: "商户运营" } as Record<string, string>)[role] || role;
}

createRoot(document.getElementById("root")!).render(<App />);
