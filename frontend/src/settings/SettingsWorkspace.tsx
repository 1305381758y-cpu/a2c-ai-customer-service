import React, { createContext, useContext, useState } from "react";
import { Bot, Globe2, Link2, MessageSquare, Settings2, Sparkles, Users } from "lucide-react";

export type SettingsSectionId = "runtime" | "a2c" | "ai" | "market" | "accounts" | "handoff";

const SETTINGS_NAVIGATION = [
  { id: "runtime", label: "运行模式", icon: Settings2 },
  { id: "a2c", label: "A2C 接入", icon: Link2 },
  { id: "ai", label: "智能供应商", icon: Sparkles },
  { id: "market", label: "国家与引导", icon: Globe2 },
  { id: "accounts", label: "客服账号与邀请码", icon: Users },
  { id: "handoff", label: "TG 接管", icon: MessageSquare }
] as const;

const SettingsReadOnlyContext = createContext(false);

export function SettingsWorkspace({ children, readOnly = false }: { children: React.ReactNode; readOnly?: boolean }) {
  const [active, setActive] = useState<SettingsSectionId>("runtime");
  const openSection = (id: SettingsSectionId) => {
    setActive(id);
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return <SettingsReadOnlyContext.Provider value={readOnly}><div className="settings-workspace">
    <nav className="settings-navigation" aria-label="设置分组">
      <div className="settings-navigation-title"><Bot size={18}/><span>配置中心</span></div>
      {SETTINGS_NAVIGATION.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? "active" : ""} onClick={() => openSection(id)}><Icon size={16}/><span>{label}</span></button>)}
    </nav>
    <div className="settings-content">{children}</div>
  </div></SettingsReadOnlyContext.Provider>;
}

export function SettingsSection({ id, title, description, status, statusTone = "neutral", impact, children }: {
  id: SettingsSectionId;
  title: string;
  description: string;
  status?: string;
  statusTone?: "ok" | "warning" | "danger" | "neutral";
  impact?: string;
  children: React.ReactNode;
}) {
  const readOnly = useContext(SettingsReadOnlyContext);
  return <section id={`settings-${id}`} className="settings-section">
    <div className="settings-section-header">
      <div><h2>{title}</h2><p>{description}</p></div>
      {status && <span className={`settings-section-status ${statusTone}`}>{status}</span>}
    </div>
    {impact && <div className="settings-impact"><strong>修改影响</strong><span>{impact}</span></div>}
    <fieldset className="settings-section-body" disabled={readOnly}>{children}</fieldset>
  </section>;
}
