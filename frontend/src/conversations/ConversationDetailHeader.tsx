import type React from "react";
import type { ChatMessage, Conversation } from "../types.js";

type ConversationDetailHeaderProps = {
  platform: boolean;
  conversation: Conversation;
  lastOutboundPayload: NonNullable<ChatMessage["rawPayload"]>;
  flowStep: string;
  strictEnabled: unknown;
  countryLabel: (value: unknown) => string;
  languageName: (value: string) => string;
  label: (value: string) => string;
  replyModeLabel: (mode?: string) => string;
  onHandoffStatusChange: (handoffStatus: string) => Promise<void>;
  renderDeleteAction: () => React.ReactNode;
};

export function ConversationDetailHeader({
  platform,
  conversation,
  lastOutboundPayload,
  flowStep,
  strictEnabled,
  countryLabel,
  languageName,
  label,
  replyModeLabel,
  onHandoffStatusChange,
  renderDeleteAction
}: ConversationDetailHeaderProps) {
  return <div className="chat-header">
    <div>
      <h3>{conversation.nickname || conversation.customerPhone}</h3>
      <div className="header-meta">
        <span>{countryLabel(conversation.countryName)}</span>
        <span>{languageName(conversation.language)}</span>
        <span>客服账号：{conversation.a2cAccountPhone || "未识别"}</span>
        <span>流程：{label(flowStep)}</span>
        <span>回复模式：{replyModeLabel(lastOutboundPayload.replyMode)}</span>
        <span>{strictEnabled === true ? "严格流程已命中" : strictEnabled === false ? "未启用严格流程" : "严格流程待判断"}</span>
        <span>手机：{conversation.extractedPhone || "未识别"}</span>
        <span>TG：{conversation.extractedTelegram || "未识别"}</span>
        <span>WS：{conversation.extractedWhatsApp || "未识别"}</span>
      </div>
      {strictEnabled === false && <div className="warning compact">当前会话未启用严格话本流程，可能走普通回复。</div>}
    </div>
    <div className="chat-actions">
      {!platform && <select value={conversation.handoffStatus} onChange={(event) => void onHandoffStatusChange(event.target.value)}>
        <option value="pending">待处理</option>
        <option value="processing">处理中</option>
        <option value="done">已完成</option>
      </select>}
      {renderDeleteAction()}
    </div>
  </div>;
}
