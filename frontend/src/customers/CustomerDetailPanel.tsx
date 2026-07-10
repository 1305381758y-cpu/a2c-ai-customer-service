import React from "react";

import { loadRows, withQuery } from "../app/api.js";
import type { Conversation, Customer } from "../types.js";
import { ConfirmActionButton } from "../ui/components.js";
import { countryLabel, formatConversationDate, label, languageName } from "../ui/formatters.js";
import { CustomerConversationHistory } from "./CustomerConversationHistory.js";

type CustomerDetailPanelProps = {
  platform: boolean;
  customer: Customer;
  canDelete: boolean;
  onDelete: () => Promise<void>;
  renderConversation: (conversation: Conversation, reloadHistory: () => Promise<void>) => React.ReactNode;
};

export function CustomerDetailPanel({ platform, customer, canDelete, onDelete, renderConversation }: CustomerDetailPanelProps) {
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
