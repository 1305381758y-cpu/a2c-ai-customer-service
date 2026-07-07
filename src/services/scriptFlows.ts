import type { Repositories, ScriptFlowRecord, ScriptFlowRuntime, ScriptFlowStepRecord, ScriptFlowVersionRecord } from "../repositories.js";

export type ScriptFlowListQuery = {
  merchantId?: string;
  countryId?: string;
  status?: string;
};

export type ScriptFlowResult<T> =
  | { ok: true; value: T }
  | { ok: false; statusCode: 400 | 404; error: string };

export function listScriptFlows(repos: Repositories, query: ScriptFlowListQuery, merchantId?: string): { rows: ScriptFlowRecord[] } {
  return {
    rows: repos.listScriptFlows({
      merchantId: merchantId ?? query.merchantId,
      countryId: query.countryId,
      status: query.status
    })
  };
}

export function getScriptFlowDetail(
  repos: Repositories,
  id: string,
  merchantId?: string
): ScriptFlowResult<ScriptFlowRuntime & { versions: ScriptFlowVersionRecord[] }> {
  const flowId = Number(id);
  const row = repos.getScriptFlow(flowId, merchantId);
  if (!row) return notFound("script flow not found");
  return { ok: true, value: { ...row, versions: repos.listScriptFlowVersions(flowId, merchantId) } };
}

export function createBuiltInStrictScriptFlow(
  repos: Repositories,
  merchantId: string | undefined,
  input: { merchantId?: string; countryId?: string; name?: string },
  userName: string
): ScriptFlowResult<ScriptFlowRuntime> {
  const targetMerchantId = merchantId ?? input.merchantId;
  if (!targetMerchantId) return { ok: false, statusCode: 400, error: "请选择商户" };
  try {
    const flow = repos.createScriptFlow(targetMerchantId, {
      name: input.name?.trim() || "严格业务流程",
      countryId: input.countryId,
      sourceFilename: "系统内置",
      steps: builtInStrictScriptFlowSteps(),
      createdBy: userName || "系统"
    });
    return { ok: true, value: flow };
  } catch (error) {
    return badRequest(error, "create built-in script flow failed");
  }
}

export function patchScriptFlow(repos: Repositories, id: string, merchantId: string | undefined, patch: Record<string, unknown>, userName: string): ScriptFlowResult<ScriptFlowRuntime> {
  const row = repos.patchScriptFlow(Number(id), merchantId, patch, userName);
  if (!row) return notFound("script flow not found");
  return { ok: true, value: row };
}

export function deleteScriptFlow(repos: Repositories, id: string, merchantId?: string): ScriptFlowResult<{ ok: true }> {
  try {
    const ok = repos.deleteScriptFlow(Number(id), merchantId);
    if (!ok) return notFound("script flow not found");
    return { ok: true, value: { ok: true } };
  } catch (error) {
    return badRequest(error, "delete failed");
  }
}

export function enableScriptFlow(
  repos: Repositories,
  id: string,
  merchantId: string | undefined,
  userName: string,
  options: { enableStrictFlowConfig?: boolean } = {}
): ScriptFlowResult<ScriptFlowRuntime> {
  const row = repos.enableScriptFlow(Number(id), merchantId, userName);
  if (!row) return notFound("script flow not found");
  if (options.enableStrictFlowConfig) repos.patchMerchantConfig(row.flow.merchantId, { strictScriptFlowEnabled: true });
  return { ok: true, value: row };
}

export function restoreScriptFlowVersion(
  repos: Repositories,
  flowId: string,
  versionId: string,
  merchantId: string | undefined,
  userName: string
): ScriptFlowResult<ScriptFlowRuntime> {
  const row = repos.restoreScriptFlowVersion(Number(flowId), Number(versionId), merchantId, userName);
  if (!row) return notFound("script flow version not found");
  return { ok: true, value: row };
}

export function createScriptFlowStep(
  repos: Repositories,
  flowId: string,
  merchantId: string | undefined,
  input: Record<string, unknown>,
  userName: string
): ScriptFlowResult<ScriptFlowStepRecord> {
  try {
    const row = repos.createScriptFlowStep(Number(flowId), merchantId, input, userName);
    if (!row) return notFound("script flow not found");
    return { ok: true, value: row };
  } catch (error) {
    return badRequest(error, "invalid step");
  }
}

export function patchScriptFlowStep(repos: Repositories, id: string, merchantId: string | undefined, patch: Record<string, unknown>, userName: string): ScriptFlowResult<ScriptFlowStepRecord> {
  const row = repos.patchScriptFlowStep(Number(id), merchantId, patch, userName);
  if (!row) return notFound("script flow step not found");
  return { ok: true, value: row };
}

export function duplicateScriptFlowStep(repos: Repositories, id: string, merchantId: string | undefined, userName: string): ScriptFlowResult<ScriptFlowStepRecord> {
  const row = repos.duplicateScriptFlowStep(Number(id), merchantId, userName);
  if (!row) return notFound("script flow step not found");
  return { ok: true, value: row };
}

