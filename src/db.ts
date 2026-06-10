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
    CREATE TABLE IF NOT EXISTS training_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      UNIQUE(customer_phone, a2c_account_phone)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      conversation_id TEXT NOT NULL,
      telegram_message TEXT NOT NULL,
      sent INTEGER DEFAULT 0,
      error TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    );
  `);
}

export function insertTrainingSamples(db: Db, samples: ImportedTrainingSample[]): number {
  const insert = db.sqlite.prepare(`
    INSERT INTO training_samples
      (customer_message, standard_reply, stage, intent, language, keywords, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.sqlite.prepare("SELECT 1");
  db.sqlite.exec("BEGIN");
  try {
    for (const sample of samples) {
      insert.run(
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
