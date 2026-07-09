import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";

import { api, loadRows, useRows, withQuery } from "../app/api.js";
import type { A2CAccount, ConfigCheck, Filters, Merchant, MerchantCountry, TeacherTgLink } from "../types.js";
import { A2CAccountCard, ConfigSwitchCards, TeacherTgLinksPanel, TutorialImageUploadCard, WebhookCopyCard } from "./SettingsEditors.js";
import { AsyncButton, ConfirmActionButton, CountryPresetDatalist, CountrySettingsEditor, Editor, Table } from "../ui/components.js";
import { coercePatch } from "../ui/form.js";
import { countryLabel, displayValue, inferCountryProfile, label, languageName, statusTone, translateSystemMessage } from "../ui/formatters.js";
import { Pagination, useClientPagination } from "../ui/Pagination.js";
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
    <div className="memory country-settings-card">
      <div className="section-title-row">
        <div>
          <h3>商户国家/市场</h3>
          <p>商户只需要填写国家，国家代码和默认语言会自动带入。当前版本每个商户只维护一个国家。</p>
        </div>
        {countries[0] && <button type="button" className="ghost" onClick={() => { applyCountryDraft(countries[0]); notify("success", "已载入当前国家", "修改后点击“保存国家设置”。"); }}>编辑当前国家</button>}
      </div>
      <div className="country-auto-note">国家代码和默认语言由国家名称自动生成，不需要手动填写；例如“玻利维亚”会自动识别为 <strong>bo / 西语</strong>。</div>
      <TeacherTgLinksPanel links={teacherTgLinks} draft={teacherTgDraft} endpoint={teacherTgLinksUrl} reload={reloadTeacherTgLinks} onDraftChange={setTeacherTgDraft} onImport={importTeacherTelegramLinks} />
      <div className="toolbar wrap country-settings-form">
        <CountryPresetDatalist />
        <label className="inline-field">国家<input list="merchant-country-presets" placeholder="输入或选择国家，例如：玻利维亚" value={countryDraft.name} onChange={(e) => updateCountryDraftName(e.target.value)} /></label>
        <label className="inline-field">国家代码<input readOnly value={countryDraft.code} /></label>
        <label className="inline-field">默认语言<input readOnly value={languageName(countryDraft.defaultLanguage)} /></label>
        <button type="button" className="ghost" onClick={reInferCountryDraft}>重新识别</button>
        <input placeholder={label("platformRegisterUrl")} value={countryDraft.platformRegisterUrl} onChange={(e) => setCountryDraft({ ...countryDraft, platformRegisterUrl: e.target.value })} />
        <input placeholder={label("tgRegisterGuideUrl")} value={countryDraft.tgRegisterGuideUrl} onChange={(e) => setCountryDraft({ ...countryDraft, tgRegisterGuideUrl: e.target.value })} />
        <select value={countryDraft.requirePlatformAccount} onChange={(e) => setCountryDraft({ ...countryDraft, requirePlatformAccount: e.target.value })}><option value="true">需要开户注册</option><option value="false">不需要开户注册</option></select>
        <select value={countryDraft.requirePhone} onChange={(e) => setCountryDraft({ ...countryDraft, requirePhone: e.target.value })}><option value="true">需要手机号</option><option value="false">不需要手机号</option></select>
        <select value={countryDraft.requireTelegram} onChange={(e) => setCountryDraft({ ...countryDraft, requireTelegram: e.target.value })}><option value="true">需要TG</option><option value="false">不需要TG</option></select>
        <select value={countryDraft.requireWhatsApp} onChange={(e) => setCountryDraft({ ...countryDraft, requireWhatsApp: e.target.value })}><option value="false">不需要WS</option><option value="true">需要WS</option></select>
        <AsyncButton onClick={saveCountry} busyText="保存中...">保存国家设置</AsyncButton>
      </div>
      <p className="table-helper">点击下方国家行也可以载入编辑。</p>
      <Table rows={countries} columns={["code", "name", "defaultLanguage", "platformRegisterUrl", "tgRegisterGuideUrl", "requirePhone", "requireTelegram", "requireWhatsApp", "status"]} rowKey={(row) => row.id} selectedKey={countries[0]?.id} onRow={(row) => { applyCountryDraft(row); notify("success", "已载入国家设置", "修改后点击“保存国家设置”。"); }} />
    </div>
    <div className="memory"><div className="account-section-head"><div><h3>A2C客服账号与邀请码池</h3><p>客服账号会自动归属到商户国家。每个客服账号可以绑定多个邀请码，客户注册后邀请码会从可用池里移除。</p></div><span>已保存 {a2cAccounts.length} 个账号</span></div><div className="account-filter-bar"><label>搜索账号<input value={accountKeyword} onChange={(e) => { setAccountKeyword(e.target.value); accountPager.setPage(1); }} placeholder="手机号、名称、WABA ID" /></label><label>状态<select value={accountStatus} onChange={(e) => { setAccountStatus(e.target.value); accountPager.setPage(1); }}><option value="">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label><label>国家<select value={accountCountryId} onChange={(e) => { setAccountCountryId(e.target.value); accountPager.setPage(1); }}><option value="">全部国家</option>{countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}</select></label></div><div className="account-list-meta">当前筛选 {filteredA2CAccounts.length} 个账号，显示第 {(accountPager.page - 1) * accountPager.pageSize + (accountPager.total ? 1 : 0)} - {Math.min(accountPager.page * accountPager.pageSize, accountPager.total)} 个。</div><div className="account-grid">{accountPager.rows.map((row) => <A2CAccountCard key={row.id} account={row} countries={countries} platform={platform} onToggle={() => toggleA2CAccount(row)} onCountry={async () => undefined} />)}{!a2cAccounts.length && <div className="empty-state">填写并保存 A2C 密钥后，点击“同步A2C客服账号”。同步成功后这里会出现每个客服账号的邀请码池。</div>}{a2cAccounts.length > 0 && !filteredA2CAccounts.length && <div className="empty-state">没有符合筛选条件的客服账号，换个手机号、状态或国家试试。</div>}</div><Pagination pager={accountPager} /></div>
    <div className="memory"><h3>TG接管群绑定</h3><p>状态：{displayValue("status", form.telegramHandoffChatStatus || "unbound")} · 群：{form.telegramHandoffChatTitle || form.telegramHandoffChatId || "未绑定"}</p>{form.telegramHandoffChatError && <div className="warning">{form.telegramHandoffChatError}</div>}<div className="toolbar"><AsyncButton onClick={setupTelegram} busyText="设置中...">设置TG绑定</AsyncButton><AsyncButton onClick={async () => { setError(""); setMessage("正在刷新TG状态..."); await reloadConfig(); setMessage("TG状态已刷新。"); notify("success", "TG 状态已刷新"); }} busyText="刷新中..."><RefreshCw size={16}/>刷新TG状态</AsyncButton></div><p>保存 TG机器人 Token 后点击设置绑定，再把机器人拉进唯一接管群并发送 /bind；系统会自动保存群ID。</p></div>
  </section>;
}
