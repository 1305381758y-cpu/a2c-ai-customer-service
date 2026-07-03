import readXlsxFile from "read-excel-file/node";
import mammoth from "mammoth";

export interface ImportedScriptFlowStep {
  flowCode: string;
  flowName: string;
  flowStep: string;
  triggerCondition: string;
  goal: string;
  customerExpressions: string;
  standardReply: string;
  collectInfo: string;
  sendLink: boolean;
  sendInvite: boolean;
  nextCondition: string;
  nextFlowCode: string;
  nextFlowStep: string;
  forbidden: string;
  notes: string;
  sortOrder: number;
  enabled: boolean;
}

const headerAliases: Record<keyof ImportedScriptFlowStep, string[]> = {
  flowCode: ["流程编号", "编号", "节点编号", "flowCode", "flow_code"],
  flowName: ["流程名称", "节点名称", "名称", "flowName", "flow_name"],
  flowStep: ["流程步骤", "系统步骤", "状态", "flowStep", "flow_step"],
  triggerCondition: ["触发条件", "进入条件", "triggerCondition", "trigger_condition"],
  goal: ["当前节点目标", "本节点目标", "节点目标", "goal"],
  customerExpressions: ["客户常见表达", "客户表达", "用户表达", "customerExpressions"],
  standardReply: ["客服标准话术", "标准话术", "客服话术", "回复话术", "standardReply", "standard_reply"],
  collectInfo: ["需要收集的信息", "收集信息", "collectInfo", "collect_info"],
  sendLink: ["是否发链接", "是否发送注册链接", "发链接", "sendLink", "send_link"],
  sendInvite: ["是否发邀请码", "是否发送邀请码", "发邀请码", "sendInvite", "send_invite"],
  nextCondition: ["下一步条件", "下一步触发", "nextCondition", "next_condition"],
  nextFlowCode: ["下一流程编号", "下一节点编号", "nextFlowCode", "next_flow_code"],
  nextFlowStep: ["下一流程步骤", "下一系统步骤", "nextFlowStep", "next_flow_step"],
  forbidden: ["禁止事项", "禁止", "forbidden"],
  notes: ["备注", "说明", "notes"],
  sortOrder: ["排序", "顺序", "sortOrder", "sort_order"],
  enabled: ["是否启用", "启用", "enabled"]
};

export async function parseScriptFlowFile(buffer: Buffer, filename = "", mimeType = ""): Promise<ImportedScriptFlowStep[]> {
  if (isDocxFile(filename, mimeType)) return parseScriptFlowDocument(buffer);
  if (isTextFile(filename, mimeType)) return parseScriptFlowText(buffer.toString("utf8"));
  if (isCsvFile(filename, mimeType)) return parseScriptFlowCsv(buffer);
  return parseScriptFlowWorkbook(buffer);
}

export async function parseScriptFlowWorkbook(buffer: Buffer): Promise<ImportedScriptFlowStep[]> {
  const rows = await readXlsxFile(buffer);
  return parseStructuredRows(rows, "Excel");
}

export function parseScriptFlowCsv(buffer: Buffer): ImportedScriptFlowStep[] {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const rows = parseDelimitedRows(text);
  try {
    return parseStructuredRows(rows, "CSV");
  } catch (error) {
    if (error instanceof Error && /缺少必填列|至少需要表头/.test(error.message)) return parseScriptFlowText(text);
    throw error;
  }
}

function parseStructuredRows(rows: unknown[][], sourceName: string): ImportedScriptFlowStep[] {
  const nonEmpty = rows.filter((row) => row.some((cell) => String(cell ?? "").trim()));
  if (nonEmpty.length < 2) throw new Error(`${sourceName} 至少需要表头和一行流程话术`);

  const header = nonEmpty[0].map((cell) => String(cell ?? "").trim());
  const index = buildHeaderIndex(header);
  if (index.standardReply === undefined) throw new Error(`${sourceName} 缺少必填列：客服标准话术`);

  const result: ImportedScriptFlowStep[] = [];
  for (const [rowIndex, row] of nonEmpty.slice(1).entries()) {
    const standardReply = readCell(row, index.standardReply).trim();
    if (!standardReply) continue;
    const sortOrder = readNumber(row, index.sortOrder) || rowIndex + 1;
    const flowCode = readCell(row, index.flowCode) || String.fromCharCode(65 + rowIndex);
    result.push({
      flowCode,
      flowName: readCell(row, index.flowName),
      flowStep: readCell(row, index.flowStep) || flowCode,
      triggerCondition: readCell(row, index.triggerCondition),
      goal: readCell(row, index.goal),
      customerExpressions: readCell(row, index.customerExpressions),
      standardReply,
      collectInfo: readCell(row, index.collectInfo),
      sendLink: readBoolean(row, index.sendLink, false),
      sendInvite: readBoolean(row, index.sendInvite, false),
      nextCondition: readCell(row, index.nextCondition),
      nextFlowCode: readCell(row, index.nextFlowCode),
      nextFlowStep: readCell(row, index.nextFlowStep),
      forbidden: readCell(row, index.forbidden),
      notes: readCell(row, index.notes),
      sortOrder,
      enabled: readBoolean(row, index.enabled, true)
    });
  }

  if (!result.length) throw new Error("没有读取到有效流程话术，请检查“客服标准话术”列");
  return result;
}

