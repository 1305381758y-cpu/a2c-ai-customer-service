import { FileText } from "lucide-react";
import type { Filters } from "../types.js";

export const EXPORT_ALL_FILTERS: Filters = { limit: "50000" };

type ExportFormat = "csv" | "jsonl";

type ExportStartedHandler = (format: ExportFormat) => void;

export function downloadConversationExport(base: string, filters: Filters, format: ExportFormat, onStarted?: ExportStartedHandler) {
  const url = withQuery(base, { ...filters, format });
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  onStarted?.(format);
}

export function ConversationExportBar({
  base,
  allFilters = EXPORT_ALL_FILTERS,
  scopedFilters,
  scopedLabel = "当前筛选",
  compact = false,
  onExportStarted,
}: {
  base: string;
  allFilters?: Filters;
  scopedFilters?: Filters;
  scopedLabel?: string;
  compact?: boolean;
  onExportStarted?: ExportStartedHandler;
}) {
  return <div className={`conversation-export-bar ${compact ? "compact" : ""}`}>
    <div className="conversation-export-copy">
      <strong>对话数据导出</strong>
      <span>导出客户消息、客服回复、译文、意图、流程步骤、发送状态和客户资料。</span>
    </div>
    <div className="conversation-export-actions">
      <button className="export-primary" onClick={() => downloadConversationExport(base, allFilters, "csv", onExportStarted)}><FileText size={15}/>一键导出全部对话</button>
      {scopedFilters && <button onClick={() => downloadConversationExport(base, scopedFilters, "csv", onExportStarted)}><FileText size={15}/>{scopedLabel} CSV</button>}
      <button onClick={() => downloadConversationExport(base, allFilters, "jsonl", onExportStarted)}><FileText size={15}/>全部 JSONL</button>
      {scopedFilters && <button onClick={() => downloadConversationExport(base, scopedFilters, "jsonl", onExportStarted)}><FileText size={15}/>{scopedLabel} JSONL</button>}
    </div>
  </div>;
}

function withQuery(base: string, filters: Filters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "") params.set(key, value);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
