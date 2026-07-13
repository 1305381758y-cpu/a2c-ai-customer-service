import React, { useEffect, useState } from "react";

import { api, useRows, withQuery } from "../app/api.js";
import type { AiCallStats, Filters, MerchantCountry } from "../types.js";
import { ResourceErrorNotice, Table } from "../ui/components.js";
import { label, type TimeDisplayMode } from "../ui/formatters.js";
import { todayDateTimeRange } from "../ui/timeFilters.js";
import { AiCallFilters } from "./AiCallFilters.js";
import { AiCallMetricGrid } from "./AiCallMetricGrid.js";
import { aiCallActiveCountry, aiCallErrorKey, aiCallStatsQuery, aiCallTimeLabelFor, aiCallTimeZoneFor, EMPTY_AI_CALL_STATS, formatAiCallSummary } from "./AiCallsPageHelpers.js";

export function AiCallsPage({ platform = false, timeMode }: { platform?: boolean; timeMode: TimeDisplayMode }) {
  if (!platform) {
    return <div className="empty-state">
      <h3>暂无权限访问此页面</h3>
      <p>模型调用统计由平台管理员统一查看和管理。</p>
    </div>;
  }
  return <PlatformAiCallsPage timeMode={timeMode} />;
}

function PlatformAiCallsPage({ timeMode }: { timeMode: TimeDisplayMode }) {
  const [filters, setFilters] = useState<Filters>({ merchantId: "", provider: "", taskType: "", status: "", ...todayDateTimeRange("Asia/Shanghai") });
  const endpoint = "/api/admin/ai-calls/stats";
  const [selectedTaskType, setSelectedTaskType] = useState("");
  const [selectedError, setSelectedError] = useState<AiCallStats["byError"][number] | null>(null);
  const [countries, , countriesState] = useRows<MerchantCountry>("/api/admin/countries");
  const [data, setData] = useState<AiCallStats>(EMPTY_AI_CALL_STATS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeCountry = aiCallActiveCountry(countries);
  const statsTimeZone = aiCallTimeZoneFor(true, timeMode, activeCountry);
  const statsTimeLabel = aiCallTimeLabelFor(true, timeMode, activeCountry);
  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const query = aiCallStatsQuery(true, filters, statsTimeZone);
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
  useEffect(() => { reload().catch(() => undefined); }, [statsTimeZone]);
  const activeTaskType = filters.taskType || selectedTaskType;
  const detailRows = activeTaskType ? data.byTypeDetails.filter((row) => row.taskType === activeTaskType) : data.byTypeDetails;
  const applyTaskType = async (taskType: string) => {
    setSelectedTaskType(taskType);
    const nextFilters = { ...filters, taskType };
    setFilters(nextFilters);
    const query = aiCallStatsQuery(true, nextFilters, statsTimeZone);
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
      <ResourceErrorNotice label="国家时间配置" error={countriesState.error} onRetry={countriesState.reload} />
      <div className="training-center-hero compact">
        <div>
          <h3>大模型调用统计</h3>
          <p>统计翻译、语言识别、意图理解、口语化改写、图片分析、复盘和普通回复等所有模型调用。当前筛选时间按{statsTimeLabel}解释。</p>
        </div>
      </div>
      <AiCallFilters
        platform={true}
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
      <AiCallMetricGrid data={data} />
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
