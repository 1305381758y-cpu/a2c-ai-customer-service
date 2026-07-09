import type { ReactNode, RefObject } from "react";

import { api } from "../app/api.js";
import type { ChatMessage, Conversation, ScriptFlowDetail } from "../types.js";
import { ConfirmActionButton } from "../ui/components.js";
import { countryLabel, formatConversationDate, formatTime, label, languageName, normalizeText, replyModeLabel, translateSystemMessage } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";
import { ConversationComposer } from "./ConversationComposer.js";
import { ConversationDetailHeader } from "./ConversationDetailHeader.js";
import { ScriptProgress } from "./ConversationTrainingPanel.js";
import { MessageTimeline } from "./MessageTimeline.js";

type ConversationChatColumnProps = {
  platform: boolean;
  conversation: Conversation;
  messages: ChatMessage[];
  messagesRef: RefObject<HTMLDivElement | null>;
  messagesLoading: boolean;
  messagesError: string;
  error: string;
  statusMessage: string;
  lastOutboundPayload: Record<string, unknown>;
  strictEnabled: unknown;
  flowStep: string;
  scriptFlow: ScriptFlowDetail | null;
  send: { type: string; content: string; url: string; caption: string; fileName: string };
  quickReplies: string[];
  refresh: () => void;
  loadReview: () => Promise<void>;
  loadMessages: (showLoading?: boolean) => Promise<void>;
  onDeleted?: () => Promise<void> | void;
  onSendChange: (send: { type: string; content: string; url: string; caption: string; fileName: string }) => void;
  renderSendAction: (disabled: boolean, children: ReactNode) => ReactNode;
  setError: (value: string) => void;
  setStatusMessage: (value: string) => void;
};

export function ConversationChatColumn({
  platform,
  conversation,
  messages,
  messagesRef,
  messagesLoading,
  messagesError,
  error,
  statusMessage,
  lastOutboundPayload,
  strictEnabled,
  flowStep,
  scriptFlow,
  send,
  quickReplies,
  refresh,
  loadReview,
  loadMessages,
  onDeleted,
  onSendChange,
  renderSendAction,
  setError,
  setStatusMessage
}: ConversationChatColumnProps) {
  return <section className="wechat-chat-column">
    <ConversationDetailHeader
      platform={platform}
      conversation={conversation}
      lastOutboundPayload={lastOutboundPayload}
      flowStep={flowStep}
      strictEnabled={strictEnabled}
      countryLabel={countryLabel}
      languageName={languageName}
      label={label}
      replyModeLabel={replyModeLabel}
      onHandoffStatusChange={async (handoffStatus) => {
        setError("");
        setStatusMessage("正在更新接管状态...");
        await api(`/api/merchant/handoffs/${conversation.id}`, { method: "PATCH", body: JSON.stringify({ handoffStatus }) });
        setStatusMessage("接管状态已更新。");
        await loadReview().catch(() => null);
        refresh();
      }}
      renderDeleteAction={() => <ConfirmActionButton className="danger" busyText="删除中..." title="确认彻底删除会话？" detail="该会话的聊天记录、接管记录和相关状态会一起删除，此操作不可恢复。" confirmText="删除会话" onConfirm={async () => { await api(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}`, { method: "DELETE" }); notify("success", "会话已彻底删除"); await onDeleted?.(); }}>删除会话</ConfirmActionButton>}
    />
    {error && <div className="error" role="alert">{error}</div>}
    {statusMessage && <div className="notice" role="status">{statusMessage}</div>}
    {messagesError && <div className="warning">聊天记录刷新失败：{messagesError}<button className="ghost" onClick={() => void loadMessages(true)}>重新加载</button></div>}
    <div className="chat-window" ref={messagesRef}>
      {messagesLoading ? <div className="empty-state">聊天记录加载中...</div> : messages.length ? <MessageTimeline messages={messages} helpers={{ formatDate: (value) => formatConversationDate(value, conversation.countryCode || conversation.countryName || conversation.countryId), formatTime: (value) => formatTime(value, conversation.countryCode || conversation.countryName || conversation.countryId), label, languageName, normalizeText, replyModeLabel, translateSystemMessage }} /> : <div className="empty-state">暂无聊天记录</div>}
    </div>
    <ScriptProgress flowStep={flowStep} scriptFlow={scriptFlow} />
    {!platform && <ConversationComposer value={send} onChange={onSendChange} renderSendAction={renderSendAction} quickReplies={quickReplies} />}
  </section>;
}
