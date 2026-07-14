import { label } from "../ui/formatters.js";

export type ConfigCredentialGroup = "a2c" | "ai" | "telegram" | "fallback";

const CONFIG_FIELDS: Record<ConfigCredentialGroup, string[]> = {
  a2c: ["a2cBaseUrl", "a2cAppId", "a2cAppSecret", "a2cAccountPhone", "a2cWebhookVerifyToken"],
  ai: ["aiProvider"],
  telegram: ["telegramBotToken"],
  fallback: ["platformRegisterUrl", "tgRegisterGuideUrl"]
};

const SECRET_FIELDS = new Set(["a2cAppSecret", "a2cWebhookVerifyToken", "minimaxApiKey", "deepseekApiKey", "googleAiApiKey", "telegramBotToken"]);

type ConfigCredentialFieldsProps = {
  form: Record<string, string | boolean>;
  onChange: (form: Record<string, string | boolean>) => void;
  group: ConfigCredentialGroup;
};

export function ConfigCredentialFields({ form, onChange, group }: ConfigCredentialFieldsProps) {
  const fields = configFieldsForGroup(group, String(form.aiProvider || "minimax"));
  return <div className="form-grid elevated-form settings-credential-grid">{fields.map((field) => <label key={field}>{label(field)}{field === "aiProvider" ? <select value={String(form[field] || "minimax")} onChange={(event) => onChange({ ...form, [field]: event.target.value })}><option value="minimax">MiniMax</option><option value="deepseek">DeepSeek</option><option value="gemini">Gemini兼容</option></select> : <input required={field === "a2cWebhookVerifyToken"} placeholder={field === "a2cWebhookVerifyToken" ? "A2C后台填写的验证 Token" : undefined} type={SECRET_FIELDS.has(field) ? "password" : "text"} autoComplete={SECRET_FIELDS.has(field) ? "new-password" : undefined} value={String(form[field] || "")} onChange={(event) => onChange({ ...form, [field]: event.target.value })} />}</label>)}</div>;
}

export function configFieldsForGroup(group: ConfigCredentialGroup, provider = "minimax"): string[] {
  if (group !== "ai") return CONFIG_FIELDS[group];
  if (provider === "deepseek") return ["aiProvider", "deepseekApiKey", "deepseekModel"];
  if (provider === "gemini") return ["aiProvider", "googleAiApiKey", "googleAiModel"];
  return ["aiProvider", "minimaxApiKey", "minimaxModel"];
}

export function ConfigSetupSteps({ platform }: { platform: boolean }) {
  return <div className="setup-strip">
    <div><span>1</span><strong>填写接入信息</strong><small>{platform ? "结算 / TG" : "A2C / TG"}</small></div>
    <div><span>2</span><strong>设置国家</strong><small>商户单国家</small></div>
    <div><span>3</span><strong>同步账号</strong><small>自动归属国家</small></div>
    <div><span>4</span><strong>接入回调</strong><small>填写 Webhook</small></div>
  </div>;
}
