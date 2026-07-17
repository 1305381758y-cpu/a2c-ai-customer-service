import type { ControlledQuestionType } from "../domain/strictFlowTypes.js";
import {
  asksAboutJob,
  asksEarningConcern,
  asksForOperationHelp,
  asksHowToOpenLink,
  asksInvestmentConcern,
  asksPaymentConcern,
  asksTelegramExplanation,
  asksTrustConcern,
  reportsLinkLoadFailure
} from "../domain/strictFlowPredicates.js";

type HistoryItem = { direction: string; content: string; intent?: string };
type StyleLanguage = "zh" | "en" | "pt" | "es";

interface IntentStyle {
  first: string[];
  repeated: string[];
  direct: string;
}

export interface ControlledQuestionStyleResult {
  reply: string;
  occurrence: number;
  openerChanged: boolean;
}

export function applyControlledQuestionStyle(input: {
  reply: string;
  language: string;
  questionType: ControlledQuestionType;
  customerText: string;
  history: HistoryItem[];
}): ControlledQuestionStyleResult {
  const style = styles[normalizeLanguage(input.language)][input.questionType];
  if (!style) return { reply: input.reply, occurrence: 1, openerChanged: false };

  const occurrence = input.history
    .filter((item) => item.direction === "inbound" && matchesQuestionType(item.content, input.questionType))
    .length + 1;
  const recentReplies = input.history
    .filter((item) => item.direction === "outbound")
    .slice(-5)
    .map((item) => normalize(item.content));
  const body = removeTrailingFlowPush(stripGenericOpener(input.reply), input.language).trim();

  if (occurrence >= 3) {
    return {
      reply: style.direct || body || input.reply,
      occurrence,
      openerChanged: true
    };
  }

  const candidates = occurrence === 1 ? style.first : style.repeated;
  const opener = candidates.find((candidate) =>
    !recentReplies.some((recent) => recent.startsWith(normalize(candidate)))
  ) ?? candidates[occurrence % candidates.length] ?? "";
  const reply = [opener, body].filter(Boolean).join(" ").trim();
  return {
    reply: reply || input.reply,
    occurrence,
    openerChanged: Boolean(opener)
  };
}

function matchesQuestionType(text: string, type: ControlledQuestionType): boolean {
  if (type === "trust") return asksTrustConcern(text);
  if (type === "payment") return asksPaymentConcern(text);
  if (type === "investment") return asksInvestmentConcern(text);
  if (type === "earning") return asksEarningConcern(text);
  if (type === "telegram") return asksTelegramExplanation(text) || /telegram|\btg\b/i.test(text);
  if (type === "link_open") return asksHowToOpenLink(text) || reportsLinkLoadFailure(text);
  if (type === "job") return asksAboutJob(text);
  if (type === "help") return asksForOperationHelp(text);
  return false;
}

function stripGenericOpener(reply: string): string {
  return reply
    .replace(/^(?:我理解(?:您|你)?的?(?:顾虑|顧慮|担心|擔心|问题|問題|疑问|疑問)|我明白(?:了)?|明白了?|这个问题问得很实际|這個問題問得很實際|当然可以|當然可以|可以，我(?:和|跟)您说明一下)[。！!，,\s]*/i, "")
    .replace(/^(?:Entendo|Compreendo)(?:\s+(?:a|sua|seu|essa|o))?[^.!?]{0,60}[.!?]\s*/i, "")
    .replace(/^(?:Claro|Certo|Perfeito|Tudo bem)[,.!]?\s*/i, "")
    .replace(/^(?:Entiendo|Comprendo)[^.!?]{0,60}[.!?]\s*/i, "")
    .replace(/^(?:Claro|De acuerdo|Perfecto|Vale)[,.!]?\s*/i, "")
    .replace(/^(?:I understand|I see|Got it)[^.!?]{0,60}[.!?]\s*/i, "")
    .replace(/^(?:Of course|Sure|Okay|Alright)[,.!]?\s*/i, "")
    .trim();
}

