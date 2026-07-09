import React, { useEffect, useState } from "react";

import { api, useRows, withQuery } from "../app/api.js";
import type { AiCallStats, Filters, MerchantCountry } from "../types.js";
import { Table } from "../ui/components.js";
import { countryLabel, label, timeDisplayModeLabel, timeZoneForCountry, type TimeDisplayMode } from "../ui/formatters.js";
import { MetricCard } from "../ui/MetricCard.js";
import { AiCallFilters } from "./AiCallFilters.js";

export function AiCallsPage({ platform = false, timeMode }: { platform?: boolean; timeMode: TimeDisplayMode }) {
  const [filters, setFilters] = useState<Filters>({ merchantId: "", provider: "", taskType: "", status: "", startAt: "", endAt: "" });
  const endpoint = platform ? "/api/admin/ai-calls/stats" : "/api/merchant/ai-calls/stats";
  const [selectedTaskType, setSelectedTaskType] = useState("");
  const [selectedError, setSelectedError] = useState<AiCallStats["byError"][number] | null>(null);
  const [countries] = useRows<MerchantCountry>(platform ? "/api/admin/countries" : "/api/merchant/countries");
  const [data, setData] = useState<AiCallStats>({ totalCalls: 0, successCalls: 0, errorCalls: 0, successRate: 0, averageDurationMs: 0, availableProviders: [], availableTaskTypes: [], byType: [], byProvider: [], byTypeDetails: [], byError: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeCountry = countries.find((country) => country.status === "active") || countries[0];
  const statsTimeZone = !platform && timeMode === "country" && activeCountry ? timeZoneForCountry(activeCountry) : "Asia/Shanghai";
  const statsTimeLabel = !platform && timeMode === "country" && activeCountry ? `${countryLabel(activeCountry.name)}时间` : timeDisplayModeLabel("beijing");
  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const query = platform
        ? { ...filters, timeZone: "Asia/Shanghai" }
        : { provider: filters.provider, taskType: filters.taskType, status: filters.status, startAt: filters.startAt, endAt: filters.endAt, timeZone: statsTimeZone };
      const nextData = await api<AiCallStats>(withQuery(endpoint, query));
      setData(nextData);
      if (selectedTaskType && !nextData.byType.some((row) => row.taskType === selectedTaskType)) setSelectedTaskType("");
      if (selectedError && !nextData.byError.some((row) => aiCallErrorKey(row) === aiCallErrorKey(selectedError))) setSelectedError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "模型调用统计加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload().catch(() => undefined); }, [platform, statsTimeZone]);
  const activeTaskType = filters.taskType || selectedTaskType;
  const detailRows = activeTaskType ? data.byTypeDetails.filter((row) => row.taskType === activeTaskType) : data.byTypeDetails;
  const applyTaskType = async (taskType: string) => {
    setSelectedTaskType(taskType);
    const nextFilters = { ...filters, taskType };
    setFilters(nextFilters);
    const query = platform
      ? { ...nextFilters, timeZone: "Asia/Shanghai" }
      : { provider: nextFilters.provider, taskType: nextFilters.taskType, status: nextFilters.status, startAt: nextFilters.startAt, endAt: nextFilters.endAt, timeZone: statsTimeZone };
    setLoading(true);
    setError("");
    try {
      setData(await api<AiCallStats>(withQuery(endpoint, query)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "调用类型明细加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };
  return <div className="ai-calls-page work-split single-column">
    <section className="work-panel">
      <div className="training-center-hero compact">
        <div>
          <h3>大模型调用统计</h3>
          <p>统计翻译、语言识别、意图理解、口语化改写、图片分析、复盘和普通回复等所有模型调用。当前筛选时间按{statsTimeLabel}解释。</p>
        </div>
      </div>
      <AiCallFilters
        platform={platform}
        filters={filters}
        loading={loading}
        availableProviders={data.availableProviders}
        availableTaskTypes={data.availableTaskTypes}
        onChange={setFilters}
        onTaskTypeChange={(taskType) => {
          setSelectedTaskType(taskType);
          setFilters({ ...filters, taskType });
        }}
        onReload={reload}
      />
      {loading && <div className="notice">正在加载模型调用统计...</div>}
      {error && <div className="error" role="alert">模型调用统计加载失败：{error}<button className="ghost" onClick={() => void reload()}>重新加载</button></div>}
      <div className="grid metrics">
        <MetricCard title="总调用" value={data.totalCalls} detail="所有供应商、所有任务类型" />
        <MetricCard title="成功调用" value={data.successCalls} detail="已正常返回内容" />
        <MetricCard title="失败调用" value={data.errorCalls} detail="Key、限流、超时或返回异常" />
        <MetricCard title="成功率" value={`${data.successRate}%`} detail="成功调用 / 总调用" />
        <MetricCard title="平均耗时" value={`${data.averageDurationMs} ms`} detail="按筛选范围计算" />
      </div>
      <div className="ai-call-columns">
        <section className="assistant-card">
          <h3>按调用类型</h3>
          <Table rows={data.byType} columns={["taskType", "totalCalls", "successCalls", "errorCalls", "successRate", "averageDurationMs"]} onRow={(row) => void applyTaskType(row.taskType)} selectedKey={activeTaskType} rowKey={(row) => row.taskType} />
        </section>
        <section className="assistant-card">
          <h3>按供应商</h3>
          <Table rows={data.byProvider} columns={["provider", "totalCalls", "successCalls", "errorCalls", "successRate", "averageDurationMs"]} />
        </section>
      </div>
      <section className="assistant-card">
        <div className="section-heading-row">
          <h3>调用类型明细 · {activeTaskType ? label(activeTaskType) : "全部类型"}</h3>
          {activeTaskType && <button className="ghost" onClick={() => void applyTaskType("")}>查看全部类型</button>}
        </div>
        <Table rows={detailRows} columns={["taskType", "provider", "model", "totalCalls", "successCalls", "errorCalls", "successRate", "averageDurationMs", "lastCalledAt"]} />
      </section>
      <section className="assistant-card">
        <h3>失败原因明细</h3>
        <Table rows={data.byError} columns={["taskType", "provider", "model", "errorMessage", "httpStatus", "errorCalls", "lastFailedAt"]} onRow={setSelectedError} selectedKey={selectedError ? aiCallErrorKey(selectedError) : undefined} rowKey={(row) => aiCallErrorKey(row)} emptyTitle="暂无失败调用" emptyDetail="当前筛选范围内没有失败记录。" />
        {selectedError && <div className="ai-call-error-detail">
          <div className="section-heading-row">
            <h4>{label(selectedError.taskType)} · {label(selectedError.provider)} · {selectedError.model}</h4>
            <button className="ghost" onClick={() => setSelectedError(null)}>收起详情</button>
          </div>
          <p><strong>失败原因：</strong>{selectedError.errorMessage}</p>
          <div className="ai-call-summary-grid">
            <div>
              <strong>请求摘要</strong>
              <pre>{formatAiCallSummary(selectedError.requestSummary)}</pre>
            </div>
            <div>
              <strong>返回摘要</strong>
              <pre>{formatAiCallSummary(selectedError.responseSummary)}</pre>
            </div>
          </div>
        </div>}
      </section>
    </section>
  </div>;
}

function aiCallErrorKey(row: AiCallStats["byError"][number]) {
  return [row.taskType, row.provider, row.model, row.errorMessage, row.httpStatus ?? "", row.lastFailedAt].join("|");
}

function formatAiCallSummary(value: string) {
  if (!value) return "暂无摘要";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
