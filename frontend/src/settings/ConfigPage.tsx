import React, { useEffect, useMemo, useState } from "react";

import { api, loadRows, useRows } from "../app/api.js";
import type { A2CAccount, ConfigCheck, Merchant, MerchantCountry, TeacherTgLink } from "../types.js";
import { A2CAccountsPanel } from "./InviteCodePanel.js";
import { ConfigSwitchCards, CountryMarketSettingsCard, TelegramHandoffCard, TutorialImageUploadCard, WebhookCopyCard } from "./SettingsEditors.js";
import { coercePatch } from "../ui/form.js";
import { inferCountryProfile, languageName, translateSystemMessage } from "../ui/formatters.js";
import { useClientPagination } from "../ui/Pagination.js";
import { notify } from "../ui/toast.js";
import { ConfigActionBar } from "./ConfigActionBar.js";
import { ConfigCredentialFields, ConfigSetupSteps } from "./ConfigCredentialFields.js";
import { DEFAULT_COUNTRY_DRAFT, configA2CAccountPatchEndpoint, configPageEndpoints, configSaveSuccessMessage, configTelegramSetupEndpoint, configTutorialImageEndpoint, configWebhookUrl, countryToDraft, filterA2CAccounts, teacherTgImportPayload } from "./ConfigPageHelpers.js";