function removeTrailingFlowPush(reply: string, language: string): string {
  const normalizedLanguage = normalizeLanguage(language);
  if (normalizedLanguage === "zh") {
    return reply
      .replace(/[。；;]?\s*(?:您|你)(?:现在|現在)?(?:有空|方便|准备好|準備好).{0,24}(?:注册|註冊|开户|開戶)[吗嗎？?。！!]*$/i, "")
      .replace(/[。；;]?\s*(?:您|你)先.{0,20}(?:下载|下載|注册|註冊).{0,20}(?:告诉我|告訴我)[。！!]*$/i, "");
  }
  if (normalizedLanguage === "pt") {
    return reply
      .replace(/\s*(?:Você|Voce) (?:tem tempo|está livre|esta livre|pode continuar|quer continuar).{0,50}(?:cadastro|registr)[^.!?]*[.!?]*$/i, "")
      .replace(/\s*(?:Primeiro|Agora),?\s*(?:baixe|continue|faça|faca).{0,80}(?:me avise|me diga)[.!?]*$/i, "");
  }
  if (normalizedLanguage === "es") {
    return reply
      .replace(/\s*¿?(?:Tiene tiempo|Está libre|Puede continuar|Quiere continuar).{0,50}(?:registro|registr)[^.!?]*[.!?]*$/i, "")
      .replace(/\s*(?:Primero|Ahora),?\s*(?:descargue|continúe|continue|haga).{0,80}(?:avíseme|digame|dígame)[.!?]*$/i, "");
  }
  return reply
    .replace(/\s*(?:Do you have time|Are you free|Can you continue|Would you like to continue).{0,50}(?:registration|register)[^.!?]*[.!?]*$/i, "")
    .replace(/\s*(?:First|Now),?\s*(?:download|continue|complete).{0,80}(?:tell me|let me know)[.!?]*$/i, "");
}