export async function parseScriptFlowDocument(buffer: Buffer): Promise<ImportedScriptFlowStep[]> {
  const extracted = await mammoth.extractRawText({ buffer });
  return parseScriptFlowText(extracted.value || "");
}

export function parseScriptFlowText(text: string): ImportedScriptFlowStep[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\u00A0/g, " ");
  const explicit = parseExplicitTextSteps(normalized);
  const auto = explicit.length ? explicit : mergeDocumentLines(
    normalized
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
  ).map((reply, index) => buildImportedStep({
    flowCode: codeFromIndex(index),
    flowStep: inferDocumentStep(reply, index).step,
    standardReply: reply,
    sortOrder: index + 1,
    ...documentStepToInput(inferDocumentStep(reply, index))
  }));
  const result = applySequentialNextCodes(auto);
  if (!result.length) throw new Error("话本文档没有读取到有效话术内容");
  return result;
}

type PartialTextStep = Partial<ImportedScriptFlowStep> & { body: string[]; fields: Record<string, string[]> };

function parseExplicitTextSteps(text: string): ImportedScriptFlowStep[] {
  const mermaid = parseMermaidNodes(text);
  if (mermaid.length) return mermaid;

  const blocks: PartialTextStep[] = [];
  let current: PartialTextStep | null = null;
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);

  for (const raw of lines) {
    const heading = parseStepHeading(raw);
    if (heading) {
      if (current) blocks.push(current);
      current = {
        flowCode: heading.code,
        flowName: heading.name || `流程节点 ${heading.code}`,
        body: [],
        fields: {}
      };
      continue;
    }
    if (!current) continue;
    const field = parseFieldLine(raw);
    if (field) {
      current.fields[field.key] = [...(current.fields[field.key] || []), field.value];
    } else {
      current.body.push(raw);
    }
  }
  if (current) blocks.push(current);

  return blocks
    .map((block, index) => blockToImportedStep(block, index))
    .filter((step) => step.standardReply.trim().length > 0);
}

function parseMermaidNodes(text: string): ImportedScriptFlowStep[] {
  const nodeNames = new Map<string, string>();
  const nextByCode = new Map<string, string>();
  const nodeRegex = /([A-Za-z]\w*)\s*\[\s*([^\]]+?)\s*\]/g;
  let match: RegExpExecArray | null;
  while ((match = nodeRegex.exec(text))) {
    nodeNames.set(match[1], match[2]);
  }
  const arrowRegex = /([A-Za-z]\w*)\s*(?:-->|→)\s*([A-Za-z]\w*)/g;
  while ((match = arrowRegex.exec(text))) {
    nextByCode.set(match[1], match[2]);
  }
  if (!nodeNames.size) return [];

  return Array.from(nodeNames.entries()).map(([code, name], index) => {
    const inferred = inferDocumentStep(name, index);
    return buildImportedStep({
      flowCode: code,
      flowName: name,
      flowStep: inferred.step,
      triggerCondition: inferred.triggerCondition,
      goal: inferred.goal || name,
      customerExpressions: inferred.customerExpressions,
      standardReply: `待确认：${name}`,
      collectInfo: inferred.collectInfo,
      sendLink: inferred.sendLink,
      sendInvite: inferred.sendInvite,
      nextCondition: nextByCode.has(code) ? `完成后进入 ${nextByCode.get(code)}` : "",
      nextFlowCode: nextByCode.get(code) || "",
      nextFlowStep: inferred.nextStep,
      sortOrder: index + 1
    });
  });
}

