import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ImportedTrainingSample } from "./import/trainingSamples.js";

export interface Db {
  sqlite: DatabaseSync;
}

export function openDb(databaseUrl: string): Db {
  const filename = databaseUrl === ":memory:" ? databaseUrl : resolve(databaseUrl);
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec("PRAGMA foreign_keys = ON;");
  migrate(sqlite);
  return { sqlite };
}

export function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      merchant_id TEXT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS merchant_configs (
      merchant_id TEXT PRIMARY KEY,
      a2c_base_url TEXT DEFAULT 'https://openapi.a2c.chat/api/openapi',
      a2c_app_id TEXT DEFAULT '',
      a2c_app_secret TEXT DEFAULT '',
      a2c_account_phone TEXT DEFAULT '',
      openai_api_key TEXT DEFAULT '',
      openai_model TEXT DEFAULT 'gpt-5-mini',
      ai_provider TEXT DEFAULT 'minimax',
      minimax_api_key TEXT DEFAULT '',
      minimax_model TEXT DEFAULT 'MiniMax-M3',
      deepseek_api_key TEXT DEFAULT '',
      deepseek_model TEXT DEFAULT 'deepseek-chat',
      google_ai_api_key TEXT DEFAULT '',
      google_ai_model TEXT DEFAULT 'gemini-2.5-flash',
      telegram_bot_token TEXT DEFAULT '',
      telegram_handoff_chat_id TEXT DEFAULT '',
      telegram_handoff_chat_title TEXT DEFAULT '',
      telegram_handoff_chat_status TEXT DEFAULT 'unbound',
      telegram_handoff_chat_error TEXT DEFAULT '',
      a2c_token_cache_key TEXT DEFAULT '',
      a2c_access_token TEXT DEFAULT '',
      a2c_token_expires_at INTEGER DEFAULT 0,
      smart_reply_enabled INTEGER DEFAULT 1,
      training_simulation_enabled INTEGER DEFAULT 0,
      strict_script_flow_enabled INTEGER DEFAULT 0,
      platform_register_url TEXT DEFAULT '',
      tg_register_guide_url TEXT DEFAULT '',
      registration_tutorial_image_url TEXT DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS merchant_countries (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      code TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL DEFAULT '默认国家',
      default_language TEXT DEFAULT 'unknown',
      platform_register_url TEXT DEFAULT '',
      tg_register_guide_url TEXT DEFAULT '',
      require_platform_account INTEGER DEFAULT 1,
      require_phone INTEGER DEFAULT 1,
      require_telegram INTEGER DEFAULT 1,
      require_whatsapp INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(merchant_id, code),
      FOREIGN KEY(merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS training_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT DEFAULT 'default',
      country_id TEXT DEFAULT '',
      customer_message TEXT NOT NULL,
      standard_reply TEXT NOT NULL,
      stage TEXT DEFAULT '',
      intent TEXT DEFAULT 'unknown',
      language TEXT DEFAULT 'zh',
      keywords TEXT DEFAULT '',
      priority INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      merchant_id TEXT DEFAULT 'default',
      country_id TEXT DEFAULT '',
      customer_phone TEXT NOT NULL,
      a2c_account_phone TEXT NOT NULL,
      nickname TEXT DEFAULT '',
      language TEXT DEFAULT 'unknown',
      stage TEXT DEFAULT 'need_platform_register',
      flow_step TEXT DEFAULT '',
      extracted_phone TEXT DEFAULT '',
      extracted_telegram TEXT DEFAULT '',
      extracted_whatsapp TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      handoff_notified INTEGER DEFAULT 0,
      unread_count INTEGER DEFAULT 0,
      pinned_at TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(merchant_id, customer_phone, a2c_account_phone)
    );

    CREATE TABLE IF NOT EXISTS merchant_a2c_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT DEFAULT 'default',
      country_id TEXT DEFAULT '',
      api_phone TEXT NOT NULL,
      waba_id TEXT DEFAULT '',
      status INTEGER DEFAULT 0,
      number_status INTEGER DEFAULT 0,
      quality_rating INTEGER DEFAULT 0,
      messaging_limit INTEGER DEFAULT 0,
      verified_name TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(merchant_id, api_phone),
      FOREIGN KEY(merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS a2c_invite_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      country_id TEXT DEFAULT '',
      a2c_account_id INTEGER NOT NULL,
      a2c_account_phone TEXT NOT NULL,
      code TEXT NOT NULL,
      register_url TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'available',
      assigned_customer_key TEXT DEFAULT '',
      assigned_conversation_id TEXT DEFAULT '',
      platform_account TEXT DEFAULT '',
      assigned_at TEXT DEFAULT '',
      used_at TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(merchant_id, a2c_account_phone, code),
      FOREIGN KEY(merchant_id) REFERENCES merchants(id),
      FOREIGN KEY(a2c_account_id) REFERENCES merchant_a2c_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT DEFAULT 'default',
      country_id TEXT DEFAULT '',
      customer_key TEXT NOT NULL,
      nickname TEXT DEFAULT '',
      first_a2c_account_phone TEXT DEFAULT '',
      last_a2c_account_phone TEXT DEFAULT '',
      language TEXT DEFAULT 'unknown',
      stage TEXT DEFAULT 'need_platform_register',
      extracted_phone TEXT DEFAULT '',
      extracted_telegram TEXT DEFAULT '',
      extracted_whatsapp TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      conversation_count INTEGER DEFAULT 0,
      last_conversation_id TEXT DEFAULT '',
      first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(merchant_id, customer_key),
      FOREIGN KEY(merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT DEFAULT 'default',
      conversation_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      external_id TEXT,
      content TEXT DEFAULT '',
      msg_type TEXT DEFAULT 'text',
      language TEXT DEFAULT 'unknown',
      intent TEXT DEFAULT 'unknown',
      phone_detected TEXT DEFAULT '',
      telegram_detected TEXT DEFAULT '',
      raw_payload TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(external_id),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS handoff_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT DEFAULT 'default',
      conversation_id TEXT NOT NULL,
      telegram_message TEXT NOT NULL,
      sent INTEGER DEFAULT 0,
      error TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS knowledge_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT DEFAULT 'default',
      country_id TEXT DEFAULT '',
      type TEXT NOT NULL DEFAULT 'faq',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      language TEXT DEFAULT 'zh',
      priority INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS training_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT DEFAULT 'default',
      country_id TEXT DEFAULT '',
      source_type TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'enabled',
      raw_text TEXT DEFAULT '',
      item_count INTEGER DEFAULT 0,
      sample_count INTEGER DEFAULT 0,
      knowledge_count INTEGER DEFAULT 0,
      warnings_json TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS training_material_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      merchant_id TEXT DEFAULT 'default',
      country_id TEXT DEFAULT '',
      kind TEXT NOT NULL,
      sample_id INTEGER,
      knowledge_id INTEGER,
      title TEXT DEFAULT '',
      content TEXT NOT NULL,
      intent TEXT DEFAULT 'unknown',
      stage TEXT DEFAULT '',
      language TEXT DEFAULT 'zh',
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(material_id) REFERENCES training_materials(id),
      FOREIGN KEY(sample_id) REFERENCES training_samples(id),
      FOREIGN KEY(knowledge_id) REFERENCES knowledge_items(id)
    );

    CREATE TABLE IF NOT EXISTS customer_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      country_id TEXT DEFAULT '',
      customer_key TEXT NOT NULL,
      conversation_id TEXT,
      language TEXT DEFAULT 'unknown',
      stage TEXT DEFAULT 'need_platform_register',
      extracted_phone TEXT DEFAULT '',
      extracted_telegram TEXT DEFAULT '',
      extracted_whatsapp TEXT DEFAULT '',
      last_intent TEXT DEFAULT 'unknown',
      summary TEXT DEFAULT '',
      facts_json TEXT DEFAULT '{}',
      operator_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(merchant_id, country_id, customer_key),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS script_flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      country_id TEXT DEFAULT '',
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      active INTEGER DEFAULT 0,
      version INTEGER DEFAULT 1,
      source_filename TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS script_flow_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flow_id INTEGER NOT NULL,
      merchant_id TEXT NOT NULL,
      country_id TEXT DEFAULT '',
      flow_code TEXT NOT NULL,
      flow_name TEXT DEFAULT '',
      flow_step TEXT DEFAULT '',
      goal TEXT DEFAULT '',
      trigger_condition TEXT DEFAULT '',
      customer_expressions TEXT DEFAULT '',
      standard_reply TEXT NOT NULL,
      collect_info TEXT DEFAULT '',
      send_link INTEGER DEFAULT 0,
      send_invite INTEGER DEFAULT 0,
      next_condition TEXT DEFAULT '',
      next_flow_code TEXT DEFAULT '',
      next_flow_step TEXT DEFAULT '',
      forbidden TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(flow_id) REFERENCES script_flows(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS script_flow_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flow_id INTEGER NOT NULL,
      merchant_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(flow_id) REFERENCES script_flows(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversation_script_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL UNIQUE,
      flow_id INTEGER,
      flow_version INTEGER DEFAULT 1,
      current_step_id INTEGER,
      current_flow_step TEXT DEFAULT '',
      collected_json TEXT DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id),
      FOREIGN KEY(flow_id) REFERENCES script_flows(id)
    );

    CREATE TABLE IF NOT EXISTS conversation_followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      flow_step TEXT NOT NULL,
      followup_type TEXT NOT NULL DEFAULT 'idle_2m',
      sent INTEGER DEFAULT 0,
      error TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(conversation_id, flow_step, followup_type),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS intent_learning_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      country_id TEXT DEFAULT '',
      conversation_id TEXT DEFAULT '',
      message_id INTEGER,
      candidate_key TEXT NOT NULL,
      suggested_intent TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      description TEXT DEFAULT '',
      customer_text TEXT NOT NULL,
      language TEXT DEFAULT 'unknown',
      detected_intent TEXT DEFAULT 'unknown',
      inferred_intent TEXT DEFAULT 'unknown',
      contextual_intent TEXT DEFAULT 'unknown',
      flow_step TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'candidate',
      occurrence_count INTEGER DEFAULT 1,
      examples_json TEXT DEFAULT '[]',
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(merchant_id, country_id, candidate_key)
    );

    CREATE TABLE IF NOT EXISTS merchant_agent_profiles (
      merchant_id TEXT PRIMARY KEY,
      agent_name TEXT NOT NULL DEFAULT '开户注册接待专员',
      role_definition TEXT NOT NULL DEFAULT '拥有10年开户注册接待经验的客户引导专员，负责自然、耐心地引导客户完成开户注册。',
      tone_style TEXT NOT NULL DEFAULT '简短、口语化、耐心、像真人客服，不长篇大论。',
      core_goal TEXT NOT NULL DEFAULT '引导客户了解工作、完成平台开户、提交注册手机号、注册或提交 Telegram 用户名，并在资料齐全后转交人工。',
      must_follow TEXT NOT NULL DEFAULT '客户提问时先简短回答，再轻轻拉回当前流程；每次只处理当前最需要的一步。',
      forbidden TEXT NOT NULL DEFAULT '不能暴露 AI、机器人、模型、自动客服身份；不能承诺固定收益；不能要求私下转账；不能收集密码、验证码、银行卡或证件敏感信息。',
      uncertainty_policy TEXT NOT NULL DEFAULT '不确定的业务规则、收益、充值、任务细节，以页面说明或人工确认为准。',
      handoff_policy TEXT NOT NULL DEFAULT '客户提交手机号和 Telegram 后回复正在核实并转人工；客户强烈要求人工或连续无法解决时也可转人工。',
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS conversation_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL UNIQUE,
      score INTEGER DEFAULT 0,
      goal_completed INTEGER DEFAULT 0,
      summary TEXT DEFAULT '',
      main_concerns_json TEXT DEFAULT '[]',
      mistakes_json TEXT DEFAULT '[]',
      good_replies_json TEXT DEFAULT '[]',
      suggested_samples_json TEXT DEFAULT '[]',
      suggested_knowledge_json TEXT DEFAULT '[]',
      improvement_actions_json TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'generated',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS conversation_review_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_id INTEGER NOT NULL,
      merchant_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      item_type TEXT NOT NULL,
      title TEXT DEFAULT '',
      content TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'candidate',
      applied_target_type TEXT DEFAULT '',
      applied_target_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(review_id) REFERENCES conversation_reviews(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT DEFAULT '',
      country_id TEXT DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      task_type TEXT NOT NULL DEFAULT 'unknown',
      status TEXT NOT NULL DEFAULT 'success',
      duration_ms INTEGER DEFAULT 0,
      error TEXT DEFAULT '',
      http_status INTEGER,
      request_summary TEXT DEFAULT '',
      response_summary TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
	  `);

  db.exec("DROP TABLE IF EXISTS vector_documents;");

	  ensureColumn(db, "merchant_countries", "platform_register_url", "TEXT DEFAULT ''");
  ensureColumn(db, "merchant_countries", "tg_register_guide_url", "TEXT DEFAULT ''");
  ensureColumn(db, "merchant_countries", "require_platform_account", "INTEGER DEFAULT 1");
  ensureColumn(db, "merchant_countries", "require_phone", "INTEGER DEFAULT 1");
  ensureColumn(db, "merchant_countries", "require_telegram", "INTEGER DEFAULT 1");
  ensureColumn(db, "merchant_countries", "require_whatsapp", "INTEGER DEFAULT 0");
  ensureColumn(db, "training_samples", "merchant_id", "TEXT DEFAULT 'default'");
  ensureColumn(db, "training_samples", "country_id", "TEXT DEFAULT ''");
  ensureColumn(db, "conversations", "merchant_id", "TEXT DEFAULT 'default'");
  ensureColumn(db, "conversations", "country_id", "TEXT DEFAULT ''");
  ensureColumn(db, "conversations", "handoff_status", "TEXT DEFAULT 'pending'");
  ensureColumn(db, "conversations", "flow_step", "TEXT DEFAULT ''");
  ensureColumn(db, "conversations", "extracted_whatsapp", "TEXT DEFAULT ''");
  ensureColumn(db, "conversations", "unread_count", "INTEGER DEFAULT 0");
  ensureColumn(db, "conversations", "pinned_at", "TEXT DEFAULT ''");
  ensureColumn(db, "merchant_a2c_accounts", "merchant_id", "TEXT DEFAULT 'default'");
  ensureColumn(db, "merchant_a2c_accounts", "country_id", "TEXT DEFAULT ''");
  ensureColumn(db, "a2c_invite_codes", "merchant_id", "TEXT DEFAULT 'default'");
  ensureColumn(db, "a2c_invite_codes", "country_id", "TEXT DEFAULT ''");
  ensureColumn(db, "a2c_invite_codes", "a2c_account_phone", "TEXT DEFAULT ''");
  ensureColumn(db, "a2c_invite_codes", "register_url", "TEXT DEFAULT ''");
  ensureColumn(db, "a2c_invite_codes", "status", "TEXT DEFAULT 'available'");
  ensureColumn(db, "a2c_invite_codes", "assigned_customer_key", "TEXT DEFAULT ''");
  ensureColumn(db, "a2c_invite_codes", "assigned_conversation_id", "TEXT DEFAULT ''");
  ensureColumn(db, "a2c_invite_codes", "platform_account", "TEXT DEFAULT ''");
  ensureColumn(db, "a2c_invite_codes", "assigned_at", "TEXT DEFAULT ''");
  ensureColumn(db, "a2c_invite_codes", "used_at", "TEXT DEFAULT ''");
  ensureColumn(db, "customers", "merchant_id", "TEXT DEFAULT 'default'");
  ensureColumn(db, "customers", "country_id", "TEXT DEFAULT ''");
  ensureColumn(db, "customers", "extracted_whatsapp", "TEXT DEFAULT ''");
  ensureColumn(db, "merchant_configs", "telegram_handoff_chat_title", "TEXT DEFAULT ''");
  ensureColumn(db, "merchant_configs", "telegram_handoff_chat_status", "TEXT DEFAULT 'unbound'");
  ensureColumn(db, "merchant_configs", "telegram_handoff_chat_error", "TEXT DEFAULT ''");
  ensureColumn(db, "merchant_configs", "a2c_token_cache_key", "TEXT DEFAULT ''");
  ensureColumn(db, "merchant_configs", "a2c_access_token", "TEXT DEFAULT ''");
  ensureColumn(db, "merchant_configs", "a2c_token_expires_at", "INTEGER DEFAULT 0");
  ensureColumn(db, "merchant_configs", "ai_provider", "TEXT DEFAULT 'minimax'");
  ensureColumn(db, "merchant_configs", "minimax_api_key", "TEXT DEFAULT ''");
  ensureColumn(db, "merchant_configs", "minimax_model", "TEXT DEFAULT 'MiniMax-M3'");
  ensureColumn(db, "merchant_configs", "deepseek_api_key", "TEXT DEFAULT ''");
  ensureColumn(db, "merchant_configs", "deepseek_model", "TEXT DEFAULT 'deepseek-chat'");
  ensureColumn(db, "merchant_configs", "google_ai_api_key", "TEXT DEFAULT ''");
  ensureColumn(db, "merchant_configs", "google_ai_model", "TEXT DEFAULT 'gemini-2.5-flash'");
  ensureColumn(db, "merchant_configs", "smart_reply_enabled", "INTEGER DEFAULT 1");
  ensureColumn(db, "merchant_configs", "training_simulation_enabled", "INTEGER DEFAULT 0");
  ensureColumn(db, "merchant_configs", "strict_script_flow_enabled", "INTEGER DEFAULT 0");
  ensureColumn(db, "merchant_configs", "registration_tutorial_image_url", "TEXT DEFAULT ''");
  ensureColumn(db, "messages", "merchant_id", "TEXT DEFAULT 'default'");
  ensureColumn(db, "handoff_events", "merchant_id", "TEXT DEFAULT 'default'");
  ensureColumn(db, "knowledge_items", "merchant_id", "TEXT DEFAULT 'default'");
  ensureColumn(db, "knowledge_items", "country_id", "TEXT DEFAULT ''");
  ensureColumn(db, "training_materials", "merchant_id", "TEXT DEFAULT 'default'");
  ensureColumn(db, "training_materials", "country_id", "TEXT DEFAULT ''");
  ensureColumn(db, "training_material_items", "merchant_id", "TEXT DEFAULT 'default'");
  ensureColumn(db, "training_material_items", "country_id", "TEXT DEFAULT ''");
  ensureColumn(db, "customer_memories", "merchant_id", "TEXT DEFAULT 'default'");
  ensureColumn(db, "customer_memories", "country_id", "TEXT DEFAULT ''");
  ensureColumn(db, "customer_memories", "extracted_whatsapp", "TEXT DEFAULT ''");
  ensureColumn(db, "script_flows", "country_id", "TEXT DEFAULT ''");
  ensureColumn(db, "script_flows", "source_filename", "TEXT DEFAULT ''");
  ensureColumn(db, "script_flow_steps", "country_id", "TEXT DEFAULT ''");
  ensureColumn(db, "script_flow_steps", "flow_step", "TEXT DEFAULT ''");
  ensureColumn(db, "script_flow_steps", "next_flow_step", "TEXT DEFAULT ''");
  ensureColumn(db, "script_flow_steps", "enabled", "INTEGER DEFAULT 1");
  ensureColumn(db, "conversation_followups", "error", "TEXT DEFAULT ''");
  ensureColumn(db, "intent_learning_events", "country_id", "TEXT DEFAULT ''");
  ensureColumn(db, "intent_learning_events", "conversation_id", "TEXT DEFAULT ''");
  ensureColumn(db, "intent_learning_events", "message_id", "INTEGER");
  ensureColumn(db, "intent_learning_events", "display_name", "TEXT DEFAULT ''");
  ensureColumn(db, "intent_learning_events", "description", "TEXT DEFAULT ''");
  ensureColumn(db, "intent_learning_events", "examples_json", "TEXT DEFAULT '[]'");
  ensureColumn(db, "merchant_agent_profiles", "enabled", "INTEGER DEFAULT 1");
  ensureColumn(db, "conversation_reviews", "status", "TEXT DEFAULT 'generated'");
  ensureColumn(db, "conversation_review_items", "applied_target_type", "TEXT DEFAULT ''");
  ensureColumn(db, "conversation_review_items", "applied_target_id", "INTEGER");
  ensureColumn(db, "ai_call_logs", "merchant_id", "TEXT DEFAULT ''");
  ensureColumn(db, "ai_call_logs", "country_id", "TEXT DEFAULT ''");
  ensureColumn(db, "ai_call_logs", "provider", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "ai_call_logs", "model", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "ai_call_logs", "task_type", "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, "ai_call_logs", "status", "TEXT NOT NULL DEFAULT 'success'");
  ensureColumn(db, "ai_call_logs", "duration_ms", "INTEGER DEFAULT 0");
  ensureColumn(db, "ai_call_logs", "error", "TEXT DEFAULT ''");
  ensureColumn(db, "ai_call_logs", "http_status", "INTEGER");
  ensureColumn(db, "ai_call_logs", "request_summary", "TEXT DEFAULT ''");
  ensureColumn(db, "ai_call_logs", "response_summary", "TEXT DEFAULT ''");
  migrateCustomerMemoriesCountryKey(db);

  db.prepare("INSERT OR IGNORE INTO merchants (id, name, status) VALUES ('default', '默认商户', 'active')").run();
  db.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES ('default')").run();
  db.prepare("INSERT OR IGNORE INTO merchant_countries (id, merchant_id, code, name, default_language) VALUES ('default:default', 'default', 'default', '默认国家', 'unknown')").run();
  db.prepare("INSERT OR IGNORE INTO merchant_countries (id, merchant_id, code, name, default_language) SELECT id || ':default', id, 'default', '默认国家', 'unknown' FROM merchants").run();
  db.prepare("UPDATE training_samples SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE conversations SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE merchant_a2c_accounts SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE a2c_invite_codes SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE customers SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE messages SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE handoff_events SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE training_materials SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE training_material_items SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE customer_memories SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE script_flows SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE script_flow_steps SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE script_flow_versions SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE merchant_agent_profiles SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE conversation_reviews SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE conversation_review_items SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE training_samples SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE conversations SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE merchant_a2c_accounts SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE a2c_invite_codes SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE customers SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE knowledge_items SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE training_materials SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE training_material_items SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE customer_memories SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE script_flows SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE script_flow_steps SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function migrateCustomerMemoriesCountryKey(db: DatabaseSync): void {
  const indexes = db.prepare("PRAGMA index_list(customer_memories)").all() as Array<{ name: string; unique: number }>;
  const uniqueColumns = indexes
    .filter((index) => index.unique)
    .map((index) => (db.prepare(`PRAGMA index_info(${index.name})`).all() as Array<{ name: string }>).map((row) => row.name).join(","));
  if (uniqueColumns.includes("merchant_id,country_id,customer_key")) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_memories_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      country_id TEXT DEFAULT '',
      customer_key TEXT NOT NULL,
      conversation_id TEXT,
      language TEXT DEFAULT 'unknown',
      stage TEXT DEFAULT 'need_platform_register',
      extracted_phone TEXT DEFAULT '',
      extracted_telegram TEXT DEFAULT '',
      extracted_whatsapp TEXT DEFAULT '',
      last_intent TEXT DEFAULT 'unknown',
      summary TEXT DEFAULT '',
      facts_json TEXT DEFAULT '{}',
      operator_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(merchant_id, country_id, customer_key),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    );
  `);
  db.prepare(`
    INSERT OR IGNORE INTO customer_memories_new
      (id, merchant_id, country_id, customer_key, conversation_id, language, stage, extracted_phone, extracted_telegram, extracted_whatsapp, last_intent, summary, facts_json, operator_notes, created_at, updated_at)
    SELECT id, merchant_id, COALESCE(NULLIF(country_id, ''), merchant_id || ':default'), customer_key, conversation_id, language, stage, extracted_phone, extracted_telegram, COALESCE(extracted_whatsapp, ''), last_intent, summary, facts_json, operator_notes, created_at, updated_at
    FROM customer_memories
  `).run();
  db.exec("DROP TABLE customer_memories;");
  db.exec("ALTER TABLE customer_memories_new RENAME TO customer_memories;");
}

export function insertTrainingSamples(db: Db, samples: ImportedTrainingSample[], merchantId = "default", countryId = `${merchantId}:default`): number {
  const insert = db.sqlite.prepare(`
    INSERT INTO training_samples
      (merchant_id, country_id, customer_message, standard_reply, stage, intent, language, keywords, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.sqlite.prepare("SELECT 1");
  db.sqlite.exec("BEGIN");
  try {
    for (const sample of samples) {
      insert.run(
        merchantId,
        countryId,
        sample.customerMessage,
        sample.standardReply,
        sample.stage,
        sample.intent,
        sample.language,
        sample.keywords,
        sample.priority,
        sample.enabled ? 1 : 0
      );
    }
    tx.get();
    db.sqlite.exec("COMMIT");
    return samples.length;
  } catch (error) {
    db.sqlite.exec("ROLLBACK");
    throw error;
  }
}
