export interface A2CWebhookPayload {
  id: string;
  timestamp: number;
  type: string;
  data: {
    messageId: string;
    content?: string;
    from: string;
    to: string;
    msgType: string;
    timestamp: number;
    nickname?: string;
    headImg?: string;
    fileName?: string;
    url?: string;
    caption?: string;
  };
}

export type NormalizedMessageType = "text" | "image" | "video" | "audio" | "document";

export interface NormalizedInboundMessage {
  data: A2CWebhookPayload["data"];
  msgType: NormalizedMessageType;
  mediaUrl: string;
  analysisText: string;
  content: string;
  shouldAnalyzeImage: boolean;
}

export function normalizeA2CWebhookPayload(payload: A2CWebhookPayload): NormalizedInboundMessage {
  const data = payload.data;
  const msgType = normalizeMessageType(data.msgType, data.url);
  const mediaUrl = data.url || (isUrl(data.content) ? data.content || "" : "");
  const analysisText = msgType === "text" ? data.content || data.caption || "" : data.caption || "";
  const content = msgType === "text" ? analysisText : data.caption || mediaLabel(msgType);
  return {
    data,
    msgType,
    mediaUrl,
    analysisText,
    content,
    shouldAnalyzeImage: msgType === "image" && Boolean(mediaUrl)
  };
}

export function normalizeMessageType(msgType = "", url = ""): NormalizedMessageType {
  const value = String(msgType || "").toLowerCase();
  if (value === "text" || value === "image" || value === "video" || value === "audio" || value === "document") return value;
  if (value === "1") return "text";
  if (value === "2") return "image";
  if (value === "3") return "video";
  if (value === "4") return "audio";
  if (value === "5") return "document";
  if (/\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(url)) return "image";
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)) return "video";
  if (/\.(mp3|wav|m4a|ogg)(\?|$)/i.test(url)) return "audio";
  if (url) return "document";
  return "text";
}

export function mediaLabel(type: string): string {
  if (type === "image") return "[图片]";
  if (type === "video") return "[视频]";
  if (type === "audio") return "[音频]";
  if (type === "document") return "[文件]";
  return "";
}

function isUrl(value = ""): boolean {
  return /^https?:\/\//i.test(value.trim());
}
