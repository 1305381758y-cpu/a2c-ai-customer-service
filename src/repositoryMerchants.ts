import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import { mapMerchant } from "./repositoryMappers.js";
import type { MerchantRecord } from "./repositoryTypes.js";

export class MerchantRepository {
  constructor(
    private readonly db: Db,
    private readonly hooks: { ensureDefaultCountry: (merchantId: string) => void } = { ensureDefaultCountry: () => {} }
  ) {}

  list(): MerchantRecord[] {
    return this.db.sqlite.prepare("SELECT id, name, status FROM merchants ORDER BY created_at DESC").all().map(mapMerchant);
  }

  create(name: string): MerchantRecord {
    const id = randomUUID();
    this.db.sqlite.prepare("INSERT INTO merchants (id, name) VALUES (?, ?)").run(id, name);
    this.db.sqlite.prepare("INSERT INTO merchant_configs (merchant_id) VALUES (?)").run(id);
    this.hooks.ensureDefaultCountry(id);
    return this.get(id)!;
  }

  get(id: string): MerchantRecord | undefined {
    const row = this.db.sqlite.prepare("SELECT id, name, status FROM merchants WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapMerchant(row) : undefined;
  }

  patch(id: string, patch: Record<string, unknown>): MerchantRecord | undefined {
    const name = typeof patch.name === "string" ? patch.name : undefined;
    const status = patch.status === "active" || patch.status === "disabled" ? patch.status : undefined;
    if (name !== undefined || status !== undefined) {
      this.db.sqlite
        .prepare("UPDATE merchants SET name = COALESCE(?, name), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(name ?? null, status ?? null, id);
    }
    return this.get(id);
  }

  delete(id: string): boolean {
    if (id === "default") return false;
    const merchant = this.get(id);
    if (!merchant) return false;
    this.db.sqlite.exec("BEGIN");
    try {
      this.db.sqlite.prepare("DELETE FROM customer_memories WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM conversation_review_items WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM conversation_reviews WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM merchant_agent_profiles WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM training_material_items WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM training_materials WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM training_samples WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM knowledge_items WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM conversation_script_state WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM script_flow_versions WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM script_flow_steps WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM script_flows WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM messages WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM handoff_events WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM conversations WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM customers WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM a2c_invite_codes WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM merchant_a2c_accounts WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM users WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM merchant_configs WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM merchant_countries WHERE merchant_id = ?").run(id);
      const result = this.db.sqlite.prepare("DELETE FROM merchants WHERE id = ?").run(id);
      this.db.sqlite.exec("COMMIT");
      return result.changes > 0;
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  findByA2CAccount(accountPhone: string): MerchantRecord | undefined {
    const row = this.db.sqlite
      .prepare(`
        SELECT DISTINCT m.*
        FROM merchants m
        JOIN merchant_configs c ON c.merchant_id = m.id
        LEFT JOIN merchant_a2c_accounts a ON a.merchant_id = m.id AND a.enabled = 1
        WHERE m.status = 'active'
          AND (
            a.api_phone = ?
            OR
            c.a2c_account_phone = ?
            OR instr(',' || replace(c.a2c_account_phone, ' ', '') || ',', ',' || ? || ',') > 0
          )
        LIMIT 1
      `)
      .get(accountPhone, accountPhone, accountPhone) as Record<string, unknown> | undefined;
    return row ? mapMerchant(row) : undefined;
  }
}
