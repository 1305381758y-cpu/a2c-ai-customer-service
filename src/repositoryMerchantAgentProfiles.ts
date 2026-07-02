import type { Db } from "./db.js";
import { booleanPatchValue, mapMerchantAgentProfile } from "./repositoryMappers.js";
import type { MerchantAgentProfileRecord } from "./repositoryTypes.js";

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

  private ensureRow(merchantId: string): void {
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_agent_profiles (merchant_id) VALUES (?)").run(merchantId);
  }
}
