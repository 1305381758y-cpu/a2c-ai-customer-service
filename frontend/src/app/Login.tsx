import React, { useState } from "react";

import type { User } from "../types.js";
import { api } from "./api.js";
import { canAccessPortal, portalModeLabel, type PortalMode } from "./portalMode.js";

export function Login({ onLogin, portalMode = "shared" }: { onLogin: (user: User) => void; portalMode?: PortalMode }) {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("Admin@2026A2c!");
  const [error, setError] = useState("");

  const login = async () => {
    setError("");
    try {
      const result = await api<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      if (!canAccessPortal(portalMode, result.user.role)) {
        await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        throw new Error(`当前账号不能进入${portalModeLabel(portalMode)}，请使用对应入口登录。`);
      }
      onLogin(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    }
  };

  return <main className="login">
    <section className="login-panel">
      <div className="brand-lockup"><span>智</span><div><h1>智能客服</h1><p>{portalModeLabel(portalMode)}</p></div></div>
      <label>邮箱<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void login(); }} /></label>
      {error && <div className="error" role="alert">{error}</div>}
      <button className="primary wide" onClick={() => void login()}>登录</button>
      <small>首次登录默认账号由系统环境配置提供。</small>
    </section>
  </main>;
}
