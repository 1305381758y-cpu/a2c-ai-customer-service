import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import type { StrictFlowReply } from "../src/domain/strictFlow.js";
import type { MerchantAgentProfileRecord, ScriptFlowRuntime } from "../src/repositories.js";
import { refineStrictFlowReplyText } from "../src/services/strictFlowReplyTextRefinement.js";

function config() {
  return loadConfig({
    DATABASE_URL: ":memory:"
  });
}

function strictReply(overrides: Partial<StrictFlowReply> = {}): StrictFlowReply {
  return {
    enabled: true,
    reply: "好的，请继续注册。",
    language: "zh",
    stage: "need_platform_register",
    nextFlowStep: "wait_registration",
    needsInviteCode: false,
    controlledQuestionType: "help",
    controlledQuestionFallback: false,
    fallback: false,
    ...overrides
  };
}

function agentProfile(overrides: Partial<MerchantAgentProfileRecord> = {}): MerchantAgentProfileRecord {
  return {
    merchantId: "merchant-1",
    agentName: "接待专员",
    roleDefinition: "",
    toneStyle: "",
    coreGoal: "",
    mustFollow: "",
    forbidden: "",
    uncertaintyPolicy: "",
    handoffPolicy: "",
    enabled: true,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function scriptFlow(overrides: Partial<ScriptFlowRuntime> = {}): ScriptFlowRuntime {
  return {
    flow: {
      id: 12,
      merchantId: "merchant-1",
      countryId: "country-1",
      countryCode: "BO",
      countryName: "玻利维亚",
      name: "测试2222",
      status: "active",
      active: true,
      version: 1,
      sourceFilename: "商户话本",
      stepCount: 1,
      createdAt: "",
      updatedAt: ""
    },
    steps: [],
    ...overrides
  };
}

describe("strict flow reply text refinement", () => {
  it("naturalizes the strict-flow draft before running the language guard", async () => {
    const ai = {
      naturalizeStrictFlowText: vi.fn(async () => ({
        text: "可以，我一步步带您处理注册。",
        used: true,
        error: ""
      }))
    };

    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply(),
      customerText: "我不会注册",
      history: [],
      agentProfile: agentProfile()
    });

    expect(ai.naturalizeStrictFlowText).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      customerText: "我不会注册",
      draftReply: "好的，请继续注册。",
      flowStep: "wait_registration",
      questionType: "help",
      allowLinkOrInvite: false
    }));
    expect(result.reply).toContain("一步步带您处理注册");
    expect(result.reply).toMatch(/^可以，我来帮您处理。/);
    expect(result.naturalized).toMatchObject({ used: true });
    expect(result.languageGuard).toMatchObject({ status: "matched", targetLanguage: "zh" });
  });

  it("keeps simple replies local when no naturalization is needed", async () => {
    const ai = {
      naturalizeStrictFlowText: vi.fn()
    };

    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: "请把手机号发给我。",
        controlledQuestionType: "none"
      }),
      customerText: "好的",
      history: [],
      agentProfile: agentProfile({ enabled: false })
    });

    expect(ai.naturalizeStrictFlowText).not.toHaveBeenCalled();
    expect(result.reply).toBe("请把手机号发给我。");
    expect(result.naturalized).toMatchObject({ used: false });
    expect(result.languageGuard.status).toBe("matched");
  });

  it("does not naturalize missing invite-code fallback into asking the customer for a code", async () => {
    const ai = {
      naturalizeStrictFlowText: vi.fn(async () => ({
        text: "Perfecto. Para registrarle necesito su código de invitación. ¿Me lo puede facilitar cuando lo tenga a la mano?",
        used: true,
        error: ""
      }))
    };

    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: "El registro necesita código de invitación. Estoy confirmando su código exclusivo ahora. Espere un momento.",
        language: "es",
        nextFlowStep: "registration_intent",
        needsInviteCode: true,
        fallback: true,
        controlledQuestionType: "none"
      }),
      customerText: "Sí",
      history: [],
      agentProfile: agentProfile()
    });

    expect(ai.naturalizeStrictFlowText).not.toHaveBeenCalled();
    expect(result.reply).toBe("El registro necesita código de invitación. Estoy confirmando su código exclusivo ahora. Espere un momento.");
    expect(result.reply).not.toMatch(/facilitar|a mano|ya tiene/i);
    expect(result.naturalized).toMatchObject({ used: false, error: "邀请码未分配时跳过口语化改写" });
  });

  it("rejects naturalized replies that offer unsupported manual registration", async () => {
    const ai = {
      naturalizeStrictFlowText: vi.fn(async () => ({
        text: "Entiendo, si no logra abrirlo, lo registramos por aquí sin problema. Confírmeme su nombre, número de teléfono y usuario de Telegram.",
        used: true,
        error: ""
      }))
    };

    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: "Entiendo, la página del enlace no carga; pruebe cambiar de navegador o red. Si sigue igual, reviso el enlace.",
        language: "es",
        controlledQuestionType: "link_open"
      }),
      customerText: "No puedo acceder al enlace.",
      history: [],
      agentProfile: agentProfile(),
      scriptFlow: scriptFlow()
    });

    expect(result.reply).toContain("la página del enlace no carga");
    expect(result.reply).not.toMatch(/registramos por aquí|nombre.*Telegram/i);
  });

  it("rejects naturalized guarantees and hidden-risk assurances", async () => {
    const ai = {
      naturalizeStrictFlowText: vi.fn(async () => ({
        text: "O cadastro é rápido e seguro, sem nada escondido e sem nenhum risco.",
        used: true,
        error: ""
      }))
    };

    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: "As regras e a verificação seguem a página. Se algo não ficar claro, pode perguntar.",
        language: "pt-BR",
        controlledQuestionType: "trust"
      }),
      customerText: "É seguro?",
      history: [],
      agentProfile: agentProfile(),
      scriptFlow: scriptFlow()
    });

    expect(result.reply).toContain("regras e a verificação");
    expect(result.reply).not.toMatch(/sem nada escondido|sem nenhum risco|rápido e seguro/i);
    expect(result.naturalized.used).toBe(false);
  });

  it("does not naturalize customer-visible handoff acknowledgements", async () => {
    const ai = {
      naturalizeStrictFlowText: vi.fn(async () => ({
        text: "Entiendo, le quedó en blanco total. Vamos a pasarlo con un compañero para que lo revise directo con usted.",
        used: true,
        error: ""
      }))
    };

    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: "Estoy verificándolo ahora. Espere un momento, por favor.",
        language: "es",
        nextFlowStep: "human_handoff",
        stage: "ready_for_handoff",
        handoffReason: "客户反馈无法打开注册链接",
        controlledQuestionType: "link_open"
      }),
      customerText: "En blanco, no se puede cargar.",
      history: [],
      agentProfile: agentProfile(),
      scriptFlow: scriptFlow()
    });

    expect(ai.naturalizeStrictFlowText).not.toHaveBeenCalled();
    expect(result.reply).toBe("Estoy verificándolo ahora. Espere un momento, por favor.");
    expect(result.reply).not.toMatch(/compañero|pasarlo|revise directo/i);
    expect(result.naturalized).toMatchObject({ used: false, error: "接管提示保留固定话术" });
  });

  it("preserves a teacher Telegram link when handoff wording needs a local language fallback", async () => {
    const ai = { naturalizeStrictFlowText: vi.fn() };
    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: "现在把老师的 Telegram 链接发给您，请主动联系导师。https://t.me/local_teacher",
        language: "pt-BR",
        nextFlowStep: "human_handoff",
        stage: "ready_for_handoff"
      }),
      customerText: "Tenho Telegram",
      history: [],
      agentProfile: agentProfile(),
      scriptFlow: scriptFlow()
    });

    expect(result.reply).toContain("https://t.me/local_teacher");
    expect(result.reply).toMatch(/entre em contato diretamente/i);
    expect(result.reply).not.toMatch(/verificando suas informações/i);
  });

  it("keeps active merchant script-flow wording unchanged", async () => {
    const ai = {
      naturalizeStrictFlowText: vi.fn(async () => ({
        text: "Claro, le explico brevemente: este trabajo en línea ayuda a comerciantes a mejorar ventas y posicionamiento. ¿Tiene tiempo para continuar con el registro ahora?",
        used: true,
        error: ""
      }))
    };

    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: "Soy Laura, asesora de bienvenida de Shopee. Primero le explico el proceso exacto del cliente y luego seguimos con el registro.",
        language: "es",
        nextFlowStep: "registration_intent",
        controlledQuestionType: "none"
      }),
      customerText: "Sí",
      history: [],
      agentProfile: agentProfile(),
      scriptFlow: scriptFlow()
    });

    expect(ai.naturalizeStrictFlowText).not.toHaveBeenCalled();
    expect(result.reply).toBe("Soy Laura, asesora de bienvenida de Shopee. Primero le explico el proceso exacto del cliente y luego seguimos con el registro.");
    expect(result.naturalized).toMatchObject({ used: false, error: "启用话本后保留节点标准话术" });
  });

  it("never lets naturalization overwrite a persisted temporary-pause reply", async () => {
    const ai = {
      naturalizeStrictFlowText: vi.fn(async () => ({
        text: "Certo, vou explicar rapidamente: este trabalho online ajuda comerciantes a melhorar vendas. Você tem tempo para continuar o cadastro agora?",
        used: true,
        error: ""
      }))
    };
    const pauseReply = "Tudo bem, cuide do que precisa agora. Quando estiver disponível, me avise e continuamos.";

    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: pauseReply,
        language: "pt-BR",
        nextFlowStep: "registration_intent",
        flowHoldReason: "temporary_pause",
        controlledQuestionType: "unknown",
        controlledQuestionFallback: true,
        contextualIntent: {
          intent: "not_available",
          source: "rule",
          answeredPreviousQuestion: true,
          isQuestion: true,
          isSubmission: false,
          shouldPause: true,
          questionType: "none",
          nextAction: "pause politely",
          reason: "not available now"
        }
      }),
      customerText: "我现在暂时没空，可以等我一下吗",
      history: [],
      agentProfile: agentProfile(),
      scriptFlow: scriptFlow()
    });

    expect(ai.naturalizeStrictFlowText).not.toHaveBeenCalled();
    expect(result.reply).toBe(pauseReply);
    expect(result.naturalized).toMatchObject({ used: false, error: "流程暂停或拒绝状态保留固定话术" });
  });

  it("keeps custom registration packages unchanged", async () => {
    const configured = "好的，请按下面步骤注册。\n注册链接：https://example.test/register\n邀请码：BO-123\n注册步骤：\n1. 打开注册链接。\n2. 填写手机号。\n3. 设置用户名和密码。\n4. 输入邀请码。\n5. 提交注册。\n完成后告诉我。";
    const ai = {
      naturalizeStrictFlowText: vi.fn(async () => ({
        text: "Perfecto, abra el enlace y complete el registro.",
        used: true,
        error: ""
      }))
    };

    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: configured,
        needsInviteCode: true,
        nextFlowStep: "wait_registration"
      }),
      customerText: "Sí",
      history: [],
      agentProfile: agentProfile(),
      scriptFlow: scriptFlow()
    });

    expect(ai.naturalizeStrictFlowText).not.toHaveBeenCalled();
    expect(result.reply).toBe(configured);
    expect(result.naturalized).toMatchObject({
      used: false,
      error: "启用话本后保留节点标准话术"
    });
  });

  it("rotates repeated wording inside an active script without model rewriting", async () => {
    const repeated = "De acuerdo, siga primero los pasos de la página. Después del registro, envíeme el teléfono usado.";
    const ai = { naturalizeStrictFlowText: vi.fn() };

    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({ reply: repeated, language: "es", controlledQuestionType: "none" }),
      customerText: "ok",
      history: [{ direction: "outbound", content: repeated, intent: "unknown", createdAt: "" }],
      agentProfile: agentProfile(),
      scriptFlow: scriptFlow()
    });

    expect(result.reply).not.toBe(repeated);
    expect(result.reply).toContain("teléfono usado");
    expect(result.duplicateAvoided).toBe(true);
    expect(result.variantApplied).toBe(true);
    expect(ai.naturalizeStrictFlowText).not.toHaveBeenCalled();
  });

  it("naturalizes only the controlled answer when the customer asks a question inside an active script", async () => {
    const ai = {
      naturalizeStrictFlowText: vi.fn(async () => ({
        text: "Entiendo su duda. La ganancia se calcula por tareas reales y reglas de la página; si quiere seguimos con el registro paso a paso.",
        used: true,
        error: ""
      }))
    };

    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: "Las ganancias exactas siguen las reglas de la página. ¿Tiene tiempo para continuar el registro?",
        language: "es",
        nextFlowStep: "registration_intent",
        controlledQuestionType: "earning"
      }),
      customerText: "¿De verdad se gana tanto?",
      history: [],
      agentProfile: agentProfile(),
      scriptFlow: scriptFlow()
    });

    expect(ai.naturalizeStrictFlowText).toHaveBeenCalledOnce();
    expect(result.reply).toContain("La ganancia se calcula por tareas reales");
    expect(result.reply).toMatch(/^La cifra de ganancias merece una explicación clara\./);
    expect(result.naturalized).toMatchObject({ used: true });
  });

  it("uses intent-specific acknowledgement levels for repeated trust questions", async () => {
    const ai = {
      naturalizeStrictFlowText: vi.fn(async () => ({
        text: "Entendo sua preocupação. As regras e a verificação seguem a página e a confirmação posterior.",
        used: true,
        error: ""
      }))
    };
    const outbound = (content: string) => ({ direction: "outbound", content, intent: "unknown", createdAt: "" });
    const inbound = (content: string) => ({ direction: "inbound", content, intent: "trust_concern", createdAt: "" });

    const first = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: "As regras e a verificação seguem a página e a confirmação posterior.",
        language: "pt-BR",
        nextFlowStep: "registration_intent",
        controlledQuestionType: "trust"
      }),
      customerText: "Esse trabalho é real?",
      history: [],
      agentProfile: agentProfile(),
      scriptFlow: scriptFlow()
    });
    const second = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: "As regras e a verificação seguem a página e a confirmação posterior.",
        language: "pt-BR",
        nextFlowStep: "registration_intent",
        controlledQuestionType: "trust"
      }),
      customerText: "Posso ser enganado?",
      history: [inbound("Esse trabalho é real?"), outbound(first.reply)],
      agentProfile: agentProfile(),
      scriptFlow: scriptFlow()
    });
    const third = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: "As regras e a verificação seguem a página e a confirmação posterior.",
        language: "pt-BR",
        nextFlowStep: "registration_intent",
        controlledQuestionType: "trust"
      }),
      customerText: "Vocês vão me enganar?",
      history: [
        inbound("Esse trabalho é real?"),
        outbound(first.reply),
        inbound("Posso ser enganado?"),
        outbound(second.reply)
      ],
      agentProfile: agentProfile(),
      scriptFlow: scriptFlow()
    });

    expect(first.reply).toMatch(/^Essa é uma dúvida importante\./);
    expect(second.reply).toMatch(/^Entendi, você quer confirmar se existe algum risco\./);
    expect(third.reply).not.toMatch(/^(Entendo|Entendi|Compreendo|Claro)/i);
    expect(new Set([first.reply, second.reply, third.reply]).size).toBe(3);
  });

  it("rotates repeated temporary-pause replies without using the model", async () => {
    const repeated = "Tudo bem, cuide do que precisa agora. Quando estiver disponível, me avise e continuamos.";
    const ai = { naturalizeStrictFlowText: vi.fn() };

    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: repeated,
        language: "pt-BR",
        nextFlowStep: "registration_intent",
        flowHoldReason: "temporary_pause",
        controlledQuestionType: "none"
      }),
      customerText: "Tá bem",
      history: [{ direction: "outbound", content: repeated, intent: "unknown", createdAt: "" }],
      agentProfile: agentProfile(),
      scriptFlow: scriptFlow()
    });

    expect(result.reply).not.toBe(repeated);
    expect(result.reply).toMatch(/aguardar|quando puder|retomar/i);
    expect(result.duplicateAvoided).toBe(true);
    expect(result.variantApplied).toBe(true);
    expect(ai.naturalizeStrictFlowText).not.toHaveBeenCalled();
  });

  it("rotates a repeated refusal acknowledgement without restarting the flow", async () => {
    const repeated = "Tudo bem, não vou incomodar você agora. Se mudar de ideia, pode me chamar.";
    const ai = { naturalizeStrictFlowText: vi.fn() };

    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: repeated,
        language: "pt-BR",
        nextFlowStep: "registration_intent",
        flowHoldReason: "rejected",
        controlledQuestionType: "none"
      }),
      customerText: "Obrigado",
      history: [{ direction: "outbound", content: repeated, intent: "unknown", createdAt: "" }],
      agentProfile: agentProfile(),
      scriptFlow: scriptFlow()
    });

    expect(result.reply).not.toBe(repeated);
    expect(result.reply).toMatch(/não enviarei|encerrar/i);
    expect(result.reply).not.toMatch(/cadastro agora|continuar agora/i);
    expect(result.duplicateAvoided).toBe(true);
  });
});
