import { Copy, Upload } from "lucide-react";

import type { MerchantCountry, TeacherTgLink } from "../types.js";
import { AsyncButton, ConfirmActionButton, CountryPresetDatalist, Table } from "../ui/components.js";
import { countryLabel, displayValue, label, languageName } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";
import { TeacherTgLinksPanel } from "./TeacherTgLinksPanel.js";

type ConfigForm = Record<string, string | boolean>;
type ConfigFlagKey = "smartReplyEnabled" | "trainingSimulationEnabled" | "strictScriptFlowEnabled";
type CountryDraft = {
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

export function ConfigSwitchCards({ form, saveConfigFlag }: { form: ConfigForm; saveConfigFlag: (key: ConfigFlagKey, value: boolean, successMessage: string) => Promise<void> }) {
  return <>
    <div className={`smart-reply-card ${form.smartReplyEnabled === false ? "off" : "on"}`}>
      <div><h3>智能自动回复</h3><p>{form.smartReplyEnabled === false ? "已关闭：系统只接收消息、翻译、更新记忆和触发接管，不会自动回复客户。" : "已开启：客户消息会自动调用智能服务，并通过当前 A2C 客服账号回复。"}</p></div>
      <ConfirmActionButton className={form.smartReplyEnabled === false ? "" : "ghost"} busyText="保存中..." title={form.smartReplyEnabled === false ? "确认开启智能回复？" : "确认关闭智能回复？"} detail={form.smartReplyEnabled === false ? "开启后，真实客户消息会按当前 A2C 客服账号自动回复。请确认 A2C、智能供应商、话本和邀请码配置都已正确。" : "关闭后，系统仍会接收客户消息和更新记录，但不会自动回复真实客户。"} confirmText={form.smartReplyEnabled === false ? "开启智能回复" : "关闭智能回复"} onConfirm={() => saveConfigFlag("smartReplyEnabled", form.smartReplyEnabled === false, form.smartReplyEnabled === false ? "智能回复已开启" : "智能回复已关闭")}>{form.smartReplyEnabled === false ? "开启智能回复" : "关闭智能回复"}</ConfirmActionButton>
    </div>
    <div className={`smart-reply-card ${form.trainingSimulationEnabled ? "on" : "off"}`}>
      <div><h3>模拟训练模式</h3><p>{form.trainingSimulationEnabled ? "已开启：真实 A2C 消息只会进入内部训练并生成记录，不会真实回复客户，也不会通知接管群。" : "已关闭：真实 A2C 消息会按当前配置正常自动回复客户。"}</p></div>
      <ConfirmActionButton className={form.trainingSimulationEnabled ? "ghost" : ""} busyText="保存中..." title={form.trainingSimulationEnabled ? "确认关闭模拟训练？" : "确认开启模拟训练？"} detail={form.trainingSimulationEnabled ? "关闭后，真实 A2C 消息会恢复按当前配置自动回复客户。请确认线上配置已经准备好。" : "开启后，真实 A2C 消息只进入内部训练，不会真实回复客户，也不会通知接管群。适合测试前排查流程。"} confirmText={form.trainingSimulationEnabled ? "关闭模拟训练" : "开启模拟训练"} onConfirm={() => saveConfigFlag("trainingSimulationEnabled", !form.trainingSimulationEnabled, form.trainingSimulationEnabled ? "模拟训练已关闭" : "模拟训练已开启")}>{form.trainingSimulationEnabled ? "关闭模拟训练" : "开启模拟训练"}</ConfirmActionButton>
    </div>
    <div className={`smart-reply-card ${form.strictScriptFlowEnabled ? "on" : "off"}`}>
      <div><h3>话本流程</h3><p>{form.strictScriptFlowEnabled ? "已开启：客户每回复一次，系统会按话本主动推进到下一步，不会掉到普通自由回复。" : "已关闭：非指定商户可能走普通回复；如要固定按开户注册话本推进，请开启。"}</p></div>
      <ConfirmActionButton className={form.strictScriptFlowEnabled ? "ghost" : ""} busyText="保存中..." title={form.strictScriptFlowEnabled ? "确认关闭话本流程？" : "确认开启话本流程？"} detail={form.strictScriptFlowEnabled ? "关闭后，客户可能不再按固定开户注册流程推进，而是走普通回复或兜底逻辑。" : "开启后，客户回复会优先按当前启用话本流程推进。请确认话本流程、注册链接、邀请码和导师 TG 链接配置正确。"} confirmText={form.strictScriptFlowEnabled ? "关闭话本流程" : "开启话本流程"} onConfirm={() => saveConfigFlag("strictScriptFlowEnabled", !form.strictScriptFlowEnabled, form.strictScriptFlowEnabled ? "话本流程已关闭" : "话本流程已开启")}>{form.strictScriptFlowEnabled ? "关闭话本流程" : "开启话本流程"}</ConfirmActionButton>
    </div>
  </>;
}

export function WebhookCopyCard({ a2cWebhookUrl, onCopied }: { a2cWebhookUrl: string; onCopied: () => void }) {
  return <div className="memory highlighted">
    <h3>A2C Webhook地址</h3>
    <p>把这个地址填写到该商户的 A2C Webhook 配置里，并使用上方填写的验证 Token。A2C 会先用 GET 验证地址，验证成功后再推送客户消息。</p>
    <div className="copy-row">
      <label>{label("a2cWebhookUrl")}<input readOnly value={a2cWebhookUrl} onFocus={(e) => e.currentTarget.select()} /></label>
      <AsyncButton onClick={async () => { await navigator.clipboard.writeText(a2cWebhookUrl); onCopied(); notify("success", "已复制 Webhook 地址"); }} busyText="复制中..."><Copy size={16}/>复制</AsyncButton>
    </div>
  </div>;
}

export function TutorialImageUploadCard({ imageUrl, file, onFileChange, onUpload }: { imageUrl: string; file: File | null; onFileChange: (file: File | null) => void; onUpload: () => Promise<void> }) {
  return <div className="memory tutorial-upload-card">
    <div>
      <h3>注册教程图片</h3>
      <p>商户只需要上传图片。客户问“怎么注册”“我不会”“有教程吗”时，系统会自动把这张图发给客户。</p>
    </div>
    <div className="tutorial-upload-layout">
      <div className="tutorial-preview">
        {imageUrl ? <img src={imageUrl} alt="注册教程图片预览" /> : <span>还未上传注册教程图片</span>}
      </div>
      <div className="tutorial-upload-actions">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => onFileChange(event.target.files?.[0] || null)} />
        <AsyncButton disabled={!file} busyText="上传中..." onClick={onUpload}><Upload size={16}/>上传图片</AsyncButton>
        <small>{file ? `已选择：${file.name}` : "支持 PNG、JPG、WEBP、GIF；上传后会替换当前教程图。"}</small>
      </div>
    </div>
  </div>;
}

