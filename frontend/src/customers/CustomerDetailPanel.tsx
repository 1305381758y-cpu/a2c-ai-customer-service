import React from "react";

import { api, loadRows, withQuery } from "../app/api.js";
import type { Conversation, Customer, CustomerBalanceTransaction } from "../types.js";
import { AsyncButton, ConfirmActionButton } from "../ui/components.js";
import { countryLabel, formatConversationDate, label, languageName } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";
import { CustomerConversationHistory } from "./CustomerConversationHistory.js";

type CustomerDetailPanelProps = {
  platform: boolean;
  customer: Customer;
  canDelete: boolean;
  onDelete: () => Promise<void>;
  renderConversation: (conversation: Conversation, reloadHistory: () => Promise<void>) => React.ReactNode;
};

export function CustomerDetailPanel({ platform, customer, canDelete, onDelete, renderConversation }: CustomerDetailPanelProps) {
  const [provider, setProvider] = React.useState(customer.aiProvider || "");
  const [model, setModel] = React.useState(customer.aiModel || "");
  const [transactions, setTransactions] = React.useState<CustomerBalanceTransaction[]>([]);
  const [balance, setBalance] = React.useState(Number(customer.balance || 0));
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const customerKey = encodeURIComponent(customer.customerKey);
  const merchantQuery = `?merchantId=${encodeURIComponent(customer.merchantId)}`;
  const reloadTransactions = async () => {
    if (!platform) return;
    const result = await api<{ rows: CustomerBalanceTransaction[] }>(`/api/admin/customers/${customerKey}/balance-transactions${merchantQuery}`);
    setTransactions(result.rows);
    setBalance(result.rows.reduce((total, row) => total + Number(row.amount || 0), 0));
  };
  React.useEffect(() => { setProvider(customer.aiProvider || ""); setModel(customer.aiModel || ""); setBalance(Number(customer.balance || 0)); void reloadTransactions().catch(() => undefined); }, [customer.id, platform]);
  const saveAgent = async () => {
    await api<Customer>(`/api/admin/customers/${customerKey}${merchantQuery}`, { method: "PATCH", body: JSON.stringify({ aiProvider: provider, aiModel: model }) });
    notify("success", "客户智能供应商已保存", "后续该客户的新消息会优先使用这项配置。");
  };
  const addBalance = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0) throw new Error("请输入不为零的金额");
    await api(`/api/admin/customers/${customerKey}/balance-transactions${merchantQuery}`, { method: "POST", body: JSON.stringify({ amount: value, note }) });
    setAmount(""); setNote(""); await reloadTransactions(); notify("success", value > 0 ? "客户余额已充值" : "客户余额已扣减");
  };
  return <section className="detail-panel customer-detail-panel">
    <div>
      <div className="detail-title-row">
        <div>
          <h3>{customer.customerKey}</h3>
          <p>{countryLabel(customer.countryName)} · {customer.nickname || "无昵称"} · {label(customer.status)} · {languageName(customer.language)}</p>
        </div>
        {canDelete && <ConfirmActionButton
          className="danger"
          busyText="删除中..."
          title="确认彻底删除客户？"
          detail={`客户 ${customer.customerKey} 的所有会话、聊天记录、记忆和接管记录都会一起删除，此操作不可恢复。`}
          confirmText="彻底删除"
          onConfirm={onDelete}
        >
          删除客户
        </ConfirmActionButton>}
      </div>
      <div className="form-grid">
        <label>首次接收账号<input readOnly value={customer.firstA2CAccountPhone || ""} /></label>
        <label>最近接收账号<input readOnly value={customer.lastA2CAccountPhone || ""} /></label>
        <label>手机号<input readOnly value={customer.extractedPhone || ""} /></label>
        <label>Telegram<input readOnly value={customer.extractedTelegram || ""} /></label>
        <label>WhatsApp<input readOnly value={customer.extractedWhatsApp || ""} /></label>
        <label>会话数<input readOnly value={String(customer.conversationCount || 0)} /></label>
        <label>最近会话ID<input readOnly value={customer.lastConversationId || ""} /></label>
      </div>
      {platform && <>
        <section className="detail-subsection">
          <div className="section-heading-row"><div><h4>客户智能供应商</h4><p>仅管理端可配置。留空时沿用当前商户默认供应商。</p></div></div>
          <div className="form-grid">
            <label>供应商<select value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}><option value="">沿用商户默认</option><option value="minimax">MiniMax</option><option value="deepseek">DeepSeek</option><option value="gemini">Gemini兼容</option></select></label>
            <label>模型<input value={model} placeholder="留空使用供应商默认模型" onChange={(event) => setModel(event.target.value)} /></label>
          </div>
          <AsyncButton busyText="保存中..." onClick={saveAgent}>保存客户模型配置</AsyncButton>
        </section>
        <section className="detail-subsection">
          <div className="section-heading-row"><div><h4>客户余额与充值记录</h4><p>当前余额：{balance.toFixed(2)} {customer.balanceCurrency === "CNY" ? "默认币种" : customer.balanceCurrency}</p></div></div>
          <div className="form-grid"><label>金额<input type="number" step="0.01" value={amount} placeholder="正数充值，负数扣减" onChange={(event) => setAmount(event.target.value)} /></label><label>备注<input value={note} onChange={(event) => setNote(event.target.value)} /></label></div>
          <AsyncButton busyText="提交中..." onClick={addBalance}>新增余额记录</AsyncButton>
          <div className="table-scroll compact"><table><thead><tr><th>金额</th><th>备注</th><th>操作人</th><th>时间</th><th>操作</th></tr></thead><tbody>{transactions.map((row) => <TransactionRow key={row.id} row={row} merchantQuery={merchantQuery} onChanged={reloadTransactions} />)}{!transactions.length && <tr><td colSpan={5}>暂无余额记录</td></tr>}</tbody></table></div>
        </section>
      </>}
      <p>客户档案由回调自动创建和更新；删除客户会同步清理该客户所有会话、消息、记忆和接管记录。</p>
    </div>
    <CustomerConversationHistory
      platform={platform}
      customer={customer}
      loadRows={loadRows}
      withQuery={withQuery}
      helpers={{ formatConversationDate, countryLabel, languageName, label }}
      renderConversation={renderConversation}
    />
  </section>;
}

