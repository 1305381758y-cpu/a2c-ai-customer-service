import { A2CClient } from "../clients/a2c.js";
import {
  aiProviderLabel,
  deepseekModel,
  hasUsableAiKey,
  minimaxModel,
  selectedAiProvider
} from "../clients/aiProvider.js";
import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import { AiTasks } from "./aiTasks.js";
import { appConfigForMerchant } from "./runtimeConfig.js";

export type ConfigCheckItem = {
  key: string;
  label: string;
  ok: boolean;
  status: "ok" | "missing" | "error" | "waiting";
  detail: string;
};

export type MerchantConfigCheckResult =
  | {
      ok: true;
      value: {
        ok: boolean;
        rows: ConfigCheckItem[];
        checkedAt: string;
      };
    }
  | {
      ok: false;
      statusCode: 404;
      error: string;
    };

export interface ConfigCheckPorts {
  checkA2C?: (config: AppConfig, repos: Repositories, merchantId: string) => Promise<ConfigCheckItem>;
  checkAiProvider?: (config: AppConfig, ai: Pick<AiTasks, "checkAvailability">) => Promise<ConfigCheckItem>;
  checkTelegram?: (config: AppConfig) => Promise<ConfigCheckItem>;
}

export async function checkMerchantConfig(
  repos: Repositories,
  baseConfig: AppConfig,
  merchantId: string,
  ai: Pick<AiTasks, "checkAvailability"> = new AiTasks(),
  ports: ConfigCheckPorts = {},
  includeAi = true
): Promise<MerchantConfigCheckResult> {
  const merchant = repos.getMerchant(merchantId);
  if (!merchant) return { ok: false, statusCode: 404, error: "merchant not found" };

  const cfg = repos.getMerchantConfig(merchantId);
  const runtimeConfig = appConfigForMerchant(baseConfig, cfg);
  const checks: ConfigCheckItem[] = [];

  checks.push(await (ports.checkA2C || checkA2C)(runtimeConfig, repos, merchantId));
  if (includeAi) checks.push(await (ports.checkAiProvider || checkAiProvider)(runtimeConfig, ai));
  checks.push(await (ports.checkTelegram || checkTelegram)(runtimeConfig));
  checks.push(checkPlatformRegisterUrl(runtimeConfig));

  return {
    ok: true,
    value: {
      ok: checks.every((item) => item.ok),
      rows: checks,
      checkedAt: new Date().toISOString()
    }
  };
}

async function checkA2C(config: AppConfig, repos: Repositories, merchantId: string): Promise<ConfigCheckItem> {
  if (!config.A2C_APP_ID || !config.A2C_APP_SECRET) {
    return { key: "a2c", label: "A2C", ok: false, status: "missing", detail: "缺少 A2C App ID 或密钥" };
  }

  const client = new A2CClient(config, repos.a2cTokenStore(merchantId));
  try {
    const accounts = await client.listAccounts();
    const rows = repos.syncMerchantA2CAccounts(merchantId, accounts);
    const enabledCount = rows.filter((account) => account.enabled).length;
    return {
      key: "a2c",
      label: "A2C",
      ok: true,
      status: "ok",
      detail: `已实时请求 A2C，认证正常；拉取到 ${rows.length} 个客服账号，其中 ${enabledCount} 个启用。`
    };
  } catch (error) {
    const localAccounts = repos.listMerchantA2CAccounts({ merchantId, enabled: true });
    const suffix = localAccounts.length ? ` 本地仍保存 ${localAccounts.length} 个启用客服账号，可继续用于已有收发；但实时检测未通过。` : "";
    return {
      key: "a2c",
      label: "A2C",
      ok: false,
      status: "error",
      detail: `${error instanceof Error ? error.message : "A2C 实时检测失败"}${suffix}`
    };
  }
}

async function checkAiProvider(config: AppConfig, ai: Pick<AiTasks, "checkAvailability">): Promise<ConfigCheckItem> {
  if (!hasUsableAiKey(config)) {
    return {
      key: "ai",
      label: "智能供应商",
      ok: false,
      status: "missing",
      detail: `缺少 ${aiProviderLabel(config)} Key，客户消息会降级使用样本/默认话术`
    };
  }

  try {
    await ai.checkAvailability(config);
    const provider = selectedAiProvider(config);
    const model = provider === "minimax" ? minimaxModel(config) : provider === "deepseek" ? deepseekModel(config) : config.GOOGLE_AI_MODEL;
    return {
      key: "ai",
      label: "智能供应商",
      ok: true,
      status: "ok",
      detail: `${aiProviderLabel(config)} 可用，当前模型 ${model}；客户消息会优先调用智能服务回复`
    };
  } catch (error) {
    return {
      key: "ai",
      label: "智能供应商",
      ok: false,
      status: "error",
      detail: error instanceof Error ? error.message : "智能供应商检测失败"
    };
  }
}

async function checkTelegram(config: AppConfig): Promise<ConfigCheckItem> {
  if (!config.TELEGRAM_BOT_TOKEN) {
    return { key: "telegram", label: "Telegram", ok: false, status: "missing", detail: "缺少 TG 机器人 Token" };
  }

  try {
    const me = await fetchTelegram(config.TELEGRAM_BOT_TOKEN, "getMe");
    if (!me.ok) throw new Error(me.description || "TG 机器人 Token 无效");
    if (!config.TELEGRAM_HANDOFF_CHAT_ID) {
      return { key: "telegram", label: "Telegram", ok: false, status: "waiting", detail: "机器人可用，但尚未绑定接管群。请拉群并发送 /bind" };
    }
    const chat = await fetchTelegram(config.TELEGRAM_BOT_TOKEN, "getChat", { chat_id: config.TELEGRAM_HANDOFF_CHAT_ID });
    if (!chat.ok) throw new Error(chat.description || "TG 群 ID 无效或机器人不在群里");
    const title = typeof chat.result === "object" && chat.result && "title" in chat.result ? String((chat.result as { title?: string }).title || config.TELEGRAM_HANDOFF_CHAT_ID) : config.TELEGRAM_HANDOFF_CHAT_ID;
    return { key: "telegram", label: "Telegram", ok: true, status: "ok", detail: `机器人和接管群可用：${title}` };
  } catch (error) {
    return {
      key: "telegram",
      label: "Telegram",
      ok: false,
      status: "error",
      detail: error instanceof Error ? error.message : "Telegram 检测失败"
    };
  }
}

function checkPlatformRegisterUrl(config: AppConfig): ConfigCheckItem {
  return {
    key: "platformRegisterUrl",
    label: "开户链接",
    ok: Boolean(config.PLATFORM_REGISTER_URL),
    status: config.PLATFORM_REGISTER_URL ? "ok" : "missing",
    detail: config.PLATFORM_REGISTER_URL || "未配置，自动回复里无法给客户开户链接"
  };
}

async function fetchTelegram(
  botToken: string,
  method: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; description?: string; result?: unknown }> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  return await response.json().catch(() => ({ ok: false, description: response.statusText })) as { ok: boolean; description?: string; result?: unknown };
}
