import React, { useEffect, useState } from "react";
import { Upload } from "lucide-react";

import { api, loadRows, useRows, withQuery } from "../app/api.js";
import type { Filters, MerchantCountry, Sample } from "../types.js";
import { AsyncButton, Editor, FilterBar, Table } from "../ui/components.js";
import { coercePatch } from "../ui/form.js";
import { countryLabel } from "../ui/formatters.js";
import { Pagination, useClientPagination } from "../ui/Pagination.js";
import { notify } from "../ui/toast.js";

export function SamplesPage({ platform = false }: { platform?: boolean }) {
  const base = platform ? "/api/admin/training-samples" : "/api/merchant/training-samples";
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", language: "", intent: "", stage: "", enabled: "" });
  const rowsUrl = withQuery(base, platform ? filters : { countryId: filters.countryId, language: filters.language, intent: filters.intent, stage: filters.stage, enabled: filters.enabled });
  const [rows, setRows] = useState<Sample[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const pager = useClientPagination(rows, 20);
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<Sample | null>(null);
  const reload = async () => {
    setRowsLoading(true);
    setRowsError(null);
    try {
      setRows(await loadRows(rowsUrl));
      pager.setPage(1);
    } catch (err) {
      setRows([]);
      setRowsError(err instanceof Error ? err.message : "样本加载失败，请稍后重试。");
    } finally {
      setRowsLoading(false);
    }
  };
  useEffect(() => { void reload(); }, [rowsUrl]);
  return <div className={selected ? "split work-split" : "single-column work-split"}>
    <section className="work-panel">
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        fields={platform ? ["merchantId", "countryId", "language", "intent", "stage", "enabled"] : ["countryId", "language", "intent", "stage", "enabled"]}
        selects={{ countryId: ["", ...countries.map((country) => country.id)], enabled: ["", "true", "false"] }}
        onApply={reload}
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
        rows={pager.rows}
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
