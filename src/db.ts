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
      platform_register_url TEXT DEFAULT '',
      tg_register_guide_url TEXT DEFAULT '',
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
  `);

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
  ensureColumn(db, "merchant_configs", "google_ai_api_key", "TEXT DEFAULT ''");
  ensureColumn(db, "merchant_configs", "google_ai_model", "TEXT DEFAULT 'gemini-2.5-flash'");
  ensureColumn(db, "merchant_configs", "smart_reply_enabled", "INTEGER DEFAULT 1");
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
  db.prepare("UPDATE training_samples SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE conversations SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE merchant_a2c_accounts SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE a2c_invite_codes SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE customers SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE knowledge_items SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE training_materials SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE training_material_items SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
  db.prepare("UPDATE customer_memories SET country_id = merchant_id || ':default' WHERE country_id IS NULL OR country_id = ''").run();
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
