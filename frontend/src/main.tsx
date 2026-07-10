import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Loader2 } from "lucide-react";

import { api } from "./app/api.js";
import { Login } from "./app/Login.js";
import { type PortalView } from "./app/navigation.js";
import { Portal } from "./app/Portal.js";
import type { User } from "./types.js";
import { ToastHost } from "./ui/toast.js";
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

  if (loading) return <><ToastHost /><div className="boot-screen"><Loader2 size={22} className="spin" />正在进入后台...</div></>;
  if (!user) return <><ToastHost /><Login onLogin={setUser} /></>;
  return <><ToastHost /><Portal user={user} requestedView={view} setView={(nextView) => setView(nextView)} onLogout={() => setUser(null)} /></>;
}

const rootElement = document.getElementById("root")! as HTMLElement & { a2cRoot?: ReturnType<typeof createRoot> };
rootElement.a2cRoot ||= createRoot(rootElement);
rootElement.a2cRoot.render(<App />);
