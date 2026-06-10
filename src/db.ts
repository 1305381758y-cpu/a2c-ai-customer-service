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
      telegram_bot_token TEXT DEFAULT '',
      telegram_handoff_chat_id TEXT DEFAULT '',
      platform_register_url TEXT DEFAULT '',
      tg_register_guide_url TEXT DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS training_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT DEFAULT 'default',
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
      customer_phone TEXT NOT NULL,
      a2c_account_phone TEXT NOT NULL,
      nickname TEXT DEFAULT '',
      language TEXT DEFAULT 'unknown',
      stage TEXT DEFAULT 'need_platform_register',
      extracted_phone TEXT DEFAULT '',
      extracted_telegram TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      handoff_notified INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(merchant_id, customer_phone, a2c_account_phone)
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
  `);

  ensureColumn(db, "training_samples", "merchant_id", "TEXT DEFAULT 'default'");
  ensureColumn(db, "conversations", "merchant_id", "TEXT DEFAULT 'default'");
  ensureColumn(db, "conversations", "handoff_status", "TEXT DEFAULT 'pending'");
  ensureColumn(db, "messages", "merchant_id", "TEXT DEFAULT 'default'");
  ensureColumn(db, "handoff_events", "merchant_id", "TEXT DEFAULT 'default'");

  db.prepare("INSERT OR IGNORE INTO merchants (id, name, status) VALUES ('default', '默认商户', 'active')").run();
  db.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES ('default')").run();
  db.prepare("UPDATE training_samples SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE conversations SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE messages SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
  db.prepare("UPDATE handoff_events SET merchant_id = 'default' WHERE merchant_id IS NULL OR merchant_id = ''").run();
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function insertTrainingSamples(db: Db, samples: ImportedTrainingSample[], merchantId = "default"): number {
  const insert = db.sqlite.prepare(`
    INSERT INTO training_samples
      (merchant_id, customer_message, standard_reply, stage, intent, language, keywords, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.sqlite.prepare("SELECT 1");
  db.sqlite.exec("BEGIN");
  try {
    for (const sample of samples) {
      insert.run(
        merchantId,
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
