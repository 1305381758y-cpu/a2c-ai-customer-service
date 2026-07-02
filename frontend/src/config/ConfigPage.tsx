import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, RefreshCw } from "lucide-react";

import { api, loadRows, useRows } from "../app/api.js";
import type { A2CAccount, ConfigCheck, Merchant, MerchantCountry } from "../types.js";
import { AsyncButton } from "../ui/components.js";
import { coercePatch } from "../ui/form.js";
import { countryLabel, displayValue, inferCountryProfile, label, languageName, translateSystemMessage } from "../ui/formatters.js";
import { Pagination, useClientPagination } from "../ui/Pagination.js";
import { notify } from "../ui/toast.js";
import { A2CAccountCard } from "./A2CAccountCard.js";
import { CountrySettingsCard, type CountryDraft } from "./CountrySettingsCard.js";
import { RegistrationTutorialImageCard } from "./RegistrationTutorialImageCard.js";

export function ConfigPage({ platform }: { platform: boolean }) {
  const [merchants] = useRows<Merchant>(platform ? "/api/admin/merchants" : "");
  const [merchantId, setMerchantId] = useState("default");
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [a2cAccounts, setA2CAccounts] = useState<A2CAccount[]>([]);
  const [countries, setCountries] = useState<MerchantCountry[]>([]);
  const [countryDraft, setCountryDraft] = useState<CountryDraft>({ code: "br", name: "巴西", defaultLanguage: "pt-BR", platformRegisterUrl: "", tgRegisterGuideUrl: "", requirePlatformAccount: "true", requirePhone: "true", requireTelegram: "true", requireWhatsApp: "false" });
  const url = platform ? `/api/admin/merchants/${merchantId}/config` : "/api/merchant/config";
  const countriesUrl = platform ? `/api/admin/merchants/${merchantId}/countries` : "/api/merchant/countries";
  const a2cAccountsUrl = platform ? `/api/admin/merchants/${merchantId}/a2c/accounts` : "/api/merchant/a2c/accounts";
  const a2cSyncUrl = platform ? `/api/admin/merchants/${merchantId}/a2c/accounts/sync` : "/api/merchant/a2c/accounts/sync";
  const checkUrl = platform ? `/api/admin/merchants/${merchantId}/config/check` : "/api/merchant/config/check";
  const a2cWebhookUrl = `${window.location.origin}/webhooks/a2c/${platform ? merchantId : String(form.merchantId || "default")}`;
  const [checks, setChecks] = useState<ConfigCheck[]>([]);
  const [tutorialImageFile, setTutorialImageFile] = useState<File | null>(null);
  const [accountKeyword, setAccountKeyword] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [accountCountryId, setAccountCountryId] = useState("");
  const reloadConfig = async () => setForm(await api<Record<string, string | boolean>>(url));
  useEffect(() => { reloadConfig().catch(() => null); }, [url]);
  useEffect(() => { loadRows<MerchantCountry>(countriesUrl).then(setCountries).catch(() => setCountries([])); }, [countriesUrl]);
  useEffect(() => { loadRows<A2CAccount>(a2cAccountsUrl).then(setA2CAccounts).catch(() => setA2CAccounts([])); }, [a2cAccountsUrl]);
  useEffect(() => { setChecks([]); }, [merchantId]);
  const applyCountryDraft = (country: MerchantCountry) => {
    setCountryDraft({
      code: country.code || "default",
      name: country.name || "默认国家",
      defaultLanguage: country.defaultLanguage || "unknown",
      platformRegisterUrl: country.platformRegisterUrl || "",
      tgRegisterGuideUrl: country.tgRegisterGuideUrl || "",
      requirePlatformAccount: String(country.requirePlatformAccount),
      requirePhone: String(country.requirePhone),
      requireTelegram: String(country.requireTelegram),
      requireWhatsApp: String(country.requireWhatsApp)
    });
  };
  useEffect(() => {
    const country = countries[0];
    if (!country) return;
    applyCountryDraft(country);
  }, [countries]);
  const filteredA2CAccounts = useMemo(() => {
    const keyword = accountKeyword.trim().toLowerCase();
    return a2cAccounts.filter((account) => {
      const haystack = [account.apiPhone, account.verifiedName, account.countryName, account.countryCode, account.wabaId].join(" ").toLowerCase();
      if (keyword && !haystack.includes(keyword)) return false;
      if (accountStatus === "enabled" && !account.enabled) return false;
      if (accountStatus === "disabled" && account.enabled) return false;
      if (accountCountryId && account.countryId !== accountCountryId) return false;
      return true;
    });
  }, [a2cAccounts, accountKeyword, accountStatus, accountCountryId]);
  const accountPager = useClientPagination(filteredA2CAccounts, 12);
  const fields = ["a2cBaseUrl", "a2cAppId", "a2cAppSecret", "a2cAccountPhone", "aiProvider", "minimaxApiKey", "minimaxModel", "deepseekApiKey", "deepseekModel", "telegramBotToken", "platformRegisterUrl", "tgRegisterGuideUrl"];
  const reloadCountries = async () => setCountries(await loadRows<MerchantCountry>(countriesUrl));
  const reloadA2CAccounts = async () => {
    setA2CAccounts(await loadRows<A2CAccount>(a2cAccountsUrl));
    accountPager.setPage(1);
  };
  const uploadTutorialImage = async () => {
    if (!tutorialImageFile) return;
    setMessage("");
    setError("");
    const body = new FormData();
    body.append("file", tutorialImageFile);
    const endpoint = platform ? `/api/admin/merchants/${merchantId}/config/registration-tutorial-image` : "/api/merchant/config/registration-tutorial-image";
    const response = await fetch(endpoint, { method: "POST", body });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(translateSystemMessage(payload.message || payload.error || "注册教程图片上传失败"));
    }
    const result = await response.json() as { imageUrl: string; config: Record<string, string | boolean> };
    setForm(result.config);
    setTutorialImageFile(null);
    setMessage("注册教程图片已上传。客户问怎么注册、不会注册、有教程吗时会自动发送这张图片。");
    notify("success", "注册教程图片已保存");
  };
  const runConfigCheck = async () => {
    setError("");
    setMessage("正在检测配置...");
    try {
      const result = await api<{ rows: ConfigCheck[]; checkedAt: string }>(checkUrl);
      setChecks(result.rows);
      setMessage("配置检测完成。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "配置检测失败");
      setMessage("");
    }
  };
  const saveConfig = async () => {
    setMessage("");
    setError("");
    try {
      const saved = await api<Record<string, string | boolean>>(url, { method: "PATCH", body: JSON.stringify(form) });
      setForm(saved);
      if (!saved.a2cAppId || !saved.a2cAppSecret) {
        setMessage("配置已保存。填写 A2C App ID 和密钥后，可手动点击“同步A2C客服账号”。");
        return;
      }
      setMessage("配置已保存。为避免 A2C 认证频繁，保存配置不会自动同步账号；需要刷新客服账号时请手动点击“同步A2C客服账号”。");
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存配置失败");
    }
  };
  const syncA2CAccounts = async (skipSave = false) => {
    setMessage("");
    setError("");
    try {
      if (!skipSave) await api(url, { method: "PATCH", body: JSON.stringify(form) });
      const result = await api<{ imported: number; rows: A2CAccount[]; config: Record<string, string | boolean>; stale?: boolean; warning?: string }>(a2cSyncUrl, { method: "POST" });
      setA2CAccounts(result.rows);
      accountPager.setPage(1);
      setForm(result.config);
      setMessage(result.stale ? result.warning || "A2C 暂时限频，已继续使用本地保存的客服账号。" : `已同步 ${result.imported} 个 A2C 客服账号，已自动写入接收账号。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步 A2C 客服账号失败");
    }
  };
  const toggleA2CAccount = async (row: A2CAccount) => {
    const endpoint = platform ? `/api/admin/a2c/accounts/${row.id}` : `/api/merchant/a2c/accounts/${row.id}`;
    const result = await api<{ config: Record<string, string | boolean> }>(endpoint, { method: "PATCH", body: JSON.stringify({ enabled: !row.enabled }) });
    setForm(result.config);
    await reloadA2CAccounts();
  };
  const saveCountry = async () => {
    const payload = coercePatch(countryDraft);
    await api(countriesUrl, { method: "POST", body: JSON.stringify(payload) });
    await reloadCountries();
    await reloadA2CAccounts();
    notify("success", "国家设置已保存", "所有客服账号会自动归属到这个国家。");
  };
  const updateCountryDraftName = (value: string) => {
    const inferred = inferCountryProfile(value);
    setCountryDraft({ ...countryDraft, name: value, code: inferred.code, defaultLanguage: inferred.defaultLanguage });
  };
  const updateCountryDraft = (draft: CountryDraft) => {
    if (draft.name !== countryDraft.name) {
      updateCountryDraftName(draft.name);
      return;
    }
    setCountryDraft(draft);
  };
  const loadCountryDraft = (country: MerchantCountry) => {
    applyCountryDraft(country);
    notify("success", "已载入国家设置", "修改后点击“保存国家设置”。");
  };
  const reInferCountryDraft = () => {
    const inferred = inferCountryProfile(countryDraft.name);
    setCountryDraft({ ...countryDraft, code: inferred.code, defaultLanguage: inferred.defaultLanguage });
    notify("success", "已重新识别", `${countryDraft.name || "当前国家"}：${inferred.code} / ${languageName(inferred.defaultLanguage)}`);
  };
  const setupTelegram = async () => {
    setMessage("");
    setError("");
    try {
      await api(url, { method: "PATCH", body: JSON.stringify(form) });
      const endpoint = platform ? `/api/admin/merchants/${merchantId}/telegram/setup-webhook` : "/api/merchant/telegram/setup-webhook";
      const result = await api<{ config: Record<string, string | boolean>; webhookUrl?: string }>(endpoint, { method: "POST" });
      setForm(result.config);
      setMessage(`TG绑定已开启${result.webhookUrl ? `：${result.webhookUrl}` : ""}。请把机器人拉进唯一接管群，并在群里发送 /bind；发送后点“刷新TG状态”。`);
      window.setTimeout(() => reloadConfig().catch(() => null), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "TG 绑定失败");
    }
  };
  return <section>
    {platform && <select value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>{merchants.map((m) => <option value={m.id} key={m.id}>{m.name}</option>)}</select>}
    <div className="setup-strip"><div><span>1</span><strong>填写密钥</strong><small>A2C / AI供应商 / TG</small></div><div><span>2</span><strong>设置国家</strong><small>商户单国家</small></div><div><span>3</span><strong>同步账号</strong><small>自动归属国家</small></div><div><span>4</span><strong>接入回调</strong><small>填写 Webhook</small></div></div>
    <div className="memory highlighted"><h3>A2C Webhook地址</h3><p>把这个地址填写到该商户的 A2C Webhook 配置里。</p><div className="copy-row"><label>{label("a2cWebhookUrl")}<input readOnly value={a2cWebhookUrl} onFocus={(e) => e.currentTarget.select()} /></label><AsyncButton onClick={async () => { await navigator.clipboard.writeText(a2cWebhookUrl); setMessage("Webhook 地址已复制。"); notify("success", "已复制 Webhook 地址"); }} busyText="复制中..."><Copy size={16}/>复制</AsyncButton></div></div>
    <div className={`smart-reply-card ${form.smartReplyEnabled === false ? "off" : "on"}`}>
      <div><h3>智能自动回复</h3><p>{form.smartReplyEnabled === false ? "已关闭：系统只接收消息、翻译、更新记忆和触发接管，不会自动回复客户。" : "已开启：客户消息会自动调用 AI，并通过当前 A2C 客服账号回复。"}</p></div>
      <button className={form.smartReplyEnabled === false ? "" : "ghost"} onClick={() => setForm({ ...form, smartReplyEnabled: form.smartReplyEnabled === false })}>{form.smartReplyEnabled === false ? "开启智能回复" : "关闭智能回复"}</button>
    </div>
    <div className={`smart-reply-card ${form.trainingSimulationEnabled ? "on" : "off"}`}>
      <div><h3>模拟训练模式</h3><p>{form.trainingSimulationEnabled ? "已开启：真实 A2C 消息只会进入内部训练并生成记录，不会真实回复客户，也不会通知接管群。" : "已关闭：真实 A2C 消息会按当前配置正常自动回复客户。"}</p></div>
      <button className={form.trainingSimulationEnabled ? "ghost" : ""} onClick={() => setForm({ ...form, trainingSimulationEnabled: !form.trainingSimulationEnabled })}>{form.trainingSimulationEnabled ? "关闭模拟训练" : "开启模拟训练"}</button>
    </div>
    <div className={`smart-reply-card ${form.strictScriptFlowEnabled ? "on" : "off"}`}>
      <div><h3>严格话本流程</h3><p>{form.strictScriptFlowEnabled ? "已开启：客户每回复一次，系统会按话本主动推进到下一步，不会掉到普通自由回复。" : "已关闭：非指定商户可能走普通回复；如要固定按开户注册话本推进，请开启。"}</p></div>
      <button className={form.strictScriptFlowEnabled ? "ghost" : ""} onClick={() => setForm({ ...form, strictScriptFlowEnabled: !form.strictScriptFlowEnabled })}>{form.strictScriptFlowEnabled ? "关闭严格流程" : "开启严格流程"}</button>
    </div>
    <div className="form-grid elevated-form">{fields.map((f) => <label key={f}>{label(f)}{f === "aiProvider" ? <select value={String(form[f] || "minimax")} onChange={(e) => setForm({ ...form, [f]: e.target.value })}><option value="minimax">MiniMax</option><option value="deepseek">DeepSeek</option><option value="gemini">Gemini兼容</option></select> : <input value={form[f] || ""} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />}</label>)}</div>
    <RegistrationTutorialImageCard imageUrl={form.registrationTutorialImageUrl} file={tutorialImageFile} onFileChange={setTutorialImageFile} onUpload={uploadTutorialImage} />
    <div className="toolbar sticky-actions"><AsyncButton onClick={saveConfig} busyText="保存中...">保存配置</AsyncButton><AsyncButton onClick={() => syncA2CAccounts()} busyText="同步中..."><RefreshCw size={16}/>同步A2C客服账号</AsyncButton><AsyncButton onClick={runConfigCheck} busyText="检测中..."><CheckCircle2 size={16}/>检测配置</AsyncButton></div>
    {error && <div className="error">{error}</div>}{message && <div className="notice">{message}</div>}
    {checks.length > 0 && <div className="config-checks">{checks.map((item) => <article key={item.key} className={item.ok ? "ok" : item.status}><strong>{item.label}</strong><span>{label(item.status)}</span><p>{item.detail}</p></article>)}</div>}
    <CountrySettingsCard countries={countries} draft={countryDraft} onDraftChange={updateCountryDraft} onLoadCountry={loadCountryDraft} onReInfer={reInferCountryDraft} onSave={saveCountry} />
    <div className="memory"><div className="account-section-head"><div><h3>A2C客服账号与邀请码池</h3><p>客服账号会自动归属到商户国家。每个客服账号可以绑定多个邀请码，客户注册后邀请码会从可用池里移除。</p></div><span>已保存 {a2cAccounts.length} 个账号</span></div><div className="account-filter-bar"><label>搜索账号<input value={accountKeyword} onChange={(e) => { setAccountKeyword(e.target.value); accountPager.setPage(1); }} placeholder="手机号、名称、WABA ID" /></label><label>状态<select value={accountStatus} onChange={(e) => { setAccountStatus(e.target.value); accountPager.setPage(1); }}><option value="">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label><label>国家<select value={accountCountryId} onChange={(e) => { setAccountCountryId(e.target.value); accountPager.setPage(1); }}><option value="">全部国家</option>{countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}</select></label></div><div className="account-list-meta">当前筛选 {filteredA2CAccounts.length} 个账号，显示第 {(accountPager.page - 1) * accountPager.pageSize + (accountPager.total ? 1 : 0)} - {Math.min(accountPager.page * accountPager.pageSize, accountPager.total)} 个。</div><div className="account-grid">{accountPager.rows.map((row) => <A2CAccountCard key={row.id} account={row} countries={countries} platform={platform} onToggle={() => toggleA2CAccount(row)} />)}{!a2cAccounts.length && <div className="empty-state">填写并保存 A2C 密钥后，点击“同步A2C客服账号”。同步成功后这里会出现每个客服账号的邀请码池。</div>}{a2cAccounts.length > 0 && !filteredA2CAccounts.length && <div className="empty-state">没有符合筛选条件的客服账号，换个手机号、状态或国家试试。</div>}</div><Pagination pager={accountPager} /></div>
    <div className="memory"><h3>TG接管群绑定</h3><p>状态：{displayValue("status", form.telegramHandoffChatStatus || "unbound")} · 群：{form.telegramHandoffChatTitle || form.telegramHandoffChatId || "未绑定"}</p>{form.telegramHandoffChatError && <div className="warning">{form.telegramHandoffChatError}</div>}<div className="toolbar"><AsyncButton onClick={setupTelegram} busyText="设置中...">设置TG绑定</AsyncButton><AsyncButton onClick={async () => { setError(""); setMessage("正在刷新TG状态..."); await reloadConfig(); setMessage("TG状态已刷新。"); notify("success", "TG 状态已刷新"); }} busyText="刷新中..."><RefreshCw size={16}/>刷新TG状态</AsyncButton></div><p>保存 TG机器人 Token 后点击设置绑定，再把机器人拉进唯一接管群并发送 /bind；系统会自动保存群ID。</p></div>
  </section>;
}
