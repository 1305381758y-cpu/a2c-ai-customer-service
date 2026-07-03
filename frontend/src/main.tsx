import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Loader2 } from "lucide-react";
import { AgentProfilePage } from "./agent/AgentProfilePage.js";
import { MerchantsPage } from "./admin/MerchantsPage.js";
import { UsersPage } from "./admin/UsersPage.js";
import { AppShell } from "./app/AppShell.js";
import { getNavSections, normalizeViewForUser, type AppView } from "./app/navigation.js";
import { loadCurrentUser, login, logout } from "./auth/authApi.js";
import { ConversationDetail } from "./conversations/ConversationDetail.js";
import { ConversationsPage } from "./conversations/ConversationsPage.js";
import { CustomersPage } from "./customers/CustomersPage.js";
import { ConfigPage } from "./config/ConfigPage.js";
import { Dashboard } from "./dashboard/Dashboard.js";
import { ScriptFlowsPage } from "./script-flows/ScriptFlowsPage.js";
import { IntentLearningPage } from "./intent-learning/IntentLearningPage.js";
import { KnowledgePage } from "./knowledge/KnowledgePage.js";
import { SamplesPage } from "./samples/SamplesPage.js";
import { TrainingSimulator } from "./simulator/TrainingSimulator.js";
import { TrainingMaterialsPage } from "./training/TrainingMaterialsPage.js";
import type { User } from "./types.js";
import { AsyncButton } from "./ui/components.js";
import { countryLabel, displayValue, formatDateTime } from "./ui/formatters.js";
import { notify, ToastHost } from "./ui/toast.js";
import "./ui/theme.css";
import "./ui/controls.css";
import "./ui/feedback.css";
import "./ui/app-shell.css";
import "./ui/primitives.css";
import "./ui/pagination.css";
import "./ui/status-card.css";
import "./admin/merchants.css";
import "./dashboard/dashboard.css";
import "./agent/agent-profile.css";
import "./customers/customers.css";
import "./config/config.css";
import "./config/config-accounts.css";
import "./training/training.css";
import "./script-flows/script-flows.css";
import "./intent-learning/intent-learning.css";
import "./simulator/simulator.css";
import "./conversations/conversations.css";
import "./conversations/conversation-lists.css";
import "./conversations/conversation-chat.css";
import "./conversations/conversation-export.css";
import "./conversations/conversation-review.css";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => window.location.hash.replace("#", "") || window.localStorage.getItem("a2c_view") || "dashboard");

  useEffect(() => {
    loadCurrentUser().then(setUser).catch(() => null).finally(() => setLoading(false));
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
              onLogin(await login({ email, password }));
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
  const nav = getNavSections(user);
  const activeView = normalizeViewForUser(user, view);
  useEffect(() => {
    if (activeView !== view) setView(activeView);
  }, [activeView, view, setView]);
  return (
    <AppShell
      user={user}
      sections={nav}
      activeView={activeView}
      onNavigate={(nextView: AppView) => setView(nextView)}
      onLogout={async () => { if (!window.confirm("确认退出当前账号？")) return; await logout(); notify("success", "已退出登录"); onLogout(); }}
    >
        {activeView === "dashboard" && <Dashboard platform={user.role === "platform_admin"} />}
        {activeView === "merchants" && <MerchantsPage />}
        {activeView === "users" && <UsersPage />}
        {activeView === "config" && <ConfigPage platform={user.role === "platform_admin"} />}
        {activeView === "agentProfile" && <AgentProfilePage platform={user.role === "platform_admin"} canEdit={user.role !== "merchant_operator"} notify={notify} AsyncButton={AsyncButton} />}
        {activeView === "customers" && <CustomersPage platform={user.role === "platform_admin"} renderConversation={(conversation, reloadHistory) => <ConversationDetail platform={user.role === "platform_admin"} conversation={conversation} refresh={reloadHistory} onDeleted={async () => { await reloadHistory(); }} />} />}
        {activeView === "scriptFlows" && <ScriptFlowsPage platform={user.role === "platform_admin"} />}
        {activeView === "intentLearning" && <IntentLearningPage platform={user.role === "platform_admin"} />}
        {activeView === "training" && <TrainingMaterialsPage platform={false} simple />}
        {activeView === "simulator" && <TrainingSimulator notify={notify} AsyncButton={AsyncButton} formatDateTime={formatDateTime} displayValue={displayValue} countryLabel={countryLabel} />}
        {activeView === "materials" && <TrainingMaterialsPage platform={user.role === "platform_admin"} />}
        {activeView === "knowledge" && <KnowledgePage platform={user.role === "platform_admin"} />}
        {activeView === "samples" && <SamplesPage platform={user.role === "platform_admin"} />}
        {activeView === "conversations" && <ConversationsPage platform={user.role === "platform_admin"} />}
        {activeView === "handoffs" && <ConversationsPage platform={user.role === "platform_admin"} handoffs />}
    </AppShell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

createRoot(document.getElementById("root")!).render(<App />);