function normalizeLanguage(language: string): StyleLanguage {
  const value = language.trim().toLowerCase();
  if (value.startsWith("pt")) return "pt";
  if (value.startsWith("es")) return "es";
  if (value.startsWith("en")) return "en";
  return "zh";
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const styles: Record<StyleLanguage, Partial<Record<ControlledQuestionType, IntentStyle>>> = {
  zh: {
    trust: {
      first: ["这个问题问得很实际。", "安全方面确实应该先确认清楚。"],
      repeated: ["我明白，您是想确认是否存在风险。", "您是在确认这一步是否可靠，我换个角度说明。"],
      direct: "我不能向您承诺绝对没有风险；请以页面规则和后续人工核验为准，也不要提交密码、验证码或进行私下转账。"
    },
    payment: {
      first: ["费用这点确实要先问清楚。", "是否需要付款，先确认清楚是对的。"],
      repeated: ["您担心注册后会涉及付款，这一点我说明清楚。", "您主要是在确认后面会不会收费，我直接说明。"],
      direct: "当前引导阶段不需要向客服私下付款或转账；后续如有平台规则，只以页面展示和人工确认为准。"
    },
    investment: {
      first: ["本金和投入这点需要先说清楚。", "是否要先投入资金，这个问题很关键。"],
      repeated: ["您是在确认会不会要求本金或押金，我直接说明。", "关于先投钱这件事，我再明确一次。"],
      direct: "当前引导阶段不需要向客服交本金、押金或垫付款；不要进行任何私下转账。"
    },
    earning: {
      first: ["收益范围确实需要说明清楚。", "您问的是实际能拿到多少，对吗？"],
      repeated: ["您想确认这个收益是不是固定的，我说明一下。", "您主要担心收益和实际情况不一致，我换个角度解释。"],
      direct: "页面中的收益只能作为参考，实际金额按完成的任务和平台规则核算，不能承诺固定收入。"
    },
    telegram: {
      first: ["Telegram 的用途我说明一下。", "您问的是为什么要用 Telegram，对吗？"],
      repeated: ["对，您现在主要想知道为什么必须使用 Telegram。", "您是在确认 Telegram 是否属于必要步骤，我直接说明。"],
      direct: "后续任务指导统一通过 Telegram 进行；准备好后系统会发送导师链接，由您主动联系导师。"
    },
    link_open: {
      first: ["链接打不开确实会影响下一步。", "我先按链接加载问题帮您排查。"],
      repeated: ["您反馈的是链接仍然无法加载，我继续按这个问题处理。", "问题还在打开链接这一步，我换一种排查方式。"],
      direct: "请换 Chrome 或 Safari、切换 Wi-Fi/移动网络并关闭 VPN 后再试；若仍无法加载，我会转人工核对链接。"
    },
    job: {
      first: ["可以，我和您说明一下。", "这个工作内容我先讲清楚。"],
      repeated: ["您是想进一步了解具体做什么，我继续说明。", "您还在确认工作内容，我换个角度介绍。"],
      direct: "这是一份按平台流程完成任务的线上兼职，具体任务、佣金和规则以页面与后续确认为准。"
    },
    help: {
      first: ["可以，我来帮您处理。", "没问题，我们按当前这一步来。"],
      repeated: ["您还是卡在当前操作，我继续按这一步协助。", "这个步骤还没解决，我们先把它处理好。"],
      direct: "请把当前页面提示或卡住的位置告诉我，我会只针对这一步继续指导。"
    }
  },
  pt: {
    trust: {
      first: ["Essa é uma dúvida importante.", "É certo confirmar a segurança antes de continuar."],
      repeated: ["Entendi, você quer confirmar se existe algum risco.", "Você quer ter certeza de que esta etapa é confiável; vou explicar por outro ângulo."],
      direct: "Não posso prometer risco zero. Confirme tudo pelas regras da página e pela verificação posterior, e nunca envie senha, código de verificação ou pagamento privado."
    },
    payment: {
      first: ["Essa questão de pagamento precisa ficar clara.", "É importante confirmar os custos antes de continuar."],
      repeated: ["Você quer saber se haverá algum pagamento depois do cadastro; vou esclarecer.", "Sua dúvida é se esta etapa envolve cobrança, então vou responder direto."],
      direct: "Nesta etapa, não é necessário pagar nem transferir dinheiro em particular para o atendimento. Qualquer regra posterior deve aparecer na página e ser confirmada."
    },
    investment: {
      first: ["A questão de investimento precisa ficar clara.", "É importante confirmar se existe algum valor inicial."],
      repeated: ["Você quer saber se haverá capital ou depósito; vou esclarecer.", "Sobre colocar dinheiro primeiro, vou responder de forma direta."],
      direct: "Nesta etapa, não é necessário entregar capital, depósito ou adiantamento ao atendimento. Não faça transferências privadas."
    },
    earning: {
      first: ["A faixa de ganhos merece uma explicação clara.", "Você quer confirmar quanto realmente pode receber, certo?"],
      repeated: ["Você quer saber se esse ganho é fixo; vou esclarecer.", "Sua dúvida é se o valor informado corresponde ao resultado real; vou explicar por outro ângulo."],
      direct: "Os valores informados são apenas referência. O ganho real depende das tarefas concluídas e das regras da plataforma; não há promessa de renda fixa."
    },
    telegram: {
      first: ["Vou explicar para que o Telegram é usado.", "Sua dúvida é por que usamos o Telegram, certo?"],
      repeated: ["Você quer confirmar por que o Telegram é necessário.", "A questão agora é se o Telegram faz parte obrigatória do processo; vou responder direto."],
      direct: "As orientações das tarefas são feitas pelo Telegram. Quando estiver pronto, enviaremos o link da professora para você entrar em contato diretamente com ela."
    },
    link_open: {
      first: ["O link não abrir realmente impede a próxima etapa.", "Vou ajudar a verificar o carregamento do link."],
      repeated: ["Você informou que o link continua sem carregar; vou tratar exatamente esse ponto.", "O problema ainda está na abertura do link, então vamos testar outra opção."],
      direct: "Tente Chrome ou Safari, alterne entre Wi-Fi e dados móveis e desligue VPN. Se continuar sem carregar, o link precisa ser verificado por uma pessoa."
    },
    job: {
      first: ["Posso explicar o trabalho com clareza.", "Vou resumir o que é este trabalho."],
      repeated: ["Você quer mais detalhes sobre o que será feito; vou continuar.", "A dúvida ainda é sobre o conteúdo do trabalho, então vou explicar por outro ângulo."],
      direct: "É um trabalho online por tarefas dentro do processo da plataforma. Detalhes, comissão e regras devem seguir a página e a confirmação posterior."
    },
    help: {
      first: ["Posso ajudar com esta etapa.", "Sem problema, vamos resolver o passo atual."],
      repeated: ["Você ainda está travado nesta operação; vou continuar por aqui.", "Este passo ainda não foi resolvido, então vamos focar nele."],
      direct: "Diga o aviso da página ou o ponto exato onde travou, e eu vou orientar somente esse passo."
    }
  },
  es: {
    trust: {
      first: ["Es una duda importante.", "Es correcto confirmar la seguridad antes de continuar."],
      repeated: ["Entiendo, quiere confirmar si existe algún riesgo.", "Quiere asegurarse de que este paso sea confiable; se lo explico desde otro ángulo."],
      direct: "No puedo prometer riesgo cero. Confirme todo con las reglas de la página y la verificación posterior, y nunca envíe contraseña, código de verificación ni pagos privados."
    },
    payment: {
      first: ["El tema del pago debe quedar claro.", "Es importante confirmar los costos antes de continuar."],
      repeated: ["Le preocupa que haya un pago después del registro; se lo aclaro.", "Quiere confirmar si este paso implica algún cobro; le respondo directo."],
      direct: "En esta etapa no necesita pagar ni transferir dinero de forma privada al servicio. Cualquier regla posterior debe aparecer en la página y confirmarse."
    },
    investment: {
      first: ["El tema de la inversión debe quedar claro.", "Es importante confirmar si existe un importe inicial."],
      repeated: ["Quiere saber si habrá capital o depósito; se lo aclaro.", "Sobre poner dinero primero, le respondo directamente."],
      direct: "En esta etapa no necesita entregar capital, depósito ni adelantos al servicio. No realice transferencias privadas."
    },
    earning: {
      first: ["La cifra de ganancias merece una explicación clara.", "Quiere confirmar cuánto se puede recibir realmente, ¿verdad?"],
      repeated: ["Quiere saber si esa ganancia es fija; se lo aclaro.", "Le preocupa que la cifra no coincida con el resultado real; se lo explico desde otro ángulo."],
      direct: "Las cifras informadas son solo una referencia. La ganancia real depende de las tareas y las reglas de la plataforma; no se promete un ingreso fijo."
    },
    telegram: {
      first: ["Le explico para qué se usa Telegram.", "Su duda es por qué usamos Telegram, ¿verdad?"],
      repeated: ["Quiere confirmar por qué Telegram es necesario.", "Ahora quiere saber si Telegram es un paso obligatorio; le respondo directamente."],
      direct: "La orientación de las tareas se realiza por Telegram. Cuando esté listo, enviaremos el enlace de la profesora para que usted la contacte directamente."
    },
    link_open: {
      first: ["Que el enlace no abra impide continuar.", "Voy a ayudarle a revisar la carga del enlace."],
      repeated: ["Me indica que el enlace sigue sin cargar; voy a centrarme en ese problema.", "El problema sigue en la apertura del enlace, así que probaremos otra opción."],
      direct: "Pruebe Chrome o Safari, cambie entre Wi-Fi y datos móviles y desactive VPN. Si sigue sin cargar, una persona debe revisar el enlace."
    },
    job: {
      first: ["Puedo explicarle el trabajo con claridad.", "Voy a resumirle en qué consiste este trabajo."],
      repeated: ["Quiere más detalles sobre lo que se hace; continúo con eso.", "La duda sigue siendo el contenido del trabajo; se lo explico desde otro ángulo."],
      direct: "Es un trabajo en línea por tareas dentro del proceso de la plataforma. Los detalles, la comisión y las reglas siguen la página y la confirmación posterior."
    },
    help: {
      first: ["Puedo ayudarle con este paso.", "No hay problema, resolvamos la operación actual."],
      repeated: ["Sigue atascado en esta operación; continúo desde aquí.", "Este paso aún no está resuelto, así que nos centraremos en él."],
      direct: "Dígame el aviso de la página o el punto exacto donde se quedó y le guiaré solo en ese paso."
    }
  },
  en: {
    trust: {
      first: ["That is an important question.", "It is sensible to confirm the safety first."],
      repeated: ["I see, you want to confirm whether there is any risk.", "You want to make sure this step is trustworthy, so I will explain it another way."],
      direct: "I cannot promise zero risk. Confirm everything through the page rules and later verification, and never send passwords, verification codes, or private payments."
    },
    payment: {
      first: ["The payment question should be clear first.", "It is important to confirm any cost before continuing."],
      repeated: ["You are concerned about payment after registration, so I will clarify it.", "You want to know whether this step involves a charge; here is the direct answer."],
      direct: "At this stage, you do not need to pay or privately transfer money to customer service. Any later rule must be shown on the page and confirmed."
    },
    investment: {
      first: ["The investment question should be clear first.", "It is important to confirm whether any starting funds are needed."],
      repeated: ["You want to know whether capital or a deposit is required; I will clarify.", "About putting money in first, here is the direct answer."],
      direct: "At this stage, you do not need to provide capital, a deposit, or an advance to customer service. Do not make private transfers."
    },
    earning: {
      first: ["The earnings range deserves a clear explanation.", "You want to confirm what can actually be earned, right?"],
      repeated: ["You want to know whether that income is fixed; I will clarify.", "You are checking whether the stated figure matches the real result; I will explain another way."],
      direct: "The stated figures are only a reference. Actual earnings depend on completed tasks and platform rules; fixed income is not guaranteed."
    },
    telegram: {
      first: ["Let me explain what Telegram is used for.", "You are asking why Telegram is used, right?"],
      repeated: ["You want to confirm why Telegram is required.", "The question now is whether Telegram is a necessary step; here is the direct answer."],
      direct: "Task guidance is handled through Telegram. When you are ready, we will send the mentor link so you can contact the mentor directly."
    },
    link_open: {
      first: ["The link not opening does block the next step.", "I will help check the link-loading issue."],
      repeated: ["You are reporting that the link still does not load, so I will focus on that.", "The problem is still opening the link, so let us try another route."],
      direct: "Try Chrome or Safari, switch between Wi-Fi and mobile data, and turn off VPN. If it still does not load, a person needs to verify the link."
    },
    job: {
      first: ["I can explain the work clearly.", "Let me summarize what this work involves."],
      repeated: ["You want more detail about what the work involves, so I will continue with that.", "Your question is still about the work itself, so I will explain it another way."],
      direct: "It is online task-based work within the platform process. Details, commission, and rules are subject to the page and later confirmation."
    },
    help: {
      first: ["I can help with this step.", "No problem, let us resolve the current step."],
      repeated: ["You are still stuck on this operation, so I will continue from here.", "This step is not resolved yet, so we will focus on it."],
      direct: "Tell me the page message or the exact point where you are stuck, and I will guide only that step."
    }
  }
};