function blockToImportedStep(block: PartialTextStep, index: number): ImportedScriptFlowStep {
  const field = (name: string) => (block.fields[name] || []).join("\n").trim();
  const reply = field("standardReply") || block.body.join("\n").trim() || block.flowName || `待确认流程节点 ${index + 1}`;
  const inferred = inferDocumentStep(`${block.flowName || ""}\n${reply}\n${field("goal")}\n${field("collectInfo")}`, index);
  return buildImportedStep({
    flowCode: block.flowCode || codeFromIndex(index),
    flowName: field("flowName") || block.flowName || inferred.name,
    flowStep: normalizeImportedFlowStep(field("flowStep") || block.flowStep || inferred.step),
    triggerCondition: field("triggerCondition") || inferred.triggerCondition,
    goal: field("goal") || inferred.goal,
    customerExpressions: field("customerExpressions") || inferred.customerExpressions,
    standardReply: reply,
    collectInfo: field("collectInfo") || inferred.collectInfo,
    sendLink: readTextBoolean(field("sendLink"), inferred.sendLink),
    sendInvite: readTextBoolean(field("sendInvite"), inferred.sendInvite),
    nextCondition: field("nextCondition"),
    nextFlowCode: field("nextFlowCode"),
    nextFlowStep: normalizeImportedFlowStep(field("nextFlowStep") || inferred.nextStep),
    forbidden: field("forbidden") || undefined,
    notes: field("notes") || undefined,
    sortOrder: Number(field("sortOrder")) || index + 1,
    enabled: readTextBoolean(field("enabled"), true)
  });
}

function buildImportedStep(input: Partial<ImportedScriptFlowStep> & Pick<ImportedScriptFlowStep, "flowCode" | "standardReply" | "sortOrder">): ImportedScriptFlowStep {
  return {
    flowCode: input.flowCode,
    flowName: input.flowName || "待确认节点",
    flowStep: normalizeImportedFlowStep(input.flowStep || ""),
    triggerCondition: input.triggerCondition || "",
    goal: input.goal || "",
    customerExpressions: input.customerExpressions || "",
    standardReply: input.standardReply,
    collectInfo: input.collectInfo || "",
    sendLink: Boolean(input.sendLink),
    sendInvite: Boolean(input.sendInvite),
    nextCondition: input.nextCondition || "",
    nextFlowCode: input.nextFlowCode || "",
    nextFlowStep: normalizeImportedFlowStep(input.nextFlowStep || ""),
    forbidden: input.forbidden || "不得暴露 AI、机器人或系统身份；不得编造收益、规则或承诺。",
    notes: input.notes || "由话本文档自动分析生成，请在页面检查节点后再启用。",
    sortOrder: input.sortOrder,
    enabled: input.enabled ?? true
  };
}

function applySequentialNextCodes(steps: ImportedScriptFlowStep[]): ImportedScriptFlowStep[] {
  return steps.map((step, index) => ({
    ...step,
    nextFlowCode: step.nextFlowCode || steps[index + 1]?.flowCode || "",
    nextCondition: step.nextCondition || (steps[index + 1] ? "当前节点目标完成后进入下一步" : "")
  }));
}

function mergeDocumentLines(lines: string[]): string[] {
  const replies: string[] = [];
  let buffer: string[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^(客服|回复|话术|标准话术|[A-Z]\s*[.、)]|\d+\s*[.、)])[:：\s]*/i, "").trim();
    if (!cleaned || /^(流程|节点|客户|用户|触发|条件|备注|禁止事项)[:：\s]/.test(cleaned)) continue;
    const startsNew = Boolean(buffer.length) && /^(您好|你好|好的|可以|没关系|恭喜|如果|请|打开|开户|注册|链接|邀请码|Hello|Hi|Okay|Sure|Olá|Certo|Claro|¡Hola|Bueno|Claro)/i.test(cleaned);
    if (startsNew) {
      replies.push(buffer.join("\n"));
      buffer = [];
    }
    buffer.push(cleaned);
  }
  if (buffer.length) replies.push(buffer.join("\n"));
  return replies.map((reply) => reply.trim()).filter((reply) => reply.length >= 4);
}

