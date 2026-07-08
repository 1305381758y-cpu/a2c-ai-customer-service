import { isPositiveConfirmation, type ContextualIntentLabel, type InternalIntentLabel } from "./analyzer.js";
import type { ControlledQuestionType, StrictFlowStep } from "./strictFlowTypes.js";
import type { ConversationMessageRecord } from "../repositories.js";

export function isPositive(text: string, intent: string, inferredIntent: InternalIntentLabel = "unknown"): boolean {
  if (inferredIntent === "positive_confirmation") return true;
  if (intent === "platform_register_done") return true;
  if (isPositiveConfirmation(text)) return true;
  return /(有兴趣|想了解|想继续|要继续|继续|准备好了|有空|空闲|有时间|现在可以|愿意|同意|interested|i want|continue|free time|available|quero|tenho interesse|continuar|tenho tempo|dispon[ií]vel|vamos|pronto)/i.test(text.trim());
}

export function isContextualPositive(step: StrictFlowStep | "", intent: ContextualIntentLabel): boolean {
  if (intent === "positive_confirmation") return true;
  if (intent === "telegram_installed") return step === "telegram_confirm" || step === "telegram_download";
  if (intent === "acknowledgement") return step === "registration_intent" || step === "telegram_download";
  return false;
}

export function mapInternalToContextual(intent: InternalIntentLabel): ContextualIntentLabel {
  const map: Partial<Record<InternalIntentLabel, ContextualIntentLabel>> = {
    positive_confirmation: "positive_confirmation",
    negative_refusal: "negative_refusal",
    need_help: "need_help",
    ask_platform_register: "ask_platform_register",
    ask_link: "ask_link",
    ask_tg_register: "ask_tg_register",
    platform_register_done: "platform_register_done",
    payment_concern: "payment_concern",
    investment_concern: "investment_concern",
    trust_concern: "trust_concern",
    earning_concern: "earning_concern",
    workflow_question: "workflow_question",
    registration_field_question: "registration_field_question",
    job_question: "job_question",
    complaint: "complaint",
    chat: "chat",
    sensitive_request: "sensitive_request"
  };
  return map[intent] ?? "unknown";
}

export function contextualQuestionType(intent: ContextualIntentLabel): ControlledQuestionType {
  if (intent === "ask_tg_register" || intent === "no_telegram" || intent === "telegram_installed" || intent === "telegram_username_help") return "telegram";
  if (intent === "incomplete_phone") return "phone_reason";
  if (intent === "payment_concern") return "payment";
  if (intent === "investment_concern") return "investment";
  if (intent === "trust_concern") return "trust";
  if (intent === "earning_concern") return "earning";
  if (intent === "registration_field_question") return "registration_field";
  if (intent === "workflow_question" || intent === "not_registered" || intent === "need_help") return "help";
  if (intent === "job_question") return "job";
  if (intent === "complaint") return "complaint";
  if (intent === "chat") return "chat";
  if (intent === "sensitive_request") return "sensitive";
  if (intent === "unknown_question") return "unknown";
  return "none";
}

export function lastAssistantContent(history: Array<Pick<ConversationMessageRecord, "direction" | "content">>): string {
  return [...history].reverse().find((message) => message.direction === "outbound")?.content ?? "";
}

export function isContextualShortReply(text: string): boolean {
  const normalized = normalizeShortReply(text);
  return normalized.length > 0 && normalized.length <= 24 && /^(我没有|没有|沒|沒有|无|無|不会|不會|装好了|安装好了|下载好了|好了|好的|好|ok|okay|明白|知道了|yes|no|no lo tengo|no tengo|todavía no|todavia no|aún no|aun no|não|nao|sim|sí|si)$/i.test(normalized);
}

export function normalizeShortReply(text: string): string {
  return text.toLowerCase().replace(/[。.!?！？,，;；:：\s]+$/g, "").trim();
}

export function saysContextualNo(text: string): boolean {
  const normalized = normalizeShortReply(text);
  return /^(我没有|没有|沒有|没|沒|无|無|还没有|還沒有|没有telegram|没有tg|沒有telegram|沒有tg|no|nope|no lo tengo|no la tengo|no tengo|no tengo telegram|no tengo tg|não tenho|nao tenho|sem telegram)$/i.test(normalized);
}

