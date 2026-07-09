import type { Db } from "./db.js";

export interface ClearLearningAndCustomerDataResult {
  customerMemoriesDeleted: number;
  trainingMaterialItemsDeleted: number;
  trainingMaterialsDeleted: number;
  trainingSamplesDeleted: number;
  knowledgeItemsDeleted: number;
  intentLearningEventsDeleted: number;
  scriptFlowsDeleted: number;
  messagesDeleted: number;
  handoffEventsDeleted: number;
  conversationsDeleted: number;
  customersDeleted: number;
  inviteCodesReset: number;
}

export interface RebuildCustomersFromConversationsResult {
  customersBefore: number;
  conversationCustomers: number;
  customersAfter: number;
  restoredCustomers: number;
}

export class MaintenanceRepository {
  constructor(private readonly db: Db) {}

  rebuildCustomersFromConversations(): RebuildCustomersFromConversationsResult {
    const customersBefore = this.countTableRows("customers");
    const conversationCustomers = Number(
      (this.db.sqlite
        .prepare("SELECT COUNT(*) AS count FROM (SELECT merchant_id, customer_phone FROM conversations GROUP BY merchant_id, customer_phone)")
        .get() as { count: number } | undefined)?.count ?? 0
    );

    this.db.sqlite.exec("BEGIN");
    try {
      this.db.sqlite
        .prepare(`
          WITH
            latest AS (
              SELECT *
              FROM (
                SELECT c.*,
                       c.rowid AS conversation_rowid,
                       ROW_NUMBER() OVER (
                         PARTITION BY c.merchant_id, c.customer_phone
                         ORDER BY c.updated_at DESC, c.created_at DESC, c.rowid DESC
                       ) AS rn
                FROM conversations c
              )
              WHERE rn = 1
            ),
            firsts AS (
              SELECT *
              FROM (
                SELECT c.*,
                       c.rowid AS conversation_rowid,
                       ROW_NUMBER() OVER (
                         PARTITION BY c.merchant_id, c.customer_phone
                         ORDER BY c.created_at ASC, c.updated_at ASC, c.rowid ASC
                       ) AS rn
                FROM conversations c
              )
              WHERE rn = 1
            ),
            counts AS (
              SELECT merchant_id,
                     customer_phone,
                     COUNT(*) AS conversation_count,
                     MIN(created_at) AS first_seen_at,
                     MAX(updated_at) AS last_seen_at
              FROM conversations
              GROUP BY merchant_id, customer_phone
            )
          INSERT INTO customers
            (merchant_id, country_id, customer_key, nickname, first_a2c_account_phone, last_a2c_account_phone,
             language, stage, extracted_phone, extracted_telegram, extracted_whatsapp, status, conversation_count,
             last_conversation_id, first_seen_at, last_seen_at, created_at, updated_at)
          SELECT latest.merchant_id,
                 latest.country_id,
                 latest.customer_phone,
                 latest.nickname,
                 firsts.a2c_account_phone,
                 latest.a2c_account_phone,
                 latest.language,
                 latest.stage,
                 latest.extracted_phone,
                 latest.extracted_telegram,
                 latest.extracted_whatsapp,
                 latest.status,
                 counts.conversation_count,
                 latest.id,
                 counts.first_seen_at,
                 counts.last_seen_at,
                 CURRENT_TIMESTAMP,
                 CURRENT_TIMESTAMP
          FROM latest
          JOIN firsts ON firsts.merchant_id = latest.merchant_id AND firsts.customer_phone = latest.customer_phone
          JOIN counts ON counts.merchant_id = latest.merchant_id AND counts.customer_phone = latest.customer_phone
          ON CONFLICT(merchant_id, customer_key) DO UPDATE SET
            country_id = excluded.country_id,
            nickname = CASE WHEN excluded.nickname != '' THEN excluded.nickname ELSE customers.nickname END,
            first_a2c_account_phone = CASE WHEN customers.first_a2c_account_phone != '' THEN customers.first_a2c_account_phone ELSE excluded.first_a2c_account_phone END,
            last_a2c_account_phone = excluded.last_a2c_account_phone,
            language = excluded.language,
            stage = excluded.stage,
            extracted_phone = CASE WHEN excluded.extracted_phone != '' THEN excluded.extracted_phone ELSE customers.extracted_phone END,
            extracted_telegram = CASE WHEN excluded.extracted_telegram != '' THEN excluded.extracted_telegram ELSE customers.extracted_telegram END,
            extracted_whatsapp = CASE WHEN excluded.extracted_whatsapp != '' THEN excluded.extracted_whatsapp ELSE customers.extracted_whatsapp END,
            status = excluded.status,
            conversation_count = excluded.conversation_count,
            last_conversation_id = excluded.last_conversation_id,
            first_seen_at = CASE WHEN customers.first_seen_at != '' THEN customers.first_seen_at ELSE excluded.first_seen_at END,
            last_seen_at = excluded.last_seen_at,
            updated_at = CURRENT_TIMESTAMP
        `)
        .run();
      this.db.sqlite.exec("COMMIT");
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }

    const customersAfter = this.countTableRows("customers");
    return {
      customersBefore,
      conversationCustomers,
      customersAfter,
      restoredCustomers: Math.max(customersAfter - customersBefore, 0)
    };
  }