export function deleteScriptFlowStep(repos: Repositories, id: string, merchantId: string | undefined, userName: string): ScriptFlowResult<{ ok: true }> {
  try {
    const ok = repos.deleteScriptFlowStep(Number(id), merchantId, userName);
    if (!ok) return notFound("script flow step not found");
    return { ok: true, value: { ok: true } };
  } catch (error) {
    return badRequest(error, "delete failed");
  }
}

function notFound(error: string): ScriptFlowResult<never> {
  return { ok: false, statusCode: 404, error };
}

function badRequest(cause: unknown, fallback: string): ScriptFlowResult<never> {
  return { ok: false, statusCode: 400, error: cause instanceof Error ? cause.message : fallback };
}

function builtInStrictScriptFlowSteps(): Array<Record<string, unknown>> {
  return [
    {
      flowCode: "1",
      flowName: "首次问候",
      flowStep: "first_greeting",
      triggerCondition: "客户首次进入会话、打招呼或主动咨询",
      goal: "礼貌开场，确认客户是否想了解在线兼职",
      customerExpressions: "你好；早上好；Hola；Información；我想了解；兼职？",
      standardReply: "您好，您是想了解一份兼职在线工作吗？",
      nextCondition: "客户继续回复后进入兴趣筛选",
      nextFlowCode: "2",
      nextFlowStep: "interest_screening",
      forbidden: defaultForbidden(),
      notes: "开场不要发链接和邀请码。",
      sortOrder: 1,
      enabled: true
    },
    {
      flowCode: "2",
      flowName: "兴趣筛选",
      flowStep: "interest_screening",
      triggerCondition: "客户表示想了解、找工作、赚钱、有兴趣",
      goal: "确认客户是否对兼职有兴趣",
      customerExpressions: "是；是的；想了解；有兴趣；可以介绍吗；我想赚钱",
      standardReply: "好的，我先简单和您说一下。",
      nextCondition: "客户表达有兴趣后进入项目介绍",
      nextFlowCode: "3",
      nextFlowStep: "project_intro",
      forbidden: defaultForbidden(),
      notes: "客户有疑问时先简短回答，再继续介绍。",
      sortOrder: 2,
      enabled: true
    },
    {
      flowCode: "3",
      flowName: "项目介绍",
      flowStep: "project_intro",
      triggerCondition: "客户确认有兴趣或要求介绍工作",
      goal: "介绍工作内容和收益口径",
      customerExpressions: "介绍一下；什么工作；怎么赚钱；能赚多少",
      standardReply: "这份兼职主要是协助商家提升产品销量和排名，完成任务后可获得佣金。收益会按实际任务和平台规则核算，具体以后续页面和人工确认为准。",
      nextCondition: "介绍完成后确认客户是否方便继续开户注册",
      nextFlowCode: "4",
      nextFlowStep: "registration_intent",
      forbidden: defaultForbidden(),
      notes: "不要承诺固定收益。",
      sortOrder: 3,
      enabled: true
    },
    {
      flowCode: "4",
      flowName: "确认意向",
      flowStep: "registration_intent",
      triggerCondition: "客户了解项目后，继续询问或表示愿意操作",
      goal: "确认客户当前是否方便开户注册",
      customerExpressions: "方便；有空；可以；开始吧；怎么注册；发链接",
      standardReply: "您现在方便继续开户注册吗？如果方便，我把注册链接和邀请码发给您，并一步步带您完成。",
      nextCondition: "客户明确表示方便、可以开始、要链接或要邀请码",
      nextFlowCode: "5",
      nextFlowStep: "send_register_link",
      forbidden: defaultForbidden(),
      notes: "客户只是想了解更多时，不要提前发送链接。",
      sortOrder: 4,
      enabled: true
    },
    {
      flowCode: "5",
      flowName: "发送链接",
      flowStep: "send_register_link",
      triggerCondition: "客户确认方便开户注册或明确索要链接、邀请码、注册步骤",
      goal: "发送开户链接、邀请码和注册步骤",
      customerExpressions: "方便；发链接；发邀请码；怎么注册；不会注册",
      standardReply: "好的，我把注册链接和邀请码发给您。\n开户链接：{{REGISTER_URL}}\n邀请码：{{INVITE_CODE}}\n注册步骤：1. 打开链接；2. 填写手机号；3. 设置用户名和密码；4. 输入邀请码；5. 提交注册。",
      collectInfo: "注册手机号",
      sendLink: true,
      sendInvite: true,
      nextCondition: "发送链接和步骤后等待客户完成注册",
      nextFlowCode: "6",
      nextFlowStep: "wait_registration",
      forbidden: defaultForbidden(),
      notes: "同一会话复用同一个邀请码。",
      sortOrder: 5,
      enabled: true
    },
    {
      flowCode: "6",
      flowName: "等待注册",
      flowStep: "wait_registration",
      triggerCondition: "已发送链接和邀请码，等待客户操作",
      goal: "协助客户完成平台注册，并收集注册手机号",
      customerExpressions: "注册好了；不会注册；链接打不开；怎么填写；手机号是...",
      standardReply: "您先按页面步骤操作；如果卡住，把页面情况或截图发我。注册完成后，请把注册时使用的手机号发给我。",
      collectInfo: "注册手机号",
      nextCondition: "客户提交有效注册手机号",
      nextFlowCode: "7",
      nextFlowStep: "telegram_confirm",
      forbidden: defaultForbidden(),
      notes: "客户问问题时先回答问题，不要只重复催手机号。",
      sortOrder: 6,
      enabled: true
    },
    {
      flowCode: "7",
      flowName: "确认TG",
      flowStep: "telegram_confirm",
      triggerCondition: "已收到客户注册手机号",
      goal: "确认客户是否已有 Telegram",
      customerExpressions: "有 Telegram；没有 Telegram；TG 是什么；手机号已发",
      standardReply: "恭喜！您已成功注册。请保存您的用户名和密码，以免忘记。您需要一个 Telegram 账号才能开始工作，您有 Telegram 应用吗？",
      collectInfo: "Telegram状态",
      nextCondition: "有 Telegram 则收集用户名；没有 Telegram 则引导下载",
      nextFlowCode: "8",
      nextFlowStep: "telegram_download",
      forbidden: "不要收集客户密码；不要询问未配置目标；不要暴露 AI、机器人或系统身份。",
      notes: "客户说有 Telegram 时，可直接进入收集TG用户名。",
      sortOrder: 7,
      enabled: true
    },
    {
      flowCode: "8",
      flowName: "下载TG",
      flowStep: "telegram_download",
      triggerCondition: "客户没有 Telegram、不知道 Telegram 是什么、不会下载或不会注册",
      goal: "引导客户下载并注册 Telegram",
      customerExpressions: "我没有；没有 Telegram；怎么下载；不会注册；装好了",
      standardReply: "没关系，您可以在应用商店（Play Store 或 App Store）搜索 Telegram 并下载安装。创建账号后告诉我，我们会在 Telegram 继续指导您。",
      collectInfo: "Telegram账号",
      nextCondition: "客户表示已安装或已注册 Telegram",
      nextFlowCode: "9",
      nextFlowStep: "collect_telegram",
      forbidden: defaultForbidden(),
      notes: "客户说“我没有”时要结合上一句理解为没有 Telegram，不要当成拒绝。",
      sortOrder: 8,
      enabled: true
    },
    {
      flowCode: "9",
      flowName: "收集TG",
      flowStep: "collect_telegram",
      triggerCondition: "客户已有或已注册 Telegram",
      goal: "收集 @ 开头的 Telegram 用户名",
      customerExpressions: "@abc123；找不到用户名；没有@；用户名在哪里；怎么设置",
      standardReply: "请把您的 Telegram 用户名发给我，需要是 @ 开头的用户名。如果找不到，打开 Telegram → 设置 → Username/用户名；没有的话可以新建一个英文或数字组合。",
      collectInfo: "Telegram用户名",
      nextCondition: "识别到手机号和 @Telegram 用户名",
      nextFlowCode: "10",
      nextFlowStep: "human_handoff",
      forbidden: "不要把普通昵称当作 Telegram 用户名；必须是 @ 开头；不要暴露 AI、机器人或系统身份。",
      notes: "客户问为什么要 Telegram 时，先解释用途，再继续收集用户名。",
      sortOrder: 9,
      enabled: true
    },
    {
      flowCode: "10",
      flowName: "人工接管",
      flowStep: "human_handoff",
      triggerCondition: "注册手机号和 Telegram 用户名齐全",
      goal: "回复核实中，停止自动回复并通知人工接管",
      customerExpressions: "手机号 + @用户名 已齐全",
      standardReply: "我们正在核实，请稍后。",
      collectInfo: "注册手机号、Telegram用户名",
      nextCondition: "通知人工后结束自动流程",
      nextFlowCode: "11",
      nextFlowStep: "ended",
      forbidden: "接管后不要继续自动营销；不要重复通知接管群。",
      notes: "这是自动流程最后一句客户可见回复。",
      sortOrder: 10,
      enabled: true
    },
    {
      flowCode: "11",
      flowName: "结束",
      flowStep: "ended",
      triggerCondition: "人工已接管或流程已完成",
      goal: "结束自动流程",
      customerExpressions: "流程结束",
      standardReply: "流程已结束，等待人工继续跟进。",
      nextCondition: "无",
      nextFlowCode: "",
      nextFlowStep: "",
      forbidden: "不要继续自动回复客户。",
      notes: "用于流程配置展示，通常不会主动发送给客户。",
      sortOrder: 11,
      enabled: true
    }
  ];
}

function defaultForbidden() {
  return "不得暴露 AI、机器人或系统身份；不得编造收益、规则或承诺；不确定问题以页面或人工确认为准。";
}
