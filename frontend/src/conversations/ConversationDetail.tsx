import { useEffect, useRef, useState } from "react";

import type { ChatMessage, Conversation, ConversationReviewResponse, CustomerMemory } from "../types.js";
import { AsyncButton } from "../ui/components.js";
import { countryLabel, formatConversationDate, formatTime, label, languageName, localizeSystemText, normalizeText, replyModeLabel, translateSystemMessage } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";
import {
  applyConversationReviewItem,
  deleteConversation,
  generateConversationReview,
  loadConversationMessages,
  loadConversationReview,
  loadCustomerMemory,
  markConversationRead,
  saveCustomerMemoryNotes,
  sendConversationMessage,
  updateConversationHandoffStatus
} from "./conversationApi.js";
import { ConversationComposer } from "./ConversationComposer.js";
import { ConversationDetailHeader } from "./ConversationDetailHeader.js";
import { ConversationMemoryCard } from "./ConversationMemoryCard.js";
import { ConversationReviewCard } from "./ConversationReviewCard.js";
import { MessageTimeline } from "./MessageTimeline.js";

export function ConversationDetail({ platform = false, conversation, refresh, onDeleted }: { platform?: boolean; conversation: Conversation; refresh: () => void; onDeleted?: () => Promise<void> | void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [memory, setMemory] = useState<CustomerMemory | null>(null);
  const [review, setReview] = useState<ConversationReviewResponse>({ review: null, items: [] });
  const [notes, setNotes] = useState("");
  const [send, setSend] = useState({ type: "text", content: "", url: "", caption: "", fileName: "" });
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const loadMessages = async () => {
    setMessages(await loadConversationMessages(platform, conversation.id, 100));
  };
  useEffect(() => {
    if (!platform) markConversationRead(conversation.id).then(() => refresh()).catch(() => null);
    loadMessages().catch(() => null);
    const timer = window.setInterval(() => loadMessages().catch(() => null), 3000);
    return () => window.clearInterval(timer);
  }, [conversation.id, platform]);
  useEffect(() => {
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, conversation.id]);
  useEffect(() => { loadCustomerMemory(platform, conversation.id).then((item) => { setMemory(item); setNotes(item.operatorNotes || ""); }).catch(() => { setMemory(null); setNotes(""); }); }, [conversation.id, platform]);
  const loadReview = async () => setReview(await loadConversationReview(platform, conversation.id));
  useEffect(() => { loadReview().catch(() => setReview({ review: null, items: [] })); }, [conversation.id, platform]);
  const lastOutboundPayload = [...messages].reverse().find((item) => item.direction === "outbound")?.rawPayload || {};
  const strictEnabled = lastOutboundPayload.strictFlowEnabled;
  const flowStep = conversation.flowStep || lastOutboundPayload.strictFlowStep || "未识别";
  const generate = async () => {
    setError("");
    setStatusMessage("正在生成对话复盘...");
    await generateConversationReview(platform, conversation.id);
    await loadReview();
    setStatusMessage("对话复盘已生成。");
  };
  const apply = async (itemId: number) => {
    setError("");
    setStatusMessage("正在加入训练中心...");
    await applyConversationReviewItem(conversation.id, itemId);
    await loadReview();
    setStatusMessage("候选内容已加入训练中心。");
    notify("success", "已加入训练中心");
  };
  return <div className="conversation-detail"><ConversationDetailHeader
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
      await updateConversationHandoffStatus(conversation.id, handoffStatus);
      setStatusMessage("接管状态已更新。");
      await loadReview().catch(() => null);
      refresh();
    }}
    renderDeleteAction={() => <AsyncButton className="danger" busyText="删除中..." onClick={async () => { if (!window.confirm("确认彻底删除这个会话？聊天记录和接管记录会一起删除。")) return; await deleteConversation(platform, conversation.id); notify("success", "会话已彻底删除"); await onDeleted?.(); }}>删除会话</AsyncButton>}
  />{error && <div className="error" role="alert">{error}</div>}{statusMessage && <div className="notice" role="status">{statusMessage}</div>}<ConversationMemoryCard
    memory={memory}
    notes={notes}
    localizeSystemText={localizeSystemText}
    onNotesChange={setNotes}
    renderSaveAction={() => <AsyncButton busyText="保存中..." onClick={async () => { setError(""); const item = await saveCustomerMemoryNotes(platform, conversation.id, notes); setMemory(item); setNotes(item.operatorNotes || ""); setStatusMessage("客户记忆已保存。"); }}>保存记忆</AsyncButton>}
  /><ConversationReviewCard platform={platform} data={review} onGenerate={generate} onApply={apply} renderAction={({ children, busyText, onClick }) => <AsyncButton onClick={onClick} busyText={busyText}>{children}</AsyncButton>} /><div className="chat-window" ref={messagesRef}>{messages.length ? <MessageTimeline messages={messages} helpers={{ formatDate: formatConversationDate, formatTime, label, languageName, normalizeText, replyModeLabel, translateSystemMessage }} /> : <div className="empty-state">暂无聊天记录</div>}</div>{!platform && <ConversationComposer value={send} onChange={setSend} renderSendAction={(disabled, children) => <AsyncButton disabled={disabled} busyText="发送中..." onClick={async () => { setError(""); setStatusMessage(""); try { await sendConversationMessage(conversation.id, send); setSend({ ...send, content: "", url: "", caption: "" }); setStatusMessage("消息已发送。"); await loadMessages(); } catch (err) { setError(err instanceof Error ? err.message : "发送失败"); } }}>{children}</AsyncButton>} />}</div>;
}
