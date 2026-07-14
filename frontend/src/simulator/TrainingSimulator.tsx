import React, { useEffect, useState } from "react";
import { CloudDownload, Send } from "lucide-react";

import { ConversationComposer } from "../conversations/ConversationComposer.js";
import type { A2CAccount, ChatMessage, Conversation, SimulatorResponse, Toast } from "../types.js";

type ApiClient = <T>(url: string, options?: RequestInit) => Promise<T>;
type Notify = (type: Toast["type"], title: string, detail?: string) => void;
type AsyncButtonComponent = React.ComponentType<{
  children: React.ReactNode;
  busyText: string;
  onClick: () => Promise<void>;
  className?: string;
  disabled?: boolean;
}>;
type TestSnapshot = {
  snapshotId: string;
  merchantId: string;
  merchant: { name: string };
  productionAgentId: string;
  productionWorkflowId: string;
  nodeCount: number;
  nodeIds: string[];
  productionWorkflowVersion: number;
  agentVersion: string;
  scriptVersion: string;
  knowledgeBaseVersion: string;
  sampleLibraryVersion: string;
  sourceUpdatedAt: string;
  configHash: string;
  snapshotCreatedAt: string;
  validation: { valid: boolean; errors: string[] };
};

export function TrainingSimulator({
  api,
  notify,
  AsyncButton,
  formatDateTime,
  displayValue,
  countryLabel
}: {
  api: ApiClient;
  notify: Notify;
  AsyncButton: AsyncButtonComponent;
  formatDateTime: (value: string) => string;
  displayValue: (column: string, value: unknown) => React.ReactNode;
  countryLabel: (value: unknown) => string;
}) {
  const [accounts, setAccounts] = useState<A2CAccount[]>([]);
  const [form, setForm] = useState({
    customerPhone: `sim-${Date.now().toString().slice(-6)}`,
    nickname: "模拟客户",
    a2cAccountPhone: "",
    content: "你好"
  });
  const [rows, setRows] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [accountsError, setAccountsError] = useState("");
  const [snapshots, setSnapshots] = useState<TestSnapshot[]>([]);
  const [snapshotId, setSnapshotId] = useState("");
  const [snapshotError, setSnapshotError] = useState("");
  const [productionConfigChanged, setProductionConfigChanged] = useState(false);

  useEffect(() => {
    setAccountsError("");
    api<{ rows: A2CAccount[] }>("/api/merchant/a2c/accounts")
      .then((res) => setAccounts(res.rows || []))
      .catch((err) => {
        setAccounts([]);
        setAccountsError(err instanceof Error ? err.message : "客服账号加载失败");
      });
  }, [api]);

  useEffect(() => {
    api<{ rows: TestSnapshot[] }>("/api/merchant/training-snapshots")
      .then((res) => {
        const rows = res.rows || [];
        setSnapshots(rows);
        if (rows[0]?.validation.valid) setSnapshotId(rows[0].snapshotId);
      })
      .catch((err) => setSnapshotError(err instanceof Error ? err.message : "测试快照加载失败"));
  }, [api]);

  const createSnapshot = async () => {
    setSnapshotError("");
    try {
      const res = await api<{ snapshot: TestSnapshot }>("/api/merchant/training-snapshots", { method: "POST", body: "{}" });
      setSnapshots((current) => [res.snapshot, ...current]);
      setSnapshotId(res.snapshot.snapshotId);
      notify("success", "已创建线上测试快照", `已锁定 ${res.snapshot.nodeCount} 个正式节点，模拟期间不会读取本地草稿。`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "无法创建线上测试快照";
      setSnapshotError(detail);
      notify("error", "创建测试快照失败", detail);
      throw err;
    }
  };

  useEffect(() => {
    if (!form.a2cAccountPhone && accounts[0]?.apiPhone) {
      setForm((current) => ({ ...current, a2cAccountPhone: accounts[0].apiPhone }));
    }
  }, [accounts, form.a2cAccountPhone]);

  const send = async () => {
    setError("");
    try {
      if (!snapshotId) {
        const detail = "请先从线上创建并选择测试快照";
        setError(detail);
        notify("error", "无法开始模拟", detail);
        return;
      }
      const res = await api<SimulatorResponse>("/api/merchant/training-simulator/messages", {
        method: "POST",
        body: JSON.stringify({
          customerPhone: form.customerPhone,
          snapshotId,
          nickname: form.nickname,
          a2cAccountPhone: form.a2cAccountPhone || undefined,
          content: form.content,
          msgType: "text"
        })
      });
      setRows(res.rows || []);
      setConversation(res.conversation || null);
      setStatus(res.status);
      setProductionConfigChanged(Boolean(res.testSnapshot?.productionConfigChanged));
      setForm({ ...form, content: "" });
      notify("success", "已完成内部模拟", "回复只记录在系统内，不会发送给真实客户。");
    } catch (err) {
      const detail = err instanceof Error ? err.message : "内部模拟失败";
      setError(detail);
      notify("error", "内部模拟失败", detail);
      throw err;
    }
  };

  const resetCustomer = () => {
    setRows([]);
    setConversation(null);
    setStatus("");
    setForm({
      ...form,
      customerPhone: `sim-${Date.now().toString().slice(-6)}`,
      nickname: "模拟客户",
      content: "你好"
    });
  };

  return <section className="simulator-layout">
    <div className="memory simulator-panel">
      <h3>内部模拟对话</h3>
      <p>用于训练和验话术：系统会按真实 webhook 流程生成回复、推进话本和记忆，但不会真实调用 A2C 发送。</p>
      <label>选择客服账号
        <select value={form.a2cAccountPhone} onChange={(e) => setForm({ ...form, a2cAccountPhone: e.target.value })}>
          {accounts.map((item) => <option key={item.id} value={item.apiPhone}>{item.verifiedName || "客服账号"} · {item.apiPhone}</option>)}
          {!accounts.length && <option value="">{accountsError ? "客服账号加载失败" : "未同步账号，使用模拟账号"}</option>}
        </select>
      </label>
      {accountsError && <div className="error" role="alert">{accountsError}</div>}
      <label>模拟客户号码<input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} /></label>
      <label>模拟客户昵称<input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} /></label>
      <label>客户消息<textarea rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="输入客户会发来的内容，例如：你好 / 链接打不开 / 我没有 Telegram" /></label>
      <div className="toolbar">
        <AsyncButton onClick={send} busyText="训练中..." disabled={!form.content.trim() || !snapshotId}><Send size={16}/>发送到内部训练</AsyncButton>
        <button onClick={resetCustomer}>换一个模拟客户</button>
      </div>
      <div className="simulator-snapshot-bar">
        <div><strong>测试配置快照</strong><p>必须使用线上正式启用流程，快照创建后不可变；不使用本地草稿。</p></div>
        <div className="toolbar">
          <select value={snapshotId} onChange={(e) => setSnapshotId(e.target.value)} aria-label="选择测试快照">
            <option value="">请选择测试快照</option>
            {snapshots.map((item) => <option key={item.snapshotId} value={item.snapshotId}>{item.nodeCount} 节点 · 版本 {item.productionWorkflowVersion} · {item.snapshotId.slice(0, 8)}</option>)}
          </select>
          <AsyncButton onClick={createSnapshot} busyText="读取线上配置中..."><CloudDownload size={16}/>从线上创建快照</AsyncButton>
        </div>
        {snapshotId && snapshots.find((item) => item.snapshotId === snapshotId) && (() => {
          const snapshot = snapshots.find((item) => item.snapshotId === snapshotId);
          if (!snapshot) return null;
          return <details>
            <summary>查看快照详情</summary>
            <div className="snapshot-detail">
              <span>当前商户：{snapshot.merchant.name}</span>
              <span>线上工作流：{snapshot.productionWorkflowId} · 版本 {snapshot.productionWorkflowVersion}</span>
              <span>线上节点：{snapshot.nodeCount} 个 · 快照节点：{snapshot.nodeIds.length} 个</span>
              <span>Agent 版本：{snapshot.agentVersion} · 话本版本：{snapshot.scriptVersion}</span>
              <span>知识库版本：{snapshot.knowledgeBaseVersion} · 样本库版本：{snapshot.sampleLibraryVersion}</span>
              <span>配置 Hash：{snapshot.configHash}</span>
              <span>快照创建：{formatDateTime(snapshot.snapshotCreatedAt)} · 源配置更新：{formatDateTime(snapshot.sourceUpdatedAt)}</span>
            </div>
          </details>;
        })()}
      </div>
      {snapshotError && <div className="error" role="alert">{snapshotError}</div>}
      {productionConfigChanged && <div className="error" role="alert">测试期间线上配置发生变化，本次结果只适用于快照版本，需要基于最新线上配置重新测试。</div>}
      {status && <div className="notice">本轮结果：{displayValue("status", status)}{conversation ? ` · 当前步骤：${displayValue("flowStep", conversation.flowStep || conversation.stage)}` : ""}</div>}
      {error && <div className="error">{error}</div>}
    </div>
    <div className="memory simulator-chat">
      <div className="section-title"><div><h3>模拟对话记录</h3><p>{conversation ? `${conversation.customerPhone} · ${conversation.a2cAccountPhone}` : "还没有开始模拟"}</p></div><span className="pill">不会真实发送 A2C</span></div>
      <div className="simulator-messages">
        {rows.length ? rows.map((msg) => <article key={msg.id} className={`sim-message ${msg.direction}`}>
          <div className="sim-message-meta"><strong>{msg.direction === "inbound" ? "客户" : "客服"}</strong><span>{formatDateTime(msg.createdAt)}</span></div>
          <p>{msg.content}</p>
          {msg.rawPayload?.a2cSendStatus === "simulated" && <small>模拟发送：已生成回复，未调用 A2C</small>}
          {msg.rawPayload?.strictFlowStep && <small>话本步骤：{displayValue("flowStep", msg.rawPayload.strictFlowStep)}</small>}
        </article>) : <div className="empty-state">输入一条客户消息开始训练。生成结果会显示在这里。</div>}
      </div>
    </div>
  </section>;
}
