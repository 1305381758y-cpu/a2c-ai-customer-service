import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bot, Building2, CheckCircle2, Contact, FileText, Lightbulb, Loader2, LogOut, MessageSquare, Settings, Sparkles, Upload, Users, Workflow } from "lucide-react";
import { AgentProfilePage } from "./agent/AgentProfilePage.js";
import { api, loadRows } from "./app/api.js";
import { ConversationDetail } from "./conversations/ConversationDetail.js";
import { Conversations } from "./conversations/ConversationsPage.js";
import { CustomersPage } from "./customers/CustomersPage.js";
import { Dashboard } from "./dashboard/Dashboard.js";
import { IntentLearningPage } from "./intent-learning/IntentLearningPage.js";
import { KnowledgePage } from "./knowledge/KnowledgePage.js";
import { MerchantsPage } from "./merchants/MerchantsPage.js";
import { AiCallsPage } from "./model-calls/AiCallsPage.js";
import { SamplesPage } from "./samples/SamplesPage.js";
import { ScriptFlowsPage } from "./script-flows/ScriptFlowsPage.js";
import { Config } from "./settings/ConfigPage.js";
import { TrainingMaterialsPage } from "./training/TrainingMaterialsPage.js";
import { TrainingSimulator } from "./simulator/TrainingSimulator.js";
import { UsersPage } from "./users/UsersPage.js";
import type { User } from "./types.js";
import { AsyncButton, ConfirmActionButton } from "./ui/components.js";
import { countryLabel, displayValue, formatDateTime, getTimeDisplayMode, setTimeDisplayMode, timeDisplayModeLabel, type TimeDisplayMode } from "./ui/formatters.js";
import { notify, ToastHost } from "./ui/toast.js";
import "./styles.css";
import "./styles/product-refresh.css";
import "./styles/ui-fit-pass.css";
import "./styles/responsive-guardrails.css";
import "./styles/final-overrides.css";

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
        {activeView === "merchants" && <MerchantsPage />}
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
function Shell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function roleName(role: string) {
  return ({ platform_admin: "平台管理员", merchant_admin: "商户管理员", merchant_operator: "商户运营" } as Record<string, string>)[role] || role;
}

const rootElement = document.getElementById("root")! as HTMLElement & { a2cRoot?: ReturnType<typeof createRoot> };
rootElement.a2cRoot ||= createRoot(rootElement);
rootElement.a2cRoot.render(<App />);
