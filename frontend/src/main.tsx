import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bot, BookOpen, Building2, Check, CheckCircle2, Contact, Copy, FileText, Lightbulb, Loader2, LogOut, MessageSquare, Plus, RefreshCw, Search, Settings, Sparkles, ThumbsDown, ThumbsUp, Upload, Users, Workflow } from "lucide-react";
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
import { Dashboard } from "./dashboard/Dashboard.js";
import { KnowledgePage } from "./knowledge/KnowledgePage.js";
import { TrainingSimulator } from "./simulator/TrainingSimulator.js";
import type { A2CAccount, AiCallStats, ChatMessage, ConfigCheck, Conversation, ConversationReview, ConversationReviewItem, ConversationReviewResponse, CustomerMemory, Filters, IntentLearningEvent, InviteCode, Knowledge, Merchant, MerchantCountry, Sample, ScriptFlow, ScriptFlowDetail, ScriptFlowStep, ScriptFlowVersion, TeacherTgLink, TrainingMaterial, TrainingMaterialItem, UnreadSummary, User } from "./types.js";
import { AsyncButton, ConfirmActionButton, CountryPresetDatalist, CountrySettingsEditor, Editor, FilterBar, Table } from "./ui/components.js";
import { coercePatch } from "./ui/form.js";
import { countryLabel, displayValue, formatConversationDate, formatDateTime, formatTime, getTimeDisplayMode, inferCountryProfile, label, languageName, localizeSystemText, normalizeText, replyModeLabel, setTimeDisplayMode, statusTone, timeDisplayModeLabel, timeZoneForCountry, translateSystemMessage, type TimeDisplayMode } from "./ui/formatters.js";
import { Pagination, useClientPagination } from "./ui/Pagination.js";
import { notify, notifyExportStarted, ToastHost } from "./ui/toast.js";
import "./styles.css";

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
        {activeView === "aiCalls" && <AiCallsPage platform={user.role === "platform_admin"} />}
        {activeView === "merchants" && <Merchants />}
        {activeView === "users" && <UsersPage />}
        {activeView === "config" && <Config platform={user.role === "platform_admin"} />}
        {activeView === "agentProfile" && <AgentProfilePage platform={user.role === "platform_admin"} canEdit={user.role !== "merchant_operator"} api={api} notify={notify} AsyncButton={AsyncButton} loadRows={loadRows} />}
        {activeView === "customers" && <CustomersPage platform={user.role === "platform_admin"} renderConversation={(conversation, reloadHistory) => <ConversationDetail platform={user.role === "platform_admin"} conversation={conversation} refresh={reloadHistory} onDeleted={async () => { await reloadHistory(); }} />} />}
        {activeView === "scriptFlows" && <ScriptFlows platform={user.role === "platform_admin"} />}
        {activeView === "intentLearning" && <IntentLearning platform={user.role === "platform_admin"} />}
        {activeView === "training" && <TrainingMaterials platform={false} simple />}
        {activeView === "simulator" && <TrainingSimulator api={api} notify={notify} AsyncButton={AsyncButton} formatDateTime={formatDateTime} displayValue={displayValue} countryLabel={countryLabel} />}
        {activeView === "materials" && <TrainingMaterials platform={user.role === "platform_admin"} />}
        {activeView === "knowledge" && <KnowledgePage platform={user.role === "platform_admin"} />}
        {activeView === "samples" && <Samples platform={user.role === "platform_admin"} />}
        {activeView === "conversations" && <Conversations platform={user.role === "platform_admin"} timeMode={timeMode} />}
        {activeView === "handoffs" && <Conversations platform={user.role === "platform_admin"} handoffs timeMode={timeMode} />}
      </main>
    </div>
  );
}

function AiCallsPage({ platform = false }: { platform?: boolean }) {
  const [filters, setFilters] = useState<Filters>({ merchantId: "", provider: "", startAt: "", endAt: "" });
  const endpoint = platform ? "/api/admin/ai-calls/stats" : "/api/merchant/ai-calls/stats";
  const [selectedTaskType, setSelectedTaskType] = useState("");
  const [data, setData] = useState<AiCallStats>({ totalCalls: 0, successCalls: 0, errorCalls: 0, successRate: 0, averageDurationMs: 0, availableProviders: [], byType: [], byProvider: [], byTypeDetails: [], byError: [] });
  const reload = async () => {
    const query = platform ? filters : { provider: filters.provider, startAt: filters.startAt, endAt: filters.endAt };
    const nextData = await api<AiCallStats>(withQuery(endpoint, query));
    setData(nextData);
    if (selectedTaskType && !nextData.byType.some((row) => row.taskType === selectedTaskType)) setSelectedTaskType("");
  };
  useEffect(() => { reload().catch(() => undefined); }, [platform]);
  const detailRows = selectedTaskType ? data.byTypeDetails.filter((row) => row.taskType === selectedTaskType) : data.byTypeDetails;
  return <div className="ai-calls-page work-split single-column">
    <section className="work-panel">
      <div className="training-center-hero compact">
        <div>
          <h3>大模型调用统计</h3>
          <p>统计翻译、语言识别、意图理解、口语化改写、图片分析、复盘和普通回复等所有模型调用。</p>
        </div>
      </div>
      <div className="toolbar wrap filters">
        {platform && <input placeholder="商户ID" value={filters.merchantId || ""} onChange={(event) => setFilters({ ...filters, merchantId: event.target.value })} />}
        <select aria-label="智能供应商" value={filters.provider || ""} onChange={(event) => setFilters({ ...filters, provider: event.target.value })}>
          <option value="">全部供应商</option>
          {data.availableProviders.map((provider) => <option key={provider} value={provider}>{label(provider)}</option>)}
        </select>
        <input type="datetime-local" step={1} aria-label="开始时间" placeholder="开始时间" value={filters.startAt || ""} onChange={(event) => setFilters({ ...filters, startAt: event.target.value })} />
        <input type="datetime-local" step={1} aria-label="结束时间" placeholder="结束时间" value={filters.endAt || ""} onChange={(event) => setFilters({ ...filters, endAt: event.target.value })} />
        <button onClick={reload}><Search size={16}/>筛选</button>
      </div>
      <div className="grid metrics">
        <MetricCard title="总调用" value={data.totalCalls} detail="所有供应商、所有任务类型" />
        <MetricCard title="成功调用" value={data.successCalls} detail="已正常返回内容" />
        <MetricCard title="失败调用" value={data.errorCalls} detail="Key、限流、超时或返回异常" />
        <MetricCard title="成功率" value={`${data.successRate}%`} detail="成功调用 / 总调用" />
        <MetricCard title="平均耗时" value={`${data.averageDurationMs} ms`} detail="按筛选范围计算" />
      </div>
      <div className="ai-call-columns">
        <section className="assistant-card">
          <h3>按调用类型</h3>
          <Table rows={data.byType} columns={["taskType", "totalCalls", "successCalls", "errorCalls", "successRate", "averageDurationMs"]} onRow={(row) => setSelectedTaskType(row.taskType)} selectedKey={selectedTaskType} rowKey={(row) => row.taskType} />
        </section>
        <section className="assistant-card">
          <h3>按供应商</h3>
          <Table rows={data.byProvider} columns={["provider", "totalCalls", "successCalls", "errorCalls", "successRate", "averageDurationMs"]} />
        </section>
      </div>
      <section className="assistant-card">
        <div className="section-heading-row">
          <h3>调用类型明细 · {selectedTaskType ? label(selectedTaskType) : "全部类型"}</h3>
          {selectedTaskType && <button className="ghost" onClick={() => setSelectedTaskType("")}>查看全部类型</button>}
        </div>
        <Table rows={detailRows} columns={["taskType", "provider", "model", "totalCalls", "successCalls", "errorCalls", "successRate", "averageDurationMs", "lastCalledAt"]} />
      </section>
      <section className="assistant-card">
        <h3>失败原因明细</h3>
        <Table rows={data.byError} columns={["taskType", "provider", "model", "errorMessage", "httpStatus", "requestSummary", "responseSummary", "errorCalls", "lastFailedAt"]} />
      </section>
    </section>
  </div>;
}