  clearLearningAndCustomerData(): ClearLearningAndCustomerDataResult {
    this.db.sqlite.exec("BEGIN");
    try {
      const customerMemories = this.db.sqlite.prepare("DELETE FROM customer_memories").run();
      const trainingMaterialItems = this.db.sqlite.prepare("DELETE FROM training_material_items").run();
      const trainingMaterials = this.db.sqlite.prepare("DELETE FROM training_materials").run();
      const trainingSamples = this.db.sqlite.prepare("DELETE FROM training_samples").run();
      const knowledgeItems = this.db.sqlite.prepare("DELETE FROM knowledge_items").run();
      const intentLearningEvents = this.db.sqlite.prepare("DELETE FROM intent_learning_events").run();
      this.db.sqlite.prepare("DELETE FROM conversation_review_items").run();
      this.db.sqlite.prepare("DELETE FROM conversation_reviews").run();
      this.db.sqlite.prepare("DELETE FROM conversation_followups").run();
      this.db.sqlite.prepare("DELETE FROM conversation_script_state").run();
      this.db.sqlite.prepare("DELETE FROM script_flow_versions").run();
      this.db.sqlite.prepare("DELETE FROM script_flow_steps").run();
      const scriptFlows = this.db.sqlite.prepare("DELETE FROM script_flows").run();
      const messages = this.db.sqlite.prepare("DELETE FROM messages").run();
      const handoffEvents = this.db.sqlite.prepare("DELETE FROM handoff_events").run();
      const conversations = this.db.sqlite.prepare("DELETE FROM conversations").run();
      const customers = this.db.sqlite.prepare("DELETE FROM customers").run();
      const inviteCodes = this.db.sqlite
        .prepare(`
          UPDATE a2c_invite_codes
          SET status = 'available',
              assigned_customer_key = '',
              assigned_conversation_id = '',
              platform_account = '',
              assigned_at = '',
              used_at = '',
              updated_at = CURRENT_TIMESTAMP
        `)
        .run();
      this.db.sqlite.exec("COMMIT");
      return {
        customerMemoriesDeleted: Number(customerMemories.changes ?? 0),
        trainingMaterialItemsDeleted: Number(trainingMaterialItems.changes ?? 0),
        trainingMaterialsDeleted: Number(trainingMaterials.changes ?? 0),
        trainingSamplesDeleted: Number(trainingSamples.changes ?? 0),
        knowledgeItemsDeleted: Number(knowledgeItems.changes ?? 0),
        intentLearningEventsDeleted: Number(intentLearningEvents.changes ?? 0),
        scriptFlowsDeleted: Number(scriptFlows.changes ?? 0),
        messagesDeleted: Number(messages.changes ?? 0),
        handoffEventsDeleted: Number(handoffEvents.changes ?? 0),
        conversationsDeleted: Number(conversations.changes ?? 0),
        customersDeleted: Number(customers.changes ?? 0),
        inviteCodesReset: Number(inviteCodes.changes ?? 0)
      };
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  private countTableRows(table: string): number {
    const row = this.db.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number } | undefined;
    return Number(row?.count ?? 0);
  }
}
