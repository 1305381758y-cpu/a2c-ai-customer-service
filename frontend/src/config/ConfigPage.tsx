import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";

import { api, loadRows, useRows } from "../app/api.js";
import type { A2CAccount, ConfigCheck, Merchant, MerchantCountry } from "../types.js";
import { AsyncButton } from "../ui/components.js";
import { coercePatch } from "../ui/form.js";
import { inferCountryProfile, label, languageName, translateSystemMessage } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";
import { A2CAccountsSection } from "./A2CAccountsSection.js";
import { ConfigOverviewSection } from "./ConfigOverviewSection.js";
import { CountrySettingsCard, type CountryDraft } from "./CountrySettingsCard.js";
import { RegistrationTutorialImageCard } from "./RegistrationTutorialImageCard.js";
import { TelegramBindingCard } from "./TelegramBindingCard.js";
import type { ConfigForm } from "./types.js";

export function ConfigPage({ platform }: { platform: boolean }) {
  const [merchants] = useRows<Merchant>(platform ? "/api/admin/merchants" : "");
  const [merchantId, setMerchantId] = useState("default");
  const [form, setForm] = useState<ConfigForm>({});
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
  const reloadConfig = async () => setForm(await api<ConfigForm>(url));
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
  const reloadCountries = async () => setCountries(await loadRows<MerchantCountry>(countriesUrl));
  const reloadA2CAccounts = async () => {
    setA2CAccounts(await loadRows<A2CAccount>(a2cAccountsUrl));
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
    const result = await response.json() as { imageUrl: string; config: ConfigForm };
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
      const saved = await api<ConfigForm>(url, { method: "PATCH", body: JSON.stringify(form) });
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
      const result = await api<{ imported: number; rows: A2CAccount[]; config: ConfigForm; stale?: boolean; warning?: string }>(a2cSyncUrl, { method: "POST" });
      setA2CAccounts(result.rows);
      setForm(result.config);
      setMessage(result.stale ? result.warning || "A2C 暂时限频，已继续使用本地保存的客服账号。" : `已同步 ${result.imported} 个 A2C 客服账号，已自动写入接收账号。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步 A2C 客服账号失败");
    }
  };
  const toggleA2CAccount = async (row: A2CAccount) => {
    const endpoint = platform ? `/api/admin/a2c/accounts/${row.id}` : `/api/merchant/a2c/accounts/${row.id}`;
    const result = await api<{ config: ConfigForm }>(endpoint, { method: "PATCH", body: JSON.stringify({ enabled: !row.enabled }) });
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
      const result = await api<{ config: ConfigForm; webhookUrl?: string }>(endpoint, { method: "POST" });
      setForm(result.config);
      setMessage(`TG绑定已开启${result.webhookUrl ? `：${result.webhookUrl}` : ""}。请把机器人拉进唯一接管群，并在群里发送 /bind；发送后点“刷新TG状态”。`);
      window.setTimeout(() => reloadConfig().catch(() => null), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "TG 绑定失败");
    }
  };
  return <section>
    {platform && <select value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>{merchants.map((m) => <option value={m.id} key={m.id}>{m.name}</option>)}</select>}
    <ConfigOverviewSection form={form} webhookUrl={a2cWebhookUrl} onFormChange={setForm} onCopied={() => setMessage("Webhook 地址已复制。")} />
    <RegistrationTutorialImageCard imageUrl={form.registrationTutorialImageUrl} file={tutorialImageFile} onFileChange={setTutorialImageFile} onUpload={uploadTutorialImage} />
    <div className="toolbar sticky-actions"><AsyncButton onClick={saveConfig} busyText="保存中...">保存配置</AsyncButton><AsyncButton onClick={() => syncA2CAccounts()} busyText="同步中..."><RefreshCw size={16}/>同步A2C客服账号</AsyncButton><AsyncButton onClick={runConfigCheck} busyText="检测中..."><CheckCircle2 size={16}/>检测配置</AsyncButton></div>
    {error && <div className="error">{error}</div>}{message && <div className="notice">{message}</div>}
    {checks.length > 0 && <div className="config-checks">{checks.map((item) => <article key={item.key} className={item.ok ? "ok" : item.status}><strong>{item.label}</strong><span>{label(item.status)}</span><p>{item.detail}</p></article>)}</div>}
    <CountrySettingsCard countries={countries} draft={countryDraft} onDraftChange={updateCountryDraft} onLoadCountry={loadCountryDraft} onReInfer={reInferCountryDraft} onSave={saveCountry} />
    <A2CAccountsSection accounts={a2cAccounts} countries={countries} platform={platform} onToggleAccount={toggleA2CAccount} />
    <TelegramBindingCard form={form} onSetup={setupTelegram} onRefresh={async () => { setError(""); setMessage("正在刷新TG状态..."); await reloadConfig(); setMessage("TG状态已刷新。"); notify("success", "TG 状态已刷新"); }} />
  </section>;
}
