import { useState } from "react";

import { api } from "../app/api.js";
import type { A2CAccount, Conversation } from "../types.js";
import { AsyncButton } from "../ui/components.js";
import { countryLabel } from "../ui/formatters.js";
import { ConversationComposer } from "./ConversationComposer.js";

export function ProactiveConversationDetail({
  account,
  target,
  onCreated,
}: {
  account: A2CAccount;
  target: { customerPhone: string; nickname: string };
  onCreated: (conversation: Conversation) => Promise<void>;
}) {
  const [send, setSend] = useState({ type: "text", content: "", url: "", caption: "", fileName: "" });
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");

  return <div className="conversation-detail proactive-chat">
    <div className="chat-header">
      <div><h3>{target.customerPhone}</h3><p>通过客服账号 {account.verifiedName || account.apiPhone} 主动发送</p></div>
      <span className="status-pill neutral">{countryLabel(account.countryName)}</span>
    </div>
    {error && <div className="error" role="alert">{error}</div>}
    {statusMessage && <div className="notice" role="status">{statusMessage}</div>}
    <div className="empty-chat compact"><h3>新对话</h3><p>发送第一条消息后，系统会自动创建客户档案和会话记录。</p></div>
    <ConversationComposer value={send} onChange={setSend} renderSendAction={(disabled, children) => <AsyncButton disabled={disabled} busyText="发送中..." onClick={async () => {
      setError("");
      setStatusMessage("");
      try {
        const res = await api<{ conversation: Conversation }>(`/api/merchant/a2c/accounts/${encodeURIComponent(account.apiPhone)}/send`, { method: "POST", body: JSON.stringify({ ...send, customerPhone: target.customerPhone, nickname: target.nickname }) });
        setStatusMessage("消息已发送，会话已创建。");
        await onCreated(res.conversation);
      } catch (err) {
        setError(err instanceof Error ? err.message : "发送失败");
      }
    }}>{children}</AsyncButton>} />
  </div>;
}
