import { useEffect, useState } from "react";

import { api, loadRows, useRows } from "../app/api.js";
import type { A2CAccount, ConfigCheck, Merchant, MerchantCountry } from "../types.js";
import { coercePatch } from "../ui/form.js";
import { languageName, translateSystemMessage } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";
import type { CountryDraft } from "./CountrySettingsCard.js";
import { applyCountryNameInference, buildA2CWebhookUrl, buildA2CSyncMessage, buildConfigSavedMessage, configEndpoints, countryToDraft, DEFAULT_COUNTRY_DRAFT, reinferCountryDraft } from "./configModel.js";
import type { ConfigForm } from "./types.js";

export function useConfigController({ platform }: { platform: boolean }) {
  const [merchants] = useRows<Merchant>(platform ? "/api/admin/merchants" : "");
  const [merchantId, setMerchantId] = useState("default");
  const [form, setForm] = useState<ConfigForm>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [a2cAccounts, setA2CAccounts] = useState<A2CAccount[]>([]);
  const [countries, setCountries] = useState<MerchantCountry[]>([]);
  const [countryDraft, setCountryDraft] = useState<CountryDraft>(DEFAULT_COUNTRY_DRAFT);
  const { configUrl, countriesUrl, a2cAccountsUrl, a2cSyncUrl, checkUrl, telegramSetupUrl, registrationTutorialImageUrl } = configEndpoints(platform, merchantId);
  const a2cWebhookUrl = buildA2CWebhookUrl(window.location.origin, platform, merchantId, form);
  const [checks, setChecks] = useState<ConfigCheck[]>([]);
  const [tutorialImageFile, setTutorialImageFile] = useState<File | null>(null);
  const reloadConfig = async () => setForm(await api<ConfigForm>(configUrl));

  useEffect(() => { reloadConfig().catch(() => null); }, [configUrl]);
  useEffect(() => { loadRows<MerchantCountry>(countriesUrl).then(setCountries).catch(() => setCountries([])); }, [countriesUrl]);
  useEffect(() => { loadRows<A2CAccount>(a2cAccountsUrl).then(setA2CAccounts).catch(() => setA2CAccounts([])); }, [a2cAccountsUrl]);
  useEffect(() => { setChecks([]); }, [merchantId]);

  const applyCountryDraft = (country: MerchantCountry) => {
    setCountryDraft(countryToDraft(country));
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
    const response = await fetch(registrationTutorialImageUrl, { method: "POST", body });
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
      const saved = await api<ConfigForm>(configUrl, { method: "PATCH", body: JSON.stringify(form) });
      setForm(saved);
      setMessage(buildConfigSavedMessage(saved));
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存配置失败");
    }
  };
  const syncA2CAccounts = async (skipSave = false) => {
    setMessage("");
    setError("");
    try {
      if (!skipSave) await api(configUrl, { method: "PATCH", body: JSON.stringify(form) });
      const result = await api<{ imported: number; rows: A2CAccount[]; config: ConfigForm; stale?: boolean; warning?: string }>(a2cSyncUrl, { method: "POST" });
      setA2CAccounts(result.rows);
      setForm(result.config);
      setMessage(buildA2CSyncMessage(result));
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
    setCountryDraft(applyCountryNameInference(countryDraft, value));
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
    const nextDraft = reinferCountryDraft(countryDraft);
    setCountryDraft(nextDraft);
    notify("success", "已重新识别", `${countryDraft.name || "当前国家"}：${nextDraft.code} / ${languageName(nextDraft.defaultLanguage)}`);
  };
  const setupTelegram = async () => {
    setMessage("");
    setError("");
    try {
      await api(configUrl, { method: "PATCH", body: JSON.stringify(form) });
      const result = await api<{ config: ConfigForm; webhookUrl?: string }>(telegramSetupUrl, { method: "POST" });
      setForm(result.config);
      setMessage(`TG绑定已开启${result.webhookUrl ? `：${result.webhookUrl}` : ""}。请把机器人拉进唯一接管群，并在群里发送 /bind；发送后点“刷新TG状态”。`);
      window.setTimeout(() => reloadConfig().catch(() => null), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "TG 绑定失败");
    }
  };
  const refreshTelegramStatus = async () => {
    setError("");
    setMessage("正在刷新TG状态...");
    await reloadConfig();
    setMessage("TG状态已刷新。");
    notify("success", "TG 状态已刷新");
  };
  const onWebhookCopied = () => {
    setMessage("Webhook 地址已复制。");
  };

  return {
    a2cAccounts,
    a2cWebhookUrl,
    checks,
    countries,
    countryDraft,
    error,
    form,
    loadCountryDraft,
    merchantId,
    merchants,
    message,
    onWebhookCopied,
    refreshTelegramStatus,
    reInferCountryDraft,
    runConfigCheck,
    saveConfig,
    saveCountry,
    setForm,
    setMerchantId,
    setTutorialImageFile,
    setupTelegram,
    syncA2CAccounts,
    toggleA2CAccount,
    tutorialImageFile,
    updateCountryDraft,
    uploadTutorialImage
  };
}