function TransactionRow({ row, merchantQuery, onChanged }: { row: CustomerBalanceTransaction; merchantQuery: string; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = React.useState(false);
  const [amount, setAmount] = React.useState(String(row.amount));
  const [note, setNote] = React.useState(row.note);
  const save = async () => { await api(`/api/admin/customer-balance-transactions/${row.id}${merchantQuery}`, { method: "PATCH", body: JSON.stringify({ amount: Number(amount), note }) }); setEditing(false); await onChanged(); };
  const remove = async () => { await api(`/api/admin/customer-balance-transactions/${row.id}${merchantQuery}`, { method: "DELETE" }); await onChanged(); };
  return <tr><td>{editing ? <input value={amount} onChange={(event) => setAmount(event.target.value)} /> : row.amount.toFixed(2)}</td><td>{editing ? <input value={note} onChange={(event) => setNote(event.target.value)} /> : row.note || "-"}</td><td>{row.createdBy || "系统"}</td><td>{row.createdAt}</td><td>{editing ? <><button onClick={() => void save()}>保存</button><button className="ghost" onClick={() => setEditing(false)}>取消</button></> : <><button onClick={() => setEditing(true)}>编辑</button><ConfirmActionButton className="danger ghost" busyText="删除中..." title="确认删除余额记录？" detail="删除后客户余额会按剩余记录重新计算。" confirmText="删除" onConfirm={remove}>删除</ConfirmActionButton></>}</td></tr>;
}
