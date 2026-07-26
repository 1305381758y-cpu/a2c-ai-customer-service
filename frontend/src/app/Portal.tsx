import React, { useEffect, useState } from "react";
import { CheckCircle2, LogOut } from "lucide-react";

import { AgentProfilePage } from "../agent/AgentProfilePage.js";
import { ConversationDetail } from "../conversations/ConversationDetail.js";
import { Conversations } from "../conversations/ConversationsPage.js";
import { CustomersPage } from "../customers/CustomersPage.js";
import { Dashboard } from "../dashboard/Dashboard.js";
import { IntentLearningPage } from "../intent-learning/IntentLearningPage.js";
import { KnowledgePage } from "../knowledge/KnowledgePage.js";
import { MerchantsPage } from "../merchants/MerchantsPage.js";
import { AiCallsPage } from "../model-calls/AiCallsPage.js";
import { OperationLogsPage } from "../operation-logs/OperationLogsPage.js";
import { SamplesPage } from "../samples/SamplesPage.js";
import { ScriptFlowsPage } from "../script-flows/ScriptFlowsPage.js";
import { Config } from "../settings/ConfigPage.js";
import { TrainingSimulator } from "../simulator/TrainingSimulator.js";
import { TrainingMaterialsPage } from "../training/TrainingMaterialsPage.js";
import type { User } from "../types.js";
import { AsyncButton, ConfirmActionButton } from "../ui/components.js";
import { countryLabel, displayValue, formatDateTime, getTimeDisplayMode, setTimeDisplayMode, timeDisplayModeLabel, type TimeDisplayMode } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";
import { UsersPage } from "../users/UsersPage.js";
import { api, loadRows } from "./api.js";
import { navigationForRole, portalViewDescription, portalViewLabel, resolvePortalView, roleName, type PortalView } from "./navigation.js";

export function Portal({ user, requestedView, setView, onLogout }: { user: User; requestedView: string; setView: (view: PortalView) => void; onLogout: () => void }) {
  const [timeMode, setTimeModeState] = useState<TimeDisplayMode>(() => getTimeDisplayMode());
  const navigation = navigationForRole(user.role);
  const activeView = resolvePortalView(user.role, requestedView);

  useEffect(() => {
    if (activeView !== requestedView) setView(activeView);
  }, [activeView, requestedView, setView]);

  const changeTimeMode = (mode: TimeDisplayMode) => {
    setTimeDisplayMode(mode);
    setTimeModeState(mode);
  };

  return <div className="app">
    <aside>
      <div className="side-brand"><span>智</span><div><h2>智能客服</h2><small>智能客服工作台</small></div></div>
      <div className="side-user"><strong>{user.name}</strong><span>{roleName(user.role)}</span></div>
      <nav>{navigation.map(({ key, label, icon: Icon, group }, index) => <React.Fragment key={key}>{(index === 0 || navigation[index - 1]?.group !== group) && <span className="nav-group-label">{group}</span>}<button title={label} key={key} className={activeView === key ? "active" : ""} onClick={() => setView(key)}><Icon size={17}/><span className="nav-label">{label}</span></button></React.Fragment>)}</nav>
      <ConfirmActionButton className="logout" busyText="退出中..." title="确认退出登录？" detail="退出后需要重新输入账号密码才能进入后台。" confirmText="退出登录" onConfirm={async () => { await api("/api/auth/logout", { method: "POST" }); notify("success", "已退出登录"); onLogout(); }}><LogOut size={17}/>退出</ConfirmActionButton>
    </aside>
    <main>
      <header><div><h1>{portalViewLabel(user.role, activeView)}</h1><p>{portalViewDescription(activeView)} <span className="header-context">{user.name} · {roleName(user.role)}</span></p></div><div className="header-actions"><label className="time-zone-toggle"><span>时间</span><select value={timeMode} onChange={(event) => changeTimeMode(event.target.value as TimeDisplayMode)} aria-label="时间显示"><option value="beijing">北京时间</option><option value="country">国家时间</option></select><small>{timeDisplayModeLabel(timeMode)}</small></label><span className="live-pill"><CheckCircle2 size={15}/>线上服务已连接</span></div></header>
      <PortalPage user={user} view={activeView} timeMode={timeMode} />
    </main>
  </div>;
}

function PortalPage({ user, view, timeMode }: { user: User; view: PortalView; timeMode: TimeDisplayMode }) {
  const platform = user.role === "platform_admin";
  const canManage = user.role !== "merchant_operator";
  const page = (() => { switch (view) {
    case "dashboard": return <Dashboard platform={platform} api={api} timeMode={timeMode} />;
    case "aiCalls": return <AiCallsPage platform={platform} timeMode={timeMode} />;
    case "operationLogs": return <OperationLogsPage platform={platform} timeMode={timeMode} />;
    case "merchants": return <MerchantsPage />;
    case "users": return <UsersPage />;
    case "config": return <Config platform={platform} canEdit={canManage} />;
    case "agentProfile": return <AgentProfilePage platform={platform} canEdit={user.role !== "merchant_operator"} api={api} notify={notify} AsyncButton={AsyncButton} loadRows={loadRows} />;
    case "customers": return <CustomersPage platform={platform} canDelete={canManage} timeMode={timeMode} renderConversation={(conversation, reloadHistory) => <ConversationDetail platform={platform} canApplyTraining={!platform && canManage} canDelete={canManage} conversation={conversation} refresh={reloadHistory} onDeleted={reloadHistory} />} />;
    case "scriptFlows": return <ScriptFlowsPage platform={platform} canEdit={canManage} />;
    case "intentLearning": return <IntentLearningPage platform={platform} timeMode={timeMode} />;
    case "training": return <TrainingMaterialsPage platform={false} simple />;
    case "simulator": return <TrainingSimulator api={api} notify={notify} AsyncButton={AsyncButton} formatDateTime={formatDateTime} displayValue={displayValue} countryLabel={countryLabel} canShare={canManage} />;
    case "materials": return <TrainingMaterialsPage platform={platform} />;
    case "knowledge": return <KnowledgePage platform={platform} />;
    case "samples": return <SamplesPage platform={platform} />;
    case "conversations": return <Conversations platform={platform} timeMode={timeMode} canApplyTraining={!platform && canManage} canDelete={canManage} />;
    case "handoffs": return <Conversations platform={platform} handoffs timeMode={timeMode} canApplyTraining={!platform && canManage} canDelete={canManage} />;
  }})();
  return <div className={`portal-page-v2 portal-page-${view}`}>{page}</div>;
}
