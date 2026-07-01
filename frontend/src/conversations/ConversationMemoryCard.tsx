import type React from "react";
import type { CustomerMemory } from "../types.js";

type ConversationMemoryCardProps = {
  memory: CustomerMemory | null;
  notes: string;
  localizeSystemText: (value: string) => string;
  onNotesChange: (value: string) => void;
  renderSaveAction: () => React.ReactNode;
};

export function ConversationMemoryCard({
  memory,
  notes,
  localizeSystemText,
  onNotesChange,
  renderSaveAction
}: ConversationMemoryCardProps) {
  return <details className="memory compact-memory">
    <summary>客户记忆文件</summary>
    <p>{localizeSystemText(memory?.summary || "暂无记忆，收到客户消息后会自动生成。")}</p>
    <textarea placeholder="人工备注，会被 AI 作为客户记忆参考" value={notes} onChange={(event) => onNotesChange(event.target.value)} />
    {renderSaveAction()}
  </details>;
}
