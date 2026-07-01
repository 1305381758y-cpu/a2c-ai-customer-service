import type React from "react";
import { Send } from "lucide-react";

export type MessageDraft = {
  type: string;
  content: string;
  url: string;
  caption: string;
  fileName?: string;
};

const MESSAGE_TYPE_OPTIONS = [
  { value: "text", label: "文本" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
  { value: "document", label: "文件" }
];

export function canSendMessage(input: { type: string; content: string; url: string }) {
  return input.type === "text" ? Boolean(input.content.trim()) : Boolean(input.url.trim());
}

export function ConversationComposer({
  value,
  onChange,
  renderSendAction
}: {
  value: MessageDraft;
  onChange: (value: MessageDraft) => void;
  renderSendAction: (disabled: boolean, children: React.ReactNode) => React.ReactNode;
}) {
  const disabled = !canSendMessage(value);
  return <div className="send chat-composer">
    <select value={value.type} onChange={(event) => onChange({ ...value, type: event.target.value })}>
      {MESSAGE_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
    <input placeholder="客服原文" value={value.content} onChange={(event) => onChange({ ...value, content: event.target.value })} />
    <input placeholder="媒体链接" value={value.url} onChange={(event) => onChange({ ...value, url: event.target.value })} />
    <input placeholder="说明/文件名" value={value.caption} onChange={(event) => onChange({ ...value, caption: event.target.value })} />
    {renderSendAction(disabled, <><Send size={16}/>发送</>)}
  </div>;
}
