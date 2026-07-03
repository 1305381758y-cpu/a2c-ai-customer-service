import type React from "react";
import { Image, Paperclip, Send, Smile } from "lucide-react";

export type MessageDraft = {
  type: string;
  content: string;
  url: string;
  caption: string;
  fileName?: string;
};

const MESSAGE_TYPE_OPTIONS = [
  { value: "text", label: "文本" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
  { value: "document", label: "文件" }
];

export function canSendMessage(input: { type: string; content: string; url: string }) {
  return input.type === "text" ? Boolean(input.content.trim()) : Boolean(input.url.trim());
}

export function ConversationComposer({
  value,
  onChange,
  renderSendAction,
  quickReplies
}: {
  value: MessageDraft;
  onChange: (value: MessageDraft) => void;
  renderSendAction: (disabled: boolean, children: React.ReactNode) => React.ReactNode;
  quickReplies?: Array<{ label: string; content: string }>;
}) {
  const disabled = !canSendMessage(value);
  const replies = quickReplies?.length ? quickReplies : DEFAULT_QUICK_REPLIES;
  return <div className="send chat-composer">
    <div className="composer-tabs">
      {replies.map((item, index) => <button
        key={`${item.label}-${index}`}
        type="button"
        className={value.caption === item.label ? "active" : ""}
        onClick={() => onChange({ ...value, caption: item.label, content: value.content.trim() ? value.content : item.content })}
      >{item.label}</button>)}
      <div className="composer-search">搜索快捷回复</div>
    </div>
    <div className="composer-body">
      <textarea
        placeholder="输入客服回复；可先选快捷回复，再按客户情况微调"
        value={value.content}
        onChange={(event) => onChange({ ...value, content: event.target.value })}
      />
    </div>
    <div className="composer-footer">
      <div className="composer-tools">
        <button type="button" className="ghost icon-only" title="表情"><Smile size={16}/></button>
        <button type="button" className="ghost icon-only" title="图片"><Image size={16}/></button>
        <button type="button" className="ghost icon-only" title="附件"><Paperclip size={16}/></button>
        <select value={value.type} onChange={(event) => onChange({ ...value, type: event.target.value })}>
          {MESSAGE_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        {value.type !== "text" && <input placeholder="媒体链接" value={value.url} onChange={(event) => onChange({ ...value, url: event.target.value })} />}
      </div>
      {renderSendAction(disabled, <><Send size={16}/>发送</>)}
    </div>
  </div>;
}

const DEFAULT_QUICK_REPLIES = [
  { label: "欢迎语", content: "您好！感谢您的咨询，我是您的专属课程顾问小A。请问您想了解哪个课程方向呢？" },
  { label: "课程价格", content: "这门课程的价格是 2999 元，包含 52 课时直播课和录播回放，支持回放学习。" },
  { label: "试听说明", content: "我们提供免费的试听课，您可以先体验课程内容、老师风格和学习节奏后再决定。" },
  { label: "报名指引", content: "报名很简单，我可以先帮您确认学习方向，再发送开户链接和报名步骤给您。" },
  { label: "售后说明", content: "报名后会有老师协助开课提醒、资料领取和学习问题跟进，您可以放心。" },
  { label: "异议处理", content: "理解您的顾虑。您可以先试听课程，也可以把关心的问题告诉我，我逐项帮您确认。" }
];
