import React, { useState } from "react";

import type { User } from "../types.js";
import { api } from "./api.js";

export function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("Admin123456");
  const [error, setError] = useState("");

  const login = async () => {
    setError("");
    try {
      const result = await api<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      onLogin(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    }
  };

  return <main className="login">
    <section className="login-panel">
      <div className="brand-lockup"><span>智</span><div><h1>A2C 智能客服</h1><p>平台管理端 / 商户端</p></div></div>
      <label>邮箱<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void login(); }} /></label>
      {error && <div className="error" role="alert">{error}</div>}
      <button className="primary wide" onClick={() => void login()}>登录</button>
      <small>首次登录默认账号由系统环境配置提供。</small>
    </section>
  </main>;
}
