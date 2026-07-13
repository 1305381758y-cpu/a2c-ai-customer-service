import { CheckCircle2, RefreshCw } from "lucide-react";

import type { ConfigCheck } from "../types.js";
import { AsyncButton, ConfirmActionButton } from "../ui/components.js";
import { label } from "../ui/formatters.js";

type ConfigActionBarProps = {
  error: string;
  message: string;
  checks: ConfigCheck[];
  onSave: () => Promise<void>;
  onSyncAccounts?: () => Promise<void>;
  onRunCheck: () => Promise<void>;
};

export function ConfigActionBar({ error, message, checks, onSave, onSyncAccounts, onRunCheck }: ConfigActionBarProps) {
  return <>
    <div className="toolbar sticky-actions">
      <AsyncButton onClick={onSave} busyText="保存中...">保存配置</AsyncButton>
      {onSyncAccounts && <ConfirmActionButton
        title="确认同步 A2C 客服账号？"
        detail="同步会真实请求 A2C 接口。A2C Token 有限频风险，请确认不是连续频繁点击；同步后会刷新本地客服账号列表和接收账号配置。"
        confirmText="同步账号"
        busyText="同步中..."
        onConfirm={onSyncAccounts}
      >
        <RefreshCw size={16} />同步A2C客服账号
      </ConfirmActionButton>}
      <AsyncButton onClick={onRunCheck} busyText="检测中..."><CheckCircle2 size={16} />检测配置</AsyncButton>
    </div>
    {error && <div className="error">{error}</div>}
    {message && <div className="notice">{message}</div>}
    {checks.length > 0 && <div className="config-checks">
      {checks.map((item) => <article key={item.key} className={item.ok ? "ok" : item.status}>
        <strong>{item.label}</strong>
        <span>{label(item.status)}</span>
        <p>{item.detail}</p>
      </article>)}
    </div>}
  </>;
}
