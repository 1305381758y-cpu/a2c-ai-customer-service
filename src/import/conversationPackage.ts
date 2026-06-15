import { parse } from "csv-parse/sync";
import type { ImportedTrainingSample } from "./trainingSamples.js";

export interface ParsedConversationPackage {
  rawSummary: string;
  samples: ImportedTrainingSample[];
  knowledge: Array<{
    type: "script";
    title: string;
    content: string;
    language: string;
    priority: number;
    enabled: boolean;
  }>;
  warnings: string[];
}

interface ConversationRow {
  sender: string;
  receiver: string;
  content: string;
}

export function looksLikeConversationPackage(buffer: Buffer): boolean {
  const header = buffer.subarray(0, 256).toString("utf8");
  return header.includes("发送账号") && header.includes("接收账号") && header.includes("内容");
}

export function parseConversationPackage(buffer: Buffer, filename: string, options: { maxSamples?: number; maxKnowledge?: number } = {}): ParsedConversationPackage {
  const maxSamples = options.maxSamples ?? 25000;
  const maxKnowledge = options.maxKnowledge ?? 350;
  const rows = parseRows(buffer);
  const stats = new Map<string, { sent: number; receivers: Set<string> }>();
  const knowledgeCounts = new Map<string, number>();

  for (const row of rows) {
    if (!isUsefulText(row.content)) continue;
    let stat = stats.get(row.sender);
    if (!stat) {
      stat = { sent: 0, receivers: new Set() };
      stats.set(row.sender, stat);
    }
    stat.sent += 1;
    stat.receivers.add(row.receiver);
  }

  const agentAccounts = new Set(
    [...stats.entries()]
      .filter(([, stat]) => stat.sent >= 80 && stat.receivers.size >= 20)
      .map(([phone]) => phone)
  );

  const samples = new Map<string, ImportedTrainingSample & { count: number }>();
  const pairLast = new Map<string, ConversationRow>();
  let candidatePairs = 0;

  for (const row of rows) {
    if (!isUsefulText(row.content)) continue;
    if (agentAccounts.has(row.sender) && isAgentKnowledge(row.content)) {
      knowledgeCounts.set(row.content, (knowledgeCounts.get(row.content) || 0) + 1);
    }
    const pairKey = [row.sender, row.receiver].sort().join("|");
    const last = pairLast.get(pairKey);
    if (last && last.sender !== row.sender && agentAccounts.has(row.sender) && !agentAccounts.has(last.sender) && isUsefulCustomerMessage(last.content) && isUsefulAgentReply(row.content)) {
      candidatePairs += 1;
      const intent = classifyIntent(last.content);
      const key = `${normalizeKey(last.content)}\n---\n${normalizeKey(row.content)}`;
      const existing = samples.get(key);
      if (existing) {
        existing.count += 1;
      } else if (samples.size < maxSamples * 2) {
        samples.set(key, {
          customerMessage: clip(last.content, 1000),
          standardReply: clip(row.content, 1400),
          intent,
          stage: stageForIntent(intent),
          language: detectLanguage(last.content),
          keywords: `真实聊天记录,${filename},${row.sender},${row.receiver},${intent}`,
          priority: 1,
          enabled: true,
          count: 1
        });
      }
    }
    pairLast.set(pairKey, row);
  }

  const finalSamples = [...samples.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxSamples)
    .map((sample) => ({
      customerMessage: sample.customerMessage,
      standardReply: sample.standardReply,
      intent: sample.intent,
      stage: sample.stage,
      language: sample.language,
      keywords: `${sample.keywords},出现${sample.count}次`,
      priority: Math.min(100, Math.max(1, sample.count)),
      enabled: true
    }));

  const knowledge = [...knowledgeCounts.entries()]
    .filter(([content, count]) => count >= 8 && isUsefulAgentReply(content))
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKnowledge)
    .map(([content, count]) => ({
      type: "script" as const,
      title: clip(content, 72),
      content: clip(content, 1800),
      language: detectLanguage(content),
      priority: Math.min(100, Math.max(5, Math.floor(count / 20))),
      enabled: true
    }));

  return {
    rawSummary: [
      `来源文件：${filename}`,
      `实际记录数：${rows.length}`,
      `识别客服账号数：${agentAccounts.size}`,
      `候选问答对：${candidatePairs}`,
      `导入样本数：${finalSamples.length}`,
      `导入知识数：${knowledge.length}`,
      "说明：系统按发送账号活跃度识别客服账号，并从连续双向消息中抽取“客户消息 -> 客服回复”。"
    ].join("\n"),
    samples: finalSamples,
    knowledge,
    warnings: [
      `已识别真实聊天流水：${rows.length} 条记录，抽取 ${finalSamples.length} 条训练样本，沉淀 ${knowledge.length} 条高频话术。`,
      `已自动过滤空消息、过短消息、明显无效内容和重复问答；候选问答对 ${candidatePairs} 条。`
    ]
  };
}

