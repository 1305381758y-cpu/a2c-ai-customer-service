import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Loader2 } from "lucide-react";

import { api, apiErrorStatus } from "./app/api.js";
import { Login } from "./app/Login.js";
import { type PortalView } from "./app/navigation.js";
import { canAccessPortal, portalModeForPath, portalModeLabel, type PortalMode } from "./app/portalMode.js";
import { Portal } from "./app/Portal.js";
import type { User } from "./types.js";
import { ToastHost } from "./ui/toast.js";
import "./styles.css";
import "./styles/product-refresh.css";
import "./styles/ui-fit-pass.css";
import "./styles/responsive-guardrails.css";
import "./styles/final-overrides.css";

function App() {
  const portalMode: PortalMode = portalModeForPath(window.location.pathname);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [view, setView] = useState(() => window.location.hash.replace("#", "") || window.localStorage.getItem("a2c_view") || "dashboard");

  const loadSession = () => {
    setLoading(true);
    setSessionError("");
    api<{ user: User }>("/api/auth/me")
      .then((res) => setUser(res.user))
      .catch((error: unknown) => {
        if (apiErrorStatus(error) === 401) {
          setUser(null);
          return;
        }
        setSessionError(error instanceof Error ? error.message : "登录状态暂时无法确认，请重试。");
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadSession(); }, []);
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

  if (loading) return <><ToastHost /><div className="boot-screen"><Loader2 size={22} className="spin" />正在进入后台...</div></>;
  if (sessionError) return <><ToastHost /><main className="login"><section className="login-panel"><div className="brand-lockup"><span>!</span><div><h1>暂时无法确认登录状态</h1><p>服务正在恢复或网络暂时不稳定</p></div></div><p>{sessionError}</p><button className="primary wide" onClick={loadSession}>重新检查</button></section></main></>;
  if (!user) return <><ToastHost /><Login onLogin={setUser} portalMode={portalMode} /></>;
  if (!canAccessPortal(portalMode, user.role)) return <><ToastHost /><PortalAccessDenied mode={portalMode} onLogout={async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => undefined); setUser(null); }} /></>;
  return <><ToastHost /><Portal user={user} requestedView={view} setView={(nextView) => setView(nextView)} onLogout={() => setUser(null)} /></>;
}

function PortalAccessDenied({ mode, onLogout }: { mode: PortalMode; onLogout: () => Promise<void> }) {
  return <main className="login"><section className="login-panel"><div className="brand-lockup"><span>!</span><div><h1>入口不匹配</h1><p>{portalModeLabel(mode)}</p></div></div><p>当前登录账号没有权限进入此入口，请使用对应的管理端或商户端链接。</p><button className="primary wide" onClick={() => void onLogout()}>退出并重新登录</button></section></main>;
}

const rootElement = document.getElementById("root")! as HTMLElement & { a2cRoot?: ReturnType<typeof createRoot> };
rootElement.a2cRoot ||= createRoot(rootElement);
rootElement.a2cRoot.render(<App />);
