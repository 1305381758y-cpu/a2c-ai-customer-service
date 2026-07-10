import type { Db } from "./db.js";
import { mapMerchantAgentProfile } from "./repositoryMerchantMappers.js";
import { booleanPatchValue } from "./repositoryPatchValues.js";
import type { MerchantAgentProfileRecord, MerchantAgentProfileVersionRecord } from "./repositoryTypes.js";

export class MerchantAgentProfileRepository {
  constructor(private readonly db: Db) {}

  get(merchantId: string): MerchantAgentProfileRecord {
    this.ensureRow(merchantId);
    const row = this.db.sqlite.prepare("SELECT * FROM merchant_agent_profiles WHERE merchant_id = ?").get(merchantId) as Record<string, unknown>;
    return mapMerchantAgentProfile(row);
  }

  patch(merchantId: string, patch: Record<string, unknown>): MerchantAgentProfileRecord {
    this.ensureRow(merchantId);
    const allowed: Record<string, string> = {
      agentName: "agent_name",
      roleDefinition: "role_definition",
      toneStyle: "tone_style",
      coreGoal: "core_goal",
      mustFollow: "must_follow",
      forbidden: "forbidden",
      uncertaintyPolicy: "uncertainty_policy",
      handoffPolicy: "handoff_policy",
      enabled: "enabled"
    };
    const entries = Object.entries(patch).filter(([key]) => key in allowed);
    if (entries.length) {
      const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      const values = entries.map(([key, value]) => key === "enabled" ? booleanPatchValue(value, true) : String(value ?? ""));
      this.db.sqlite
        .prepare(`UPDATE merchant_agent_profiles SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?`)
        .run(...values, merchantId);
    }
    return this.get(merchantId);
  }

  recordVersion(merchantId: string, changedKeys: string[], userName: string, note = "保存智能体配置"): MerchantAgentProfileVersionRecord {
    const current = this.get(merchantId);
    const version = Number((this.db.sqlite.prepare("SELECT COALESCE(MAX(version), 0) + 1 AS version FROM merchant_agent_profile_versions WHERE merchant_id = ?").get(merchantId) as { version: number }).version);
    const result = this.db.sqlite.prepare(`
      INSERT INTO merchant_agent_profile_versions (merchant_id, version, snapshot_json, changed_keys_json, note, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(merchantId, version, JSON.stringify(current), JSON.stringify([...new Set(changedKeys)]), note, userName);
    const createdAt = String((this.db.sqlite.prepare("SELECT created_at FROM merchant_agent_profile_versions WHERE id = ?").get(Number(result.lastInsertRowid)) as { created_at: string }).created_at);
    return { id: Number(result.lastInsertRowid), merchantId, version, changedKeys: [...new Set(changedKeys)], note, createdBy: userName, createdAt };
  }

  listVersions(merchantId: string, limit = 20): MerchantAgentProfileVersionRecord[] {
    const rows = this.db.sqlite.prepare(`
      SELECT id, merchant_id, version, changed_keys_json, note, created_by, created_at
      FROM merchant_agent_profile_versions
      WHERE merchant_id = ?
      ORDER BY version DESC
      LIMIT ?
    `).all(merchantId, Math.max(1, Math.min(limit, 100))) as Array<Record<string, unknown>>;
    return rows.map(mapVersion);
  }

  restoreVersion(merchantId: string, versionId: number, userName: string): MerchantAgentProfileRecord | undefined {
    const row = this.db.sqlite.prepare("SELECT version, snapshot_json FROM merchant_agent_profile_versions WHERE id = ? AND merchant_id = ?").get(versionId, merchantId) as { version: number; snapshot_json: string } | undefined;
    if (!row) return undefined;
    const snapshot = JSON.parse(row.snapshot_json) as Record<string, unknown>;
    const restored = this.patch(merchantId, snapshot);
    this.recordVersion(merchantId, Object.keys(snapshot), userName, `恢复版本 ${row.version}`);
    return restored;
  }

  private ensureRow(merchantId: string): void {
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_agent_profiles (merchant_id) VALUES (?)").run(merchantId);
  }
}

function mapVersion(row: Record<string, unknown>): MerchantAgentProfileVersionRecord {
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
