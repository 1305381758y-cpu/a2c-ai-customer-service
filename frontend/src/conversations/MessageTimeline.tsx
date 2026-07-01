import React from "react";
import type { ChatMessage } from "../types.js";

type MessageTimelineHelpers = {
  formatDate: (value: string) => string;
  formatTime: (value: string) => string;
  label: (key: string) => string;
  languageName: (code: unknown) => string;
  normalizeText: (value: string) => string;
  replyModeLabel: (mode?: string) => string;
  translateSystemMessage: (message: unknown) => string;
};

export function MessageTimeline({ messages, helpers }: { messages: ChatMessage[]; helpers: MessageTimelineHelpers }) {
  let lastLabel = "";
  return <>
    {messages.map((message, index) => {
      const dateLabel = helpers.formatDate(message.createdAt);
      const showDate = dateLabel && dateLabel !== lastLabel;
      lastLabel = dateLabel || lastLabel;
      return <React.Fragment key={`${message.id || message.createdAt}-${index}`}>
        {showDate && <div className="chat-date-divider">{dateLabel}</div>}
        <ChatBubble message={message} helpers={helpers} />
      </React.Fragment>;
    })}
  </>;
}

function ChatBubble({ message, helpers }: { message: ChatMessage; helpers: MessageTimelineHelpers }) {
  const payload = message.rawPayload || {};
  const original = payload.originalContent || "";
  const translated = payload.translatedContent || "";
  const operatorTranslated = payload.operatorTranslatedContent || "";
  const translationStatus = payload.translationStatus || (original && translated && helpers.normalizeText(original) !== helpers.normalizeText(translated) ? "translated" : undefined);
  const canShowTranslation = Boolean(original && translated && translationStatus === "translated" && helpers.normalizeText(original) !== helpers.normalizeText(translated));
  const translationIssue = original && !canShowTranslation ? payload.translationError || (translationStatus === "skipped" ? "无需翻译或翻译配置未完成" : "译文未生成，请先检查 AI 供应商配置") : "";
  const isOutbound = message.direction === "outbound";
  const operatorTranslationStatus = payload.operatorTranslationStatus || (operatorTranslated && helpers.normalizeText(operatorTranslated) !== helpers.normalizeText(message.content) ? "translated" : undefined);
  const canShowOperatorTranslation = Boolean(isOutbound && operatorTranslated && operatorTranslationStatus === "translated" && helpers.normalizeText(operatorTranslated) !== helpers.normalizeText(message.content));
  const operatorTranslationIssue = isOutbound && payload.operatorTranslationError && !canShowOperatorTranslation ? payload.operatorTranslationError : "";
  const sendIssue = isOutbound && payload.a2cSendStatus === "failed" ? `A2C发送失败：${helpers.translateSystemMessage(payload.a2cSendError || "未知错误")}` : "";
  const mediaUrl = mediaUrlFromMessage(message);
  return <article className={`chat-bubble ${message.direction}`}>
    <div className="bubble-meta"><span>{isOutbound ? "客服" : "客户"}</span><time>{helpers.formatTime(message.createdAt)}</time></div>
    {mediaUrl ? <MediaPreview type={message.msgType} url={mediaUrl} caption={message.content} /> : original ? <div className="translation-block">
      <strong>{isOutbound ? "客服原文" : "客户原文"}</strong>
      <p>{original}</p>
      {canShowTranslation ? <><strong>{isOutbound ? "发送译文" : "中文译文"}{payload.targetLanguage ? ` · ${helpers.languageName(payload.targetLanguage)}` : ""}</strong><p>{translated}</p></> : !isOutbound && <div className="translation-warning">{helpers.translateSystemMessage(translationIssue)}</div>}
      {canShowOperatorTranslation && <><strong>中文译文 · {helpers.languageName(payload.operatorTranslationTargetLanguage || "zh-CN")}</strong><p>{operatorTranslated}</p></>}
      {operatorTranslationIssue && <div className="translation-warning">{helpers.translateSystemMessage(operatorTranslationIssue)}</div>}
    </div> : <div className="translation-block">
      <strong>{isOutbound ? "发送原文" : "消息内容"}</strong>
      <p>{message.content}</p>
      {canShowOperatorTranslation && <><strong>中文译文 · {helpers.languageName(payload.operatorTranslationTargetLanguage || "zh-CN")}</strong><p>{operatorTranslated}</p></>}
      {operatorTranslationIssue && <div className="translation-warning">{helpers.translateSystemMessage(operatorTranslationIssue)}</div>}
    </div>}
    {sendIssue && <div className="translation-warning">{sendIssue}</div>}
    {isOutbound && <div className="message-diagnostics">
      <span>{helpers.replyModeLabel(payload.replyMode)}</span>
      {payload.strictFlowStep && <span>{helpers.label(payload.strictFlowStep)}</span>}
      {payload.strictFlowEnabled === true && <span>严格流程</span>}
    </div>}
    <small>{helpers.label(message.intent)} · {helpers.languageName(message.language)}</small>
  </article>;
}

function MediaPreview({ type, url, caption }: { type: string; url: string; caption: string }) {
  if (type === "image") return <div className="media-preview"><a href={url} target="_blank" rel="noreferrer"><img src={url} alt={caption && caption !== "[图片]" ? caption : "客户发送的图片"} loading="lazy" /></a>{caption && caption !== "[图片]" && <p>{caption}</p>}</div>;
  if (type === "video") return <div className="media-preview"><video src={url} controls preload="metadata" />{caption && caption !== "[视频]" && <p>{caption}</p>}</div>;
  if (type === "audio") return <div className="media-preview"><audio src={url} controls />{caption && caption !== "[音频]" && <p>{caption}</p>}</div>;
  return <div className="media-preview file-preview"><a href={url} target="_blank" rel="noreferrer">{caption && caption !== "[文件]" ? caption : "打开文件"}</a></div>;
}

function mediaUrlFromMessage(message: ChatMessage) {
  const payload = message.rawPayload || {};
  const nested = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
  const url = String(payload.mediaUrl || payload.url || nested.url || "");
  if (url) return url;
  if (message.msgType !== "text" && /^https?:\/\//i.test(message.content)) return message.content;
  return "";
}
