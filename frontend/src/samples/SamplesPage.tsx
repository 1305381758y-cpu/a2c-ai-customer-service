import { Upload } from "lucide-react";
import { useState } from "react";

import { useRows } from "../app/api.js";
import type { Filters, MerchantCountry, Sample } from "../types.js";
import { AsyncButton, Editor, FilterBar, Table } from "../ui/components.js";
import { countryLabel } from "../ui/formatters.js";
import { Pagination, useClientPagination } from "../ui/Pagination.js";
import { notify } from "../ui/toast.js";
import { buildSamplesUrl, deleteSample, importSampleTrainingFile, loadSamples, samplesBase, updateSample } from "./samplesApi.js";

export function SamplesPage({ platform = false }: { platform?: boolean }) {
  const base = samplesBase(platform);
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", language: "", intent: "", stage: "", enabled: "" });
  const rowsUrl = buildSamplesUrl(platform, filters);
  const [rows, setRows] = useRows<Sample>(rowsUrl);
  const pager = useClientPagination(rows, 20);
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<Sample | null>(null);
  const reload = async () => {
    setRows(await loadSamples(rowsUrl));
    pager.setPage(1);
  };

  return (
    <div className={selected ? "split work-split" : "single-column work-split"}>
      <section className="work-panel">
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          fields={platform ? ["merchantId", "countryId", "language", "intent", "stage", "enabled"] : ["countryId", "language", "intent", "stage", "enabled"]}
          selects={{ countryId: ["", ...countries.map((country) => country.id)], enabled: ["", "true", "false"] }}
          onApply={reload}
        />
        {!platform && (
          <div className="material-uploader compact-uploader">
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
                  const result = await importSampleTrainingFile(file, filters.countryId || countries[0]?.id || "");
                  notify("success", "训练文件已导入", `样本 ${result.samples} 条，知识 ${result.knowledge} 条${result.warnings?.length ? `；${result.warnings.join("；")}` : ""}`);
                  setFile(null);
                  await reload();
                }}
              >
                <Upload size={16}/>上传训练文件
              </AsyncButton>
            </div>
            <small>支持 CSV、Excel、Word、TXT、截图/图片。表格直接生成样本；文本、Word、截图会自动提取话术。</small>
          </div>
        )}
        <Table rows={pager.rows} columns={["countryId", "customerMessage", "standardReply", "intent", "stage", "language", "priority", "enabled"]} onRow={setSelected} />
        <Pagination pager={pager} />
      </section>
      {selected && (
        <section className="detail-panel">
          <Editor
            title="样本编辑"
            value={selected as any}
            fields={["countryId", "customerMessage", "standardReply", "intent", "stage", "language", "keywords", "priority", "enabled"]}
            selects={{ enabled: ["true", "false"] }}
            onSave={async (patch) => {
              await updateSample(base, selected.id, patch);
              await reload();
            }}
            onDelete={async () => {
              if (!window.confirm("确认彻底删除这个样本？删除后 AI 不会再引用它。")) return;
              await deleteSample(base, selected.id);
              setSelected(null);
              await reload();
              notify("success", "样本已彻底删除");
            }}
          />
        </section>
      )}
    </div>
  );
}
