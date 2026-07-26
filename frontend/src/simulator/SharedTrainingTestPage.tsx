import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, MessageSquare, RefreshCw, Send } from "lucide-react";

type PublicTestInfo = {
  label: string;
  merchantName: string;
  expiresAt: string;
  nodeCount: number;
  snapshotCreatedAt: string;
  productionConfigChanged: boolean;
};

type PublicMessage = {
  id: number;
  direction: "inbound" | "outbound";
  content: string;
  msgType: string;
  language: string;
  createdAt: string;
};

export function SharedTrainingTestPage({ token }: { token: string }) {
  const storageKey = `shared-training-session:${token.slice(0, 12)}`;
  const [sessionId, setSessionId] = useState(() => window.sessionStorage.getItem(storageKey) || createSessionId());
  const [test, setTest] = useState<PublicTestInfo | null>(null);
  const [rows, setRows] = useState<PublicMessage[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.sessionStorage.setItem(storageKey, sessionId);
  }, [sessionId, storageKey]);

  useEffect(() => {
    setLoading(true);
    publicApi<{ test: PublicTestInfo }>(`/api/public/training-simulator/${encodeURIComponent(token)}`)
      .then((response) => setTest(response.test))
      .catch((err) => setError(err instanceof Error ? err.message : "测试链接暂时无法访问"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [rows]);

  const expiryText = useMemo(() => test ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(test.expiresAt)) : "", [test]);

  const send = async () => {
    const message = content.trim();
    if (!message || sending) return;
    setSending(true);
    setError("");
    setContent("");
    try {
      const response = await publicApi<{ rows: PublicMessage[]; productionConfigChanged: boolean }>(`/api/public/training-simulator/${encodeURIComponent(token)}/messages`, {
        method: "POST",
        body: JSON.stringify({ sessionId, content: message })
      });
      setRows(response.rows || []);
      if (response.productionConfigChanged) setTest((current) => current ? { ...current, productionConfigChanged: true } : current);
    } catch (err) {
      setContent(message);
      setError(err instanceof Error ? err.message : "消息发送失败，请稍后重试");
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    const next = createSessionId();
    setSessionId(next);
    setRows([]);
    setContent("");
    setError("");
  };

  if (loading) return <main className="shared-test-page shared-test-centered"><Loader2 className="spin" size={24}/><p>正在打开对话测试...</p></main>;
  if (!test) return <main className="shared-test-page shared-test-centered"><AlertCircle size={30}/><h1>测试链接不可用</h1><p>{error || "链接可能已过期或被撤销，请联系链接发送方重新生成。"}</p></main>;

  return <main className="shared-test-page">
    <section className="shared-test-shell">
      <header className="shared-test-header">
        <div className="shared-test-brand"><span><MessageSquare size={20}/></span><div><h1>{test.label}</h1><p>{test.merchantName} · 独立模拟环境</p></div></div>
        <div className="shared-test-status"><CheckCircle2 size={16}/><span>不会发送给真实客户</span></div>
      </header>
      <div className="shared-test-notice">
        <p>请像真实客户一样连续发送消息，系统会保留本次测试上下文。</p>
        <span>链接有效至 {expiryText}（北京时间）</span>
      </div>
      <div className="shared-test-alerts">
        {test.productionConfigChanged && <div className="shared-test-warning" role="status">线上配置已有更新，本次对话仍使用链接创建时的固定版本。请联系发送方生成新链接后复测。</div>}
        {error && <div className="shared-test-error" role="alert"><AlertCircle size={16}/>{error}</div>}
      </div>
      <div className="shared-test-messages" ref={messagesRef} aria-live="polite">
        {rows.length ? rows.map((message) => <article key={message.id} className={`shared-test-message ${message.direction}`}>
          <strong>{message.direction === "inbound" ? "我" : "客服"}</strong>
          <p>{message.content}</p>
          <time>{formatMessageTime(message.createdAt)}</time>
        </article>) : <div className="shared-test-empty"><MessageSquare size={28}/><h2>开始测试对话</h2><p>输入一句客户可能会说的话，例如“你好”“我想先问个问题”。</p></div>}
      </div>
      <footer className="shared-test-composer">
        <textarea value={content} disabled={sending} rows={2} maxLength={4000} onChange={(event) => setContent(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void send();
          }
        }} placeholder="输入测试消息，Enter 发送，Shift + Enter 换行" aria-label="测试消息" />
        <button type="button" className="shared-test-send" disabled={!content.trim() || sending} onClick={() => void send()} title="发送测试消息">{sending ? <Loader2 className="spin" size={19}/> : <Send size={19}/>}<span>{sending ? "回复生成中" : "发送"}</span></button>
      </footer>
      <button type="button" className="shared-test-reset" onClick={reset}><RefreshCw size={15}/>开始一段新对话</button>
    </section>
  </main>;
}

async function publicApi<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body === undefined ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || "请求失败，请稍后重试");
  return body as T;
}

function createSessionId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatMessageTime(value: string): string {
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(normalized));
}