function parseRows(buffer: Buffer): ConversationRow[] {
  const records = parse(buffer, {
    bom: true,
    columns: true,
    delimiter: "\t",
    quote: "\"",
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true
  }) as Array<Record<string, string>>;
  return records
    .map((record) => ({
      sender: String(record["发送账号"] || "").trim(),
      receiver: String(record["接收账号"] || "").trim(),
      content: normalizeContent(record["内容"] || "")
    }))
    .filter((row) => row.sender && row.receiver && row.content);
}

function normalizeContent(value: string): string {
  return String(value || "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string): string {
  return normalizeContent(value).toLowerCase().replace(/[.,!?，。！？\s]+/g, " ").trim();
}

function clip(value: string, max: number): string {
  const text = normalizeContent(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function isUsefulText(text: string): boolean {
  if (!text || text.length < 2 || text.length > 2500) return false;
  if (/^\?+$/.test(text) || /^[-_.\s]+$/.test(text)) return false;
  return true;
}

function isUsefulCustomerMessage(text: string): boolean {
  return isUsefulText(text) && text.length <= 600 && !isProfane(text);
}

function isUsefulAgentReply(text: string): boolean {
  return isUsefulText(text) && text.length <= 1600 && !isProfane(text) && /[a-zA-ZÀ-ÿ\u4e00-\u9fff]/.test(text);
}

function isAgentKnowledge(text: string): boolean {
  if (!isUsefulAgentReply(text)) return false;
  if (/^(ok|sim|não|nao|yes|no|oi|ol[aá]|hello)$/i.test(text)) return false;
  return text.length >= 20;
}

function isProfane(text: string): boolean {
  return /\b(cu|porra|puta|foda|caralho|fuck|shit)\b/i.test(text);
}

function detectLanguage(text: string): string {
  const lower = text.toLowerCase();
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[áàâãéêíóôõúç]/i.test(text) || /\b(sim|você|voce|não|nao|olá|ola|bom dia|boa noite|cadastro|cadastrar|trabalho|obrigad[ao]|quero|tenho|posso|preciso|fazer|pronto|interesse|interessad[ao]|enviei|meu|minha|certo)\b/i.test(lower)) return "pt";
  if (/\b(hello|good|please|register|registration|job|account|send|screenshot|time|work|earn|interested|joining|platform|complete|commission|reward)\b/i.test(lower)) return "en";
  return "unknown";
}

function classifyIntent(text: string): ImportedTrainingSample["intent"] {
  const lower = text.toLowerCase();
  if (/\b(oi|olá|ola|bom dia|boa tarde|boa noite|hello|hi|good morning)\b/i.test(lower)) return "greeting";
  if (/\b(cadastro|cadastrar|registr|register|sign up|inscri)\b/i.test(lower)) return "ask_platform_register";
  if (/\b(link|site|url|entrada)\b/i.test(lower)) return "ask_link";
  if (/\b(telegram| tg\b|@[\w_]{3,})\b/i.test(lower)) return "ask_tg_register";
  if (/\b(n[ãa]o consigo|não sei|nao sei|ajuda|help|dúvida|duvida|problema|erro|screenshot|print)\b/i.test(lower)) return "need_help";
  if (/\b(seguro|confi[aá]vel|golpe|verdade|real|taxa|pagar|pagamento|dinheiro)\b/i.test(lower)) return "trust_concern";
  if (/\b\d{8,}\b/.test(lower)) return "provide_phone";
  return "unknown";
}

function stageForIntent(intent: ImportedTrainingSample["intent"]): ImportedTrainingSample["stage"] {
  if (intent === "ask_tg_register") return "need_tg_register";
  if (intent === "provide_phone") return "need_tg_register";
  return "need_platform_register";
}
