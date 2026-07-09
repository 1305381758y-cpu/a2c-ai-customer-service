import type { AiCallStats } from "../types.js";
import { MetricCard } from "../ui/MetricCard.js";

export function AiCallMetricGrid({ data }: { data: AiCallStats }) {
  return <div className="grid metrics">
    <MetricCard title="总调用" value={data.totalCalls} detail="所有供应商、所有任务类型" />
    <MetricCard title="成功调用" value={data.successCalls} detail="已正常返回内容" />
    <MetricCard title="失败调用" value={data.errorCalls} detail="Key、限流、超时或返回异常" />
    <MetricCard title="成功率" value={`${data.successRate}%`} detail="成功调用 / 总调用" />
    <MetricCard title="平均耗时" value={`${data.averageDurationMs} ms`} detail="按筛选范围计算" />
  </div>;
}