function inferDocumentStep(reply: string, index: number) {
  const text = reply.toLowerCase();
  if (/人工|接管|核实|稍后|handoff|manual|humano/.test(text)) {
    return scriptStep("human_handoff", "人工接管", "资料齐全后提示核实并转人工", "客户已提交完整资料", "", "ended", false, false);
  }
  if (/首次问候|初次问候|问候|打招呼|greeting/.test(text)) {
    return scriptStep("interest_screening", "兴趣筛选", "问候并确认客户是否有兴趣", "客户首次打招呼", "", "registration_intent", false, false);
  }
  if (/^(您好|你好|hello|hi|hola|olá|早上好)/i.test(reply) && /(想了解|是否|感兴趣|interested|interesse|interés|兼职|part-time|trabalho|trabajo|工作)/i.test(reply)) {
    return scriptStep("interest_screening", "兴趣筛选", "问候并确认客户是否有兴趣", "客户首次打招呼", "", "registration_intent", false, false);
  }
  if (/telegram|tg|@|用户名|username/.test(text)) {
    if (/下载|安装|play store|app store|download|install|baixar|descargar/.test(text)) {
      return scriptStep("telegram_download", "Telegram 下载引导", "引导客户下载/注册 Telegram", "没有 Telegram、不会下载", "Telegram 用户名", "collect_telegram", false, false);
    }
    return scriptStep("collect_telegram", "收集 Telegram 用户名", "要求客户发送 @ 开头用户名", "已安装 Telegram、找用户名", "Telegram 用户名", "human_handoff", false, false);
  }
  if (/链接|link|邀请码|invite|convite|注册步骤|开户注册|cadastro|registro/.test(text)) {
    return scriptStep("wait_registration", "发送注册步骤", "发送开户链接、邀请码和注册步骤", "客户确认有空或索要注册步骤", "注册手机号", "telegram_confirm", true, true);
  }
  if (/手机号|手机号码|电话号码|phone|telefone|teléfono/.test(text) && /注册|verify|核对|验证|cadastro|registro|发送|提交/.test(text)) {
    return scriptStep("telegram_confirm", "确认 Telegram", "收到手机号后确认 Telegram", "客户发送注册手机号", "Telegram 状态", "collect_telegram", false, false);
  }
  if (/收益|佣金|工作|兼职|ranking|rank|sales|income|ganancia|comisión|trabalho|comissão/.test(text)) {
    return scriptStep("registration_intent", "项目介绍", "介绍工作并确认是否继续注册", "客户表示有兴趣或想了解工作", "", "wait_registration", false, false);
  }
  if (index === 0) {
    return scriptStep("interest_screening", "兴趣筛选", "问候并确认客户是否有兴趣", "客户首次打招呼", "", "registration_intent", false, false);
  }
  return scriptStep("registration_intent", "流程话术", "按话本推进下一步", "客户继续对话", "", "", false, false);
}

function scriptStep(step: string, name: string, goal: string, customerExpressions: string, collectInfo: string, nextStep: string, sendLink: boolean, sendInvite: boolean) {
  return { step, name, goal, triggerCondition: customerExpressions, customerExpressions, collectInfo, nextStep, sendLink, sendInvite };
}

function documentStepToInput(inferred: ReturnType<typeof inferDocumentStep>): Partial<ImportedScriptFlowStep> {
  return {
    flowName: inferred.name,
    flowStep: inferred.step,
    triggerCondition: inferred.triggerCondition,
    goal: inferred.goal,
    customerExpressions: inferred.customerExpressions,
    collectInfo: inferred.collectInfo,
    sendLink: inferred.sendLink,
    sendInvite: inferred.sendInvite,
    nextFlowStep: inferred.nextStep
  };
}

function parseStepHeading(line: string): { code: string; name: string } | null {
  const cleaned = line.replace(/^#{1,6}\s*/, "").trim();
  const compact = cleaned.match(/^([A-Za-z]\w*|\d+)\s*\[\s*([^\]]+)\s*\]$/);
  if (compact) return { code: compact[1], name: compact[2].trim() };
  const matched = cleaned.match(/^(?:流程|节点|步骤)?\s*([A-Za-z]\w*|\d+)\s*[.、):：-]\s*(.+)$/);
  if (!matched) return null;
  const name = matched[2].replace(/^【|】$/g, "").trim();
  if (/^(客户|用户|客服|回复|触发|目标|标准话术|备注|禁止事项|下一步|是否)/.test(name)) return null;
  return { code: matched[1], name };
}

function parseFieldLine(line: string): { key: string; value: string } | null {
  const matched = line.match(/^([^:：]{2,18})[:：]\s*(.*)$/);
  if (!matched) return null;
  const key = fieldKey(matched[1]);
  if (!key) return null;
  return { key, value: matched[2].trim() };
}