function MetricCard({ title, value, detail }: { title: string; value: number | string; detail: string }) {
  return <section className="metric-card">
    <div className="metric-top"><span>{title}</span><i><Sparkles size={19}/></i></div>
    <strong>{value}</strong>
    <small>{detail}</small>
  </section>;
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

function UsersPage() {
  const [filters, setFilters] = useState<Filters>({ merchantId: "" });
  const usersUrl = withQuery("/api/admin/users", filters);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", name: "", password: "Admin123456", role: "merchant_admin", merchantId: "default" });
  const [selected, setSelected] = useState<Record<string, string> | null>(null);
  const reload = async () => {
    setRowsLoading(true);
    setRowsError(null);
    try {
      setRows(await loadRows(usersUrl));
    } catch (err) {
      setRows([]);
      setRowsError(err instanceof Error ? err.message : "用户列表加载失败，请稍后重试。");
    } finally {
      setRowsLoading(false);
    }
  };
  useEffect(() => { void reload(); }, [usersUrl]);
  const createUser = async () => {
    await api("/api/admin/users", { method: "POST", body: JSON.stringify(form) });
    setForm({ ...form, email: "", name: "", password: "Admin123456" });
    await reload();
    notify("success", "用户已新增");
  };
  return <div className="split work-split">
    <section className="work-panel">
      <div className="toolbar wrap">
        <input placeholder="按商户ID筛选" value={filters.merchantId} onChange={(e) => setFilters({ merchantId: e.target.value })} />
        <AsyncButton busyText="筛选中..." onClick={reload}><Search size={16}/>筛选</AsyncButton>
      </div>
      <div className="toolbar wrap compact-create">
        {["email", "name", "password", "merchantId"].map((key) => <input key={key} placeholder={label(key)} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />)}
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="merchant_admin">{label("merchant_admin")}</option>
          <option value="merchant_operator">{label("merchant_operator")}</option>
          <option value="platform_admin">{label("platform_admin")}</option>
        </select>
        <AsyncButton disabled={!form.email.trim() || !form.name.trim() || form.password.length < 8} busyText="新增中..." onClick={createUser}><Plus size={16}/>新增用户</AsyncButton>
      </div>
      <Table rows={rows} columns={["email", "name", "role", "merchantId", "status"]} onRow={setSelected} selectedKey={selected?.id} rowKey={(row) => row.id} loading={rowsLoading} error={rowsError} onRetry={reload} emptyTitle="暂无用户" emptyDetail="新增平台管理员、商户管理员或商户运营后，会显示在这里。" />
    </section>
    <section className="detail-panel">
      {selected ? <Editor
        title="用户设置"
        value={{ name: selected.name, status: selected.status, role: selected.role, merchantId: selected.merchantId || "", password: "" }}
        fields={["name", "status", "role", "merchantId", "password"]}
        selects={{ status: ["active", "disabled"], role: ["platform_admin", "merchant_admin", "merchant_operator"] }}
        deleteTitle="确认删除后台用户？"
        deleteDetail={`删除用户 ${selected.email} 后，该账号将无法登录后台。商户和客户数据不会删除。`}
        deleteConfirmText="删除用户"
        onSave={async (patch) => {
          if (!patch.password) delete patch.password;
          const saved = await api<Record<string, string>>(`/api/admin/users/${selected.id}`, { method: "PATCH", body: JSON.stringify(patch) });
          setSelected(saved);
          await reload();
        }}
        onDelete={async () => {
          await api(`/api/admin/users/${selected.id}`, { method: "DELETE" });
          setSelected(null);
          await reload();
          notify("success", "用户已删除");
        }}
      /> : <div className="empty-state">选择用户后可停用、改角色、重置密码或删除账号。</div>}
    </section>
  </div>;
}

function Config({ platform }: { platform: boolean }) {
  const [merchants] = useRows<Merchant>(platform ? "/api/admin/merchants" : "");
  const [merchantId, setMerchantId] = useState("default");
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [a2cAccounts, setA2CAccounts] = useState<A2CAccount[]>([]);
  const [countries, setCountries] = useState<MerchantCountry[]>([]);
  const [countryDraft, setCountryDraft] = useState({ code: "br", name: "巴西", defaultLanguage: "pt-BR", platformRegisterUrl: "", tgRegisterGuideUrl: "", requirePlatformAccount: "true", requirePhone: "true", requireTelegram: "true", requireWhatsApp: "false" });
  const [teacherTgLinks, setTeacherTgLinks] = useState<TeacherTgLink[]>([]);
  const [teacherTgDraft, setTeacherTgDraft] = useState({ urls: "", priority: "0", rotationCount: "1" });
  const url = platform ? `/api/admin/merchants/${merchantId}/config` : "/api/merchant/config";
  const countriesUrl = platform ? `/api/admin/merchants/${merchantId}/countries` : "/api/merchant/countries";
  const a2cAccountsUrl = platform ? `/api/admin/merchants/${merchantId}/a2c/accounts` : "/api/merchant/a2c/accounts";
  const a2cSyncUrl = platform ? `/api/admin/merchants/${merchantId}/a2c/accounts/sync` : "/api/merchant/a2c/accounts/sync";
  const teacherTgLinksUrl = platform ? `/api/admin/merchants/${merchantId}/teacher-tg-links` : "/api/merchant/teacher-tg-links";
  const checkUrl = platform ? `/api/admin/merchants/${merchantId}/config/check` : "/api/merchant/config/check";
  const a2cWebhookUrl = `${window.location.origin}/webhooks/a2c/${platform ? merchantId : String(form.merchantId || "default")}`;
  const [checks, setChecks] = useState<ConfigCheck[]>([]);
  const [tutorialImageFile, setTutorialImageFile] = useState<File | null>(null);
  const [accountKeyword, setAccountKeyword] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [accountCountryId, setAccountCountryId] = useState("");
  const reloadConfig = async () => setForm(await api<Record<string, string | boolean>>(url));
  useEffect(() => {
    reloadConfig().catch((err) => setError(err instanceof Error ? err.message : "配置加载失败"));
  }, [url]);
  useEffect(() => {
    loadRows<MerchantCountry>(countriesUrl).then(setCountries).catch((err) => setError(err instanceof Error ? err.message : "国家设置加载失败"));
  }, [countriesUrl]);
  useEffect(() => {
    loadRows<A2CAccount>(a2cAccountsUrl).then(setA2CAccounts).catch((err) => setError(err instanceof Error ? err.message : "A2C客服账号加载失败"));
  }, [a2cAccountsUrl]);
  useEffect(() => {
    loadRows<TeacherTgLink>(teacherTgLinksUrl).then(setTeacherTgLinks).catch((err) => setError(err instanceof Error ? err.message : "老师TG链接加载失败"));
  }, [teacherTgLinksUrl]);
  useEffect(() => { setChecks([]); }, [merchantId]);
  const applyCountryDraft = (country: MerchantCountry) => {
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
  };
  useEffect(() => {
    const country = countries[0];
    if (!country) return;
    applyCountryDraft(country);
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
  const fields = ["a2cBaseUrl", "a2cAppId", "a2cAppSecret", "a2cAccountPhone", "aiProvider", "minimaxApiKey", "minimaxModel", "deepseekApiKey", "deepseekModel", "telegramBotToken", "platformRegisterUrl", "tgRegisterGuideUrl"];
  const reloadCountries = async () => setCountries(await loadRows<MerchantCountry>(countriesUrl));
  const reloadTeacherTgLinks = async () => setTeacherTgLinks(await loadRows<TeacherTgLink>(teacherTgLinksUrl));
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
  const saveConfigFlag = async (key: "smartReplyEnabled" | "trainingSimulationEnabled" | "strictScriptFlowEnabled", value: boolean, successMessage: string) => {
    setMessage("");
    setError("");
    try {
      const saved = await api<Record<string, string | boolean>>(url, { method: "PATCH", body: JSON.stringify({ [key]: value }) });
      setForm(saved);
      setMessage(successMessage);
      notify("success", successMessage);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "保存开关失败";
      setError(detail);
      notify("error", "开关保存失败", detail);
      throw err;
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
  const importTeacherTelegramLinks = async () => {
    const currentCountry = countries[0];
    if (!currentCountry) throw new Error("请先保存国家设置，再批量设置老师TG链接。");
    if (!teacherTgDraft.urls.trim()) throw new Error("请先填写老师TG链接，一行一条。");
    const result = await api<{ imported: number; rows: TeacherTgLink[] }>(`${teacherTgLinksUrl}/import`, {
      method: "POST",
      body: JSON.stringify({
        countryId: currentCountry.id,
        urls: teacherTgDraft.urls,
        priority: Number(teacherTgDraft.priority || 0),
        rotationCount: Number(teacherTgDraft.rotationCount || 1)
      })
    });
    setTeacherTgLinks(result.rows);
    setTeacherTgDraft({ ...teacherTgDraft, urls: "" });
    notify("success", "老师TG链接已导入", `已新增 ${result.imported} 条，后续客户会按优先级和轮询次数自动分配。`);
  };
  const updateCountryDraftName = (value: string) => {
    const inferred = inferCountryProfile(value);
    setCountryDraft({ ...countryDraft, name: value, code: inferred.code, defaultLanguage: inferred.defaultLanguage });
  };
  const reInferCountryDraft = () => {
    const inferred = inferCountryProfile(countryDraft.name);
    setCountryDraft({ ...countryDraft, code: inferred.code, defaultLanguage: inferred.defaultLanguage });
    notify("success", "已重新识别", `${countryDraft.name || "当前国家"}：${inferred.code} / ${languageName(inferred.defaultLanguage)}`);
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
    <div className="setup-strip"><div><span>1</span><strong>填写密钥</strong><small>A2C / 智能供应商 / TG</small></div><div><span>2</span><strong>设置国家</strong><small>商户单国家</small></div><div><span>3</span><strong>同步账号</strong><small>自动归属国家</small></div><div><span>4</span><strong>接入回调</strong><small>填写 Webhook</small></div></div>
    <div className="memory highlighted"><h3>A2C Webhook地址</h3><p>把这个地址填写到该商户的 A2C Webhook 配置里。</p><div className="copy-row"><label>{label("a2cWebhookUrl")}<input readOnly value={a2cWebhookUrl} onFocus={(e) => e.currentTarget.select()} /></label><AsyncButton onClick={async () => { await navigator.clipboard.writeText(a2cWebhookUrl); setMessage("Webhook 地址已复制。"); notify("success", "已复制 Webhook 地址"); }} busyText="复制中..."><Copy size={16}/>复制</AsyncButton></div></div>
    <div className={`smart-reply-card ${form.smartReplyEnabled === false ? "off" : "on"}`}>
      <div><h3>智能自动回复</h3><p>{form.smartReplyEnabled === false ? "已关闭：系统只接收消息、翻译、更新记忆和触发接管，不会自动回复客户。" : "已开启：客户消息会自动调用智能服务，并通过当前 A2C 客服账号回复。"}</p></div>
      <ConfirmActionButton className={form.smartReplyEnabled === false ? "" : "ghost"} busyText="保存中..." title={form.smartReplyEnabled === false ? "确认开启智能回复？" : "确认关闭智能回复？"} detail={form.smartReplyEnabled === false ? "开启后，真实客户消息会按当前 A2C 客服账号自动回复。请确认 A2C、智能供应商、话本和邀请码配置都已正确。" : "关闭后，系统仍会接收客户消息和更新记录，但不会自动回复真实客户。"} confirmText={form.smartReplyEnabled === false ? "开启智能回复" : "关闭智能回复"} onConfirm={() => saveConfigFlag("smartReplyEnabled", form.smartReplyEnabled === false, form.smartReplyEnabled === false ? "智能回复已开启" : "智能回复已关闭")}>{form.smartReplyEnabled === false ? "开启智能回复" : "关闭智能回复"}</ConfirmActionButton>
    </div>
    <div className={`smart-reply-card ${form.trainingSimulationEnabled ? "on" : "off"}`}>
      <div><h3>模拟训练模式</h3><p>{form.trainingSimulationEnabled ? "已开启：真实 A2C 消息只会进入内部训练并生成记录，不会真实回复客户，也不会通知接管群。" : "已关闭：真实 A2C 消息会按当前配置正常自动回复客户。"}</p></div>
      <ConfirmActionButton className={form.trainingSimulationEnabled ? "ghost" : ""} busyText="保存中..." title={form.trainingSimulationEnabled ? "确认关闭模拟训练？" : "确认开启模拟训练？"} detail={form.trainingSimulationEnabled ? "关闭后，真实 A2C 消息会恢复按当前配置自动回复客户。请确认线上配置已经准备好。" : "开启后，真实 A2C 消息只进入内部训练，不会真实回复客户，也不会通知接管群。适合测试前排查流程。"} confirmText={form.trainingSimulationEnabled ? "关闭模拟训练" : "开启模拟训练"} onConfirm={() => saveConfigFlag("trainingSimulationEnabled", !form.trainingSimulationEnabled, form.trainingSimulationEnabled ? "模拟训练已关闭" : "模拟训练已开启")}>{form.trainingSimulationEnabled ? "关闭模拟训练" : "开启模拟训练"}</ConfirmActionButton>
    </div>
    <div className={`smart-reply-card ${form.strictScriptFlowEnabled ? "on" : "off"}`}>
      <div><h3>话本流程</h3><p>{form.strictScriptFlowEnabled ? "已开启：客户每回复一次，系统会按话本主动推进到下一步，不会掉到普通自由回复。" : "已关闭：非指定商户可能走普通回复；如要固定按开户注册话本推进，请开启。"}</p></div>
      <ConfirmActionButton className={form.strictScriptFlowEnabled ? "ghost" : ""} busyText="保存中..." title={form.strictScriptFlowEnabled ? "确认关闭话本流程？" : "确认开启话本流程？"} detail={form.strictScriptFlowEnabled ? "关闭后，客户可能不再按固定开户注册流程推进，而是走普通回复或兜底逻辑。" : "开启后，客户回复会优先按当前启用话本流程推进。请确认话本流程、注册链接、邀请码和导师 TG 链接配置正确。"} confirmText={form.strictScriptFlowEnabled ? "关闭话本流程" : "开启话本流程"} onConfirm={() => saveConfigFlag("strictScriptFlowEnabled", !form.strictScriptFlowEnabled, form.strictScriptFlowEnabled ? "话本流程已关闭" : "话本流程已开启")}>{form.strictScriptFlowEnabled ? "关闭话本流程" : "开启话本流程"}</ConfirmActionButton>
    </div>
    <div className="form-grid elevated-form">{fields.map((f) => <label key={f}>{label(f)}{f === "aiProvider" ? <select value={String(form[f] || "minimax")} onChange={(e) => setForm({ ...form, [f]: e.target.value })}><option value="minimax">MiniMax</option><option value="deepseek">DeepSeek</option><option value="gemini">Gemini兼容</option></select> : <input value={form[f] || ""} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />}</label>)}</div>
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
    <div className="toolbar sticky-actions"><AsyncButton onClick={saveConfig} busyText="保存中...">保存配置</AsyncButton><ConfirmActionButton title="确认同步 A2C 客服账号？" detail="同步会真实请求 A2C 接口。A2C Token 有限频风险，请确认不是连续频繁点击；同步后会刷新本地客服账号列表和接收账号配置。" confirmText="同步账号" busyText="同步中..." onConfirm={() => syncA2CAccounts()}><RefreshCw size={16}/>同步A2C客服账号</ConfirmActionButton><AsyncButton onClick={runConfigCheck} busyText="检测中..."><CheckCircle2 size={16}/>检测配置</AsyncButton></div>
    {error && <div className="error">{error}</div>}{message && <div className="notice">{message}</div>}
    {checks.length > 0 && <div className="config-checks">{checks.map((item) => <article key={item.key} className={item.ok ? "ok" : item.status}><strong>{item.label}</strong><span>{label(item.status)}</span><p>{item.detail}</p></article>)}</div>}
    <div className="memory country-settings-card">
      <div className="section-title-row">
        <div>
          <h3>商户国家/市场</h3>
          <p>商户只需要填写国家，国家代码和默认语言会自动带入。当前版本每个商户只维护一个国家。</p>
        </div>
        {countries[0] && <button type="button" className="ghost" onClick={() => { applyCountryDraft(countries[0]); notify("success", "已载入当前国家", "修改后点击“保存国家设置”。"); }}>编辑当前国家</button>}
      </div>
      <div className="country-auto-note">国家代码和默认语言由国家名称自动生成，不需要手动填写；例如“玻利维亚”会自动识别为 <strong>bo / 西语</strong>。</div>
      <div className="memory compact-panel">
        <div className="section-title-row">
          <div>
            <h3>老师TG链接池</h3>
            <p>话本流程第 9 步会从这里自动分配老师 Telegram 链接。同一客户首次分配后会绑定固定导师，后续不会切换。</p>
          </div>
          <span className="status-pill neutral">已配置 {teacherTgLinks.length} 条</span>
        </div>
        <div className="toolbar wrap">
          <label className="wide">批量导入<textarea placeholder="一行一个老师TG链接，例如：https://t.me/teacher_username" value={teacherTgDraft.urls} onChange={(e) => setTeacherTgDraft({ ...teacherTgDraft, urls: e.target.value })} /></label>
          <label>优先级<input type="number" value={teacherTgDraft.priority} onChange={(e) => setTeacherTgDraft({ ...teacherTgDraft, priority: e.target.value })} /></label>
          <label>轮询次数<input type="number" min="1" value={teacherTgDraft.rotationCount} onChange={(e) => setTeacherTgDraft({ ...teacherTgDraft, rotationCount: e.target.value })} /></label>
          <AsyncButton onClick={importTeacherTelegramLinks} busyText="导入中...">导入链接</AsyncButton>
        </div>
        <small>分配规则：按优先级从高到低排列；轮询次数表示这一轮里该链接连续出现几次。例如 A 轮询 2、B 轮询 1，则分配顺序为 A、A、B，然后循环。</small>
        <Table rows={teacherTgLinks} columns={["label", "url", "priority", "rotationCount", "assignedCount", "status"]} rowKey={(row) => row.id} />
        <div className="messages material-items">
          {teacherTgLinks.map((link) => <TeacherTgLinkEditor key={link.id} link={link} endpoint={teacherTgLinksUrl} reload={reloadTeacherTgLinks} />)}
        </div>
      </div>
      <div className="toolbar wrap country-settings-form">
        <CountryPresetDatalist />
        <label className="inline-field">国家<input list="merchant-country-presets" placeholder="输入或选择国家，例如：玻利维亚" value={countryDraft.name} onChange={(e) => updateCountryDraftName(e.target.value)} /></label>
        <label className="inline-field">国家代码<input readOnly value={countryDraft.code} /></label>
        <label className="inline-field">默认语言<input readOnly value={languageName(countryDraft.defaultLanguage)} /></label>
        <button type="button" className="ghost" onClick={reInferCountryDraft}>重新识别</button>
        <input placeholder={label("platformRegisterUrl")} value={countryDraft.platformRegisterUrl} onChange={(e) => setCountryDraft({ ...countryDraft, platformRegisterUrl: e.target.value })} />
        <input placeholder={label("tgRegisterGuideUrl")} value={countryDraft.tgRegisterGuideUrl} onChange={(e) => setCountryDraft({ ...countryDraft, tgRegisterGuideUrl: e.target.value })} />
        <select value={countryDraft.requirePlatformAccount} onChange={(e) => setCountryDraft({ ...countryDraft, requirePlatformAccount: e.target.value })}><option value="true">需要开户注册</option><option value="false">不需要开户注册</option></select>
        <select value={countryDraft.requirePhone} onChange={(e) => setCountryDraft({ ...countryDraft, requirePhone: e.target.value })}><option value="true">需要手机号</option><option value="false">不需要手机号</option></select>
        <select value={countryDraft.requireTelegram} onChange={(e) => setCountryDraft({ ...countryDraft, requireTelegram: e.target.value })}><option value="true">需要TG</option><option value="false">不需要TG</option></select>
        <select value={countryDraft.requireWhatsApp} onChange={(e) => setCountryDraft({ ...countryDraft, requireWhatsApp: e.target.value })}><option value="false">不需要WS</option><option value="true">需要WS</option></select>
        <AsyncButton onClick={saveCountry} busyText="保存中...">保存国家设置</AsyncButton>
      </div>
      <p className="table-helper">点击下方国家行也可以载入编辑。</p>
      <Table rows={countries} columns={["code", "name", "defaultLanguage", "platformRegisterUrl", "tgRegisterGuideUrl", "requirePhone", "requireTelegram", "requireWhatsApp", "status"]} rowKey={(row) => row.id} selectedKey={countries[0]?.id} onRow={(row) => { applyCountryDraft(row); notify("success", "已载入国家设置", "修改后点击“保存国家设置”。"); }} />
    </div>
    <div className="memory"><div className="account-section-head"><div><h3>A2C客服账号与邀请码池</h3><p>客服账号会自动归属到商户国家。每个客服账号可以绑定多个邀请码，客户注册后邀请码会从可用池里移除。</p></div><span>已保存 {a2cAccounts.length} 个账号</span></div><div className="account-filter-bar"><label>搜索账号<input value={accountKeyword} onChange={(e) => { setAccountKeyword(e.target.value); accountPager.setPage(1); }} placeholder="手机号、名称、WABA ID" /></label><label>状态<select value={accountStatus} onChange={(e) => { setAccountStatus(e.target.value); accountPager.setPage(1); }}><option value="">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label><label>国家<select value={accountCountryId} onChange={(e) => { setAccountCountryId(e.target.value); accountPager.setPage(1); }}><option value="">全部国家</option>{countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}</select></label></div><div className="account-list-meta">当前筛选 {filteredA2CAccounts.length} 个账号，显示第 {(accountPager.page - 1) * accountPager.pageSize + (accountPager.total ? 1 : 0)} - {Math.min(accountPager.page * accountPager.pageSize, accountPager.total)} 个。</div><div className="account-grid">{accountPager.rows.map((row) => <A2CAccountCard key={row.id} account={row} countries={countries} platform={platform} onToggle={() => toggleA2CAccount(row)} onCountry={async () => undefined} />)}{!a2cAccounts.length && <div className="empty-state">填写并保存 A2C 密钥后，点击“同步A2C客服账号”。同步成功后这里会出现每个客服账号的邀请码池。</div>}{a2cAccounts.length > 0 && !filteredA2CAccounts.length && <div className="empty-state">没有符合筛选条件的客服账号，换个手机号、状态或国家试试。</div>}</div><Pagination pager={accountPager} /></div>
    <div className="memory"><h3>TG接管群绑定</h3><p>状态：{displayValue("status", form.telegramHandoffChatStatus || "unbound")} · 群：{form.telegramHandoffChatTitle || form.telegramHandoffChatId || "未绑定"}</p>{form.telegramHandoffChatError && <div className="warning">{form.telegramHandoffChatError}</div>}<div className="toolbar"><AsyncButton onClick={setupTelegram} busyText="设置中...">设置TG绑定</AsyncButton><AsyncButton onClick={async () => { setError(""); setMessage("正在刷新TG状态..."); await reloadConfig(); setMessage("TG状态已刷新。"); notify("success", "TG 状态已刷新"); }} busyText="刷新中..."><RefreshCw size={16}/>刷新TG状态</AsyncButton></div><p>保存 TG机器人 Token 后点击设置绑定，再把机器人拉进唯一接管群并发送 /bind；系统会自动保存群ID。</p></div>
  </section>;
}

function TeacherTgLinkEditor({ link, endpoint, reload }: { link: TeacherTgLink; endpoint: string; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState({ label: link.label || "", url: link.url, priority: String(link.priority), rotationCount: String(link.rotationCount), status: link.status });
  useEffect(() => setDraft({ label: link.label || "", url: link.url, priority: String(link.priority), rotationCount: String(link.rotationCount), status: link.status }), [link.id, link.label, link.url, link.priority, link.rotationCount, link.status]);
  return <article>
    <strong>{draft.label || "未命名导师"} · 已分配 {link.assignedCount} 次</strong>
    <div className="toolbar wrap">
      <input placeholder="导师备注名" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
      <input className="wide" placeholder="老师TG链接" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
      <input type="number" placeholder="优先级" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} />
      <input type="number" min="1" placeholder="轮询次数" value={draft.rotationCount} onChange={(e) => setDraft({ ...draft, rotationCount: e.target.value })} />
      <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="active">启用</option><option value="disabled">停用</option></select>
      <AsyncButton busyText="保存中..." onClick={async () => { await api(`${endpoint}/${link.id}`, { method: "PATCH", body: JSON.stringify({ ...draft, priority: Number(draft.priority || 0), rotationCount: Number(draft.rotationCount || 1) }) }); await reload(); notify("success", "老师TG链接已保存"); }}>保存</AsyncButton>
      <ConfirmActionButton className="danger" busyText="删除中..." title="确认删除导师 TG 链接？" detail="删除后新客户不会再分配到这条导师链接；已分配过的老客户仍保留历史绑定记录。" confirmText="删除链接" onConfirm={async () => { await api(`${endpoint}/${link.id}`, { method: "DELETE" }); await reload(); notify("success", "老师TG链接已删除"); }}>删除</ConfirmActionButton>
    </div>
  </article>;
}

function A2CAccountCard({ account, countries, platform, onToggle, onCountry }: { account: A2CAccount; countries: MerchantCountry[]; platform: boolean; onToggle: () => Promise<void>; onCountry: (countryId: string) => Promise<void> }) {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [codesError, setCodesError] = useState("");
  const [draft, setDraft] = useState({ codes: "", registerUrl: "" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const endpoint = platform ? `/api/admin/a2c/accounts/${account.id}/invite-codes` : `/api/merchant/a2c/accounts/${account.id}/invite-codes`;
  const codeEndpoint = platform ? "/api/admin/invite-codes" : "/api/merchant/invite-codes";
  const reload = async () => {
    setCodesError("");
    try {
      setCodes(await loadRows<InviteCode>(endpoint));
    } catch (err) {
      setCodes([]);
      setCodesError(err instanceof Error ? err.message : "邀请码池加载失败");
    }
  };
  useEffect(() => { void reload(); }, [endpoint]);
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
      <ConfirmActionButton busyText="处理中..." title={account.enabled ? "确认停用客服账号？" : "确认启用客服账号？"} detail={account.enabled ? "停用后，该 A2C 客服账号不会再用于自动回复和分配邀请码；已有会话记录仍会保留。" : "启用后，该 A2C 客服账号会参与自动回复和邀请码分配，请确认账号国家和邀请码池配置正确。"} confirmText={account.enabled ? "停用账号" : "启用账号"} onConfirm={onToggle}>{account.enabled ? "停用账号" : "启用账号"}</ConfirmActionButton>
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
            {codesError && <div className="empty-state compact error-state"><strong>邀请码池加载失败</strong><span>{codesError}</span><button className="ghost" onClick={() => void reload()}>重新加载</button></div>}
            {!codesError && codes.map((code) => <button key={code.id} className={selectedCode?.id === code.id ? "active" : ""} onClick={() => setSelectedId(code.id)}>
              <strong>{code.code}</strong>
              {displayValue("status", code.status)}
              <small>{code.assignedCustomerKey || "未绑定"}</small>
            </button>)}
            {!codesError && !codes.length && <div className="empty-state compact">暂无邀请码，先在上方批量导入。</div>}
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
    <div className="invite-editor-title"><div><strong>{code.code}</strong><span>{displayValue("status", code.status)}</span></div><small>{code.updatedAt ? `更新于 ${formatDateTime(code.updatedAt, code.countryName || code.countryId)}` : ""}</small></div>
    <div className="invite-editor-grid">
      <label>邀请码<input aria-label="邀请码" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} /></label>
      <label>状态<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="available">{label("available")}</option><option value="reserved">{label("reserved")}</option><option value="used">{label("used")}</option><option value="disabled">{label("disabled")}</option></select></label>
      <label className="wide">注册链接<input aria-label="注册链接" value={draft.registerUrl} placeholder="不填时使用国家/商户开户链接；可包含 {code}" onChange={(e) => setDraft({ ...draft, registerUrl: e.target.value })} /></label>
    </div>
    <div className="invite-meta">
      <span>绑定客户：{code.assignedCustomerKey || "未绑定"}</span>
      <span>注册账号：{code.platformAccount || "未填写"}</span>
      <span>使用时间：{code.usedAt ? formatDateTime(code.usedAt, code.countryName || code.countryId) : "未使用"}</span>
    </div>
    <div className="invite-editor-actions">
      <AsyncButton busyText="保存中..." onClick={async () => { await api(`${endpoint}/${code.id}`, { method: "PATCH", body: JSON.stringify(draft) }); await reload(); notify("success", "邀请码已保存"); }}>保存修改</AsyncButton>
      <ConfirmActionButton className="danger" busyText="删除中..." title="确认彻底删除邀请码？" detail={`邀请码 ${code.code} 删除后不可恢复。若它已绑定客户，历史绑定记录可能仍用于排查，但不会再进入可分配池。`} confirmText="彻底删除" onConfirm={async () => { await api(`${endpoint}/${code.id}`, { method: "DELETE" }); await reload(); notify("success", "邀请码已彻底删除"); }}>彻底删除</ConfirmActionButton>
    </div>
  </div>;
}

function Samples({ platform = false }: { platform?: boolean }) {
  const base = platform ? "/api/admin/training-samples" : "/api/merchant/training-samples";
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", language: "", intent: "", stage: "", enabled: "" });
  const rowsUrl = withQuery(base, platform ? filters : { countryId: filters.countryId, language: filters.language, intent: filters.intent, stage: filters.stage, enabled: filters.enabled });
  const [rows, setRows] = useState<Sample[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const pager = useClientPagination(rows, 20);
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<Sample | null>(null);
  const reload = async () => {
    setRowsLoading(true);
    setRowsError(null);
    try {
      setRows(await loadRows(rowsUrl));
      pager.setPage(1);
    } catch (err) {
      setRows([]);
      setRowsError(err instanceof Error ? err.message : "样本加载失败，请稍后重试。");
    } finally {
      setRowsLoading(false);
    }
  };
  useEffect(() => { void reload(); }, [rowsUrl]);
  return <div className={selected ? "split work-split" : "single-column work-split"}><section className="work-panel"><FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "countryId", "language", "intent", "stage", "enabled"] : ["countryId", "language", "intent", "stage", "enabled"]} selects={{ countryId: ["", ...countries.map((country) => country.id)], enabled: ["", "true", "false"] }} onApply={reload} />{!platform && <div className="material-uploader compact-uploader"><div className="toolbar"><select value={filters.countryId} onChange={(e) => setFilters({ ...filters, countryId: e.target.value })}>{countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}</select><input type="file" accept=".csv,.xlsx,.xls,.docx,.txt,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /><AsyncButton disabled={!file} busyText="上传中..." onClick={async () => { if (!file) return; const body = new FormData(); body.append("file", file); body.append("countryId", filters.countryId || countries[0]?.id || ""); const response = await fetch("/api/merchant/training-materials/import", { method: "POST", body }); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "上传失败"); const result = await response.json() as { imported: number; samples: number; knowledge: number; warnings?: string[] }; notify("success", "训练文件已导入", `样本 ${result.samples} 条，知识 ${result.knowledge} 条${result.warnings?.length ? `；${result.warnings.join("；")}` : ""}`); setFile(null); await reload(); }}><Upload size={16}/>上传训练文件</AsyncButton></div><small>支持 CSV、Excel、Word、TXT、截图/图片。表格直接生成样本；文本、Word、截图会自动提取话术。</small></div>}<Table rows={pager.rows} columns={["countryId", "customerMessage", "standardReply", "intent", "stage", "language", "priority", "enabled"]} onRow={setSelected} loading={rowsLoading} error={rowsError} onRetry={reload} emptyTitle="暂无训练样本" emptyDetail="上传标准样本、话本或聊天记录后，系统会在这里展示可编辑的优秀回复样本。" /><Pagination pager={pager} /></section>{selected && <section className="detail-panel"><Editor title="样本编辑" value={selected as any} fields={["countryId", "customerMessage", "standardReply", "intent", "stage", "language", "keywords", "priority", "enabled"]} selects={{ enabled: ["true", "false"] }} deleteTitle="确认彻底删除样本？" deleteDetail="删除后，后续回复不会再参考这个优秀样本。此操作不可恢复。" deleteConfirmText="彻底删除" onSave={async (patch) => { await api(`${base}/${selected.id}`, { method: "PATCH", body: JSON.stringify(coercePatch(patch)) }); await reload(); }} onDelete={async () => { await api(`${base}/${selected.id}`, { method: "DELETE" }); setSelected(null); await reload(); notify("success", "样本已彻底删除"); }} /></section>}</div>;
}

function ScriptFlows({ platform = false }: { platform?: boolean }) {
  const base = platform ? "/api/admin/script-flows" : "/api/merchant/script-flows";
  const stepBase = platform ? "/api/admin/script-flow-steps" : "/api/merchant/script-flow-steps";
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", status: "" });
  const rowsUrl = withQuery(base, platform ? filters : { countryId: filters.countryId, status: filters.status });
  const [rows, setRows] = useState<ScriptFlow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ScriptFlow | null>(null);
  const [detail, setDetail] = useState<{ flow: ScriptFlow; steps: ScriptFlowStep[]; versions: ScriptFlowVersion[] } | null>(null);
  const [selectedStep, setSelectedStep] = useState<ScriptFlowStep | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [flowName, setFlowName] = useState("");
  const reload = async () => {
    setRowsLoading(true);
    setRowsError(null);
    try {
      setRows(await loadRows(rowsUrl));
    } catch (err) {
      setRows([]);
      setRowsError(err instanceof Error ? err.message : "话本流程加载失败，请稍后重试。");
    } finally {
      setRowsLoading(false);
    }
  };
  useEffect(() => { void reload(); }, [rowsUrl]);
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
    notify("success", "话本流程已导入", `已生成 ${result.imported} 个流程节点。当前为草稿，请检查后再启用。`);
    setFile(null);
    setFlowName("");
    await reload();
    await loadDetail(result.flow);
  };
  const createBuiltIn = async () => {
    const countryId = filters.countryId || countries[0]?.id || "";
    const body: Record<string, string> = { name: flowName.trim() || "严格业务流程" };
    if (countryId) body.countryId = countryId;
    if (platform && filters.merchantId.trim()) body.merchantId = filters.merchantId.trim();
    const result = await api<{ flow: ScriptFlow; steps: ScriptFlowStep[] }>(`${base}/builtin`, { method: "POST", body: JSON.stringify(body) });
    notify("success", "已创建内置流程", "已生成 11 个可编辑节点。请检查话术后再启用。");
    setFlowName("");
    await reload();
    await loadDetail(result.flow);
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
        <div><h3>话本流程</h3><p>上传话本后，系统会自动分析并生成可编辑流程节点。检查无误后再启用，客户会话才会按新流程推进。</p></div>
      </div>
      <FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "countryId", "status"] : ["countryId", "status"]} selects={{ countryId: ["", ...countries.map((country) => country.id)], status: ["", "draft", "active", "disabled"] }} onApply={reload} />
      <div className="material-uploader compact-uploader">
        <div className="toolbar wrap">
          <input placeholder="话本名称，可选" value={flowName} onChange={(event) => setFlowName(event.target.value)} />
          <input type="file" accept=".xlsx,.xls,.docx,.txt,.md,.csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <AsyncButton disabled={!file || platform && !filters.merchantId.trim()} busyText="分析中..." onClick={upload}><Upload size={16}/>上传并生成节点</AsyncButton>
          <AsyncButton disabled={platform && !filters.merchantId.trim()} busyText="创建中..." onClick={createBuiltIn}><Workflow size={16}/>使用内置11步创建</AsyncButton>
        </div>
        <small>支持 Excel/CSV 标准表头，也支持 Word/TXT/MD 自由话本。也可以直接使用系统内置 11 步生成草稿，右侧逐步修改后再启用。</small>
      </div>
      <Table
        rows={rows}
        columns={["name", "countryName", "status", "active", "version", "stepCount", "updatedAt"]}
        onRow={loadDetail}
        selectedKey={selected?.id}
        rowKey={(row) => row.id}
        loading={rowsLoading}
        error={rowsError}
        onRetry={reload}
        emptyTitle="暂无话本流程"
        emptyDetail="可以上传话本文件，或使用内置 11 步创建一个草稿流程。"
      />
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
            <ConfirmActionButton
              className="danger"
              busyText="删除中..."
              title="确认删除话本流程？"
              detail="删除后不可恢复。若这是当前启用流程，需要先启用其他流程，否则真实客户可能无法继续按预期话本推进。"
              confirmText="删除流程"
              onConfirm={deleteFlow}
            >
              删除流程
            </ConfirmActionButton>
          </div>
        </div>
        <Editor title="流程基础信息" value={{ name: detail.flow.name, status: detail.flow.status, countryId: detail.flow.countryId }} fields={["name", "status", "countryId"]} selects={{ status: ["draft", "active", "disabled"], countryId: countries.map((country) => country.id) }} onSave={async (patch) => { await api(`${base}/${detail.flow.id}`, { method: "PATCH", body: JSON.stringify(patch) }); notify("success", "流程信息已保存"); await refreshDetail(); }} />
        <div className="script-flow-columns">
          <div className="script-step-list">
            <div className="panel-title"><h3>流程节点</h3><AsyncButton busyText="新增中..." onClick={addStep}><Plus size={16}/>新增节点</AsyncButton></div>
            {detail.steps.map((step) => <button key={step.id} className={`script-step-card ${selectedStep?.id === step.id ? "active" : ""} ${step.enabled ? "enabled" : "disabled"}`} onClick={() => setSelectedStep(step)}>
              <span className="script-step-card-head">
                <strong>{step.flowCode || "未编号"} · {step.flowName || label(step.flowStep)}</strong>
                <span className={`script-step-status ${step.enabled ? "on" : "off"}`}>{step.enabled ? "启用" : "停用"}</span>
              </span>
              <span className="script-step-meta">{label(step.flowStep)} · 顺序 {step.sortOrder}</span>
              <small className="script-step-reply">{step.standardReply || "暂无标准话术，请点击右侧补充。"}</small>
            </button>)}
            {!detail.steps.length && <div className="empty-state">还没有流程节点，请新增或重新导入话本文件。</div>}
          </div>
          <div className="script-step-editor">
            {selectedStep ? <ScriptFlowStepEditor step={selectedStep} endpoint={stepBase} onSaved={refreshDetail} /> : <div className="empty-state">选择左侧节点后编辑话术和跳转规则。</div>}
          </div>
        </div>
        <details className="version-panel">
          <summary>版本记录</summary>
          <div className="stack-list">
            {detail.versions.map((version) => <div key={version.id} className="version-row"><span>版本 {version.version}</span><span>{version.note || "保存"}</span><span>{version.createdBy || "系统"} · {formatDateTime(version.createdAt, detail.flow.countryName || detail.flow.countryId)}</span><ConfirmActionButton busyText="恢复中..." title="确认恢复话本版本？" detail={`恢复到版本 ${version.version} 后，当前流程节点和话术会被该版本覆盖。建议确认内容无误后再操作。`} confirmText="恢复版本" onConfirm={async () => { await api(`${base}/${detail.flow.id}/versions/${version.id}/restore`, { method: "POST" }); notify("success", "版本已恢复"); await refreshDetail(); }}>恢复</ConfirmActionButton></div>)}
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
      <label>是否发教程图<select value={String(Boolean(draft.sendTutorialImage))} onChange={(e) => set("sendTutorialImage", e.target.value === "true")}><option value="false">否</option><option value="true">是</option></select></label>
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
    <div className="toolbar"><AsyncButton busyText="保存中..." onClick={save}>保存节点</AsyncButton><AsyncButton busyText="复制中..." onClick={duplicate}><Copy size={16}/>复制节点</AsyncButton><ConfirmActionButton className="danger" busyText="删除中..." title="确认删除流程节点？" detail="删除后不可恢复。如果其他节点引用了这个节点，需要先修改引用关系，否则流程可能断开。" confirmText="删除节点" onConfirm={remove}>删除节点</ConfirmActionButton></div>
  </div>;
}

function IntentLearning({ platform = false }: { platform?: boolean }) {
  const base = platform ? "/api/admin/intent-learning" : "/api/merchant/intent-learning";
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", status: "candidate", suggestedIntent: "", q: "", limit: "100" });
  const rowsUrl = withQuery(base, platform ? filters : { countryId: filters.countryId, status: filters.status, suggestedIntent: filters.suggestedIntent, q: filters.q, limit: filters.limit });
  const [rows, setRows] = useState<IntentLearningEvent[]>([]);
  const [total, setTotal] = useState(0);
  const pager = useClientPagination(rows, 20);
  const [selected, setSelected] = useState<IntentLearningEvent | null>(null);
  const [detailDraft, setDetailDraft] = useState({ status: "candidate", displayName: "", description: "" });
  useEffect(() => {
    if (!selected) return;
    setDetailDraft({ status: selected.status, displayName: selected.displayName, description: selected.description });
  }, [selected]);
  const reload = async () => {
    const result = await api<{ rows: IntentLearningEvent[]; total: number }>(rowsUrl);
    setRows(result.rows);
    setTotal(result.total);
    pager.setPage(1);
    setSelected((current) => current ? result.rows.find((item) => item.id === current.id) || null : null);
  };
  useEffect(() => { reload().catch(() => { setRows([]); setTotal(0); }); }, [rowsUrl]);
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
        <span>筛选总数 <strong>{total}</strong></span>
        <span>待处理 <strong>{metrics.candidate}</strong></span>
        <span>已确认 <strong>{metrics.reviewed}</strong></span>
        <span>已沉淀 <strong>{metrics.promoted}</strong></span>
        <span>已忽略 <strong>{metrics.ignored}</strong></span>
      </div>
      <FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "q", "countryId", "status", "suggestedIntent", "limit"] : ["q", "countryId", "status", "suggestedIntent", "limit"]} selects={{ countryId: ["", ...countries.map((country) => country.id)], status: ["", "candidate", "reviewed", "promoted", "ignored"] }} onApply={reload} />
      <Table rows={pager.rows} columns={["displayName", "suggestedIntent", "occurrenceCount", "customerText", "flowStep", "status", "lastSeenAt"]} onRow={setSelected} selectedKey={selected?.id} rowKey={(row) => row.id} />
      <Pagination pager={pager} />
    </section>
    <section className="detail-panel">
      {selected ? <div className="intent-learning-detail">
        <div className="detail-title-row">
          <div>
            <h3>{selected.displayName || selected.suggestedIntent}</h3>
            <p>{countryLabel(selected.countryId)} · 出现 {selected.occurrenceCount} 次 · 最近 {formatDateTime(selected.lastSeenAt, selected.countryId)}</p>
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
              <p>流程：{label(String(example.flowStep || selected.flowStep || "unknown"))} · 原识别：{label(String(example.detectedIntent || "unknown"))} · 时间：{formatDateTime(String(example.at || ""), selected.countryId)}</p>
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
  const [rows, setRows] = useState<TrainingMaterial[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const pager = useClientPagination(rows, 20);
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [selected, setSelected] = useState<TrainingMaterial | null>(null);
  const [detail, setDetail] = useState<{ material: TrainingMaterial; items: TrainingMaterialItem[] } | null>(null);
  const [message, setMessage] = useState("");
  const reload = async () => {
    setMaterialsLoading(true);
    setMaterialsError(null);
    try {
      setRows(await loadRows(rowsUrl));
      pager.setPage(1);
    } catch (err) {
      setRows([]);
      setMaterialsError(err instanceof Error ? err.message : "学习资料加载失败，请稍后重试。");
    } finally {
      setMaterialsLoading(false);
    }
  };
  useEffect(() => { void reload(); }, [rowsUrl]);
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
  return <div className={selected && detail ? "split work-split" : "single-column work-split"}><section className="work-panel">{simple && <div className="training-center-hero"><div><h3>上传资料，系统自动学习</h3><p>把聊天记录、话本、FAQ、业务规则、Word、TXT、Excel 或截图上传到这里。系统会自动拆解、打标签、整理成后续回复可参考的内容。</p></div><div className="training-steps"><span>1 选择国家</span><span>2 上传或粘贴资料</span><span>3 自动学习并生效</span></div></div>}<FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "countryId", "sourceType", "status", "limit"] : ["countryId", "sourceType", "status", "limit"]} selects={{ countryId: ["", ...countries.map((country) => country.id)], sourceType: ["", "csv", "xlsx", "docx", "txt", "image"], status: ["", "enabled", "disabled"] }} onApply={reload} />{!platform && <div className="material-uploader compact-uploader training-uploader"><div className="toolbar"><select value={filters.countryId} onChange={(e) => setFilters({ ...filters, countryId: e.target.value })}>{countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}</select><input type="file" accept=".csv,.xlsx,.xls,.docx,.txt,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /><AsyncButton disabled={!file} busyText="学习中..." onClick={async () => { if (file) await uploadFile(file); }}><Upload size={16}/>{simple ? "上传并学习" : "上传素材"}</AsyncButton></div><textarea placeholder={simple ? "也可以直接粘贴真实聊天记录、话本、问答或业务规则，系统会自动学习" : "粘贴聊天记录、话术、问答或业务规则"} value={pasted} onChange={(e) => setPasted(e.target.value)} /><AsyncButton disabled={!pasted.trim()} busyText="学习中..." onClick={async () => { if (!pasted.trim()) return; await uploadFile(new File([pasted], "pasted-material.txt", { type: "text/plain" })); setPasted(""); }}><FileText size={16}/>{simple ? "学习粘贴内容" : "导入粘贴文本"}</AsyncButton>{message && <div className="notice" role="status">{message}</div>}</div>}<Table rows={pager.rows} columns={columns} onRow={loadDetail} loading={materialsLoading} error={materialsError} onRetry={reload} emptyTitle={simple ? "暂无学习资料" : "暂无素材记录"} emptyDetail={simple ? "上传聊天记录、话本、FAQ、业务规则或截图后，系统会自动学习。" : "上传素材后会在这里展示解析结果。"} /><Pagination pager={pager} /></section>{selected && detail && <section className="detail-panel"><div><h3>{detail.material.filename}</h3><p>{countryLabel(detail.material.countryName)} · {label(detail.material.sourceType)} · {simple ? `已学习 ${detail.material.itemCount} 条内容` : `生成 ${detail.material.itemCount} 条 · 样本 ${detail.material.sampleCount} · 知识 ${detail.material.knowledgeCount}`}</p><div className="toolbar"><ConfirmActionButton className="danger" busyText="删除中..." title={simple ? "确认彻底删除学习资料？" : "确认彻底删除素材？"} detail={simple ? "删除后系统不会再参考这份学习资料，此操作不可恢复。" : "删除后该素材及其生成的样本和知识会一起删除，后续回复不会再参考它们。"} confirmText={simple ? "彻底删除资料" : "彻底删除素材"} onConfirm={async () => { await api(`${base}/${detail.material.id}`, { method: "DELETE" }); setSelected(null); setDetail(null); await reload(); notify("success", simple ? "学习资料已彻底删除" : "素材已彻底删除"); }}>{simple ? "彻底删除资料" : "彻底删除素材"}</ConfirmActionButton></div>{detail.material.warnings?.length ? <div className="warning">{detail.material.warnings.join("；")}</div> : null}<div className="messages material-items">{detail.items.map((item) => <article key={item.id}><strong>{simple ? "学习内容" : item.kind === "sample" ? "样本" : "知识"} · {languageName(item.language)}</strong><span>{item.title}</span><small>{label(item.intent || item.stage)}</small><p>{item.content}</p></article>)}</div><pre>{detail.material.rawText || ""}</pre></div></section>}</div>;
}

function Conversations({ platform = false, handoffs = false, timeMode }: { platform?: boolean; handoffs?: boolean; timeMode: TimeDisplayMode }) {
  return platform ? <PlatformConversations handoffs={handoffs} /> : <MerchantConversations handoffs={handoffs} timeMode={timeMode} />;
}

function PlatformConversations({ handoffs = false }: { handoffs?: boolean }) {
  const base = "/api/admin/conversations";
  const [filters, setFiltersState] = useState<Filters>({ merchantId: "", status: handoffs ? "human_handoff" : "", handoffStatus: handoffs ? "pending" : "", language: "", limit: "100" });
  const rowsUrl = withQuery(base, filters);
  const [rows, setRows] = useState<Conversation[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const pager = useClientPagination(rows, 20);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const reload = async () => {
    setRowsLoading(true);
    setRowsError(null);
    try {
      setRows(await loadRows(rowsUrl));
      pager.setPage(1);
    } catch (err) {
      setRows([]);
      setRowsError(err instanceof Error ? err.message : "会话加载失败，请稍后重试。");
    } finally {
      setRowsLoading(false);
    }
  };
  useEffect(() => { void reload(); }, [rowsUrl]);
  const setFilters = (next: Filters) => {
    setFiltersState(handoffs ? { ...next, status: "human_handoff", handoffStatus: "pending" } : next);
  };
  return <div className={selected ? "split conversation-admin-layout work-split" : "single-column work-split"}><section className="work-panel"><ConversationExportBar base="/api/admin/conversations/export" scopedFilters={{ ...filters, limit: "50000" }} scopedLabel="当前筛选" onExportStarted={notifyExportStarted} />{handoffs && <div className="conversation-list-toolbar"><span className="status-pill warning">只显示待接管</span></div>}<FilterBar filters={filters} setFilters={setFilters} fields={handoffs ? ["merchantId", "language", "startAt", "endAt", "limit"] : ["merchantId", "status", "handoffStatus", "language", "startAt", "endAt", "limit"]} selects={{ status: ["", "active", "human_handoff"], handoffStatus: ["", "pending", "processing", "done"] }} onApply={reload} /><Table rows={pager.rows} columns={["merchantId", "countryName", "customerPhone", "nickname", "language", "stage", "status", "handoffStatus"]} onRow={setSelected} selectedKey={selected?.id} rowKey={(row) => row.id} loading={rowsLoading} error={rowsError} onRetry={reload} emptyTitle={handoffs ? "暂无待接管会话" : "暂无会话"} emptyDetail={handoffs ? "客户触发人工接管后会显示在这里。" : "客户发送消息后，会话会显示在这里。"} /><Pagination pager={pager} /></section>{selected && <section className="detail-panel"><ConversationDetail platform conversation={selected} refresh={async () => { setRows(await loadRows(rowsUrl)); }} onDeleted={async () => { setSelected(null); await reload(); }} /></section>}</div>;
}

function MerchantConversations({ handoffs = false, timeMode }: { handoffs?: boolean; timeMode: TimeDisplayMode }) {
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
  const conversationTimeZone = timeMode === "country" && selectedAccount ? timeZoneForCountry(selectedAccount.countryCode || selectedAccount.countryName) : "";
  const rowsUrl = selectedAccount
    ? withQuery("/api/merchant/conversations", { ...filters, timeZone: conversationTimeZone, a2cAccountPhone: selectedAccount.apiPhone })
    : "";
  const [rows, setRows] = useState<Conversation[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
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
    if (!selectedAccount || !rowsUrl) {
      setRows([]);
      setRowsError(null);
      return;
    }
    setRowsLoading(true);
    setRowsError(null);
    try {
      const nextRows = await loadRows<Conversation>(rowsUrl);
      setRows(nextRows);
      setSelected((current) => current ? nextRows.find((row) => row.id === current.id) || current : current);
    } catch (err) {
      setRows([]);
      setRowsError(err instanceof Error ? err.message : "客户会话加载失败，请稍后重试。");
    } finally {
      setRowsLoading(false);
    }
  };
  useEffect(() => { void reloadRows(); }, [rowsUrl]);
  useEffect(() => {
    if (!selectedAccount) return;
    let cancelled = false;
    const pollRows = async () => {
      const nextRows = await loadRows<Conversation>(rowsUrl).catch(() => null);
      if (!nextRows || cancelled) return;
      setRowsError(null);
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

  const exportFilters = selectedAccount ? { ...filters, timeZone: conversationTimeZone, a2cAccountPhone: selectedAccount.apiPhone, limit: "50000" } : undefined;
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
      loading={rowsLoading}
      loadError={rowsError}
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
      onRetry={reloadRows}
      onExportStarted={notifyExportStarted}
      renderFilterBar={() => <FilterBar filters={filters} setFilters={setFilters} fields={handoffs ? ["language", "startAt", "endAt", "limit"] : ["status", "handoffStatus", "language", "startAt", "endAt", "limit"]} selects={{ status: ["", "active", "human_handoff"], handoffStatus: ["", "pending", "processing", "done"] }} onApply={reloadRows} />}
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
  const [scriptFlow, setScriptFlow] = useState<ScriptFlowDetail | null>(null);
  const [trainingSamples, setTrainingSamples] = useState<Sample[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<Knowledge[]>([]);
  const [notes, setNotes] = useState("");
  const [send, setSend] = useState({ type: "text", content: "", url: "", caption: "", fileName: "" });
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [memoryError, setMemoryError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [contextError, setContextError] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const loadMessages = async (showLoading = false) => {
    if (showLoading) setMessagesLoading(true);
    try {
      const res = await api<{ rows: ChatMessage[] }>(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/messages?limit=100`);
      setMessages(res.rows);
      setMessagesError("");
    } catch (err) {
      setMessagesError(err instanceof Error ? err.message : "聊天记录加载失败");
    } finally {
      if (showLoading) setMessagesLoading(false);
    }
  };
  useEffect(() => {
    if (!platform) api(`/api/merchant/conversations/${conversation.id}/read`, { method: "POST" }).then(() => refresh()).catch(() => null);
    void loadMessages(true);
    const timer = window.setInterval(() => void loadMessages(), 3000);
    return () => window.clearInterval(timer);
  }, [conversation.id, platform]);
  useEffect(() => {
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, conversation.id]);
  useEffect(() => {
    setMemoryError("");
    api<CustomerMemory>(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/memory`).then((item) => {
      setMemory(item);
      setNotes(item.operatorNotes || "");
    }).catch((err) => {
      setMemory(null);
      setNotes("");
      setMemoryError(err instanceof Error ? err.message : "客户记忆加载失败");
    });
  }, [conversation.id, platform]);
  const loadReview = async () => {
    setReviewError("");
    try {
      setReview(await api<ConversationReviewResponse>(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/review`));
    } catch (err) {
      setReview({ review: null, items: [] });
      setReviewError(err instanceof Error ? err.message : "对话复盘加载失败");
    }
  };
  useEffect(() => { void loadReview(); }, [conversation.id, platform]);
  useEffect(() => {
    if (platform) {
      setScriptFlow(null);
      setTrainingSamples([]);
      setKnowledgeItems([]);
      return;
    }
    let cancelled = false;
    const loadBusinessContext = async () => {
      setContextError("");
      try {
        const flow = await loadActiveScriptFlow(conversation.countryId).catch(() => null);
        const sampleFilters = {
          countryId: conversation.countryId || "",
          language: conversation.language || "",
          stage: conversation.stage || "",
          enabled: "true"
        };
        const [samplesResult, knowledgeResult] = await Promise.all([
          loadRows<Sample>(withQuery("/api/merchant/training-samples", sampleFilters)),
          loadRows<Knowledge>(withQuery("/api/merchant/knowledge", { countryId: conversation.countryId || "", enabled: "true" }))
        ]);
        if (cancelled) return;
        setScriptFlow(flow);
        setTrainingSamples(samplesResult);
        setKnowledgeItems(knowledgeResult);
      } catch (err) {
        if (cancelled) return;
        setScriptFlow(null);
        setTrainingSamples([]);
        setKnowledgeItems([]);
        setContextError(err instanceof Error ? err.message : "业务上下文加载失败");
      }
    };
    void loadBusinessContext();
    return () => { cancelled = true; };
  }, [conversation.countryId, conversation.stage, conversation.language, platform]);
  const memoryUrl = `${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/memory`;
  const lastOutboundPayload = [...messages].reverse().find((item) => item.direction === "outbound")?.rawPayload || {};
  const strictEnabled = lastOutboundPayload.strictFlowEnabled;
  const flowStep = conversation.flowStep || lastOutboundPayload.strictFlowStep || "未识别";
  const currentScriptStep = currentFlowStep(scriptFlow, flowStep);
  const quickReplies = buildBusinessQuickReplies(currentScriptStep, trainingSamples, knowledgeItems);
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
  const saveMemoryAction = () => <AsyncButton busyText="保存中..." onClick={async () => {
    setError("");
    const item = await api<CustomerMemory>(memoryUrl, { method: "PATCH", body: JSON.stringify({ operatorNotes: notes }) });
    setMemory(item);
    setNotes(item.operatorNotes || "");
    setStatusMessage("客户记忆已保存。");
  }}>保存记忆</AsyncButton>;
  const sendAction = (disabled: boolean, children: React.ReactNode) => <AsyncButton disabled={disabled} busyText="发送中..." onClick={async () => {
    setError("");
    setStatusMessage("");
    try {
      await api(`/api/merchant/conversations/${conversation.id}/send`, { method: "POST", body: JSON.stringify(send) });
      setSend({ ...send, content: "", url: "", caption: "" });
      setStatusMessage("消息已发送。");
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    }
  }}>{children}</AsyncButton>;
  return <div className="conversation-detail wechat-detail">
    <section className="wechat-chat-column">
      <ConversationDetailHeader
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
        renderDeleteAction={() => <ConfirmActionButton className="danger" busyText="删除中..." title="确认彻底删除会话？" detail="该会话的聊天记录、接管记录和相关状态会一起删除，此操作不可恢复。" confirmText="删除会话" onConfirm={async () => { await api(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}`, { method: "DELETE" }); notify("success", "会话已彻底删除"); await onDeleted?.(); }}>删除会话</ConfirmActionButton>}
      />
      {error && <div className="error" role="alert">{error}</div>}
      {statusMessage && <div className="notice" role="status">{statusMessage}</div>}
      {messagesError && <div className="warning">聊天记录刷新失败：{messagesError}<button className="ghost" onClick={() => void loadMessages(true)}>重新加载</button></div>}
      <div className="chat-window" ref={messagesRef}>{messagesLoading ? <div className="empty-state">聊天记录加载中...</div> : messages.length ? <MessageTimeline messages={messages} helpers={{ formatDate: (value) => formatConversationDate(value, conversation.countryCode || conversation.countryName || conversation.countryId), formatTime: (value) => formatTime(value, conversation.countryCode || conversation.countryName || conversation.countryId), label, languageName, normalizeText, replyModeLabel, translateSystemMessage }} /> : <div className="empty-state">暂无聊天记录</div>}</div>
      <ScriptProgress flowStep={flowStep} scriptFlow={scriptFlow} />
      {!platform && <ConversationComposer value={send} onChange={setSend} renderSendAction={sendAction} quickReplies={quickReplies} />}
    </section>
    <TrainingLoopPanel
      platform={platform}
      conversation={conversation}
      flowStep={flowStep}
      lastOutboundPayload={lastOutboundPayload}
      scriptFlow={scriptFlow}
      currentScriptStep={currentScriptStep}
      trainingSamples={trainingSamples}
      knowledgeItems={knowledgeItems}
      review={review}
      reviewError={reviewError}
      memory={memory}
      memoryError={memoryError}
      contextError={contextError}
      notes={notes}
      localizeSystemText={localizeSystemText}
      onNotesChange={setNotes}
      saveMemoryAction={saveMemoryAction}
      onGenerate={generate}
      onApply={apply}
      setDraft={(content) => setSend({ ...send, type: "text", content, url: "", caption: "智能建议" })}
    />
  </div>;
}

async function loadActiveScriptFlow(countryId: string): Promise<ScriptFlowDetail | null> {
  const query = countryId ? { countryId, status: "active" } : { status: "active" };
  const result = await loadRows<ScriptFlow>(withQuery("/api/merchant/script-flows", query));
  const active = result.find((flow) => flow.active) || result[0];
  if (!active && countryId) {
    const fallback = await loadRows<ScriptFlow>(withQuery("/api/merchant/script-flows", { status: "active" }));
    const fallbackActive = fallback.find((flow) => flow.active) || fallback[0];
    return fallbackActive ? api<ScriptFlowDetail>(`/api/merchant/script-flows/${fallbackActive.id}`) : null;
  }
  return active ? api<ScriptFlowDetail>(`/api/merchant/script-flows/${active.id}`) : null;
}

function currentFlowStep(scriptFlow: ScriptFlowDetail | null, flowStep: string): ScriptFlowStep | null {
  if (!scriptFlow?.steps.length) return null;
  const normalized = normalizeBusinessStep(flowStep);
  return scriptFlow.steps.find((step) => normalizeBusinessStep(step.flowStep) === normalized)
    || scriptFlow.steps.find((step) => normalizeBusinessStep(step.flowCode) === normalized)
    || scriptFlow.steps.find((step) => step.enabled)
    || scriptFlow.steps[0]
    || null;
}

function buildBusinessQuickReplies(step: ScriptFlowStep | null, samples: Sample[], knowledge: Knowledge[]) {
  const replies: Array<{ label: string; content: string }> = [];
  if (step?.standardReply) replies.push({ label: step.flowName || label(step.flowStep) || "当前话本", content: step.standardReply });
  for (const sample of samples.slice(0, 4)) {
    if (!sample.standardReply) continue;
    replies.push({ label: clipUiText(label(sample.intent) || sample.intent || "样本", 8), content: sample.standardReply });
  }
  for (const item of knowledge.slice(0, 2)) {
    if (!item.content) continue;
    replies.push({ label: clipUiText(item.title || "知识", 8), content: item.content });
  }
  return dedupeQuickReplies(replies).slice(0, 6);
}

function dedupeQuickReplies(rows: Array<{ label: string; content: string }>) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = normalizeText(row.content);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ScriptProgress({ flowStep, scriptFlow }: { flowStep: string; scriptFlow: ScriptFlowDetail | null }) {
  const runtimeSteps = scriptFlow?.steps.length
    ? scriptFlow.steps.filter((step) => step.enabled).map((step) => [step.flowStep || step.flowCode, step.flowName || step.goal || label(step.flowStep)] as const)
    : STRICT_FLOW_STEP_LABELS;
  const steps = runtimeSteps.length ? runtimeSteps : STRICT_FLOW_STEP_LABELS;
  const activeIndex = Math.max(0, steps.findIndex(([key]) => normalizeBusinessStep(key) === normalizeBusinessStep(flowStep)));
  return <div className="script-progress">
    <div className="script-progress-head"><strong>脚本流程：{scriptFlow?.flow.name || "严格业务流程"}</strong><span>{scriptFlow ? `版本 ${scriptFlow.flow.version}` : "系统内置"}</span></div>
    <div className="script-rail">
      {steps.map(([key, text], index) => <div key={key} className={index <= activeIndex ? "done" : ""}>
        <span>{index < activeIndex ? <Check size={12}/> : index + 1}</span>
        <small>{text}</small>
      </div>)}
    </div>
  </div>;
}

const STRICT_FLOW_STEP_LABELS = [
  ["first_greeting", "首次问候"],
  ["interest_screening", "兴趣筛选"],
  ["project_intro", "项目介绍"],
  ["registration_intent", "确认意向"],
  ["send_register_link", "发送链接"],
  ["wait_registration", "等待注册"],
  ["telegram_confirm", "确认TG"],
  ["telegram_download", "下载TG"],
  ["collect_telegram", "发送TG链接"],
  ["human_handoff", "人工接管"],
  ["ended", "结束"]
] as const;

function normalizeBusinessStep(value: string) {
  return String(value || "").trim().toLowerCase();
}

function clipUiText(value: string, max: number) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function TrainingLoopPanel({
  platform,
  conversation,
  flowStep,
  lastOutboundPayload,
  scriptFlow,
  currentScriptStep,
  trainingSamples,
  knowledgeItems,
  review,
  reviewError,
  memory,
  memoryError,
  contextError,
  notes,
  localizeSystemText,
  onNotesChange,
  saveMemoryAction,
  onGenerate,
  onApply,
  setDraft
}: {
  platform: boolean;
  conversation: Conversation;
  flowStep: string;
  lastOutboundPayload: NonNullable<ChatMessage["rawPayload"]>;
  scriptFlow: ScriptFlowDetail | null;
  currentScriptStep: ScriptFlowStep | null;
  trainingSamples: Sample[];
  knowledgeItems: Knowledge[];
  review: ConversationReviewResponse;
  reviewError: string;
  memory: CustomerMemory | null;
  memoryError: string;
  contextError: string;
  notes: string;
  localizeSystemText: (value: string) => string;
  onNotesChange: (value: string) => void;
  saveMemoryAction: () => React.ReactNode;
  onGenerate: () => Promise<void>;
  onApply: (itemId: number) => Promise<void>;
  setDraft: (content: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"assistant" | "profile" | "ticket" | "history">("assistant");
  const suggestedReply = currentScriptStep?.standardReply
    || trainingSamples.find((sample) => sample.standardReply)?.standardReply
    || firstSuggestedReply(review)
    || "当前节点还没有配置标准回复。可以先生成对话复盘，或到话本流程/训练中心补充样本。";
  const firstKnowledge = knowledgeItems[0];
  const firstSample = trainingSamples[0];
  const firstReviewItem = review.items[0];
  const referencedSamples = lastOutboundPayload.samples?.length || 0;
  const referencedMaterials = lastOutboundPayload.trainingMaterials?.length || 0;
  return <aside className="training-loop-panel">
    <div className="assistant-tabs">
      <button className={activeTab === "assistant" ? "active" : ""} onClick={() => setActiveTab("assistant")}>智能助手</button>
      <button className={activeTab === "profile" ? "active" : ""} onClick={() => setActiveTab("profile")}>客户资料</button>
      <button className={activeTab === "ticket" ? "active" : ""} onClick={() => setActiveTab("ticket")}>工单</button>
      <button className={activeTab === "history" ? "active" : ""} onClick={() => setActiveTab("history")}>历史记录</button>
    </div>
    {activeTab === "assistant" && <>
      {contextError && <div className="warning">业务上下文加载失败：{contextError}</div>}
      <section className="assistant-card ai-reply-card">
        <div className="assistant-card-title"><Sparkles size={17}/><div><h3>智能回复建议</h3><p>基于对话上下文生成</p></div></div>
        <div className="reply-preview">{suggestedReply}</div>
        <div className="runtime-facts">
          <span>回复模式：{replyModeLabel(lastOutboundPayload.replyMode)}</span>
          <span>{lastOutboundPayload.scriptFlowName ? `话本流程：${lastOutboundPayload.scriptFlowName}` : lastOutboundPayload.strictFlowEnabled === true ? "系统流程已启用" : lastOutboundPayload.strictFlowEnabled === false ? "话本流程未启用" : "话本流程待判断"}</span>
          <span>引用样本 {referencedSamples} 条 · 资料 {referencedMaterials} 条</span>
        </div>
        <div className="confidence-row"><span>业务来源 <strong>{currentScriptStep ? "当前话本节点" : firstSample ? "训练样本" : firstReviewItem ? "复盘候选" : "待补充"}</strong></span><button onClick={() => { setDraft(suggestedReply); notify("success", "已填入回复框"); }}>使用回复</button><button className="ghost" onClick={() => { setDraft(suggestedReply); notify("success", "已填入回复框", "请在发送前按客户情况微调。"); }}>微调后使用</button><button className="icon-only ghost" title="回复合适" onClick={() => notify("success", "已记录反馈", "这条建议会作为后续优化参考。")}><ThumbsUp size={16}/></button><button className="icon-only ghost" title="回复不合适" onClick={() => notify("info", "已记录反馈", "建议生成复盘后沉淀为改进样本。")}><ThumbsDown size={16}/></button></div>
      </section>
      <section className="assistant-card">
        <div className="assistant-card-title"><BookOpen size={17}/><div><h3>匹配知识</h3><p>{conversation.countryName ? `${countryLabel(conversation.countryName)} · ${languageName(conversation.language)}` : "当前客户上下文"}</p></div><span className="status-pill ok">{firstKnowledge ? "已匹配" : "待补充"}</span></div>
        <strong>{firstKnowledge?.title || firstReviewItem?.title || "暂无直接匹配知识"}</strong>
        <p>{firstKnowledge?.content || displayReviewItemContent(firstReviewItem) || "当前国家/语言下还没有可展示知识，可从对话复盘生成或到知识库添加。"}</p>
        <small>来源：{firstKnowledge ? "知识库" : firstReviewItem ? "对话复盘" : "未命中"} · 当前阶段 {label(conversation.stage)}</small>
      </section>
      <section className="assistant-card script-guidance">
        <div className="assistant-card-title"><Workflow size={17}/><div><h3>脚本引导</h3><p>{scriptFlow?.flow.name || "系统流程"} · 当前步骤：{label(flowStep)}</p></div></div>
        {scriptGuidanceRows(currentScriptStep).map((item, index) => <div key={`${item}-${index}`} className={index < 3 ? "checked" : ""}><span>{index < 3 ? <Check size={12}/> : index + 1}</span>{item}</div>)}
      </section>
      <section className="assistant-card">
        <div className="assistant-card-title"><FileText size={17}/><div><h3>样本推荐</h3><p>相似场景优秀回复</p></div></div>
        {review.items.slice(0, 2).map((item) => <article key={item.id} className="sample-suggestion">
          <strong>{item.title}</strong>
          <p>{displayReviewItemContent(item)}</p>
          {!platform && item.status !== "applied" && <AsyncButton busyText="加入中..." onClick={() => onApply(item.id)}>引用</AsyncButton>}
        </article>)}
        {!review.items.length && trainingSamples.slice(0, 2).map((sample) => <article key={sample.id} className="sample-suggestion">
          <strong>{label(sample.intent)} · {label(sample.stage)}</strong>
          <p>{sample.standardReply}</p>
          <button className="ghost" onClick={() => { setDraft(sample.standardReply); notify("success", "样本已填入回复框"); }}>引用</button>
        </article>)}
        {!review.items.length && !trainingSamples.length && <article className="sample-suggestion"><strong>暂无样本命中</strong><p>当前阶段还没有训练样本。建议生成复盘或上传真实聊天记录。</p></article>}
      </section>
      <section className="assistant-card">
        <div className="assistant-card-title"><Lightbulb size={17}/><div><h3>训练提升</h3><p>当前对话可沉淀为训练内容</p></div></div>
        <div className="training-actions"><button className="ghost" onClick={() => notify("info", "已标记：不准确", "请点击“一键提升为训练样本”生成复盘候选后再处理。")}>不准确</button><button className="ghost" onClick={() => notify("info", "已标记：不完整", "请点击“一键提升为训练样本”补全复盘候选。")}>不完整</button>{!platform && <AsyncButton busyText="生成中..." onClick={onGenerate}>一键提升为训练样本</AsyncButton>}</div>
        <ConversationReviewCard platform={platform} data={review} error={reviewError} onGenerate={onGenerate} onApply={onApply} renderAction={({ children, busyText, onClick }) => <AsyncButton onClick={onClick} busyText={busyText}>{children}</AsyncButton>} />
      </section>
    </>}
    {activeTab === "profile" && <section className="assistant-card customer-profile-panel">
      <div className="assistant-card-title"><Contact size={17}/><div><h3>客户资料</h3><p>{conversation.nickname || conversation.customerPhone}</p></div><span className="status-pill ok">{label(conversation.status)}</span></div>
      <div className="profile-grid">
        <span>国家</span><strong>{countryLabel(conversation.countryName)}</strong>
        <span>语言</span><strong>{languageName(conversation.language)}</strong>
        <span>阶段</span><strong>{label(conversation.stage)}</strong>
        <span>当前流程</span><strong>{label(flowStep)}</strong>
        <span>客户号码</span><strong>{conversation.customerPhone || "未识别"}</strong>
        <span>客服账号</span><strong>{conversation.a2cAccountPhone || "未绑定"}</strong>
        <span>手机</span><strong>{conversation.extractedPhone || "未识别"}</strong>
        <span>Telegram</span><strong>{conversation.extractedTelegram || "未识别"}</strong>
        <span>WhatsApp</span><strong>{conversation.extractedWhatsApp || "未识别"}</strong>
      </div>
      <ConversationMemoryCard memory={memory} error={memoryError} notes={notes} localizeSystemText={localizeSystemText} onNotesChange={onNotesChange} renderSaveAction={saveMemoryAction} />
    </section>}
    {activeTab === "ticket" && <section className="assistant-card ticket-panel">
      <div className="assistant-card-title"><MessageSquare size={17}/><div><h3>工单</h3><p>当前会话处理状态</p></div><span className="status-pill ok">{label(conversation.handoffStatus)}</span></div>
      <div className="ticket-rows">
        <div><span>会话状态</span><strong>{label(conversation.status)}</strong></div>
        <div><span>接管状态</span><strong>{label(conversation.handoffStatus)}</strong></div>
        <div><span>未读消息</span><strong>{conversation.unreadCount} 条</strong></div>
        <div><span>推荐动作</span><strong>{conversation.handoffStatus === "pending" ? "尽快处理客户问题" : "保持跟进"}</strong></div>
      </div>
      <p>这里保持和现有接管流程一致：状态修改仍通过会话顶部的“待处理 / 处理中 / 已完成”操作完成，避免右侧面板产生第二套状态入口。</p>
    </section>}
    {activeTab === "history" && <section className="assistant-card history-panel">
      <div className="assistant-card-title"><FileText size={17}/><div><h3>历史记录</h3><p>聊天、复盘与训练沉淀</p></div></div>
      <div className="history-list">
        <article><strong>最近聊天</strong><p>{conversation.updatedAt ? formatDateTime(conversation.updatedAt, conversation.countryCode || conversation.countryName || conversation.countryId) : "暂无更新时间"} · 当前聊天窗口展示完整消息时间线</p></article>
        <article><strong>对话复盘</strong><p>{review.review ? `${review.review.score} 分 · ${review.review.summary}` : "未生成复盘"}</p></article>
        <article><strong>训练候选</strong><p>{review.items.length ? `${review.items.length} 条候选内容` : "暂无候选内容"}</p></article>
        <article><strong>运行引用</strong><p>样本 {referencedSamples} 条 · 资料 {referencedMaterials} 条 · 回复模式 {replyModeLabel(lastOutboundPayload.replyMode)}</p></article>
      </div>
    </section>}
  </aside>;
}

function firstSuggestedReply(review: ConversationReviewResponse) {
  const applied = review.items.find((item) => item.itemType === "sample" || item.itemType === "knowledge");
  if (applied?.content) return displayReviewItemContent(applied);
  const good = review.review?.goodReplies?.[0];
  if (good) return good;
  return "";
}

function displayReviewItemContent(item?: ConversationReviewItem) {
  if (!item) return "";
  try {
    const parsed = JSON.parse(item.content) as Record<string, unknown>;
    return String(parsed.standardReply || parsed.reply || parsed.content || parsed.answer || parsed.customerMessage || item.content || "");
  } catch {
    return item.content;
  }
}

function scriptGuidanceRows(step: ScriptFlowStep | null) {
  if (!step) return ["根据当前阶段判断客户问题", "查看最近客服回复与客户资料", "必要时生成复盘沉淀样本", "无法确认时转人工"];
  return [
    step.goal && `目标：${step.goal}`,
    step.triggerCondition && `触发：${step.triggerCondition}`,
    step.collectInfo && `收集：${step.collectInfo}`,
    step.sendLink ? "需要发送开户链接或教程" : "",
    step.sendInvite ? "需要分配或提醒邀请码" : "",
    step.sendTutorialImage ? "需要发送注册教程图片" : "",
    step.nextCondition && `下一步：${step.nextCondition}`,
    step.forbidden && `禁止：${step.forbidden}`
  ].filter(Boolean) as string[];
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
