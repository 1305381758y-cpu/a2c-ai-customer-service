import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { api, loadRows } from "../app/api.js";
import type { A2CAccount, InviteCode, MerchantCountry } from "../types.js";
import { AsyncButton } from "../ui/components.js";
import { countryLabel, displayValue } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";
import { InviteCodeEditor } from "./InviteCodeEditor.js";

export function A2CAccountCard({ account, countries, platform, onToggle }: { account: A2CAccount; countries: MerchantCountry[]; platform: boolean; onToggle: () => Promise<void> }) {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [draft, setDraft] = useState({ codes: "", registerUrl: "" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const endpoint = platform ? `/api/admin/a2c/accounts/${account.id}/invite-codes` : `/api/merchant/a2c/accounts/${account.id}/invite-codes`;
  const codeEndpoint = platform ? "/api/admin/invite-codes" : "/api/merchant/invite-codes";
  const reload = async () => setCodes(await loadRows<InviteCode>(endpoint));
  useEffect(() => { reload().catch(() => setCodes([])); }, [endpoint]);
  const selectedCode = codes.find((item) => item.id === selectedId) || codes[0] || null;
  useEffect(() => {
    if (!codes.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !codes.some((item) => item.id === selectedId)) setSelectedId(codes[0].id);
  }, [codes, selectedId]);
  const stats = {
    available: codes.filter((item) => item.status === "available").length,
    reserved: codes.filter((item) => item.status === "reserved").length,
    used: codes.filter((item) => item.status === "used").length,
    disabled: codes.filter((item) => item.status === "disabled").length
  };
  return <article className="account-panel">
    <div className="account-panel-head">
      <div><strong>{account.verifiedName || account.apiPhone}</strong><span>{account.apiPhone} · {countryLabel(account.countryName)} · {account.enabled ? "启用" : "停用"}</span></div>
      <AsyncButton busyText="处理中..." onClick={onToggle}>{account.enabled ? "停用账号" : "启用账号"}</AsyncButton>
    </div>
    <div className="account-settings-row">
      <div className="account-country">归属国家：{countryLabel(account.countryName || countries[0]?.name || "默认国家")}</div>
      <div className="invite-stats"><span>可用 {stats.available}</span><span>已分配 {stats.reserved}</span><span>已使用 {stats.used}</span><span>停用 {stats.disabled}</span></div>
    </div>
    <details className="invite-panel">
      <summary>管理邀请码池</summary>
      <div className="invite-console">
        <div className="invite-import">
          <label>批量导入<textarea placeholder="一行一个邀请码；也支持逗号、空格分隔" value={draft.codes} onChange={(e) => setDraft({ ...draft, codes: e.target.value })} /></label>
          <label>注册链接模板<input placeholder="例如 https://example.com/register?code={code}" value={draft.registerUrl} onChange={(e) => setDraft({ ...draft, registerUrl: e.target.value })} /></label>
          <AsyncButton disabled={!draft.codes.trim()} busyText="保存中..." onClick={async () => { const result = await api<{ imported: number; rows: InviteCode[] }>(`${endpoint}/import`, { method: "POST", body: JSON.stringify(draft) }); setCodes(result.rows); setDraft({ codes: "", registerUrl: draft.registerUrl }); notify("success", "邀请码池已保存", `已处理 ${result.imported} 个邀请码`); }}><Plus size={16}/>导入</AsyncButton>
        </div>
        <div className="invite-manager">
          <div className="invite-list">
            <div className="invite-list-head"><span>邀请码</span><span>状态</span><span>客户</span></div>
            {codes.map((code) => <button key={code.id} className={selectedCode?.id === code.id ? "active" : ""} onClick={() => setSelectedId(code.id)}>
              <strong>{code.code}</strong>
              {displayValue("status", code.status)}
              <small>{code.assignedCustomerKey || "未绑定"}</small>
            </button>)}
            {!codes.length && <div className="empty-state compact">暂无邀请码，先在上方批量导入。</div>}
          </div>
          <div className="invite-detail">
            {selectedCode ? <InviteCodeEditor code={selectedCode} endpoint={codeEndpoint} reload={reload} /> : <div className="empty-state compact">选择一个邀请码后可编辑注册链接、状态和删除。</div>}
          </div>
        </div>
      </div>
    </details>
  </article>;
}
