import React, { useEffect, useState } from "react";

import { api, useRows, withQuery } from "../app/api.js";
import type { Filters, IntentLearningEvent, MerchantCountry } from "../types.js";
import { AsyncButton, FilterBar, ResourceErrorNotice, Table } from "../ui/components.js";
import { countryLabel, formatDateTime, label, languageName, statusTone, type TimeDisplayMode } from "../ui/formatters.js";
import { Pagination } from "../ui/Pagination.js";
import { notify } from "../ui/toast.js";
import { intentActiveCountry, intentQueryFilters, intentTimeLabelFor, intentTimeZoneFor } from "./IntentLearningPageHelpers.js";

export function IntentLearningPage({ platform = false, timeMode }: { platform?: boolean; timeMode: TimeDisplayMode }) {
  const base = platform ? "/api/admin/intent-learning" : "/api/merchant/intent-learning";
  const [countries, , countriesState] = useRows<MerchantCountry>(platform ? "/api/admin/countries" : "/api/merchant/countries");
  const defaultFilters: Filters = { merchantId: "", countryId: "", status: "candidate", suggestedIntent: "", q: "", startAt: "", endAt: "" };
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const activeCountry = intentActiveCountry(countries, filters.countryId || "");
  const intentTimeZone = intentTimeZoneFor(platform, timeMode, activeCountry);
  const intentTimeLabel = intentTimeLabelFor(platform, timeMode, activeCountry);
  const rowsUrl = withQuery(base, intentQueryFilters(platform, filters, intentTimeZone, page, pageSize));
  const [rows, setRows] = useState<IntentLearningEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({ candidate: 0, reviewed: 0, promoted: 0, ignored: 0 });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pager = { rows, page, pageSize, total, totalPages, setPage: (value: number) => setPage(Math.min(Math.max(1, value), totalPages)), setPageSize: (value: number) => { setPageSize(value); setPage(1); } };
  const [selected, setSelected] = useState<IntentLearningEvent | null>(null);
  const [detailDraft, setDetailDraft] = useState({ status: "candidate", displayName: "", description: "" });

  useEffect(() => {
    if (!selected) return;
    setDetailDraft({ status: selected.status, displayName: selected.displayName, description: selected.description });
  }, [selected]);

  const reload = async () => {
    setRowsLoading(true);
    setRowsError(null);
    try {
      const result = await api<{ rows: IntentLearningEvent[]; total: number; metrics: typeof metrics }>(rowsUrl);
      setRows(result.rows);
      setTotal(result.total);
      setMetrics(result.metrics);
      setSelected((current) => current ? result.rows.find((item) => item.id === current.id) || null : null);
    } catch (err) {
      setRowsError(err instanceof Error ? err.message : "意图学习数据加载失败，请稍后重试。");
      throw err;
    } finally {
      setRowsLoading(false);
    }
  };
  useEffect(() => { void reload().catch(() => undefined); }, [rowsUrl]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const patchSelected = async (patch: Record<string, unknown>, message = "意图候选已更新") => {
    if (!selected) return;
    const saved = await api<IntentLearningEvent>(`${base}/${selected.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    setSelected(saved);
    await reload();
    notify("success", message);
  };

  return <div className="intent-learning-page work-split">
    <section className="work-panel">
      <div className="training-center-hero compact">
        <div>
          <h3>意图学习</h3>
          <p>系统会把没识别准、规则库没有覆盖、或需要靠上下文判断的客户表达自动沉淀到这里。筛选时间按{intentTimeLabel}解释，运营处理后可把高频意图补进话本或规则。</p>
        </div>
      </div>
      <div className="learning-metrics">
        <span>筛选总数 <strong>{total}</strong></span>
        <span>待处理 <strong>{metrics.candidate}</strong></span>
        <span>已确认 <strong>{metrics.reviewed}</strong></span>
        <span>已沉淀 <strong>{metrics.promoted}</strong></span>
        <span>已忽略 <strong>{metrics.ignored}</strong></span>
      </div>
      <ResourceErrorNotice label="国家筛选选项" error={countriesState.error} onRetry={countriesState.reload} />
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        fields={platform ? ["merchantId", "q", "countryId", "status", "suggestedIntent", "startAt", "endAt"] : ["q", "countryId", "status", "suggestedIntent", "startAt", "endAt"]}
        selects={{ countryId: ["", ...countries.map((country) => country.id)], status: ["", "candidate", "reviewed", "promoted", "ignored"] }}
        resetValues={defaultFilters}
        onApply={async () => { if (page === 1) await reload(); else setPage(1); }}
      />
      <Table rows={rows} columns={["displayName", "suggestedIntent", "occurrenceCount", "customerText", "flowStep", "status", "lastSeenAt"]} onRow={setSelected} selectedKey={selected?.id} rowKey={(row) => row.id} loading={rowsLoading} error={rowsError} onRetry={reload} emptyTitle="暂无意图候选" emptyDetail="系统发现新的识别盲区后，会在这里生成待处理候选。" />
      <Pagination pager={pager} />
    </section>
    <section className="detail-panel">
      {selected ? <div className="intent-learning-detail">
        <div className="detail-title-row">
          <div>
            <h3>{selected.displayName || selected.suggestedIntent}</h3>
            <p>{countryLabel(selected.countryId)} · 出现 {selected.occurrenceCount} 次 · 最近 {formatDateTime(selected.lastSeenAt, selected.countryId)}</p>
          </div>
          <span className={`status-pill ${statusTone(selected.status)}`}>{label(selected.status)}</span>
        </div>
        <div className="learning-summary">
          <strong>客户原话</strong>
          <p>{selected.customerText}</p>
        </div>
        <div className="learning-facts">
          <span>系统识别：{label(selected.detectedIntent || "unknown")}</span>
          <span>上下文识别：{label(selected.contextualIntent || "unknown")}</span>
          <span>建议意图：{label(selected.suggestedIntent || "unknown")}</span>
          <span>流程节点：{label(selected.flowStep || "unknown")}</span>
          <span>语言：{languageName(selected.language)}</span>
        </div>
        <div className="form-grid">
          <label>意图名称<input value={detailDraft.displayName} onChange={(event) => setDetailDraft({ ...detailDraft, displayName: event.target.value })} /></label>
          <label>处理状态<select value={detailDraft.status} onChange={(event) => setDetailDraft({ ...detailDraft, status: event.target.value })}>{["candidate", "reviewed", "promoted", "ignored"].map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
          <label className="wide-field">处理说明<textarea value={detailDraft.description} onChange={(event) => setDetailDraft({ ...detailDraft, description: event.target.value })} /></label>
        </div>
        <div className="toolbar">
          <AsyncButton busyText="保存中..." onClick={() => patchSelected(detailDraft, "意图处理结果已保存")}>保存处理</AsyncButton>
          <AsyncButton busyText="标记中..." onClick={() => patchSelected({ status: "reviewed" }, "已标记为已确认")}>标记已确认</AsyncButton>
          <AsyncButton busyText="沉淀中..." onClick={() => patchSelected({ status: "promoted" }, "已标记为已沉淀")}>标记已沉淀</AsyncButton>
          <AsyncButton className="danger" busyText="忽略中..." onClick={() => patchSelected({ status: "ignored" }, "已忽略该候选")}>忽略</AsyncButton>
        </div>
        <details className="version-panel" open>
          <summary>样例记录</summary>
          <div className="learning-examples">
            {selected.examples?.length ? selected.examples.map((example, index) => <article key={index}>
              <strong>{String(example.customerText || selected.customerText)}</strong>
              <p>流程：{label(String(example.flowStep || selected.flowStep || "unknown"))} · 原识别：{label(String(example.detectedIntent || "unknown"))} · 时间：{formatDateTime(String(example.at || ""), selected.countryId)}</p>
            </article>) : <div className="empty-state compact">暂无样例</div>}
          </div>
        </details>
        <div className="notice">下一步建议：高频候选先标记“已确认”，再把对应表达补到“话本流程”的客户常见表达或规则里。系统后续就会更稳定地识别这类客户意图。</div>
      </div> : <div className="empty-chat"><h3>选择一个候选意图</h3><p>左侧显示的是系统自动发现的识别盲区。选择后可以查看样例、确认它属于什么意图，并标记处理状态。</p></div>}
    </section>
  </div>;
}
