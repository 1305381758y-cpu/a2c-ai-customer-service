import React, { useState } from "react";
import { BookOpen, Check, Contact, FileText, Lightbulb, MessageSquare, Sparkles, ThumbsDown, ThumbsUp, Workflow } from "lucide-react";

import { api, loadRows, withQuery } from "../app/api.js";
import type { ChatMessage, Conversation, ConversationReviewItem, ConversationReviewResponse, CustomerMemory, Knowledge, Sample, ScriptFlow, ScriptFlowDetail, ScriptFlowStep } from "../types.js";
import { AsyncButton } from "../ui/components.js";
import { countryLabel, formatDateTime, label, languageName, normalizeText, replyModeLabel } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";
import { ConversationMemoryCard } from "./ConversationMemoryCard.js";
import { ConversationReviewCard } from "./ConversationReviewCard.js";

export async function loadActiveScriptFlow(countryId: string): Promise<ScriptFlowDetail | null> {
  const query = countryId ? { countryId, status: "active" } : { status: "active" };
  const result = await loadRows<ScriptFlow>(withQuery("/api/merchant/script-flows", query));
  const active = result.find((flow) => flow.active) || result[0];
  if (!active && countryId) {
    const fallback = await loadRows<ScriptFlow>(withQuery("/api/merchant/script-flows", { status: "active" }));
    const fallbackActive = fallback.find((flow) => flow.active) || fallback[0];
    return fallbackActive ? api<ScriptFlowDetail>(`/api/merchant/script-flows/${fallbackActive.id}`) : null;
  }
  return active ? api<ScriptFlowDetail>(`/api/merchant/script-flows/${active.id}`) : null;
}

export function currentFlowStep(scriptFlow: ScriptFlowDetail | null, flowStep: string): ScriptFlowStep | null {
  if (!scriptFlow?.steps.length) return null;
  const normalized = normalizeBusinessStep(flowStep);
  return scriptFlow.steps.find((step) => normalizeBusinessStep(step.flowStep) === normalized)
    || scriptFlow.steps.find((step) => normalizeBusinessStep(step.flowCode) === normalized)
    || scriptFlow.steps.find((step) => step.enabled)
    || scriptFlow.steps[0]
    || null;
}

export function buildBusinessQuickReplies(step: ScriptFlowStep | null, samples: Sample[], knowledge: Knowledge[]) {
  const replies: Array<{ label: string; content: string }> = [];
  if (step?.standardReply) replies.push({ label: step.flowName || label(step.flowStep) || "当前话本", content: step.standardReply });
  for (const sample of samples.slice(0, 4)) {
    if (!sample.standardReply) continue;
    replies.push({ label: clipUiText(label(sample.intent) || sample.intent || "样本", 8), content: sample.standardReply });
  }
  for (const item of knowledge.slice(0, 2)) {
    if (!item.content) continue;
    replies.push({ label: clipUiText(item.title || "知识", 8), content: item.content });
  }
  return dedupeQuickReplies(replies).slice(0, 6);
}

function dedupeQuickReplies(rows: Array<{ label: string; content: string }>) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = normalizeText(row.content);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function ScriptProgress({ flowStep, scriptFlow }: { flowStep: string; scriptFlow: ScriptFlowDetail | null }) {
  const runtimeSteps = scriptFlow?.steps.length
    ? scriptFlow.steps.filter((step) => step.enabled).map((step) => [step.flowStep || step.flowCode, step.flowName || step.goal || label(step.flowStep)] as const)
    : STRICT_FLOW_STEP_LABELS;
  const steps = runtimeSteps.length ? runtimeSteps : STRICT_FLOW_STEP_LABELS;
  const activeIndex = Math.max(0, steps.findIndex(([key]) => normalizeBusinessStep(key) === normalizeBusinessStep(flowStep)));
  return <div className="script-progress">
    <div className="script-progress-head"><strong>脚本流程：{scriptFlow?.flow.name || "严格业务流程"}</strong><span>{scriptFlow ? `版本 ${scriptFlow.flow.version}` : "系统内置"}</span></div>
    <div className="script-rail">
      {steps.map(([key, text], index) => <div key={key} className={index <= activeIndex ? "done" : ""}>
        <span>{index < activeIndex ? <Check size={12}/> : index + 1}</span>
        <small>{text}</small>
      </div>)}
    </div>
  </div>;
}