export function CountryMarketSettingsCard({
  countries,
  countryDraft,
  teacherTgLinks,
  teacherTgDraft,
  teacherTgLinksUrl,
  reloadTeacherTgLinks,
  applyCountryDraft,
  updateCountryDraftName,
  setCountryDraft,
  reInferCountryDraft,
  saveCountry,
  onTeacherTgDraftChange,
  onTeacherTgImport
}: {
  countries: MerchantCountry[];
  countryDraft: CountryDraft;
  teacherTgLinks: TeacherTgLink[];
  teacherTgDraft: { urls: string; priority: string; rotationCount: string };
  teacherTgLinksUrl: string;
  reloadTeacherTgLinks: () => Promise<void>;
  applyCountryDraft: (country: MerchantCountry) => void;
  updateCountryDraftName: (value: string) => void;
  setCountryDraft: (draft: CountryDraft) => void;
  reInferCountryDraft: () => void;
  saveCountry: () => Promise<void>;
  onTeacherTgDraftChange: (draft: { urls: string; priority: string; rotationCount: string }) => void;
  onTeacherTgImport: () => Promise<void>;
}) {
  return <div className="memory country-settings-card">
    <div className="section-title-row">
      <div>
        <h3>商户国家/市场</h3>
        <p>商户只需要填写国家，国家代码和默认语言会自动带入。当前版本每个商户只维护一个国家。</p>
      </div>
      {countries[0] && <button type="button" className="ghost" onClick={() => { applyCountryDraft(countries[0]); notify("success", "已载入当前国家", "修改后点击“保存国家设置”。"); }}>编辑当前国家</button>}
    </div>
    <div className="country-auto-note">国家代码和默认语言由国家名称自动生成，不需要手动填写；例如“玻利维亚”会自动识别为 <strong>bo / 西语</strong>。</div>
    <TeacherTgLinksPanel links={teacherTgLinks} draft={teacherTgDraft} endpoint={teacherTgLinksUrl} reload={reloadTeacherTgLinks} onDraftChange={onTeacherTgDraftChange} onImport={onTeacherTgImport} />
    <div className="toolbar wrap country-settings-form">
      <CountryPresetDatalist />
      <label className="inline-field">国家<input list="merchant-country-presets" placeholder="输入或选择国家，例如：玻利维亚" value={countryDraft.name} onChange={(event) => updateCountryDraftName(event.target.value)} /></label>
      <label className="inline-field">国家代码<input readOnly value={countryDraft.code} /></label>
      <label className="inline-field">默认语言<input readOnly value={languageName(countryDraft.defaultLanguage)} /></label>
      <button type="button" className="ghost" onClick={reInferCountryDraft}>重新识别</button>
      <input placeholder={label("platformRegisterUrl")} value={countryDraft.platformRegisterUrl} onChange={(event) => setCountryDraft({ ...countryDraft, platformRegisterUrl: event.target.value })} />
      <input placeholder={label("tgRegisterGuideUrl")} value={countryDraft.tgRegisterGuideUrl} onChange={(event) => setCountryDraft({ ...countryDraft, tgRegisterGuideUrl: event.target.value })} />
      <select value={countryDraft.requirePlatformAccount} onChange={(event) => setCountryDraft({ ...countryDraft, requirePlatformAccount: event.target.value })}><option value="true">需要开户注册</option><option value="false">不需要开户注册</option></select>
      <select value={countryDraft.requirePhone} onChange={(event) => setCountryDraft({ ...countryDraft, requirePhone: event.target.value })}><option value="true">需要手机号</option><option value="false">不需要手机号</option></select>
      <select value={countryDraft.requireTelegram} onChange={(event) => setCountryDraft({ ...countryDraft, requireTelegram: event.target.value })}><option value="true">需要TG</option><option value="false">不需要TG</option></select>
      <select value={countryDraft.requireWhatsApp} onChange={(event) => setCountryDraft({ ...countryDraft, requireWhatsApp: event.target.value })}><option value="false">不需要WS</option><option value="true">需要WS</option></select>
      <AsyncButton onClick={saveCountry} busyText="保存中...">保存国家设置</AsyncButton>
    </div>
    <p className="table-helper">点击下方国家行也可以载入编辑。</p>
    <Table rows={countries} columns={["code", "name", "defaultLanguage", "platformRegisterUrl", "tgRegisterGuideUrl", "requirePhone", "requireTelegram", "requireWhatsApp", "status"]} rowKey={(row) => row.id} selectedKey={countries[0]?.id} onRow={(row) => { applyCountryDraft(row); notify("success", "已载入国家设置", "修改后点击“保存国家设置”。"); }} />
  </div>;
}

export function TelegramHandoffCard({
  form,
  setupTelegram,
  refreshTelegramStatus
}: {
  form: ConfigForm;
  setupTelegram: () => Promise<void>;
  refreshTelegramStatus: () => Promise<void>;
}) {
  return <div className="memory">
    <h3>TG接管群绑定</h3>
    <p>状态：{displayValue("status", form.telegramHandoffChatStatus || "unbound")} · 群：{form.telegramHandoffChatTitle || form.telegramHandoffChatId || "未绑定"}</p>
    {form.telegramHandoffChatError && <div className="warning">{form.telegramHandoffChatError}</div>}
    <div className="toolbar">
      <AsyncButton onClick={setupTelegram} busyText="设置中...">设置TG绑定</AsyncButton>
      <AsyncButton onClick={refreshTelegramStatus} busyText="刷新中...">刷新TG状态</AsyncButton>
    </div>
    <p>保存 TG机器人 Token 后点击设置绑定，再把机器人拉进唯一接管群并发送 /bind；系统会自动保存群ID。</p>
  </div>;
}
