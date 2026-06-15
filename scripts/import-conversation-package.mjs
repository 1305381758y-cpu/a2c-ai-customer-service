import { createReadStream, copyFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parse } from "csv-parse";

const [, , inputPathArg, dbPathArg = "./data/app.db"] = process.argv;
if (!inputPathArg) {
  console.error("Usage: node --experimental-sqlite scripts/import-conversation-package.mjs <tsv-file> [db-path]");
  process.exit(1);
}

const inputPath = resolve(inputPathArg);
const dbPath = resolve(dbPathArg);
const merchantId = "default";
const countryId = "default:default";
const filename = basename(inputPath);
const sourceTag = `conversation_package:${filename}`;
const maxSamples = Number(process.env.MAX_SAMPLES || 25000);
const maxKnowledge = Number(process.env.MAX_KNOWLEDGE || 350);

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

const backupPath = `${dbPath}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
copyFileSync(dbPath, backupPath);

const stats = new Map();
const contentCounts = new Map();
let rowCount = 0;

for await (const row of readRows(inputPath)) {
  rowCount += 1;
  const sender = row.sender;
  const receiver = row.receiver;
  const content = normalizeContent(row.content);
  if (!sender || !receiver || !isUsefulText(content)) continue;
  let stat = stats.get(sender);
  if (!stat) {
    stat = { sent: 0, receivers: new Set(), contents: new Map() };
    stats.set(sender, stat);
  }
  stat.sent += 1;
  stat.receivers.add(receiver);
  stat.contents.set(content, (stat.contents.get(content) || 0) + 1);
  contentCounts.set(content, (contentCounts.get(content) || 0) + 1);
}

const agentAccounts = new Set(
  [...stats.entries()]
    .filter(([, stat]) => stat.sent >= 80 && stat.receivers.size >= 20)
    .map(([phone]) => phone)
);

const sampleMap = new Map();
const knowledgeCounts = new Map();
const pairLast = new Map();
let parsedRows = 0;
let candidatePairs = 0;

for await (const row of readRows(inputPath)) {
  parsedRows += 1;
  const sender = row.sender;
  const receiver = row.receiver;
  const content = normalizeContent(row.content);
  if (!sender || !receiver || !isUsefulText(content)) continue;

  if (agentAccounts.has(sender) && isAgentKnowledge(content)) {
    knowledgeCounts.set(content, (knowledgeCounts.get(content) || 0) + 1);
  }

  const pairKey = [sender, receiver].sort().join("|");
  const last = pairLast.get(pairKey);
  if (last && last.sender !== sender) {
    const currentIsAgent = agentAccounts.has(sender);
    const lastIsAgent = agentAccounts.has(last.sender);
    if (currentIsAgent && !lastIsAgent && isUsefulCustomerMessage(last.content) && isUsefulAgentReply(content)) {
      candidatePairs += 1;
      const intent = classifyIntent(last.content);
      const stage = stageForIntent(intent);
      const language = detectLanguage(last.content);
      const key = `${normalizeKey(last.content)}\n---\n${normalizeKey(content)}`;
      const existing = sampleMap.get(key);
      if (existing) {
        existing.count += 1;
      } else if (sampleMap.size < maxSamples * 2) {
        sampleMap.set(key, {
          customerMessage: clip(last.content, 1000),
          standardReply: clip(content, 1400),
          intent,
          stage,
          language,
          count: 1,
          keywords: [sourceTag, "真实聊天记录", sender, receiver, intent].join(",")
        });
      }
    }
  }
  pairLast.set(pairKey, { sender, receiver, content });
}

const samples = [...sampleMap.values()]
  .sort((a, b) => b.count - a.count || scoreSample(b) - scoreSample(a))
  .slice(0, maxSamples);

const knowledge = [...knowledgeCounts.entries()]
  .filter(([content, count]) => count >= 8 && isUsefulAgentReply(content))
  .sort((a, b) => b[1] - a[1])
  .slice(0, maxKnowledge)
  .map(([content, count]) => ({
    title: clip(content, 72),
    content: clip(content, 1800),
    language: detectLanguage(content),
    priority: Math.min(100, Math.max(5, Math.floor(count / 20))),
    count
  }));

db.exec("BEGIN");
try {
  const materialId = insertMaterial({
    filename,
    rawText: [
      `来源文件：${inputPath}`,
      `总行数：${rowCount}`,
      `识别客服账号数：${agentAccounts.size}`,
      `候选问答对：${candidatePairs}`,
      `导入样本数：${samples.length}`,
      `导入知识数：${knowledge.length}`,
      `说明：脚本按发送账号活跃度识别客服账号，并从连续双向消息中抽取“客户消息 -> 客服回复”。`
    ].join("\n")
  });

  let sampleCount = 0;
  let knowledgeCount = 0;
  const sampleStmt = db.prepare(`
    INSERT INTO training_samples
      (merchant_id, country_id, customer_message, standard_reply, stage, intent, language, keywords, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const materialSampleStmt = db.prepare(`
    INSERT INTO training_material_items
      (material_id, merchant_id, country_id, kind, sample_id, title, content, intent, stage, language, enabled)
    VALUES (?, ?, ?, 'sample', ?, ?, ?, ?, ?, ?, 1)
  `);

  for (const sample of samples) {
    const priority = Math.min(100, Math.max(1, sample.count));
    const result = sampleStmt.run(
      merchantId,
      countryId,
      sample.customerMessage,
      sample.standardReply,
      sample.stage,
      sample.intent,
      sample.language,
      `${sample.keywords},出现${sample.count}次`,
      priority
    );
    const sampleId = Number(result.lastInsertRowid);
    materialSampleStmt.run(
      materialId,
      merchantId,
      countryId,
      sampleId,
      clip(sample.customerMessage, 80),
      `${sample.customerMessage}\n${sample.standardReply}`,
      sample.intent,
      sample.stage,
      sample.language
    );
    sampleCount += 1;
  }

  const knowledgeStmt = db.prepare(`
    INSERT INTO knowledge_items
      (merchant_id, country_id, type, title, content, language, priority, enabled)
    VALUES (?, ?, 'script', ?, ?, ?, ?, 1)
  `);
  const materialKnowledgeStmt = db.prepare(`
    INSERT INTO training_material_items
      (material_id, merchant_id, country_id, kind, knowledge_id, title, content, intent, stage, language, enabled)
    VALUES (?, ?, ?, 'knowledge', ?, ?, ?, 'unknown', 'need_platform_register', ?, 1)
  `);
  for (const item of knowledge) {
    const result = knowledgeStmt.run(merchantId, countryId, item.title, item.content, item.language, item.priority);
    const knowledgeId = Number(result.lastInsertRowid);
    materialKnowledgeStmt.run(materialId, merchantId, countryId, knowledgeId, item.title, item.content, item.language);
    knowledgeCount += 1;
  }

  db.prepare(`
    UPDATE training_materials
    SET item_count = ?, sample_count = ?, knowledge_count = ?, warnings_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    sampleCount + knowledgeCount,
    sampleCount,
    knowledgeCount,
    JSON.stringify([
      `已自动过滤空消息、过短消息、明显无效内容和重复问答；候选问答对 ${candidatePairs} 条。`,
      `为避免检索噪声，默认最多导入 ${maxSamples} 条样本和 ${maxKnowledge} 条高频知识。`
    ]),
    materialId
  );

  db.exec("COMMIT");
  console.log(JSON.stringify({
    ok: true,
    backupPath,
    materialId,
    rowCount,
    parsedRows,
    agentAccounts: agentAccounts.size,
    candidatePairs,
    importedSamples: sampleCount,
    importedKnowledge: knowledgeCount
  }, null, 2));
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

function insertMaterial({ filename, rawText }) {
  const result = db.prepare(`
    INSERT INTO training_materials
      (merchant_id, country_id, source_type, filename, mime_type, status, raw_text, warnings_json)
    VALUES (?, ?, 'txt', ?, 'text/tab-separated-values; charset=utf-8', 'enabled', ?, '[]')
  `).run(merchantId, countryId, filename, rawText);
  return Number(result.lastInsertRowid);
}

async function* readRows(path) {
  const parser = createReadStream(path).pipe(parse({
    bom: true,
    columns: true,
    delimiter: "\t",
    quote: "\"",
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true
  }));
  for await (const record of parser) {
    yield {
      sender: String(record["发送账号"] || "").trim(),
      receiver: String(record["接收账号"] || "").trim(),
      content: String(record["内容"] || "").trim()
    };
  }
}

function normalizeContent(value) {
  return String(value || "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value) {
  return normalizeContent(value).toLowerCase().replace(/[.,!?，。！？\s]+/g, " ").trim();
}

function clip(value, max) {
  const text = normalizeContent(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function isUsefulText(text) {
  if (!text || text.length < 2 || text.length > 2500) return false;
  if (/^\?+$/.test(text) || /^[-_.\s]+$/.test(text)) return false;
  return true;
}

function isUsefulCustomerMessage(text) {
  if (!isUsefulText(text) || text.length > 600) return false;
  if (isProfane(text)) return false;
  return true;
}

function isUsefulAgentReply(text) {
  if (!isUsefulText(text) || text.length > 1600) return false;
  if (isProfane(text)) return false;
  return /[a-zA-ZÀ-ÿ\u4e00-\u9fff]/.test(text);
}

function isAgentKnowledge(text) {
  if (!isUsefulAgentReply(text)) return false;
  if (/^(ok|sim|não|nao|yes|no|oi|ol[aá]|hello)$/i.test(text)) return false;
  return text.length >= 20;
}

function isProfane(text) {
  return /\b(cu|porra|puta|foda|caralho|fuck|shit)\b/i.test(text);
}

function detectLanguage(text) {
  const lower = text.toLowerCase();
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[áàâãéêíóôõúç]/i.test(text) || /\b(sim|você|voce|não|nao|olá|ola|bom dia|boa noite|cadastro|cadastrar|trabalho|obrigad[ao]|quero|tenho|posso|preciso|fazer|pronto|interesse|interessad[ao]|enviei|meu|minha|certo)\b/i.test(lower)) return "pt";
  if (/\b(hello|good|please|register|registration|job|account|send|screenshot|time|work|earn|interested|joining|platform|complete|commission|reward)\b/i.test(lower)) return "en";
  return "unknown";
}

function classifyIntent(text) {
  const lower = text.toLowerCase();
  if (/\b(oi|olá|ola|bom dia|boa tarde|boa noite|hello|hi|good morning)\b/i.test(lower)) return "greeting";
  if (/\b(cadastro|cadastrar|registr|register|sign up|inscri)\b/i.test(lower)) return "ask_platform_register";
  if (/\b(link|site|url|entrada)\b/i.test(lower)) return "ask_link";
  if (/\b(telegram| tg\b|@[\w_]{3,})\b/i.test(lower)) return "ask_tg_register";
  if (/\b(whatsapp|zap|wa\b)\b/i.test(lower)) return "provide_telegram";
  if (/\b(n[ãa]o consigo|não sei|nao sei|ajuda|help|dúvida|duvida|problema|erro|screenshot|print)\b/i.test(lower)) return "need_help";
  if (/\b(seguro|confi[aá]vel|golpe|verdade|real|taxa|pagar|pagamento|dinheiro)\b/i.test(lower)) return "trust_concern";
  if (/\b(interess|quero|trabalho|job|vaga|part-time|tempo)\b/i.test(lower)) return "greeting";
  if (/\b\d{8,}\b/.test(lower)) return "provide_phone";
  return "unknown";
}

function stageForIntent(intent) {
  if (intent === "ask_tg_register") return "need_telegram";
  if (intent === "provide_phone") return "need_telegram";
  if (intent === "need_help") return "need_platform_register";
  if (intent === "trust_concern") return "need_platform_register";
  return "need_platform_register";
}

function scoreSample(sample) {
  const intentScore = sample.intent === "unknown" ? 0 : 10;
  const languageScore = sample.language === "unknown" ? 0 : 5;
  return intentScore + languageScore + Math.min(sample.customerMessage.length, 80) / 80;
}
