import readXlsxFile from "read-excel-file/node";

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
