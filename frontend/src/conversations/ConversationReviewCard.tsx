import type React from "react";
import type { ConversationReviewResponse } from "../types.js";

type ConversationReviewCardProps = {
  data: ConversationReviewResponse;
  platform: boolean;
  onGenerate: () => Promise<void>;
  onApply: (itemId: number) => Promise<void>;
  renderAction: (options: { children: React.ReactNode; busyText: string; onClick: () => Promise<void> }) => React.ReactNode;
};

export function ConversationReviewCard({ data, platform, onGenerate, onApply, renderAction }: ConversationReviewCardProps) {
  const review = data.review;
  return <details className="memory review-card review-card-collapsible">
    <summary className="review-summary">
      <div>
        <h3>对话复盘</h3>
        <p>{review ? review.summary : "默认收起，需要查看质量分析或沉淀样本时再展开。"}</p>
      </div>
      <div className="review-score compact">{review ? <><strong>{review.score}</strong><span>分</span></> : <span>未生成</span>}</div>
    </summary>
    <div className="review-card-body">
      <div className="toolbar">
        {renderAction({ onClick: onGenerate, busyText: "生成中...", children: "生成复盘" })}
        {review?.goalCompleted && <span className="status-pill ok">目标已完成</span>}
      </div>
      {review && <div className="review-grid">
        <ReviewList title="客户主要疑虑" rows={review.mainConcerns} />
        <ReviewList title="发现的问题" rows={review.mistakes} />
        <ReviewList title="优秀回复" rows={review.goodReplies} />
        <ReviewList title="优化建议" rows={review.improvementActions} />
      </div>}
      {data.items.length > 0 && <div className="review-items">
        <h4>候选学习内容</h4>
        {data.items.map((item) => <article key={item.id}>
          <div>
            <strong>{item.title}</strong>
            <small>{item.itemType === "sample" ? "样本候选" : "知识候选"} · {item.status === "applied" ? "已加入" : "待审核"}</small>
          </div>
          {!platform && item.status !== "applied" && renderAction({ onClick: () => onApply(item.id), busyText: "加入中...", children: "加入训练中心" })}
        </article>)}
      </div>}
    </div>
  </details>;
}

function ReviewList({ title, rows }: { title: string; rows: string[] }) {
  return <div><strong>{title}</strong>{rows.length ? <ul>{rows.slice(0, 4).map((row, index) => <li key={`${title}-${index}`}>{row}</li>)}</ul> : <p>暂无</p>}</div>;
}
