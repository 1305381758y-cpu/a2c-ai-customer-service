import { CheckCircle2, RefreshCw } from "lucide-react";

import type { ConfigCheck } from "../types.js";
import { AsyncButton } from "../ui/components.js";
import { label } from "../ui/formatters.js";

type ConfigActionsPanelProps = {
  checks: ConfigCheck[];
  error: string;
  message: string;
  onCheck: () => Promise<void>;
  onSave: () => Promise<void>;
  onSyncA2C: () => Promise<void>;
};

export function ConfigActionsPanel({ checks, error, message, onCheck, onSave, onSyncA2C }: ConfigActionsPanelProps) {
  return <>
    <div className="toolbar sticky-actions">
      <AsyncButton onClick={onSave} busyText="保存中...">保存配置</AsyncButton>
      <AsyncButton onClick={onSyncA2C} busyText="同步中..."><RefreshCw size={16}/>同步A2C客服账号</AsyncButton>
      <AsyncButton onClick={onCheck} busyText="检测中..."><CheckCircle2 size={16}/>检测配置</AsyncButton>
    </div>
    {error && <div className="error">{error}</div>}
    {message && <div className="notice">{message}</div>}
    {checks.length > 0 && <div className="config-checks">{checks.map((item) => <article key={item.key} className={item.ok ? "ok" : item.status}><strong>{item.label}</strong><span>{label(item.status)}</span><p>{item.detail}</p></article>)}</div>}
  </>;
}
