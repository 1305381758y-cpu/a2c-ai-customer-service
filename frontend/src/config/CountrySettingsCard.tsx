import type { MerchantCountry } from "../types.js";
import { AsyncButton, CountryPresetDatalist, Table } from "../ui/components.js";
import { label, languageName } from "../ui/formatters.js";

export type CountryDraft = {
  code: string;
  name: string;
  defaultLanguage: string;
  platformRegisterUrl: string;
  tgRegisterGuideUrl: string;
  requirePlatformAccount: string;
  requirePhone: string;
  requireTelegram: string;
  requireWhatsApp: string;
};

export function CountrySettingsCard({
  countries,
  draft,
  onDraftChange,
  onLoadCountry,
  onReInfer,
  onSave,
}: {
  countries: MerchantCountry[];
  draft: CountryDraft;
  onDraftChange: (draft: CountryDraft) => void;
  onLoadCountry: (country: MerchantCountry) => void;
  onReInfer: () => void;
  onSave: () => Promise<void>;
}) {
  return <div className="memory country-settings-card">
    <div className="section-title-row">
      <div>
        <h3>商户国家/市场</h3>
        <p>商户只需要填写国家，国家代码和默认语言会自动带入。当前版本每个商户只维护一个国家。</p>
      </div>
      {countries[0] && <button type="button" className="ghost" onClick={() => onLoadCountry(countries[0])}>编辑当前国家</button>}
    </div>
    <div className="country-auto-note">国家代码和默认语言由国家名称自动生成，不需要手动填写；例如“玻利维亚”会自动识别为 <strong>bo / 西语</strong>。</div>
    <div className="toolbar wrap country-settings-form">
      <CountryPresetDatalist />
      <label className="inline-field">国家<input list="merchant-country-presets" placeholder="输入或选择国家，例如：玻利维亚" value={draft.name} onChange={(e) => onDraftChange({ ...draft, name: e.target.value })} /></label>
      <label className="inline-field">国家代码<input readOnly value={draft.code} /></label>
      <label className="inline-field">默认语言<input readOnly value={languageName(draft.defaultLanguage)} /></label>
      <button type="button" className="ghost" onClick={onReInfer}>重新识别</button>
      <input placeholder={label("platformRegisterUrl")} value={draft.platformRegisterUrl} onChange={(e) => onDraftChange({ ...draft, platformRegisterUrl: e.target.value })} />
      <input placeholder={label("tgRegisterGuideUrl")} value={draft.tgRegisterGuideUrl} onChange={(e) => onDraftChange({ ...draft, tgRegisterGuideUrl: e.target.value })} />
      <select value={draft.requirePlatformAccount} onChange={(e) => onDraftChange({ ...draft, requirePlatformAccount: e.target.value })}><option value="true">需要开户注册</option><option value="false">不需要开户注册</option></select>
      <select value={draft.requirePhone} onChange={(e) => onDraftChange({ ...draft, requirePhone: e.target.value })}><option value="true">需要手机号</option><option value="false">不需要手机号</option></select>
      <select value={draft.requireTelegram} onChange={(e) => onDraftChange({ ...draft, requireTelegram: e.target.value })}><option value="true">需要TG</option><option value="false">不需要TG</option></select>
      <select value={draft.requireWhatsApp} onChange={(e) => onDraftChange({ ...draft, requireWhatsApp: e.target.value })}><option value="false">不需要WS</option><option value="true">需要WS</option></select>
      <AsyncButton onClick={onSave} busyText="保存中...">保存国家设置</AsyncButton>
    </div>
    <p className="table-helper">点击下方国家行也可以载入编辑。</p>
    <Table rows={countries} columns={["code", "name", "defaultLanguage", "platformRegisterUrl", "tgRegisterGuideUrl", "requirePhone", "requireTelegram", "requireWhatsApp", "status"]} rowKey={(row) => row.id} selectedKey={countries[0]?.id} onRow={onLoadCountry} />
  </div>;
}
