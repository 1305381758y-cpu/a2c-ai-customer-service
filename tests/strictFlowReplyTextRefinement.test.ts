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
    expect(result.reply).toBe("可以，我一步步带您处理注册。");
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

    expect(result.reply).toBe("Entiendo, la página del enlace no carga; pruebe cambiar de navegador o red. Si sigue igual, reviso el enlace.");
    expect(result.reply).not.toMatch(/registramos por aquí|nombre.*Telegram/i);
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

  it("preserves active merchant script-flow wording instead of rewriting it like built-in copy", async () => {
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
    expect(result.reply).toContain("Soy Laura");
    expect(result.reply).toContain("proceso exacto del cliente");
    expect(result.reply).not.toContain("este trabajo en línea ayuda a comerciantes");
    expect(result.naturalized).toMatchObject({ used: false, error: "已启用商户话本流程，保留节点原话术" });
  });

  it("still lets active script-flow replies answer customer questions inside the current node", async () => {
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

    expect(ai.naturalizeStrictFlowText).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      customerText: "¿De verdad se gana tanto?",
      draftReply: "Las ganancias exactas siguen las reglas de la página. ¿Tiene tiempo para continuar el registro?",
      questionType: "earning",
      flowStep: "registration_intent"
    }));
    expect(result.reply).toContain("Entiendo su duda");
    expect(result.naturalized).toMatchObject({ used: true });
  });
});
