import type { Conversation } from "../repositories.js";

export function buildHandoffMessage(input: {
  conversation: Conversation;
  lastMessageId: string;
  lastMessageTime: string;
  summary: string;
}): string {
  const { conversation } = input;
  return `客户已完成自动引导流程，请人工跟进。

客户定位信息：
- 客户手机号：${conversation.extractedPhone || conversation.customerPhone}
- Telegram账号：${conversation.extractedTelegram}
- 客户昵称：${conversation.nickname || "-"}
- 客户语言：${conversation.language}
- A2C接收账号：${conversation.a2cAccountPhone}
- A2C消息ID：${input.lastMessageId || "-"}
- 会话ID：${conversation.id}
- 最近消息时间：${input.lastMessageTime}

最近聊天摘要：
${input.summary}

建议操作：
请人工使用上方“客户手机号 + Telegram账号 + A2C接收账号”定位客户，并使用客户语言继续跟进。`;
}
