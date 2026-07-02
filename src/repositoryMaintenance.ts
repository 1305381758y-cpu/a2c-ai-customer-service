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

export class MaintenanceRepository {
  constructor(private readonly db: Db) {}

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
}
