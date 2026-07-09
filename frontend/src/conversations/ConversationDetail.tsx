import React, { useEffect, useRef, useState } from "react";

import { api, loadRows, withQuery } from "../app/api.js";
import type { ChatMessage, Conversation, ConversationReviewResponse, CustomerMemory, Knowledge, Sample, ScriptFlowDetail } from "../types.js";
import { AsyncButton } from "../ui/components.js";
import { localizeSystemText } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";
import { ConversationChatColumn } from "./ConversationChatColumn.js";
import { buildBusinessQuickReplies, currentFlowStep, loadActiveScriptFlow, ScriptProgress, TrainingLoopPanel } from "./ConversationTrainingPanel.js";

export function ConversationDetail({ platform = false, conversation, refresh, onDeleted }: { platform?: boolean; conversation: Conversation; refresh: () => void; onDeleted?: () => Promise<void> | void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [memory, setMemory] = useState<CustomerMemory | null>(null);
  const [review, setReview] = useState<ConversationReviewResponse>({ review: null, items: [] });
  const [scriptFlow, setScriptFlow] = useState<ScriptFlowDetail | null>(null);
  const [trainingSamples, setTrainingSamples] = useState<Sample[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<Knowledge[]>([]);
  const [notes, setNotes] = useState("");
  const [send, setSend] = useState({ type: "text", content: "", url: "", caption: "", fileName: "" });
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [memoryError, setMemoryError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [contextError, setContextError] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const loadMessages = async (showLoading = false) => {
    if (showLoading) setMessagesLoading(true);
    try {
      const res = await api<{ rows: ChatMessage[] }>(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/messages?limit=100`);
      setMessages(res.rows);
      setMessagesError("");
    } catch (err) {
      setMessagesError(err instanceof Error ? err.message : "聊天记录加载失败");
    } finally {
      if (showLoading) setMessagesLoading(false);
    }
  };
  useEffect(() => {
    if (!platform) api(`/api/merchant/conversations/${conversation.id}/read`, { method: "POST" }).then(() => refresh()).catch(() => null);
    void loadMessages(true);
    const timer = window.setInterval(() => void loadMessages(), 3000);
    return () => window.clearInterval(timer);
  }, [conversation.id, platform]);
  useEffect(() => {
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, conversation.id]);
  useEffect(() => {
    setMemoryError("");
    api<CustomerMemory>(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/memory`).then((item) => {
      setMemory(item);
      setNotes(item.operatorNotes || "");
    }).catch((err) => {
      setMemory(null);
      setNotes("");
      setMemoryError(err instanceof Error ? err.message : "客户记忆加载失败");
    });
  }, [conversation.id, platform]);
  const loadReview = async () => {
    setReviewError("");
    try {
      setReview(await api<ConversationReviewResponse>(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/review`));
    } catch (err) {
      setReview({ review: null, items: [] });
      setReviewError(err instanceof Error ? err.message : "对话复盘加载失败");
    }
  };
  useEffect(() => { void loadReview(); }, [conversation.id, platform]);
  useEffect(() => {
    if (platform) {
      setScriptFlow(null);
      setTrainingSamples([]);
      setKnowledgeItems([]);
      return;
    }
    let cancelled = false;
    const loadBusinessContext = async () => {
      setContextError("");
      try {
        const flow = await loadActiveScriptFlow(conversation.countryId).catch(() => null);
        const sampleFilters = {
          countryId: conversation.countryId || "",
          language: conversation.language || "",
          stage: conversation.stage || "",
          enabled: "true"
        };
        const [samplesResult, knowledgeResult] = await Promise.all([
          loadRows<Sample>(withQuery("/api/merchant/training-samples", sampleFilters)),
          loadRows<Knowledge>(withQuery("/api/merchant/knowledge", { countryId: conversation.countryId || "", enabled: "true" }))
        ]);
        if (cancelled) return;
        setScriptFlow(flow);
        setTrainingSamples(samplesResult);
        setKnowledgeItems(knowledgeResult);
      } catch (err) {
        if (cancelled) return;
        setScriptFlow(null);
        setTrainingSamples([]);
        setKnowledgeItems([]);
        setContextError(err instanceof Error ? err.message : "业务上下文加载失败");
      }
    };
    void loadBusinessContext();
    return () => { cancelled = true; };
  }, [conversation.countryId, conversation.stage, conversation.language, platform]);
  const memoryUrl = `${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/memory`;
  const lastOutboundPayload = [...messages].reverse().find((item) => item.direction === "outbound")?.rawPayload || {};
  const strictEnabled = lastOutboundPayload.strictFlowEnabled;
  const flowStep = conversation.flowStep || lastOutboundPayload.strictFlowStep || "未识别";
  const currentScriptStep = currentFlowStep(scriptFlow, flowStep);
  const quickReplies = buildBusinessQuickReplies(currentScriptStep, trainingSamples, knowledgeItems);
  const generate = async () => {
    setError("");
    setStatusMessage("正在生成对话复盘...");
    await api(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/review`, { method: "POST" });
    await loadReview();
    setStatusMessage("对话复盘已生成。");
  };
  const apply = async (itemId: number) => {
    setError("");
    setStatusMessage("正在加入训练中心...");
    await api(`/api/merchant/conversations/${conversation.id}/review/apply`, { method: "POST", body: JSON.stringify({ itemId }) });
    await loadReview();
    setStatusMessage("候选内容已加入训练中心。");
    notify("success", "已加入训练中心");
  };
  const saveMemoryAction = () => <AsyncButton busyText="保存中..." onClick={async () => {
    setError("");
    const item = await api<CustomerMemory>(memoryUrl, { method: "PATCH", body: JSON.stringify({ operatorNotes: notes }) });
    setMemory(item);
    setNotes(item.operatorNotes || "");
    setStatusMessage("客户记忆已保存。");
  }}>保存记忆</AsyncButton>;
  const sendAction = (disabled: boolean, children: React.ReactNode) => <AsyncButton disabled={disabled} busyText="发送中..." onClick={async () => {
    setError("");
    setStatusMessage("");
    try {
      await api(`/api/merchant/conversations/${conversation.id}/send`, { method: "POST", body: JSON.stringify(send) });
      setSend({ ...send, content: "", url: "", caption: "" });
      setStatusMessage("消息已发送。");
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    }
  }}>{children}</AsyncButton>;
  return <div className="conversation-detail wechat-detail">
    <ConversationChatColumn
      platform={platform}
      conversation={conversation}
      messages={messages}
      messagesRef={messagesRef}
      messagesLoading={messagesLoading}
      messagesError={messagesError}
      error={error}
      statusMessage={statusMessage}
      lastOutboundPayload={lastOutboundPayload}
      strictEnabled={strictEnabled}
      flowStep={flowStep}
      scriptFlow={scriptFlow}
      send={send}
      quickReplies={quickReplies}
      refresh={refresh}
      loadReview={loadReview}
      loadMessages={loadMessages}
      onDeleted={onDeleted}
      onSendChange={setSend}
      renderSendAction={sendAction}
      setError={setError}
      setStatusMessage={setStatusMessage}
    />
    <TrainingLoopPanel
      platform={platform}
      conversation={conversation}
      flowStep={flowStep}
      lastOutboundPayload={lastOutboundPayload}
      scriptFlow={scriptFlow}
      currentScriptStep={currentScriptStep}
      trainingSamples={trainingSamples}
      knowledgeItems={knowledgeItems}
      review={review}
      reviewError={reviewError}
      memory={memory}
      memoryError={memoryError}
      contextError={contextError}
      notes={notes}
      localizeSystemText={localizeSystemText}
      onNotesChange={setNotes}
      saveMemoryAction={saveMemoryAction}
      onGenerate={generate}
      onApply={apply}
      setDraft={(content) => setSend({ ...send, type: "text", content, url: "", caption: "智能建议" })}
    />
  </div>;
}