export function Config({ platform }: { platform: boolean }) {
  const [merchants] = useRows<Merchant>(platform ? "/api/admin/merchants" : "");
  const [merchantId, setMerchantId] = useState("default");
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [a2cAccounts, setA2CAccounts] = useState<A2CAccount[]>([]);
  const [countries, setCountries] = useState<MerchantCountry[]>([]);
  const [countryDraft, setCountryDraft] = useState(DEFAULT_COUNTRY_DRAFT);
  const [teacherTgLinks, setTeacherTgLinks] = useState<TeacherTgLink[]>([]);
  const [teacherTgDraft, setTeacherTgDraft] = useState({ urls: "", priority: "0", rotationCount: "1" });
  const endpoints = configPageEndpoints(platform, merchantId);
  const a2cWebhookUrl = configWebhookUrl(window.location.origin, platform, merchantId, form);
  const [checks, setChecks] = useState<ConfigCheck[]>([]);
  const [tutorialImageFile, setTutorialImageFile] = useState<File | null>(null);
  const [accountKeyword, setAccountKeyword] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [accountCountryId, setAccountCountryId] = useState("");
  const reloadConfig = async () => setForm(await api<Record<string, string | boolean>>(endpoints.config));
  useEffect(() => {
    reloadConfig().catch((err) => setError(err instanceof Error ? err.message : "配置加载失败"));
  }, [endpoints.config]);
  useEffect(() => {
    loadRows<MerchantCountry>(endpoints.countries).then(setCountries).catch((err) => setError(err instanceof Error ? err.message : "国家设置加载失败"));
  }, [endpoints.countries]);
  useEffect(() => {
    loadRows<A2CAccount>(endpoints.a2cAccounts).then(setA2CAccounts).catch((err) => setError(err instanceof Error ? err.message : "A2C客服账号加载失败"));
  }, [endpoints.a2cAccounts]);
  useEffect(() => {
    loadRows<TeacherTgLink>(endpoints.teacherTgLinks).then(setTeacherTgLinks).catch((err) => setError(err instanceof Error ? err.message : "老师TG链接加载失败"));
  }, [endpoints.teacherTgLinks]);
  useEffect(() => { setChecks([]); }, [merchantId]);
  const applyCountryDraft = (country: MerchantCountry) => setCountryDraft(countryToDraft(country));
  useEffect(() => {
    const country = countries[0];
    if (!country) return;
    applyCountryDraft(country);
  }, [countries]);
  const filteredA2CAccounts = useMemo(() => {
    return filterA2CAccounts(a2cAccounts, { keyword: accountKeyword, status: accountStatus, countryId: accountCountryId });
  }, [a2cAccounts, accountKeyword, accountStatus, accountCountryId]);
  const accountPager = useClientPagination(filteredA2CAccounts, 12);
  const reloadCountries = async () => setCountries(await loadRows<MerchantCountry>(endpoints.countries));
  const reloadTeacherTgLinks = async () => setTeacherTgLinks(await loadRows<TeacherTgLink>(endpoints.teacherTgLinks));
  const reloadA2CAccounts = async () => {
    setA2CAccounts(await loadRows<A2CAccount>(endpoints.a2cAccounts));
    accountPager.setPage(1);
  };
  const uploadTutorialImage = async () => {
    if (!tutorialImageFile) return;
    setMessage("");
    setError("");
    const body = new FormData();
    body.append("file", tutorialImageFile);
    const response = await fetch(configTutorialImageEndpoint(platform, merchantId), { method: "POST", body });
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
      const result = await api<{ rows: ConfigCheck[]; checkedAt: string }>(endpoints.check);
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
      const saved = await api<Record<string, string | boolean>>(endpoints.config, { method: "PATCH", body: JSON.stringify(form) });
      setForm(saved);
      setMessage(configSaveSuccessMessage(saved));
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存配置失败");
    }
  };
  const saveConfigFlag = async (key: "smartReplyEnabled" | "trainingSimulationEnabled" | "strictScriptFlowEnabled", value: boolean, successMessage: string) => {
    setMessage("");
    setError("");
    try {
      const saved = await api<Record<string, string | boolean>>(endpoints.config, { method: "PATCH", body: JSON.stringify({ [key]: value }) });
      setForm(saved);
      setMessage(successMessage);
      notify("success", successMessage);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "保存开关失败";
      setError(detail);
      notify("error", "开关保存失败", detail);
      throw err;
    }
  };
  const syncA2CAccounts = async (skipSave = false) => {
    setMessage("");
    setError("");
    try {
      if (!skipSave) await api(endpoints.config, { method: "PATCH", body: JSON.stringify(form) });
      const result = await api<{ imported: number; rows: A2CAccount[]; config: Record<string, string | boolean>; stale?: boolean; warning?: string }>(endpoints.a2cSync, { method: "POST" });
      setA2CAccounts(result.rows);
      accountPager.setPage(1);
      setForm(result.config);
      setMessage(result.stale ? result.warning || "A2C 暂时限频，已继续使用本地保存的客服账号。" : `已同步 ${result.imported} 个 A2C 客服账号，已自动写入接收账号。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步 A2C 客服账号失败");
    }
  };
  const toggleA2CAccount = async (row: A2CAccount) => {
    const result = await api<{ config: Record<string, string | boolean> }>(configA2CAccountPatchEndpoint(platform, row.id), { method: "PATCH", body: JSON.stringify({ enabled: !row.enabled }) });
    setForm(result.config);
    await reloadA2CAccounts();
  };
  const saveCountry = async () => {
    const payload = coercePatch(countryDraft);
    await api(endpoints.countries, { method: "POST", body: JSON.stringify(payload) });
    await reloadCountries();
    await reloadA2CAccounts();
    notify("success", "国家设置已保存", "所有客服账号会自动归属到这个国家。");
  };
  const importTeacherTelegramLinks = async () => {
    const currentCountry = countries[0];
    if (!currentCountry) throw new Error("请先保存国家设置，再批量设置老师TG链接。");
    if (!teacherTgDraft.urls.trim()) throw new Error("请先填写老师TG链接，一行一条。");
    const result = await api<{ imported: number; rows: TeacherTgLink[] }>(`${endpoints.teacherTgLinks}/import`, {
      method: "POST",
      body: JSON.stringify(teacherTgImportPayload(currentCountry, teacherTgDraft))
    });
    setTeacherTgLinks(result.rows);
    setTeacherTgDraft({ ...teacherTgDraft, urls: "" });
    notify("success", "老师TG链接已导入", `已新增 ${result.imported} 条，后续客户会按优先级和轮询次数自动分配。`);
  };
  const updateCountryDraftName = (value: string) => {
    const inferred = inferCountryProfile(value);
    setCountryDraft({ ...countryDraft, name: value, code: inferred.code, defaultLanguage: inferred.defaultLanguage });
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
      await api(endpoints.config, { method: "PATCH", body: JSON.stringify(form) });
      const result = await api<{ config: Record<string, string | boolean>; webhookUrl?: string }>(configTelegramSetupEndpoint(platform, merchantId), { method: "POST" });
      setForm(result.config);
      setMessage(`TG绑定已开启${result.webhookUrl ? `：${result.webhookUrl}` : ""}。请把机器人拉进唯一接管群，并在群里发送 /bind；发送后点“刷新TG状态”。`);
      window.setTimeout(() => reloadConfig().catch(() => null), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "TG 绑定失败");
    }
  };
  return <section>
    {platform && <select value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>{merchants.map((m) => <option value={m.id} key={m.id}>{m.name}</option>)}</select>}
    <ConfigSetupSteps />
    <WebhookCopyCard a2cWebhookUrl={a2cWebhookUrl} onCopied={() => setMessage("Webhook 地址已复制。")} />
    <ConfigSwitchCards form={form} saveConfigFlag={saveConfigFlag} />
    <ConfigCredentialFields form={form} onChange={setForm} />
    <TutorialImageUploadCard imageUrl={String(form.registrationTutorialImageUrl || "")} file={tutorialImageFile} onFileChange={setTutorialImageFile} onUpload={uploadTutorialImage} />
    <ConfigActionBar error={error} message={message} checks={checks} onSave={saveConfig} onSyncAccounts={() => syncA2CAccounts()} onRunCheck={runConfigCheck} />
    <CountryMarketSettingsCard countries={countries} countryDraft={countryDraft} teacherTgLinks={teacherTgLinks} teacherTgDraft={teacherTgDraft} teacherTgLinksUrl={endpoints.teacherTgLinks} reloadTeacherTgLinks={reloadTeacherTgLinks} applyCountryDraft={applyCountryDraft} updateCountryDraftName={updateCountryDraftName} setCountryDraft={setCountryDraft} reInferCountryDraft={reInferCountryDraft} saveCountry={saveCountry} onTeacherTgDraftChange={setTeacherTgDraft} onTeacherTgImport={importTeacherTelegramLinks} />
    <A2CAccountsPanel accounts={a2cAccounts} filteredAccounts={filteredA2CAccounts} pager={accountPager} countries={countries} platform={platform} accountKeyword={accountKeyword} accountStatus={accountStatus} accountCountryId={accountCountryId} onKeywordChange={(value) => { setAccountKeyword(value); accountPager.setPage(1); }} onStatusChange={(value) => { setAccountStatus(value); accountPager.setPage(1); }} onCountryChange={(value) => { setAccountCountryId(value); accountPager.setPage(1); }} onToggle={toggleA2CAccount} />
    <TelegramHandoffCard form={form} setupTelegram={setupTelegram} refreshTelegramStatus={async () => { setError(""); setMessage("正在刷新TG状态..."); await reloadConfig(); setMessage("TG状态已刷新。"); notify("success", "TG 状态已刷新"); }} />
  </section>;
}
