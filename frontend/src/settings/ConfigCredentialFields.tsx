import { label } from "../ui/formatters.js";

const CONFIG_FIELDS = [
  "a2cBaseUrl",
  "a2cAppId",
  "a2cAppSecret",
  "a2cAccountPhone",
  "aiProvider",
  "minimaxApiKey",
  "minimaxModel",
  "deepseekApiKey",
  "deepseekModel",
  "telegramBotToken",
  "platformRegisterUrl",
  "tgRegisterGuideUrl"
];

type ConfigCredentialFieldsProps = {
  form: Record<string, string | boolean>;
  onChange: (form: Record<string, string | boolean>) => void;
};

export function ConfigCredentialFields({ form, onChange }: ConfigCredentialFieldsProps) {
  return <div className="form-grid elevated-form">{CONFIG_FIELDS.map((field) => <label key={field}>{label(field)}{field === "aiProvider" ? <select value={String(form[field] || "minimax")} onChange={(event) => onChange({ ...form, [field]: event.target.value })}><option value="minimax">MiniMax</option><option value="deepseek">DeepSeek</option><option value="gemini">Gemini兼容</option></select> : <input value={form[field] || ""} onChange={(event) => onChange({ ...form, [field]: event.target.value })} />}</label>)}</div>;
}

export function ConfigSetupSteps() {
  return <div className="setup-strip">
    <div><span>1</span><strong>填写密钥</strong><small>A2C / 智能供应商 / TG</small></div>
    <div><span>2</span><strong>设置国家</strong><small>商户单国家</small></div>
    <div><span>3</span><strong>同步账号</strong><small>自动归属国家</small></div>
    <div><span>4</span><strong>接入回调</strong><small>填写 Webhook</small></div>
  </div>;
}
