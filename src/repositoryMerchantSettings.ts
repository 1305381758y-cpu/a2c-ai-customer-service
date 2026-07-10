import type { A2CTokenStore } from "./clients/a2c.js";
import type { Db } from "./db.js";
import { inferCountryProfile } from "./repositoryCountryProfile.js";
import { mapMerchantConfig, mapMerchantCountry } from "./repositoryMerchantMappers.js";
import { booleanPatchValue } from "./repositoryPatchValues.js";
import type { MerchantConfigRecord, MerchantConfigVersionRecord, MerchantCountryRecord } from "./repositoryTypes.js";

export class MerchantSettingsRepository {
  constructor(private readonly db: Db) {}

  getConfig(merchantId: string): MerchantConfigRecord {
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
    const row = this.db.sqlite.prepare("SELECT * FROM merchant_configs WHERE merchant_id = ?").get(merchantId) as Record<string, unknown>;
    return mapMerchantConfig(row);
  }

  patchConfig(merchantId: string, patch: Record<string, unknown>): MerchantConfigRecord {
    const allowed: Record<string, string> = {
      a2cBaseUrl: "a2c_base_url",
      a2cAppId: "a2c_app_id",
      a2cAppSecret: "a2c_app_secret",
      a2cAccountPhone: "a2c_account_phone",
      openaiApiKey: "openai_api_key",
      openaiModel: "openai_model",
      aiProvider: "ai_provider",
      minimaxApiKey: "minimax_api_key",
      minimaxModel: "minimax_model",
      deepseekApiKey: "deepseek_api_key",
      deepseekModel: "deepseek_model",
      googleAiApiKey: "google_ai_api_key",
      googleAiModel: "google_ai_model",
      telegramBotToken: "telegram_bot_token",
      telegramHandoffChatId: "telegram_handoff_chat_id",
      telegramHandoffChatTitle: "telegram_handoff_chat_title",
      telegramHandoffChatStatus: "telegram_handoff_chat_status",
      telegramHandoffChatError: "telegram_handoff_chat_error",
      smartReplyEnabled: "smart_reply_enabled",
      trainingSimulationEnabled: "training_simulation_enabled",
      strictScriptFlowEnabled: "strict_script_flow_enabled",
      platformRegisterUrl: "platform_register_url",
      tgRegisterGuideUrl: "tg_register_guide_url",
      registrationTutorialImageUrl: "registration_tutorial_image_url"
    };
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
    const entries = Object.entries(patch).filter(([key, value]) => key in allowed && (typeof value === "string" || typeof value === "boolean"));
    if (entries.length) {
      const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      this.db.sqlite.prepare(`UPDATE merchant_configs SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?`).run(...entries.map(([key, value]) => {
        if (key === "smartReplyEnabled") return booleanPatchValue(value, true);
        if (key === "trainingSimulationEnabled") return booleanPatchValue(value, false);
        if (key === "strictScriptFlowEnabled") return booleanPatchValue(value, false);
        if (key === "aiProvider") return value === "gemini" || value === "deepseek" ? value : "minimax";
        return value as string;
      }), merchantId);
    }
    return this.getConfig(merchantId);
  }

