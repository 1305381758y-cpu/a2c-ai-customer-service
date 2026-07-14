import React, { useEffect, useState } from "react";
import { Upload } from "lucide-react";

import { api, useRows, withQuery } from "../app/api.js";
import type { Filters, MerchantCountry, Sample } from "../types.js";
import { AsyncButton, Editor, FilterBar, ResourceErrorNotice, Table } from "../ui/components.js";
import { coercePatch } from "../ui/form.js";
import { countryLabel } from "../ui/formatters.js";
import { Pagination } from "../ui/Pagination.js";
import { notify } from "../ui/toast.js";

export function SamplesPage({ platform = false }: { platform?: boolean }) {
  const base = platform ? "/api/admin/training-samples" : "/api/merchant/training-samples";
  const [countries, , countriesState] = useRows<MerchantCountry>(platform ? "/api/admin/countries" : "/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", language: "", intent: "", stage: "", enabled: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const query = platform ? filters : { countryId: filters.countryId, language: filters.language, intent: filters.intent, stage: filters.stage, enabled: filters.enabled };
  const rowsUrl = withQuery(base, { ...query, limit: String(pageSize), offset: String((page - 1) * pageSize) });
  const [rows, setRows] = useState<Sample[]>([]);
  const [total, setTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pager = { rows, page, pageSize, total, totalPages, setPage: (value: number) => setPage(Math.min(Math.max(1, value), totalPages)), setPageSize: (value: number) => { setPageSize(value); setPage(1); } };
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<Sample | null>(null);
  const reload = async () => {
    setRowsLoading(true);
    setRowsError(null);
    try {
      const result = await api<{ rows: Sample[]; total: number }>(rowsUrl);
      setRows(result.rows);
      setTotal(result.total);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setRowsError(err instanceof Error ? err.message : "样本加载失败，请稍后重试。");
    } finally {
      setRowsLoading(false);
    }
  };
  useEffect(() => { void reload(); }, [rowsUrl]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  return <div className={selected ? "split work-split" : "single-column work-split"}>
    <section className="work-panel">
      <ResourceErrorNotice label="国家筛选选项" error={countriesState.error} onRetry={countriesState.reload} />
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        fields={platform ? ["merchantId", "countryId", "language", "intent", "stage", "enabled"] : ["countryId", "language", "intent", "stage", "enabled"]}
        selects={{ countryId: ["", ...countries.map((country) => country.id)], enabled: ["", "true", "false"] }}
        onApply={async () => { if (page === 1) await reload(); else setPage(1); }}
      />
      {!platform && <div className="material-uploader compact-uploader">
        <div className="toolbar">
          <select value={filters.countryId} onChange={(e) => setFilters({ ...filters, countryId: e.target.value })}>
            {countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}
          </select>
          <input type="file" accept=".csv,.xlsx,.xls,.docx,.txt,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <AsyncButton
            disabled={!file}
            busyText="上传中..."
            onClick={async () => {
              if (!file) return;
              const body = new FormData();
              body.append("file", file);
              body.append("countryId", filters.countryId || countries[0]?.id || "");
              const response = await fetch("/api/merchant/training-materials/import", { method: "POST", body });
              if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "上传失败");
              const result = await response.json() as { imported: number; samples: number; knowledge: number; warnings?: string[] };
              notify("success", "训练文件已导入", `样本 ${result.samples} 条，知识 ${result.knowledge} 条${result.warnings?.length ? `；${result.warnings.join("；")}` : ""}`);
              setFile(null);
              await reload();
            }}
          >
            <Upload size={16}/>上传训练文件
          </AsyncButton>
        </div>
        <small>支持 CSV、Excel、Word、TXT、截图/图片。表格直接生成样本；文本、Word、截图会自动提取话术。</small>
      </div>}
      <Table
        rows={rows}
        columns={["countryId", "customerMessage", "standardReply", "intent", "stage", "language", "priority", "enabled"]}
        onRow={setSelected}
        loading={rowsLoading}
        error={rowsError}
        onRetry={reload}
        emptyTitle="暂无训练样本"
        emptyDetail="上传标准样本、话本或聊天记录后，系统会在这里展示可编辑的优秀回复样本。"
      />
      <Pagination pager={pager} />
    </section>
    {selected && <section className="detail-panel">
      <Editor
        title="样本编辑"
        onClose={() => setSelected(null)}
        value={selected as any}
        fields={["countryId", "customerMessage", "standardReply", "intent", "stage", "language", "keywords", "priority", "enabled"]}
        selects={{ enabled: ["true", "false"] }}
        deleteTitle="确认彻底删除样本？"
        deleteDetail="删除后，后续回复不会再参考这个优秀样本。此操作不可恢复。"
        deleteConfirmText="彻底删除"
        onSave={async (patch) => {
          await api(`${base}/${selected.id}`, { method: "PATCH", body: JSON.stringify(coercePatch(patch)) });
          await reload();
        }}
        onDelete={async () => {
          await api(`${base}/${selected.id}`, { method: "DELETE" });
          setSelected(null);
          await reload();
          notify("success", "样本已彻底删除");
        }}
      />
    </section>}
  </div>;
}
