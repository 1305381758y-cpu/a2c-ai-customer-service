import { Search } from "lucide-react";

import type { Filters } from "../types.js";
import { label } from "../ui/formatters.js";

type AiCallFiltersProps = {
  platform: boolean;
  filters: Filters;
  loading: boolean;
  availableProviders: string[];
  availableTaskTypes: string[];
  onChange: (filters: Filters) => void;
  onTaskTypeChange: (taskType: string) => void;
  onReload: () => Promise<void>;
};

export function AiCallFilters({ platform, filters, loading, availableProviders, availableTaskTypes, onChange, onTaskTypeChange, onReload }: AiCallFiltersProps) {
  return <div className="toolbar wrap filters">
    {platform && <input placeholder="商户ID" value={filters.merchantId || ""} onChange={(event) => onChange({ ...filters, merchantId: event.target.value })} />}
    <select aria-label="智能供应商" value={filters.provider || ""} onChange={(event) => onChange({ ...filters, provider: event.target.value })}>
      <option value="">全部供应商</option>
      {availableProviders.map((provider) => <option key={provider} value={provider}>{label(provider)}</option>)}
    </select>
    <select aria-label="调用类型" value={filters.taskType || ""} onChange={(event) => onTaskTypeChange(event.target.value)}>
      <option value="">全部调用类型</option>
      {availableTaskTypes.map((taskType) => <option key={taskType} value={taskType}>{label(taskType)}</option>)}
    </select>
    <select aria-label="调用状态" value={filters.status || ""} onChange={(event) => onChange({ ...filters, status: event.target.value })}>
      <option value="">全部状态</option>
      <option value="success">成功</option>
      <option value="error">失败</option>
    </select>
    <input type="datetime-local" step={1} aria-label="开始时间" placeholder="开始时间" value={filters.startAt || ""} onChange={(event) => onChange({ ...filters, startAt: event.target.value })} />
    <input type="datetime-local" step={1} aria-label="结束时间" placeholder="结束时间" value={filters.endAt || ""} onChange={(event) => onChange({ ...filters, endAt: event.target.value })} />
    <button onClick={() => void onReload()} disabled={loading}><Search size={16} />{loading ? "筛选中..." : "筛选"}</button>
  </div>;
}
