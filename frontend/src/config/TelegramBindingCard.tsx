import { RefreshCw } from "lucide-react";

import type { ConfigForm } from "./types.js";
import { AsyncButton } from "../ui/components.js";
import { displayValue } from "../ui/formatters.js";

type TelegramBindingCardProps = {
  form: ConfigForm;
  onRefresh: () => Promise<void>;
  onSetup: () => Promise<void>;
};

export function TelegramBindingCard({ form, onRefresh, onSetup }: TelegramBindingCardProps) {
  return <div className="memory">
    <h3>TG接管群绑定</h3>
    <p>状态：{displayValue("status", form.telegramHandoffChatStatus || "unbound")} · 群：{form.telegramHandoffChatTitle || form.telegramHandoffChatId || "未绑定"}</p>
    {form.telegramHandoffChatError && <div className="warning">{form.telegramHandoffChatError}</div>}
    <div className="toolbar">
      <AsyncButton onClick={onSetup} busyText="设置中...">设置TG绑定</AsyncButton>
      <AsyncButton onClick={onRefresh} busyText="刷新中..."><RefreshCw size={16}/>刷新TG状态</AsyncButton>
    </div>
    <p>保存 TG机器人 Token 后点击设置绑定，再把机器人拉进唯一接管群并发送 /bind；系统会自动保存群ID。</p>
  </div>;
}
