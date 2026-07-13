import React from "react";
import { History } from "lucide-react";

import type { MerchantConfigVersion } from "../types.js";
import { ConfirmActionButton } from "../ui/components.js";
import { formatDateTime, label } from "../ui/formatters.js";

export function ConfigVersionHistory({ rows, loading, canRestore, platform = false, onRestore }: {
  rows: MerchantConfigVersion[];
  loading: boolean;
  canRestore: boolean;
  platform?: boolean;
  onRestore: (version: MerchantConfigVersion) => Promise<void>;
}) {
  return <details className="config-version-panel">
    <summary><History size={17}/><span><strong>配置版本记录</strong><small>{loading ? "加载中" : rows.length ? `最近 ${rows.length} 个版本` : "保存配置后会自动记录"}</small></span></summary>
    <div className="config-version-list">
      {loading && <div className="empty-state">正在加载配置版本...</div>}
      {!loading && !rows.length && <div className="empty-state">暂无配置版本记录。</div>}
      {!loading && rows.map((version) => <article key={version.id} className="config-version-row">
        <div><strong>版本 {version.version}</strong><span>{version.note || "保存配置"}</span></div>
        <p>{version.changedKeys.length ? version.changedKeys.map(label).join("、") : "未记录变更字段"}</p>
        <small>{version.createdBy || "系统"} · {formatDateTime(version.createdAt)}</small>
        {canRestore && <ConfirmActionButton
          className="ghost"
          busyText="恢复中..."
          title={`确认恢复配置版本 ${version.version}？`}
          detail={platform ? "恢复后，A2C、智能供应商、运行模式、注册链接和TG配置等会回到该版本，并自动生成一条新的恢复记录。请确认不会影响正在服务的真实客户。" : "恢复后，A2C、运行模式、注册链接和TG配置等会回到该版本，并自动生成一条新的恢复记录。请确认不会影响正在服务的真实客户。"}
          confirmText="恢复此版本"
          onConfirm={() => onRestore(version)}
        >恢复</ConfirmActionButton>}
      </article>)}
    </div>
  </details>;
}
