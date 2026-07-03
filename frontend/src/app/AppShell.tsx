import React from "react";
import { CheckCircle2, LogOut } from "lucide-react";

import type { User } from "../types.js";
import type { AppView, NavSection } from "./navigation.js";
import { findNavItem, roleName } from "./navigation.js";

export function AppShell({
  user,
  sections,
  activeView,
  onNavigate,
  onLogout,
  children,
}: {
  user: User;
  sections: NavSection[];
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const active = findNavItem(sections, activeView);
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="side-brand">
          <span>AI</span>
          <div>
            <h2>A2C AI</h2>
            <small>智能客服工作台</small>
          </div>
        </div>
        <div className="side-user">
          <div>
            <strong>{user.name}</strong>
            <span>{roleName(user.role)}</span>
          </div>
        </div>
        <nav className="side-nav" aria-label="主导航">
          {sections.map((section) => (
            <section key={section.title} className="side-nav-section">
              <h3>{section.title}</h3>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.key} className={activeView === item.key ? "active" : ""} onClick={() => onNavigate(item.key)}>
                    <Icon size={17} />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
        </nav>
        <button className="logout" onClick={onLogout}><LogOut size={17} />退出</button>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="page-kicker">{user.name} · {roleName(user.role)}</div>
          <div className="topbar-row">
            <div>
              <h1>{active.label}</h1>
              <p>{active.description}</p>
            </div>
            <span className="live-pill"><CheckCircle2 size={15} />线上服务已连接</span>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
