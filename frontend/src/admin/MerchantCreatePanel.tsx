import { Plus } from "lucide-react";

import { AsyncButton } from "../ui/components.js";
import { languageName } from "../ui/formatters.js";

export type MerchantCreateForm = {
  name: string;
  countryCode: string;
  countryName: string;
  defaultLanguage: string;
  platformRegisterUrl: string;
  tgRegisterGuideUrl: string;
  requirePlatformAccount: string;
  requirePhone: string;
  requireTelegram: string;
  requireWhatsApp: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
};

type MerchantCreatePanelProps = {
  form: MerchantCreateForm;
  createdLogin: string;
  onCreate: () => Promise<void>;
  onUpdate: (key: keyof MerchantCreateForm, value: string) => void;
  onUpdateCountryName: (value: string) => void;
};

export function MerchantCreatePanel({ form, createdLogin, onCreate, onUpdate, onUpdateCountryName }: MerchantCreatePanelProps) {
  return <div className="merchant-create-panel">
    <div className="panel-heading">
      <div><h3>新增商户开户</h3><p>一次填写商户、国家/市场和商户端管理员账号，创建后商户可直接登录配置。</p></div>
    </div>
    <div className="form-section">
      <h4>商户基础信息</h4>
      <div className="form-grid compact-fields">
        <label>商户名称<input placeholder="例如：阿斯顿" value={form.name} onChange={(e) => onUpdate("name", e.target.value)} /></label>
      </div>
    </div>
    <div className="form-section">
      <h4>国家 / 市场</h4>
      <div className="form-grid compact-fields">
        <label>国家<input list="merchant-country-presets" placeholder="输入或选择国家，例如：巴西" value={form.countryName} onChange={(e) => onUpdateCountryName(e.target.value)} /></label>
        <label>国家代码<input readOnly value={form.countryCode} /></label>
        <label>默认语言<input readOnly value={languageName(form.defaultLanguage)} /></label>
        <label>开户链接<input placeholder="开户链接，可后续在配置页修改" value={form.platformRegisterUrl} onChange={(e) => onUpdate("platformRegisterUrl", e.target.value)} /></label>
        <label>TG注册说明<input placeholder="Telegram 下载或注册说明链接" value={form.tgRegisterGuideUrl} onChange={(e) => onUpdate("tgRegisterGuideUrl", e.target.value)} /></label>
      </div>
      <div className="target-grid">
        {[
          ["requirePlatformAccount", "要求平台开户"],
          ["requirePhone", "要求手机号"],
          ["requireTelegram", "要求Telegram"],
          ["requireWhatsApp", "要求WhatsApp"]
        ].map(([key, text]) => <label key={key}>{text}<select value={form[key as keyof MerchantCreateForm]} onChange={(e) => onUpdate(key as keyof MerchantCreateForm, e.target.value)}><option value="true">需要</option><option value="false">不需要</option></select></label>)}
      </div>
    </div>
    <div className="form-section">
      <h4>商户端登录账号</h4>
      <div className="form-grid compact-fields">
        <label>登录邮箱<input placeholder="merchant@example.com" value={form.adminEmail} onChange={(e) => onUpdate("adminEmail", e.target.value)} /></label>
        <label>管理员姓名<input placeholder="默认用“商户名管理员”" value={form.adminName} onChange={(e) => onUpdate("adminName", e.target.value)} /></label>
        <label>初始密码<input value={form.adminPassword} onChange={(e) => onUpdate("adminPassword", e.target.value)} /></label>
      </div>
    </div>
    <div className="toolbar sticky-actions merchant-create-actions">
      <AsyncButton disabled={!form.name.trim() || Boolean(form.adminEmail.trim()) && form.adminPassword.length < 8} busyText="创建中..." onClick={onCreate}><Plus size={16}/>创建商户</AsyncButton>
      {createdLogin && <span className="success-text">{createdLogin}</span>}
    </div>
  </div>;
}
