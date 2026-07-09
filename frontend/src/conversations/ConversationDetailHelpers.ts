import type { ChatMessage, Conversation } from "../types.js";

export type ConversationSendDraft = {
  type: string;
  content: string;
  url: string;
  caption: string;
  fileName: string;
};

export type ConversationDetailEndpoints = {
  base: string;
  messages: string;
  read: string;
  memory: string;
  review: string;
  send: string;
};

export function conversationDetailEndpoints(platform: boolean, conversationId: string): ConversationDetailEndpoints {
  const base = `${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversationId}`;
  return {
    base,
    messages: `${base}/messages?limit=100`,
    read: `${base}/read`,
    memory: `${base}/memory`,
    review: `${base}/review`,
    send: `${base}/send`
  };
}

export function lastOutboundPayload(messages: ChatMessage[]) {
  return [...messages].reverse().find((item) => item.direction === "outbound")?.rawPayload || {};
}

export function detailFlowStep(conversation: Conversation, payload: ReturnType<typeof lastOutboundPayload>) {
  return conversation.flowStep || payload.strictFlowStep || "未识别";
}

export function resetSentDraft(draft: ConversationSendDraft): ConversationSendDraft {
  return { ...draft, content: "", url: "", caption: "" };
}

export function textSuggestionDraft(draft: ConversationSendDraft, content: string): ConversationSendDraft {
  return { ...draft, type: "text", content, url: "", caption: "智能建议" };
}
