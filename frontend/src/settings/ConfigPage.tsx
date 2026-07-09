import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";

import { api, loadRows, useRows } from "../app/api.js";
import type { A2CAccount, ConfigCheck, Merchant, MerchantCountry, TeacherTgLink } from "../types.js";
import { A2CAccountsPanel } from "./InviteCodePanel.js";
import { ConfigSwitchCards, CountryMarketSettingsCard, TelegramHandoffCard, TutorialImageUploadCard, WebhookCopyCard } from "./SettingsEditors.js";
import { AsyncButton, ConfirmActionButton } from "../ui/components.js";
import { coercePatch } from "../ui/form.js";
import { inferCountryProfile, label, languageName, translateSystemMessage } from "../ui/formatters.js";
import { useClientPagination } from "../ui/Pagination.js";
import { notify } from "../ui/toast.js";

export function Config({ platform }: { platform: boolean }) {
  const [merchants] = useRows<Merchant>(platform ? "/api/admin/merchants" : "");
  const [merchantId, setMerchantId] = useState("default");
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [a2cAccounts, setA2CAccounts] = useState<A2CAccount[]>([]);
  const [countries, setCountries] = useState<MerchantCountry[]>([]);
  const [countryDraft, setCountryDraft] = useState({ code: "br", name: "巴西", defaultLanguage: "pt-BR", platformRegisterUrl: "", tgRegisterGuideUrl: "", requirePlatformAccount: "true", requirePhone: "true", requireTelegram: "true", requireWhatsApp: "false" });
  const [teacherTgLinks, setTeacherTgLinks] = useState<TeacherTgLink[]>([]);
  const [teacherTgDraft, setTeacherTgDraft] = useState({ urls: "", priority: "0", rotationCount: "1" });
  const url = platform ? `/api/admin/merchants/${merchantId}/config` : "/api/merchant/config";
  const countriesUrl = platform ? `/api/admin/merchants/${merchantId}/countries` : "/api/merchant/countries";
  const a2cAccountsUrl = platform ? `/api/admin/merchants/${merchantId}/a2c/accounts` : "/api/merchant/a2c/accounts";
  const a2cSyncUrl = platform ? `/api/admin/merchants/${merchantId}/a2c/accounts/sync` : "/api/merchant/a2c/accounts/sync";
  const teacherTgLinksUrl = platform ? `/api/admin/merchants/${merchantId}/teacher-tg-links` : "/api/merchant/teacher-tg-links";
  const checkUrl = platform ? `/api/admin/merchants/${merchantId}/config/check` : "/api/merchant/config/check";
  const a2cWebhookUrl = `${window.location.origin}/webhooks/a2c/${platform ? merchantId : String(form.merchantId || "default")}`;
  const [checks, setChecks] = useState<ConfigCheck[]>([]);
  const [tutorialImageFile, setTutorialImageFile] = useState<File | null>(null);
  const [accountKeyword, setAccountKeyword] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [accountCountryId, setAccountCountryId] = useState("");
  const reloadConfig = async () => setForm(await api<Record<string, string | boolean>>(url));
  useEffect(() => {
    reloadConfig().catch((err) => setError(err instanceof Error ? err.message : "配置加载失败"));
  }, [url]);
  useEffect(() => {
    loadRows<MerchantCountry>(countriesUrl).then(setCountries).catch((err) => setError(err instanceof Error ? err.message : "国家设置加载失败"));
  }, [countriesUrl]);
  useEffect(() => {
    loadRows<A2CAccount>(a2cAccountsUrl).then(setA2CAccounts).catch((err) => setError(err instanceof Error ? err.message : "A2C客服账号加载失败"));
  }, [a2cAccountsUrl]);
  useEffect(() => {
    loadRows<TeacherTgLink>(teacherTgLinksUrl).then(setTeacherTgLinks).catch((err) => setError(err instanceof Error ? err.message : "老师TG链接加载失败"));
  }, [teacherTgLinksUrl]);
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
  const reloadTeacherTgLinks = async () => setTeacherTgLinks(await loadRows<TeacherTgLink>(teacherTgLinksUrl));
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
  const saveConfigFlag = async (key: "smartReplyEnabled" | "trainingSimulationEnabled" | "strictScriptFlowEnabled", value: boolean, successMessage: string) => {
    setMessage("");
    setError("");
    try {
      const saved = await api<Record<string, string | boolean>>(url, { method: "PATCH", body: JSON.stringify({ [key]: value }) });
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
  const importTeacherTelegramLinks = async () => {
    const currentCountry = countries[0];
    if (!currentCountry) throw new Error("请先保存国家设置，再批量设置老师TG链接。");
    if (!teacherTgDraft.urls.trim()) throw new Error("请先填写老师TG链接，一行一条。");
    const result = await api<{ imported: number; rows: TeacherTgLink[] }>(`${teacherTgLinksUrl}/import`, {
      method: "POST",
      body: JSON.stringify({
        countryId: currentCountry.id,
        urls: teacherTgDraft.urls,
        priority: Number(teacherTgDraft.priority || 0),
        rotationCount: Number(teacherTgDraft.rotationCount || 1)
      })
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
    <div className="setup-strip"><div><span>1</span><strong>填写密钥</strong><small>A2C / 智能供应商 / TG</small></div><div><span>2</span><strong>设置国家</strong><small>商户单国家</small></div><div><span>3</span><strong>同步账号</strong><small>自动归属国家</small></div><div><span>4</span><strong>接入回调</strong><small>填写 Webhook</small></div></div>
    <WebhookCopyCard a2cWebhookUrl={a2cWebhookUrl} onCopied={() => setMessage("Webhook 地址已复制。")} />
    <ConfigSwitchCards form={form} saveConfigFlag={saveConfigFlag} />
    <div className="form-grid elevated-form">{fields.map((f) => <label key={f}>{label(f)}{f === "aiProvider" ? <select value={String(form[f] || "minimax")} onChange={(e) => setForm({ ...form, [f]: e.target.value })}><option value="minimax">MiniMax</option><option value="deepseek">DeepSeek</option><option value="gemini">Gemini兼容</option></select> : <input value={form[f] || ""} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />}</label>)}</div>
    <TutorialImageUploadCard imageUrl={String(form.registrationTutorialImageUrl || "")} file={tutorialImageFile} onFileChange={setTutorialImageFile} onUpload={uploadTutorialImage} />
    <div className="toolbar sticky-actions"><AsyncButton onClick={saveConfig} busyText="保存中...">保存配置</AsyncButton><ConfirmActionButton title="确认同步 A2C 客服账号？" detail="同步会真实请求 A2C 接口。A2C Token 有限频风险，请确认不是连续频繁点击；同步后会刷新本地客服账号列表和接收账号配置。" confirmText="同步账号" busyText="同步中..." onConfirm={() => syncA2CAccounts()}><RefreshCw size={16}/>同步A2C客服账号</ConfirmActionButton><AsyncButton onClick={runConfigCheck} busyText="检测中..."><CheckCircle2 size={16}/>检测配置</AsyncButton></div>
    {error && <div className="error">{error}</div>}{message && <div className="notice">{message}</div>}
    {checks.length > 0 && <div className="config-checks">{checks.map((item) => <article key={item.key} className={item.ok ? "ok" : item.status}><strong>{item.label}</strong><span>{label(item.status)}</span><p>{item.detail}</p></article>)}</div>}
    <CountryMarketSettingsCard countries={countries} countryDraft={countryDraft} teacherTgLinks={teacherTgLinks} teacherTgDraft={teacherTgDraft} teacherTgLinksUrl={teacherTgLinksUrl} reloadTeacherTgLinks={reloadTeacherTgLinks} applyCountryDraft={applyCountryDraft} updateCountryDraftName={updateCountryDraftName} setCountryDraft={setCountryDraft} reInferCountryDraft={reInferCountryDraft} saveCountry={saveCountry} onTeacherTgDraftChange={setTeacherTgDraft} onTeacherTgImport={importTeacherTelegramLinks} />
    <A2CAccountsPanel accounts={a2cAccounts} filteredAccounts={filteredA2CAccounts} pager={accountPager} countries={countries} platform={platform} accountKeyword={accountKeyword} accountStatus={accountStatus} accountCountryId={accountCountryId} onKeywordChange={(value) => { setAccountKeyword(value); accountPager.setPage(1); }} onStatusChange={(value) => { setAccountStatus(value); accountPager.setPage(1); }} onCountryChange={(value) => { setAccountCountryId(value); accountPager.setPage(1); }} onToggle={toggleA2CAccount} />
    <TelegramHandoffCard form={form} setupTelegram={setupTelegram} refreshTelegramStatus={async () => { setError(""); setMessage("正在刷新TG状态..."); await reloadConfig(); setMessage("TG状态已刷新。"); notify("success", "TG 状态已刷新"); }} />
  </section>;
}