const STRICT_FLOW_STEP_LABELS = [
  ["first_greeting", "首次问候"],
  ["interest_screening", "兴趣筛选"],
  ["project_intro", "项目介绍"],
  ["registration_intent", "确认意向"],
  ["send_register_link", "发送链接"],
  ["wait_registration", "等待注册"],
  ["telegram_confirm", "确认TG"],
  ["telegram_download", "下载TG"],
  ["collect_telegram", "发送TG链接"],
  ["human_handoff", "人工接管"],
  ["ended", "结束"]
] as const;

function normalizeBusinessStep(value: string) {
  return String(value || "").trim().toLowerCase();
}

function clipUiText(value: string, max: number) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function TrainingLoopPanel({
  platform,
  conversation,
  flowStep,
  lastOutboundPayload,
  scriptFlow,
  currentScriptStep,
  trainingSamples,
  knowledgeItems,
  review,
  reviewError,
  memory,
  memoryError,
  contextError,
  notes,
  localizeSystemText,
  onNotesChange,
  saveMemoryAction,
  onGenerate,
  onApply,
  setDraft
}: {
  platform: boolean;
  conversation: Conversation;
  flowStep: string;
  lastOutboundPayload: NonNullable<ChatMessage["rawPayload"]>;
  scriptFlow: ScriptFlowDetail | null;
  currentScriptStep: ScriptFlowStep | null;
  trainingSamples: Sample[];
  knowledgeItems: Knowledge[];
  review: ConversationReviewResponse;
  reviewError: string;
  memory: CustomerMemory | null;
  memoryError: string;
  contextError: string;
  notes: string;
  localizeSystemText: (value: string) => string;
  onNotesChange: (value: string) => void;
  saveMemoryAction: () => React.ReactNode;
  onGenerate: () => Promise<void>;
  onApply: (itemId: number) => Promise<void>;
  setDraft: (content: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"assistant" | "profile" | "ticket" | "history">("assistant");
  const suggestedReply = currentScriptStep?.standardReply
    || trainingSamples.find((sample) => sample.standardReply)?.standardReply
    || firstSuggestedReply(review)
    || "当前节点还没有配置标准回复。可以先生成对话复盘，或到话本流程/训练中心补充样本。";
  const firstKnowledge = knowledgeItems[0];
  const firstSample = trainingSamples[0];
  const firstReviewItem = review.items[0];
  const referencedSamples = lastOutboundPayload.samples?.length || 0;
  const referencedMaterials = lastOutboundPayload.trainingMaterials?.length || 0;
  return <aside className="training-loop-panel">
    <div className="assistant-tabs">
      <button className={activeTab === "assistant" ? "active" : ""} onClick={() => setActiveTab("assistant")}>智能助手</button>
      <button className={activeTab === "profile" ? "active" : ""} onClick={() => setActiveTab("profile")}>客户资料</button>
      <button className={activeTab === "ticket" ? "active" : ""} onClick={() => setActiveTab("ticket")}>工单</button>
      <button className={activeTab === "history" ? "active" : ""} onClick={() => setActiveTab("history")}>历史记录</button>
    </div>
    {activeTab === "assistant" && <>
      {contextError && <div className="warning">业务上下文加载失败：{contextError}</div>}
      <section className="assistant-card ai-reply-card">
        <div className="assistant-card-title"><Sparkles size={17}/><div><h3>智能回复建议</h3><p>基于对话上下文生成</p></div></div>
        <div className="reply-preview">{suggestedReply}</div>
        <div className="runtime-facts">
          <span>回复模式：{replyModeLabel(lastOutboundPayload.replyMode)}</span>
          <span>{lastOutboundPayload.scriptFlowName ? `话本流程：${lastOutboundPayload.scriptFlowName}` : lastOutboundPayload.strictFlowEnabled === true ? "系统流程已启用" : lastOutboundPayload.strictFlowEnabled === false ? "话本流程未启用" : "话本流程待判断"}</span>
          <span>引用样本 {referencedSamples} 条 · 资料 {referencedMaterials} 条</span>
        </div>
        <div className="confidence-row"><span>业务来源 <strong>{currentScriptStep ? "当前话本节点" : firstSample ? "训练样本" : firstReviewItem ? "复盘候选" : "待补充"}</strong></span><button onClick={() => { setDraft(suggestedReply); notify("success", "已填入回复框"); }}>使用回复</button><button className="ghost" onClick={() => { setDraft(suggestedReply); notify("success", "已填入回复框", "请在发送前按客户情况微调。"); }}>微调后使用</button><button className="icon-only ghost" title="回复合适" onClick={() => notify("success", "已记录反馈", "这条建议会作为后续优化参考。")}><ThumbsUp size={16}/></button><button className="icon-only ghost" title="回复不合适" onClick={() => notify("info", "已记录反馈", "建议生成复盘后沉淀为改进样本。")}><ThumbsDown size={16}/></button></div>
      </section>
      <section className="assistant-card">
        <div className="assistant-card-title"><BookOpen size={17}/><div><h3>匹配知识</h3><p>{conversation.countryName ? `${countryLabel(conversation.countryName)} · ${languageName(conversation.language)}` : "当前客户上下文"}</p></div><span className="status-pill ok">{firstKnowledge ? "已匹配" : "待补充"}</span></div>
        <strong>{firstKnowledge?.title || firstReviewItem?.title || "暂无直接匹配知识"}</strong>
        <p>{firstKnowledge?.content || displayReviewItemContent(firstReviewItem) || "当前国家/语言下还没有可展示知识，可从对话复盘生成或到知识库添加。"}</p>
        <small>来源：{firstKnowledge ? "知识库" : firstReviewItem ? "对话复盘" : "未命中"} · 当前阶段 {label(conversation.stage)}</small>
      </section>
      <section className="assistant-card script-guidance">
        <div className="assistant-card-title"><Workflow size={17}/><div><h3>脚本引导</h3><p>{scriptFlow?.flow.name || "系统流程"} · 当前步骤：{label(flowStep)}</p></div></div>
        {scriptGuidanceRows(currentScriptStep).map((item, index) => <div key={`${item}-${index}`} className={index < 3 ? "checked" : ""}><span>{index < 3 ? <Check size={12}/> : index + 1}</span>{item}</div>)}
      </section>
      <section className="assistant-card">
        <div className="assistant-card-title"><FileText size={17}/><div><h3>样本推荐</h3><p>相似场景优秀回复</p></div></div>
        {review.items.slice(0, 2).map((item) => <article key={item.id} className="sample-suggestion">
          <strong>{item.title}</strong>
          <p>{displayReviewItemContent(item)}</p>
          {!platform && item.status !== "applied" && <AsyncButton busyText="加入中..." onClick={() => onApply(item.id)}>引用</AsyncButton>}
        </article>)}
        {!review.items.length && trainingSamples.slice(0, 2).map((sample) => <article key={sample.id} className="sample-suggestion">
          <strong>{label(sample.intent)} · {label(sample.stage)}</strong>
          <p>{sample.standardReply}</p>
          <button className="ghost" onClick={() => { setDraft(sample.standardReply); notify("success", "样本已填入回复框"); }}>引用</button>
        </article>)}
        {!review.items.length && !trainingSamples.length && <article className="sample-suggestion"><strong>暂无样本命中</strong><p>当前阶段还没有训练样本。建议生成复盘或上传真实聊天记录。</p></article>}
      </section>
      <section className="assistant-card">
        <div className="assistant-card-title"><Lightbulb size={17}/><div><h3>训练提升</h3><p>当前对话可沉淀为训练内容</p></div></div>
        <div className="training-actions"><button className="ghost" onClick={() => notify("info", "已标记：不准确", "请点击“一键提升为训练样本”生成复盘候选后再处理。")}>不准确</button><button className="ghost" onClick={() => notify("info", "已标记：不完整", "请点击“一键提升为训练样本”补全复盘候选。")}>不完整</button>{!platform && <AsyncButton busyText="生成中..." onClick={onGenerate}>一键提升为训练样本</AsyncButton>}</div>
        <ConversationReviewCard platform={platform} data={review} error={reviewError} onGenerate={onGenerate} onApply={onApply} renderAction={({ children, busyText, onClick }) => <AsyncButton onClick={onClick} busyText={busyText}>{children}</AsyncButton>} />
      </section>
    </>}
    {activeTab === "profile" && <section className="assistant-card customer-profile-panel">
      <div className="assistant-card-title"><Contact size={17}/><div><h3>客户资料</h3><p>{conversation.nickname || conversation.customerPhone}</p></div><span className="status-pill ok">{label(conversation.status)}</span></div>
      <div className="profile-grid">
        <span>国家</span><strong>{countryLabel(conversation.countryName)}</strong>
        <span>语言</span><strong>{languageName(conversation.language)}</strong>
        <span>阶段</span><strong>{label(conversation.stage)}</strong>
        <span>当前流程</span><strong>{label(flowStep)}</strong>
        <span>客户号码</span><strong>{conversation.customerPhone || "未识别"}</strong>
        <span>客服账号</span><strong>{conversation.a2cAccountPhone || "未绑定"}</strong>
        <span>手机</span><strong>{conversation.extractedPhone || "未识别"}</strong>
        <span>Telegram</span><strong>{conversation.extractedTelegram || "未识别"}</strong>
        <span>WhatsApp</span><strong>{conversation.extractedWhatsApp || "未识别"}</strong>
      </div>
      <ConversationMemoryCard memory={memory} error={memoryError} notes={notes} localizeSystemText={localizeSystemText} onNotesChange={onNotesChange} renderSaveAction={saveMemoryAction} />
    </section>}
    {activeTab === "ticket" && <section className="assistant-card ticket-panel">
      <div className="assistant-card-title"><MessageSquare size={17}/><div><h3>工单</h3><p>当前会话处理状态</p></div><span className="status-pill ok">{label(conversation.handoffStatus)}</span></div>
      <div className="ticket-rows">
        <div><span>会话状态</span><strong>{label(conversation.status)}</strong></div>
        <div><span>接管状态</span><strong>{label(conversation.handoffStatus)}</strong></div>
        <div><span>未读消息</span><strong>{conversation.unreadCount} 条</strong></div>
        <div><span>推荐动作</span><strong>{conversation.handoffStatus === "pending" ? "尽快处理客户问题" : "保持跟进"}</strong></div>
      </div>
      <p>这里保持和现有接管流程一致：状态修改仍通过会话顶部的“待处理 / 处理中 / 已完成”操作完成，避免右侧面板产生第二套状态入口。</p>
    </section>}
    {activeTab === "history" && <section className="assistant-card history-panel">
      <div className="assistant-card-title"><FileText size={17}/><div><h3>历史记录</h3><p>聊天、复盘与训练沉淀</p></div></div>
      <div className="history-list">
        <article><strong>最近聊天</strong><p>{conversation.updatedAt ? formatDateTime(conversation.updatedAt, conversation.countryCode || conversation.countryName || conversation.countryId) : "暂无更新时间"} · 当前聊天窗口展示完整消息时间线</p></article>
        <article><strong>对话复盘</strong><p>{review.review ? `${review.review.score} 分 · ${review.review.summary}` : "未生成复盘"}</p></article>
        <article><strong>训练候选</strong><p>{review.items.length ? `${review.items.length} 条候选内容` : "暂无候选内容"}</p></article>
        <article><strong>运行引用</strong><p>样本 {referencedSamples} 条 · 资料 {referencedMaterials} 条 · 回复模式 {replyModeLabel(lastOutboundPayload.replyMode)}</p></article>
      </div>
    </section>}
  </aside>;
}

function firstSuggestedReply(review: ConversationReviewResponse) {
  const applied = review.items.find((item) => item.itemType === "sample" || item.itemType === "knowledge");
  if (applied?.content) return displayReviewItemContent(applied);
  const good = review.review?.goodReplies?.[0];
  if (good) return good;
  return "";
}

function displayReviewItemContent(item?: ConversationReviewItem) {
  if (!item) return "";
  try {
    const parsed = JSON.parse(item.content) as Record<string, unknown>;
    return String(parsed.standardReply || parsed.reply || parsed.content || parsed.answer || parsed.customerMessage || item.content || "");
  } catch {
    return item.content;
  }
}

function scriptGuidanceRows(step: ScriptFlowStep | null) {
  if (!step) return ["根据当前阶段判断客户问题", "查看最近客服回复与客户资料", "必要时生成复盘沉淀样本", "无法确认时转人工"];
  return [
    step.goal && `目标：${step.goal}`,
    step.triggerCondition && `触发：${step.triggerCondition}`,
    step.collectInfo && `收集：${step.collectInfo}`,
    step.sendLink ? "需要发送开户链接或教程" : "",
    step.sendInvite ? "需要分配或提醒邀请码" : "",
    step.sendTutorialImage ? "需要发送注册教程图片" : "",
    step.nextCondition && `下一步：${step.nextCondition}`,
    step.forbidden && `禁止：${step.forbidden}`
  ].filter(Boolean) as string[];
}
