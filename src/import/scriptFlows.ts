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
  return parseScriptFlowWorkbook(buffer);
}

export async function parseScriptFlowWorkbook(buffer: Buffer): Promise<ImportedScriptFlowStep[]> {
  const rows = await readXlsxFile(buffer);
  const nonEmpty = rows.filter((row) => row.some((cell) => String(cell ?? "").trim()));
  if (nonEmpty.length < 2) throw new Error("Excel 至少需要表头和一行流程话术");

  const header = nonEmpty[0].map((cell) => String(cell ?? "").trim());
  const index = buildHeaderIndex(header);
  if (index.standardReply === undefined) throw new Error("Excel 缺少必填列：客服标准话术");

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
  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const replies = mergeDocumentLines(lines);
  const result = replies.map((reply, index) => {
    const inferred = inferDocumentStep(reply, index);
    return {
      flowCode: String.fromCharCode(65 + Math.min(index, 25)),
      flowName: inferred.name,
      flowStep: inferred.step,
      triggerCondition: inferred.triggerCondition,
      goal: inferred.goal,
      customerExpressions: inferred.customerExpressions,
      standardReply: reply,
      collectInfo: inferred.collectInfo,
      sendLink: inferred.sendLink,
      sendInvite: inferred.sendInvite,
      nextCondition: "",
      nextFlowCode: "",
      nextFlowStep: inferred.nextStep,
      forbidden: "不得暴露 AI、机器人或系统身份；不得编造收益、规则或承诺。",
      notes: "由 Word 话本文档自动拆分生成，请在页面确认后启用。",
      sortOrder: index + 1,
      enabled: true
    };
  });
  if (!result.length) throw new Error("Word 文档没有读取到有效话术内容");
  return result;
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
  if (/^(您好|你好|hello|hi|hola|olá)/i.test(reply) && /(想了解|是否|感兴趣|interested|interesse|interés|兼职|part-time|trabalho|trabajo)/i.test(reply)) {
    return scriptStep("interest_screening", "兴趣筛选", "问候并确认客户是否有兴趣", "客户首次打招呼", "", "registration_intent", false, false);
  }
  if (/telegram|tg|@|用户名|username/.test(text)) {
    if (/下载|安装|play store|app store|download|install|baixar|descargar/.test(text)) {
      return scriptStep("telegram_download", "Telegram 下载引导", "引导客户下载/注册 Telegram", "没有 Telegram、不会下载", "Telegram 用户名", "collect_telegram", false, false);
    }
    return scriptStep("collect_telegram", "收集 Telegram 用户名", "要求客户发送 @ 开头用户名", "已安装 Telegram、找用户名", "Telegram 用户名", "human_handoff", false, false);
  }
  if (/手机号|手机号码|电话号码|phone|telefone|teléfono/.test(text) && /注册|verify|核对|验证|cadastro|registro/.test(text)) {
    return scriptStep("telegram_confirm", "确认 Telegram", "收到手机号后确认 Telegram", "客户发送注册手机号", "Telegram 状态", "collect_telegram", false, false);
  }
  if (/链接|link|邀请码|invite|convite|注册步骤|开户注册|cadastro|registro/.test(text)) {
    return scriptStep("wait_registration", "发送注册步骤", "发送开户链接、邀请码和注册步骤", "客户确认有空或索要注册步骤", "注册手机号", "telegram_confirm", true, true);
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

function isDocxFile(filename: string, mimeType: string): boolean {
  const name = filename.toLowerCase();
  const mime = mimeType.toLowerCase();
  return name.endsWith(".docx") || mime.includes("wordprocessingml");
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
