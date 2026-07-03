import { Copy } from "lucide-react";

import { AsyncButton } from "../ui/components.js";
import { label } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";

const CONFIG_FIELDS = ["a2cBaseUrl", "a2cAppId", "a2cAppSecret", "a2cAccountPhone", "aiProvider", "minimaxApiKey", "minimaxModel", "deepseekApiKey", "deepseekModel", "telegramBotToken", "platformRegisterUrl", "tgRegisterGuideUrl"];

export function ConfigOverviewSection({
  form,
  webhookUrl,
  onFormChange,
  onCopied,
}: {
  form: Record<string, string | boolean>;
  webhookUrl: string;
  onFormChange: (form: Record<string, string | boolean>) => void;
  onCopied: () => void;
}) {
  return <>
    <div className="setup-strip"><div><span>1</span><strong>填写密钥</strong><small>A2C / AI供应商 / TG</small></div><div><span>2</span><strong>设置国家</strong><small>商户单国家</small></div><div><span>3</span><strong>同步账号</strong><small>自动归属国家</small></div><div><span>4</span><strong>接入回调</strong><small>填写 Webhook</small></div></div>
    <div className="memory highlighted"><h3>A2C Webhook地址</h3><p>把这个地址填写到该商户的 A2C Webhook 配置里。</p><div className="copy-row"><label>{label("a2cWebhookUrl")}<input readOnly value={webhookUrl} onFocus={(e) => e.currentTarget.select()} /></label><AsyncButton onClick={async () => { await navigator.clipboard.writeText(webhookUrl); onCopied(); notify("success", "已复制 Webhook 地址"); }} busyText="复制中..."><Copy size={16}/>复制</AsyncButton></div></div>
    <div className={`smart-reply-card ${form.smartReplyEnabled === false ? "off" : "on"}`}>
      <div><h3>智能自动回复</h3><p>{form.smartReplyEnabled === false ? "已关闭：系统只接收消息、翻译、更新记忆和触发接管，不会自动回复客户。" : "已开启：客户消息会自动调用 AI，并通过当前 A2C 客服账号回复。"}</p></div>
      <button className={form.smartReplyEnabled === false ? "" : "ghost"} onClick={() => onFormChange({ ...form, smartReplyEnabled: form.smartReplyEnabled === false })}>{form.smartReplyEnabled === false ? "开启智能回复" : "关闭智能回复"}</button>
    </div>
    <div className={`smart-reply-card ${form.trainingSimulationEnabled ? "on" : "off"}`}>
      <div><h3>模拟训练模式</h3><p>{form.trainingSimulationEnabled ? "已开启：真实 A2C 消息只会进入内部训练并生成记录，不会真实回复客户，也不会通知接管群。" : "已关闭：真实 A2C 消息会按当前配置正常自动回复客户。"}</p></div>
      <button className={form.trainingSimulationEnabled ? "ghost" : ""} onClick={() => onFormChange({ ...form, trainingSimulationEnabled: !form.trainingSimulationEnabled })}>{form.trainingSimulationEnabled ? "关闭模拟训练" : "开启模拟训练"}</button>
    </div>
    <div className={`smart-reply-card ${form.strictScriptFlowEnabled ? "on" : "off"}`}>
      <div><h3>严格话本流程</h3><p>{form.strictScriptFlowEnabled ? "已开启：客户每回复一次，系统会按话本主动推进到下一步，不会掉到普通自由回复。" : "已关闭：非指定商户可能走普通回复；如要固定按开户注册话本推进，请开启。"}</p></div>
      <button className={form.strictScriptFlowEnabled ? "ghost" : ""} onClick={() => onFormChange({ ...form, strictScriptFlowEnabled: !form.strictScriptFlowEnabled })}>{form.strictScriptFlowEnabled ? "关闭严格流程" : "开启严格流程"}</button>
    </div>
    <div className="form-grid elevated-form">{CONFIG_FIELDS.map((field) => <label key={field}>{label(field)}{field === "aiProvider" ? <select value={String(form[field] || "minimax")} onChange={(event) => onFormChange({ ...form, [field]: event.target.value })}><option value="minimax">MiniMax</option><option value="deepseek">DeepSeek</option><option value="gemini">Gemini兼容</option></select> : <input value={form[field] || ""} onChange={(event) => onFormChange({ ...form, [field]: event.target.value })} />}</label>)}</div>
  </>;
}
