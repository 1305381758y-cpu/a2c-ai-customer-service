import { Check } from "lucide-react";

import { api, loadRows, withQuery } from "../app/api.js";
import type { ConversationReviewItem, ConversationReviewResponse, Knowledge, Sample, ScriptFlow, ScriptFlowDetail, ScriptFlowStep } from "../types.js";
import { label, normalizeText } from "../ui/formatters.js";

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

export function ScriptProgress({ flowStep, scriptFlow }: { flowStep: string; scriptFlow: ScriptFlowDetail | null }) {
  const runtimeSteps = scriptFlow?.steps.length
    ? scriptFlow.steps.filter((step) => step.enabled).map((step) => [step.flowStep || step.flowCode, step.flowName || step.goal || label(step.flowStep)] as const)
    : STRICT_FLOW_STEP_LABELS;
  const steps = runtimeSteps.length ? runtimeSteps : STRICT_FLOW_STEP_LABELS;
  const activeIndex = Math.max(0, steps.findIndex(([key]) => normalizeBusinessStep(key) === normalizeBusinessStep(flowStep)));
  const currentText = steps[activeIndex]?.[1] || label(flowStep);
  return <details className="script-progress">
    <summary className="script-progress-head"><strong>流程：{currentText}</strong><span>{steps.length} 步 · {scriptFlow ? `版本 ${scriptFlow.flow.version}` : "系统内置"}</span></summary>
    <div className="script-rail" aria-label="流程节点">
      {steps.map(([key, text], index) => <div key={key} className={index <= activeIndex ? "done" : ""}>
        <span>{index < activeIndex ? <Check size={12}/> : index + 1}</span>
        <small>{text}</small>
      </div>)}
    </div>
  </details>;
}

export function firstSuggestedReply(review: ConversationReviewResponse) {
  const applied = review.items.find((item) => item.itemType === "sample" || item.itemType === "knowledge");
  if (applied?.content) return displayReviewItemContent(applied);
  const good = review.review?.goodReplies?.[0];
  if (good) return good;
  return "";
}

export function displayReviewItemContent(item?: ConversationReviewItem) {
  if (!item) return "";
  try {
    const parsed = JSON.parse(item.content) as Record<string, unknown>;
    return String(parsed.standardReply || parsed.reply || parsed.content || parsed.answer || parsed.customerMessage || item.content || "");
  } catch {
    return item.content;
  }
}

export function scriptGuidanceRows(step: ScriptFlowStep | null) {
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

function dedupeQuickReplies(rows: Array<{ label: string; content: string }>) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = normalizeText(row.content);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeBusinessStep(value: string) {
  return String(value || "").trim().toLowerCase();
}

function clipUiText(value: string, max: number) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