function fieldKey(label: string): string {
  const normalized = normalizeHeader(label);
  const keys: Record<string, string> = {
    flowcode: "flowCode",
    流程编号: "flowCode",
    编号: "flowCode",
    flowname: "flowName",
    流程名称: "flowName",
    节点名称: "flowName",
    flowstep: "flowStep",
    流程步骤: "flowStep",
    系统步骤: "flowStep",
    触发条件: "triggerCondition",
    进入条件: "triggerCondition",
    goal: "goal",
    当前节点目标: "goal",
    本节点目标: "goal",
    节点目标: "goal",
    客户常见表达: "customerExpressions",
    客户表达: "customerExpressions",
    用户表达: "customerExpressions",
    客服标准话术: "standardReply",
    标准话术: "standardReply",
    客服话术: "standardReply",
    回复话术: "standardReply",
    需要收集的信息: "collectInfo",
    收集信息: "collectInfo",
    是否发链接: "sendLink",
    是否发送注册链接: "sendLink",
    发链接: "sendLink",
    是否发邀请码: "sendInvite",
    是否发送邀请码: "sendInvite",
    发邀请码: "sendInvite",
    下一步条件: "nextCondition",
    下一流程编号: "nextFlowCode",
    下一节点编号: "nextFlowCode",
    下一流程步骤: "nextFlowStep",
    下一系统步骤: "nextFlowStep",
    禁止事项: "forbidden",
    禁止: "forbidden",
    备注: "notes",
    说明: "notes",
    排序: "sortOrder",
    顺序: "sortOrder",
    是否启用: "enabled",
    启用: "enabled"
  };
  return keys[normalized] || "";
}

function normalizeImportedFlowStep(value: string): string {
  const normalized = value.trim();
  const aliases: Record<string, string> = {
    首次问候: "interest_screening",
    打招呼: "interest_screening",
    兴趣筛选: "interest_screening",
    项目介绍: "registration_intent",
    工作介绍: "registration_intent",
    确认注册意向: "registration_intent",
    发送链接: "wait_registration",
    发送注册链接: "wait_registration",
    等待完成注册: "wait_registration",
    等待注册: "wait_registration",
    收集手机号: "telegram_confirm",
    确认tg: "telegram_confirm",
    确认telegram: "telegram_confirm",
    下载tg: "telegram_download",
    下载telegram: "telegram_download",
    引导下载tg: "telegram_download",
    引导下载telegram: "telegram_download",
    收集tg: "collect_telegram",
    收集telegram: "collect_telegram",
    收集tg用户名: "collect_telegram",
    收集telegram用户名: "collect_telegram",
    人工接管: "human_handoff",
    结束: "ended"
  };
  return aliases[normalized.toLowerCase()] || aliases[normalized] || normalized || "registration_intent";
}

function readTextBoolean(value: string, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["是", "启用", "true", "1", "yes", "y"].includes(normalized)) return true;
  if (["否", "停用", "false", "0", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function codeFromIndex(index: number): string {
  if (index < 26) return String.fromCharCode(65 + index);
  return `N${index + 1}`;
}

function parseDelimitedRows(text: string): string[][] {
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function isDocxFile(filename: string, mimeType: string): boolean {
  const name = filename.toLowerCase();
  const mime = mimeType.toLowerCase();
  return name.endsWith(".docx") || mime.includes("wordprocessingml");
}

function isCsvFile(filename: string, mimeType: string): boolean {
  const name = filename.toLowerCase();
  const mime = mimeType.toLowerCase();
  return name.endsWith(".csv") || mime.includes("csv");
}

function isTextFile(filename: string, mimeType: string): boolean {
  const name = filename.toLowerCase();
  const mime = mimeType.toLowerCase();
  return name.endsWith(".txt") || name.endsWith(".md") || mime.startsWith("text/plain") || mime.includes("markdown");
}

function buildHeaderIndex(header: string[]): Partial<Record<keyof ImportedScriptFlowStep, number>> {
  const index: Partial<Record<keyof ImportedScriptFlowStep, number>> = {};
  for (const [key, aliases] of Object.entries(headerAliases) as Array<[keyof ImportedScriptFlowStep, string[]]>) {
    const found = header.findIndex((name) => aliases.some((alias) => normalizeHeader(alias) === normalizeHeader(name)));
    if (found >= 0) index[key] = found;
  }
  return index;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_/-]+/g, "");
}

function readCell(row: unknown[], index: number | undefined): string {
  if (index === undefined) return "";
  return String(row[index] ?? "").trim();
}

function readNumber(row: unknown[], index: number | undefined): number {
  const value = Number(readCell(row, index));
  return Number.isFinite(value) ? value : 0;
}

function readBoolean(row: unknown[], index: number | undefined, fallback: boolean): boolean {
  const value = readCell(row, index).toLowerCase();
  if (!value) return fallback;
  if (["是", "启用", "true", "1", "yes", "y"].includes(value)) return true;
  if (["否", "停用", "false", "0", "no", "n"].includes(value)) return false;
  return fallback;
}