export function saysNotAvailable(text: string): boolean {
  const normalized = normalizeShortReply(text);
  return /^(我没有|没有|沒有|没|沒|没空|沒有空|没时间|沒時間|没有时间|暂时没空|现在不行|no|not now|no time)$/i.test(normalized);
}

export function saysNotRegistered(text: string): boolean {
  const normalized = normalizeShortReply(text);
  if (/^(我没有|没有|沒有|没|沒|还没|还没有|還沒|還沒有|没完成|沒有完成|没注册|沒有注册|没有注册|不会注册|no|not yet|todav[ií]a no|a[uú]n no)$/i.test(normalized)) return true;
  return /(还没.*(注册|完成)|還沒.*(註冊|完成)|没有.*(注册|完成)|沒有.*(註冊|完成)|没.*注册成功|沒有.*註冊成功|not.*registered|not.*finished|not.*completed|haven'?t.*registered|todav[ií]a\s+no.*registr|a[uú]n\s+no.*registr|no\s+he\s+(logrado|podido)?\s*registr|no\s+me\s+he\s+registr|no\s+pude\s+(registr|complet)|no\s+he\s+(terminado|finalizado|completado)|no\s+termin[eé]|no\s+finalic[eé]|não\s+(consegui|terminei|finalizei).*cadastro|nao\s+(consegui|terminei|finalizei).*cadastro)/i.test(text);
}

export function saysTelegramInstalled(text: string): boolean {
  return /(装好了|安裝好了|安装好了|下载好了|下載好了|已经下载|已下載|已经装|已安装|installed|downloaded|instalei|baixei)/i.test(text.trim());
}

export function asksTelegramUsernameHelp(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return /(怎么找.*(用户名|用戶名|@)|哪里.*(用户名|用戶名|@)|在哪.*(用户名|用戶名|@)|(用户名|用戶名|@).*(在哪|哪里|哪裡)|看.*(用户名|用戶名|@)|没有\s*@|沒有\s*@|没有看到\s*@|没看到\s*@|沒看到\s*@|没有用户名|沒有用戶名|没用户名|沒用戶名|怎么设置.*(用户名|用戶名|@)|设置.*(用户名|用戶名|@)|需要设置吗|要设置吗|是不是.*设置|用户名是什么|用戶名是什麼|我找不到|找不到.*(用户名|用戶名|@)|没找到.*(用户名|用戶名|@)|沒找到.*(用户名|用戶名|@)|不会设置|不會設置|安卓手机|安卓|android|username.*(where|在哪|哪里|哪裡)|where.*username|set.*username|create.*username|find.*username|find.*@|couldn'?t.*(find|see).*(username|@)|can'?t.*(find|see).*(username|@)|cannot.*(find|see).*(username|@)|no\s*@|no username|don'?t have.*username|starting with @)/i.test(normalized);
}

export function saysTelegramUsernameMissing(text: string): boolean {
  const normalized = normalizeShortReply(text);
  return /^(我没有|没有|沒有|没|沒|无|無|没有@|沒有@|没看到|沒看到|没找到|沒找到|找不到|没有用户名|沒有用戶名|没用户名|沒用戶名|no|no username)$/i.test(normalized);
}

export function mentionsAndroidPhone(text: string): boolean {
  return /(安卓手机|安卓|android)/i.test(text);
}

export function isAcknowledgement(text: string): boolean {
  const normalized = normalizeShortReply(text);
  return /^(好|好的|好吧|ok|okay|明白|明白了|知道了|懂了|嗯|嗯嗯|行|可以|yes|sim|claro)$/i.test(normalized);
}

export function hasIncompleteRegistrationPhone(text: string): boolean {
  if (!/(注册好了|註冊好了|注册完|註冊完|已注册|已註冊|完成注册|完成註冊|registered|cadastrei|registrado)/i.test(text)) return false;
  const digits = text.replace(/https?:\/\/\S+/gi, " ").match(/\d[\d\s-]{4,10}\d/g);
  if (!digits) return false;
  return digits
    .map((value) => value.replace(/\D/g, ""))
    .some((value) => value.length > 0 && value.length < 8);
}

export function isRegistrationDoneConfirmation(text: string): boolean {
  return /^(好了|好啦|完成了|注册好了|註冊好了|注册完了|註冊完了|已注册|已註冊|done|finished|registered|terminei|concluí|conclui|cadastrei|pronto|finalizado|finalizada|finalic[eé]|terminado|terminada|ya\s+termin[eé]|completado|completada|ya\s+complet[eé]|registrado|registrada)$/i.test(text.trim().replace(/[。.!?！？,，;；:：]+$/g, ""));
}

export function saysNoTelegram(text: string): boolean {
  return /(没有|沒有|无|不用|不会|不想|没有tg|没有 telegram|no telegram|don't have telegram|dont have telegram|no lo tengo|no la tengo|no tengo telegram|no tengo tg|sem telegram|não tenho telegram|nao tenho telegram|não tenho|nao tenho)/i.test(text.trim());
}

export function asksForInviteOrLink(text: string, intent: string): boolean {
  return intent === "ask_link" || /(邀请码|邀請碼|链接|开户链接|link|invite code|invitation code|código|codigo|convite|cadastro)/i.test(text);
}

export function asksAboutPlatform(text: string): boolean {
  return /(什么平台|什麼平台|哪个平台|哪個平台|平台是做什么|平台做什么|什么项目|什麼項目|what platform|which platform|what project|que plataforma|qual plataforma)/i.test(text);
}

export function asksToChat(text: string): boolean {
  return /(可以聊|能聊|聊天|聊聊|说话|真人|人工|can we chat|talk to me|posso falar|conversar)/i.test(text);
}

export function asksTrustConcern(text: string): boolean {
  return /(安全|真的假的|可信|靠谱吗|可靠|骗人|骗子|騙子|欺骗|欺騙|诈骗|詐騙|违法|非法|走私|safe|trust|real|scam|fraud|illegal|contraband|seguro|confiável|confiavel|golpe|verdade|ilegal|contrabando|estafa|fraude)/i.test(text);
}

export function asksEarningConcern(text: string): boolean {
  return /(每天.*赚|收益.*多|赚.*这么多|這麼多|这么多|那么多|真的假的|真的.*赚|收入.*真实|佣金.*真实|earn.*that much|so much|income.*real|real earnings|ganhar.*tanto|renda.*real|ganhos.*reais)/i.test(text);
}

export function asksPaymentConcern(text: string): boolean {
  return /(付钱|付費|付款|交钱|交錢|收费|收費|花钱|花錢|充值|转账|轉帳|私下付款|私下转账|私下轉帳|需要.{0,4}(付|交|花|转|轉|充值|付款|收费|收費)|要.{0,4}(付|交|花|转|轉|充值|付款|收费|收費)|pay|payment|fee|charge|deposit|recharge|transfer money|pagar|pagamento|taxa|cobrança|cobranca|recarga|transferir)/i.test(text);
}

export function asksInvestmentConcern(text: string): boolean {
  return /(投资|投資|投钱|投錢|本金|押金|垫付|墊付|先付|先交|先充|预付|預付|需要.{0,6}(投资|投資|本金|押金|垫付|墊付)|investment|invest|principal|advance payment|upfront|pay first|dep[oó]sito|adiantar|investimento)/i.test(text);
}

export function asksTelegramExplanation(text: string): boolean {
  return /(telegram.*是什么|telegram.*是什麼|tg.*是什么|tg.*是什麼|什么是.*telegram|什麼是.*telegram|什么是.*tg|什麼是.*tg|telegram.*干嘛|telegram.*幹嘛|tg.*干嘛|tg.*幹嘛|为什么.*telegram|為什麼.*telegram|为什么.*tg|為什麼.*tg|what is telegram|what.*telegram.*for|why.*telegram|o que.*telegram|para que.*telegram|por que.*telegram)/i.test(text);
}

export function asksServiceIdentity(text: string): boolean {
  return /(你是谁|你是誰|你是什么人|你是什麼人|你干嘛的|你幹嘛的|你负责什么|你負責什麼|who are you|what are you|quem é você|quem e voce|quem é vc|quem e vc)/i.test(text);
}

export function asksWhyPhone(text: string): boolean {
  return /(为什么.*手机号|為什麼.*手機號|为什么.*手机号码|为什么.*電話|为什么.*号码|要手机号干嘛|要手机号码干嘛|why.*phone|why.*number|por que.*telefone|para que.*telefone)/i.test(text);
}

export function asksRegistrationFieldQuestion(text: string): boolean {
  return /(用户名.*(真实|真名|名字|姓名|怎么填|怎麼填|填什么|填什麼)|用户名称.*(真实|真名|名字|姓名|怎么填|怎麼填|填什么|填什麼)|姓名.*(要不要|需要|必须|必須|真实|真實)|真实.*名字|真名|手机号.*(真实|真實|自己的|本人|怎么填|怎麼填|填什么|填什麼)|手机号码.*(真实|真實|自己的|本人|怎么填|怎麼填|填什么|填什麼)|电话号码.*(真实|真實|自己的|本人)|電話號碼.*(真实|真實|自己的|本人)|密码.*(怎么填|怎麼填|填什么|填什麼|要求)|密碼.*(怎么填|怎麼填|填什么|填什麼|要求)|邮箱.*(怎么填|怎麼填|填什么|填什麼|要不要)|郵箱.*(怎么填|怎麼填|填什么|填什麼|要不要)|邀请码.*(填哪|哪里填|哪裡填|怎么填|怎麼填)|邀請碼.*(填哪|哪里填|哪裡填|怎么填|怎麼填)|页面.*字段|表单.*字段|username.*(real|name|fill)|phone.*(real|own|fill)|password.*fill|email.*fill|invite.*where|invite.*fill)/i.test(text);
}

export function asksToAnswerPreviousQuestion(text: string): boolean {
  return /(回答.*问题|回覆.*问题|回复.*问题|回答我的问题|回我的问题|没回答我的问题|沒有回答我的問題|没有回复我的问题|沒有回覆我的問題|answer my question)/i.test(text);
}

export function asksHowToOpenLink(text: string): boolean {
  const normalized = text.trim().replace(/[。.!?！？,，;；:：]+$/g, "");
  if (/^(还是)?(打不开|打不開|无法打开|無法打開|开不了|開不了|进不去|進不去|打不开了|打不開了)$/i.test(normalized)) return true;
  return /(链接.*怎么.*打开|链接.*打不开|链接.*无法.*打开|链接.*不能.*打开|链接.*打不.*开|链接.*加载不了|链接.*无法加载|打不.*链接|打不开.*链接|无法.*打开.*链接|无法.*加载.*链接|怎么打开.*链接|(卡在|卡到|卡住|开在|開在).*(打开链接|打開鏈接|链接|鏈接)|浏览器.*打开|chrome|safari|how.*open.*link|link.*not.*open|link.*won'?t.*open|cannot.*open.*link|abrir.*link|link.*não abre|link.*nao abre)/i.test(text);
}

export function reportsLinkLoadFailure(text: string): boolean {
  const normalized = text.trim().replace(/[。.!?！？,，;；:：]+$/g, "");
  if (/^(还是)?(打不开|打不開|无法打开|無法打開|开不了|開不了|进不去|進不去|打不开了|打不開了)$/i.test(normalized)) return true;
  return /(还是.*(打不开|打不開|开不了|開不了|进不去|進不去|加载不出来|載入不出來|无法加载|無法載入)|我说.*(打不开|打不開|无法打开|無法打開|无法加载|無法載入)|没有报错.*(打不开|打不開|加载不出来|无法加载|空白)|没报错.*(打不开|打不開|加载不出来|无法加载|空白)|無報錯.*(打不開|載入不出來)|链接.*(一直加载|加载不出来|无法加载|載入不出來|空白|没反应|沒有反應)|页面.*(加载不出来|无法加载|載入不出來|空白|没内容|沒有內容)|无法加载内容|載入不了內容|cannot load|won'?t load|still.*not.*open|still.*cannot.*open|page.*blank|page.*not.*load)/i.test(text);
}

export function asksGenericQuestionPermission(text: string): boolean {
  return /(我有(个|個)?问题.*(可以|能|帮|幫).*?(解答|回答|问|問)|我还有(一个|個|个)?问题|还有(一个|個|个)?问题|可以.*(问|問).*问题|能.*(问|問).*问题|我想问.*问题|i have.*question|another question|can i ask|posso perguntar|tenho uma pergunta)/i.test(text);
}

export function asksLookAtCurrentProblem(text: string): boolean {
  const normalized = text.trim().replace(/[。.!?！？,，;；:：]+$/g, "");
  return /^(你看看|帮我看看|幫我看看|看一下|帮我看一下|幫我看一下|看看这个|看看這個|看这个|看這個|你帮我看|你幫我看)$/i.test(normalized) ||
    /(你看看.*(页面|頁面|截图|截圖|图片|圖片|问题|問題)|帮我看看.*(页面|截图|图片|问题)|幫我看看.*(頁面|截圖|圖片|問題))/i.test(text);
}

export function asksVerificationCodeProblem(text: string): boolean {
  return /(验证码.*(没收到|收不到|没有收到|不来|不到账|不显示)|驗證碼.*(沒收到|收不到|沒有收到|不來|不顯示)|收不到.*验证码|收不到.*驗證碼|没有.*验证码|沒有.*驗證碼|verification code.*(not received|not arrive|didn'?t receive)|code.*(not received|not arrive|didn'?t receive))/i.test(text);
}

export function reportsRegistrationBlocker(text: string): boolean {
  return /(卡住|卡在|过不去|過不去|提交不了|提交失败|提交失敗|页面报错|頁面報錯|页面错误|頁面錯誤|不能注册|無法注册|无法注册|不能註冊|注册不了|註冊不了|打不开页面|打不開頁面|页面打不开|頁面打不開|stuck|cannot register|can'?t register|registration failed|page error|erro na página|erro na pagina|não consigo cadastrar|nao consigo cadastrar)/i.test(text);
}

export function isInboundImageOrScreenshot(text: string): boolean {
  const normalized = text.trim();
  return /^\[(图片|圖片|照片|截图|截圖|image|photo|screenshot)\](?:\s|$)/i.test(normalized) ||
    /客户发送[了的].*(图片|圖片|照片|截图|截圖|页面|頁面)|截图.*(注册|页面|链接|打不开|报错)|图片.*(注册|页面|链接|打不开|报错)/i.test(normalized);
}

export function asksWhetherCanReadImage(text: string): boolean {
  return /(能.*(识别|識別|看懂|看到|分析).*(图片|圖片|照片|截图|截圖)|图片.*(是什么意思|什麼意思|什么意思|能看吗|能看嗎|能识别|能識別)|截图.*(是什么意思|什么意思|能看吗|能看嗎|能识别|能識別)|看.*(我发|我發).*(图片|圖片|截图|截圖)|can.*(read|see|understand|analyze).*(image|photo|screenshot)|what.*(image|photo|screenshot).*(mean|show))/i.test(text);
}

export function asksNextStep(text: string): boolean {
  return /(接下来|下一步|然后呢|然后怎么办|现在怎么办|之后呢|next step|what next|what should i do next|e agora|próximo passo|proximo passo)/i.test(text);
}

export function asksSensitiveInfo(text: string): boolean {
  return /(验证码|驗證碼|密码给你|密碼給你|银行卡|銀行卡|身份证|身份證|护照|護照|私钥|私鑰|verification code|password|bank card|id card|passport|senha|código de verificação|codigo de verificacao|cartão bancário|cartao bancario|documento)/i.test(text);
}

export function looksLikeQuestion(text: string): boolean {
  return /[?？]$|[吗嗎呢么嘛][。.!！]*$|^(为什么|為什麼|怎么|怎麼|如何|什么|什麼|哪个|哪個|哪里|哪裡|能不能|可不可以|why|how|what|which|where|can|could|o que|por que|como|qual|onde)/i.test(text.trim());
}

export function complainsAboutReply(text: string): boolean {
  return /(为什么会这样|為什麼會這樣|怎么还是|怎麼還是|没回答|沒有回答|没有回答|答非所问|没说清楚|太机械|机械|僵硬|重复|只会|一句话|听不懂|不是|不对|别一直|robotic|mechanical|repeat|same thing|wrong|didn.?t answer|não respondeu|nao respondeu|não entendi|nao entendi|mecânico|mecanico|repetindo)/i.test(text);
}

export function isExplicitRefusal(text: string): boolean {
  const normalized = text.trim().replace(/[。.!?！？,，;；:：]+$/g, "");
  if (/^(不是|不|否|不了|不要|不用|no|nope|nah|não|nao)$/i.test(normalized)) return true;
  return /(不接受|不想接受|不用了|不需要|不了|算了|没兴趣|不想|不要|别发了|不要再发|停止|no thanks|not interested|do not accept|don't accept|stop|não quero|nao quero|não aceito|nao aceito|sem interesse|pare)/i.test(text);
}

export function isHesitant(text: string): boolean {
  return /(先不用|再看看|考虑一下|想想|晚点|maybe later|not now|agora não|agora nao|vou pensar)/i.test(text);
}

export function asksForOperationHelp(text: string): boolean {
  return /(不会|不會|不懂|怎么弄|怎麼弄|怎么操作|如何操作|怎么注册|怎么下载|怎么用|帮我|教我|一步一步|help|how do i|how to|cannot|can't|ajuda|me ajuda|como faço|como fazer|não consigo|nao consigo)/i.test(text);
}

export function asksForMoreJobInfo(text: string): boolean {
  return /(更多.*(信息|资料|資料|细节|細節)|提供.*(信息|资料|資料|细节|細節)|给我.*(信息|资料|資料|细节|細節)|告訴我.*(信息|资料|資料|细节|細節)|告诉我.*(信息|资料|資料|细节|細節)|多讲|多说|再介绍|详细介绍|具体介绍|具体.*工作|工作.*具体|更多了解|了解更多|more info|more information|tell me more|details|mais informações|mais informacoes|me explica melhor)/i.test(text);
}

export function asksForRegistrationSteps(text: string): boolean {
  return /(教程|注册步骤|注册流程|流程是什么|流程是什麼|怎么注册|怎麼註冊|如何注册|如何註冊|不会注册|不會註冊|教我注册|教我註冊|带我注册|帶我註冊|一步步.*注册|重新发.*步骤|重发.*步骤|再发.*步骤|重新发.*流程|重发.*流程|再走一遍|走一遍流程|重新走|注册.*怎么操作|cadastro.*passo|como.*cadastrar|c[oó]mo.*registr|como.*registr|registrarme|registrarse|pasos.*registro|proceso.*registro|registration steps|register.*steps|how.*register)/i.test(text);
}

export function shouldSendRegistrationTutorialImage(text: string, step: StrictFlowStep | "", needsInviteCode: boolean, tutorialUrl = ""): boolean {
  if (!needsInviteCode || !tutorialUrl || step !== "wait_registration") return false;
  if (isInboundImageOrScreenshot(text) || asksLookAtCurrentProblem(text) || asksHowToOpenLink(text) || reportsRegistrationBlocker(text)) return false;
  return asksForRegistrationSteps(text) ||
    /(教程|图文|圖片教程|图片教程|步骤图|流程图|不会注册|不會註冊|不懂注册|不懂註冊|注册.*不会|註冊.*不會|注册.*不懂|註冊.*不懂|怎么注册|怎麼註冊|如何注册|如何註冊|how.*register|registration.*tutorial|passo.*cadastro|como.*cadastrar)/i.test(text);
}

export function isReadyToStartRegistration(text: string): boolean {
  const normalized = text.trim().replace(/[。.!?！？,，;；:：]+$/g, "");
  return /^(方便|方便的|有空|有空的|可以开始|开始吧|准备好了|準備好了|我准备好了|我準備好了|现在可以|現在可以|可以操作|继续|继续吧|ready|i'?m ready|i am ready|start|let'?s start|pronto)$/i.test(normalized);
}

export function asksAboutJob(text: string): boolean {
  return /(了解.*工作|这份工作|這份工作|介绍.*工作|找工作|兼职|线上工作|在线工作|工作内容|赚钱|賺錢|挣钱|掙錢|赚佣金|賺佣金|佣金收入|怎么赚钱|如何赚钱|job|work|part[-\s]?time|online work|extra income|emprego|trabalho|renda extra|vaga)/i.test(text);
}

export function isRepeatGreeting(text: string): boolean {
  return /^(你好|您好|在吗|在不在|嗨|hi|hello|hey|good morning|good afternoon|good evening|ol[aá]|oi|bom dia|boa tarde|boa noite|こんにちは|こんばんは)\s*[。.!?？！]*$/i.test(text);
}