  recordConfigVersion(merchantId: string, changedKeys: string[], userName: string, note = "保存配置"): MerchantConfigVersionRecord {
    const current = this.getConfig(merchantId);
    const version = Number((this.db.sqlite.prepare("SELECT COALESCE(MAX(version), 0) + 1 AS version FROM merchant_config_versions WHERE merchant_id = ?").get(merchantId) as { version: number }).version);
    const result = this.db.sqlite.prepare(`
      INSERT INTO merchant_config_versions (merchant_id, version, snapshot_json, changed_keys_json, note, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(merchantId, version, JSON.stringify(configSnapshot(current)), JSON.stringify([...new Set(changedKeys)]), note, userName);
    return {
      id: Number(result.lastInsertRowid),
      merchantId,
      version,
      changedKeys: [...new Set(changedKeys)],
      note,
      createdBy: userName,
      createdAt: String((this.db.sqlite.prepare("SELECT created_at FROM merchant_config_versions WHERE id = ?").get(Number(result.lastInsertRowid)) as { created_at: string }).created_at)
    };
  }

  listConfigVersions(merchantId: string, limit = 20): MerchantConfigVersionRecord[] {
    const rows = this.db.sqlite.prepare(`
      SELECT id, merchant_id, version, changed_keys_json, note, created_by, created_at
      FROM merchant_config_versions
      WHERE merchant_id = ?
      ORDER BY version DESC
      LIMIT ?
    `).all(merchantId, Math.max(1, Math.min(limit, 100))) as Array<Record<string, unknown>>;
    return rows.map(mapConfigVersion);
  }

  restoreConfigVersion(merchantId: string, versionId: number, userName: string): MerchantConfigRecord | undefined {
    const row = this.db.sqlite.prepare("SELECT version, snapshot_json FROM merchant_config_versions WHERE id = ? AND merchant_id = ?").get(versionId, merchantId) as { version: number; snapshot_json: string } | undefined;
    if (!row) return undefined;
    const snapshot = JSON.parse(row.snapshot_json) as Record<string, unknown>;
    const restored = this.patchConfig(merchantId, snapshot);
    this.recordConfigVersion(merchantId, Object.keys(snapshot), userName, `恢复版本 ${row.version}`);
    return restored;
  }

  tokenStore(merchantId: string): A2CTokenStore {
    return {
      get: (cacheKey) => {
        const config = this.getConfig(merchantId);
        if (config.a2cTokenCacheKey !== cacheKey || !config.a2cAccessToken || !config.a2cTokenExpiresAt) return undefined;
        return { accessToken: config.a2cAccessToken, expiresAt: config.a2cTokenExpiresAt };
      },
      set: (cacheKey, accessToken, expiresAt) => {
        this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
        this.db.sqlite
          .prepare(`
            UPDATE merchant_configs
            SET a2c_token_cache_key = ?,
                a2c_access_token = ?,
                a2c_token_expires_at = ?,
                a2c_auth_blocked_until = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE merchant_id = ?
          `)
          .run(cacheKey, accessToken, expiresAt, merchantId);
      },
      getAuthBlockedUntil: (cacheKey) => {
        const config = this.getConfig(merchantId);
        if (config.a2cTokenCacheKey && config.a2cTokenCacheKey !== cacheKey) return undefined;
        return config.a2cAuthBlockedUntil || undefined;
      },
      setAuthBlockedUntil: (cacheKey, blockedUntil) => {
        this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
        this.db.sqlite
          .prepare(`
            UPDATE merchant_configs
            SET a2c_token_cache_key = ?,
                a2c_auth_blocked_until = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE merchant_id = ?
          `)
          .run(cacheKey, blockedUntil, merchantId);
      },
      clear: (cacheKey) => {
        const config = this.getConfig(merchantId);
        if (config.a2cTokenCacheKey && config.a2cTokenCacheKey !== cacheKey) return;
        this.db.sqlite
          .prepare(`
            UPDATE merchant_configs
            SET a2c_token_cache_key = '',
                a2c_access_token = '',
                a2c_token_expires_at = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE merchant_id = ?
          `)
          .run(merchantId);
      }
    };
  }

  ensureDefaultCountry(merchantId: string): MerchantCountryRecord {
    const id = `${merchantId}:default`;
    this.db.sqlite.prepare(`
      INSERT OR IGNORE INTO merchant_countries
        (id, merchant_id, code, name, default_language)
      VALUES (?, ?, 'default', '默认国家', 'unknown')
    `).run(id, merchantId);
    return this.getCountry(id)!;
  }

  defaultCountryId(merchantId: string): string {
    return this.ensurePrimaryCountry(merchantId).id;
  }

  ensurePrimaryCountry(merchantId: string): MerchantCountryRecord {
    this.ensureDefaultCountry(merchantId);
    const row = this.db.sqlite
      .prepare(`
        SELECT *
        FROM merchant_countries
        WHERE merchant_id = ? AND status = 'active'
        ORDER BY CASE WHEN code = 'default' THEN 1 ELSE 0 END, updated_at DESC, created_at DESC
        LIMIT 1
      `)
      .get(merchantId) as Record<string, unknown> | undefined;
    return row ? mapMerchantCountry(row) : this.ensureDefaultCountry(merchantId);
  }

  validCountryId(merchantId: string, countryId: string): string {
    if (!countryId) return "";
    const row = this.db.sqlite.prepare("SELECT id FROM merchant_countries WHERE id = ? AND merchant_id = ?").get(countryId, merchantId) as { id: string } | undefined;
    return row?.id ?? "";
  }

  getCountry(id: string): MerchantCountryRecord | undefined {
    const row = this.db.sqlite.prepare("SELECT * FROM merchant_countries WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapMerchantCountry(row) : undefined;
  }

  listCountries(merchantId: string): MerchantCountryRecord[] {
    return [this.ensurePrimaryCountry(merchantId)];
  }

  listAllCountries(): MerchantCountryRecord[] {
    return this.db.sqlite
      .prepare(`
        SELECT *
        FROM merchant_countries
        ORDER BY merchant_id ASC, status ASC, updated_at DESC, created_at DESC
      `)
      .all()
      .map((row) => mapMerchantCountry(row as Record<string, unknown>));
  }

  createCountry(merchantId: string, input: Record<string, unknown>): MerchantCountryRecord {
    const current = this.ensurePrimaryCountry(merchantId);
    const profile = inferCountryProfile(input, current);
    const code = profile.code;
    const id = current.id;
    this.db.sqlite.prepare("DELETE FROM merchant_countries WHERE merchant_id = ? AND code = ? AND id != ?").run(merchantId, code, id);
    this.db.sqlite.prepare(`
      UPDATE merchant_countries
      SET code = ?,
          name = ?,
          default_language = ?,
          platform_register_url = ?,
          tg_register_guide_url = ?,
          require_platform_account = ?,
          require_phone = ?,
          require_telegram = ?,
          require_whatsapp = ?,
          status = 'active',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND merchant_id = ?
    `).run(
      code,
      profile.name,
      profile.defaultLanguage,
      String(input.platformRegisterUrl ?? current.platformRegisterUrl ?? ""),
      String(input.tgRegisterGuideUrl ?? current.tgRegisterGuideUrl ?? ""),
      booleanPatchValue(input.requirePlatformAccount, current.requirePlatformAccount),
      booleanPatchValue(input.requirePhone, current.requirePhone),
      booleanPatchValue(input.requireTelegram, current.requireTelegram),
      booleanPatchValue(input.requireWhatsApp, current.requireWhatsApp),
      id,
      merchantId
    );
    this.reassignToSingleCountry(merchantId, id);
    return this.getCountry(id)!;
  }

  patchCountry(id: string, merchantId: string, patch: Record<string, unknown>): MerchantCountryRecord | undefined {
    const allowed: Record<string, string> = {
      code: "code",
      name: "name",
      defaultLanguage: "default_language",
      platformRegisterUrl: "platform_register_url",
      tgRegisterGuideUrl: "tg_register_guide_url",
      requirePlatformAccount: "require_platform_account",
      requirePhone: "require_phone",
      requireTelegram: "require_telegram",
      requireWhatsApp: "require_whatsapp",
      status: "status"
    };
    const entries = Object.entries(patch).filter(([key]) => key in allowed);
    if (entries.length) {
      const current = this.getCountry(id);
      const normalizedPatch = { ...patch };
      if (current && ("name" in patch || "code" in patch || "defaultLanguage" in patch)) {
        const profile = inferCountryProfile(patch, current);
        normalizedPatch.code = profile.code;
        normalizedPatch.name = profile.name;
        normalizedPatch.defaultLanguage = profile.defaultLanguage;
      }
      if (typeof normalizedPatch.code === "string" && normalizedPatch.code.trim()) {
        this.db.sqlite.prepare("DELETE FROM merchant_countries WHERE merchant_id = ? AND code = ? AND id != ?").run(merchantId, normalizedPatch.code.trim(), id);
      }
      const normalizedEntries = Object.entries(normalizedPatch).filter(([key]) => key in allowed);
      const assignments = normalizedEntries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      const values = normalizedEntries.map(([key, value]) => {
        if (key.startsWith("require")) return value ? 1 : 0;
        return String(value ?? "");
      }) as Array<string | number>;
      this.db.sqlite.prepare(`UPDATE merchant_countries SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?`).run(...values, id, merchantId);
      this.reassignToSingleCountry(merchantId, id);
    }
    const row = this.db.sqlite.prepare("SELECT * FROM merchant_countries WHERE id = ? AND merchant_id = ?").get(id, merchantId) as Record<string, unknown> | undefined;
    return row ? mapMerchantCountry(row) : undefined;
  }

  countryIdForA2CAccount(merchantId: string, apiPhone: string): string {
    void apiPhone;
    return this.defaultCountryId(merchantId);
  }

  markTelegramBindingInvalid(merchantId: string, error: string): MerchantConfigRecord {
    return this.patchConfig(merchantId, { telegramHandoffChatStatus: "invalid", telegramHandoffChatError: error });
  }

  updateTelegramBinding(
    merchantId: string,
    input: { chatId?: string; chatTitle?: string; status: MerchantConfigRecord["telegramHandoffChatStatus"]; error?: string }
  ): MerchantConfigRecord {
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
    this.db.sqlite
      .prepare(`
        UPDATE merchant_configs
        SET telegram_handoff_chat_id = COALESCE(?, telegram_handoff_chat_id),
            telegram_handoff_chat_title = COALESCE(?, telegram_handoff_chat_title),
            telegram_handoff_chat_status = ?,
            telegram_handoff_chat_error = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE merchant_id = ?
      `)
      .run(input.chatId ?? null, input.chatTitle ?? null, input.status, input.error ?? "", merchantId);
    return this.getConfig(merchantId);
  }

  private reassignToSingleCountry(merchantId: string, countryId: string): void {
    if (!this.validCountryId(merchantId, countryId)) return;
    this.db.sqlite
      .prepare(`
        DELETE FROM customer_memories
        WHERE merchant_id = ?
          AND id NOT IN (
            SELECT MAX(id)
            FROM customer_memories
            WHERE merchant_id = ?
            GROUP BY customer_key
          )
      `)
      .run(merchantId, merchantId);
    this.db.sqlite.prepare("UPDATE merchant_countries SET status = CASE WHEN id = ? THEN 'active' ELSE 'disabled' END, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE merchant_a2c_accounts SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE conversations SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE customers SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE customer_memories SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE training_samples SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE knowledge_items SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE training_materials SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE training_material_items SET country_id = ? WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE a2c_invite_codes SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
  }
}

function configSnapshot(config: MerchantConfigRecord): Record<string, unknown> {
  const {
    a2cTokenCacheKey: _cacheKey,
    a2cAccessToken: _accessToken,
    a2cTokenExpiresAt: _expiresAt,
    a2cAuthBlockedUntil: _blockedUntil,
    merchantId: _merchantId,
    ...editable
  } = config;
  return editable;
}

function mapConfigVersion(row: Record<string, unknown>): MerchantConfigVersionRecord {
  let changedKeys: string[] = [];
  try {
    const parsed = JSON.parse(String(row.changed_keys_json || "[]"));
    if (Array.isArray(parsed)) changedKeys = parsed.map(String);
  } catch {
    changedKeys = [];
  }
  return {
    id: Number(row.id),
    merchantId: String(row.merchant_id),
    version: Number(row.version),
    changedKeys,
    note: String(row.note || ""),
    createdBy: String(row.created_by || ""),
    createdAt: String(row.created_at || "")
  };
}
