import { FileText, Upload } from "lucide-react";
import { useState } from "react";

import { useRows } from "../app/api.js";
import type { Filters, MerchantCountry, TrainingMaterial, TrainingMaterialItem } from "../types.js";
import { AsyncButton, FilterBar, Table } from "../ui/components.js";
import { countryLabel, label, languageName } from "../ui/formatters.js";
import { Pagination, useClientPagination } from "../ui/Pagination.js";
import { notify } from "../ui/toast.js";
import { buildTrainingMaterialsUrl, deleteTrainingMaterial, importTrainingMaterial, loadTrainingMaterialDetail, loadTrainingMaterials, trainingMaterialsBase } from "./trainingApi.js";

export function TrainingMaterialsPage({ platform = false, simple = false }: { platform?: boolean; simple?: boolean }) {
  const base = trainingMaterialsBase(platform);
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", sourceType: "", status: "", limit: "100" });
  const rowsUrl = buildTrainingMaterialsUrl(platform, filters);
  const [rows, setRows] = useRows<TrainingMaterial>(rowsUrl);
  const pager = useClientPagination(rows, 20);
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [selected, setSelected] = useState<TrainingMaterial | null>(null);
  const [detail, setDetail] = useState<{ material: TrainingMaterial; items: TrainingMaterialItem[] } | null>(null);
  const [message, setMessage] = useState("");
  const reload = async () => {
    setRows(await loadTrainingMaterials(rowsUrl));
    pager.setPage(1);
  };
  const loadDetail = async (row: TrainingMaterial) => {
    setSelected(row);
    setDetail(await loadTrainingMaterialDetail(base, row.id));
  };
  const uploadFile = async (upload: File) => {
    const result = await importTrainingMaterial("/api/merchant/training-materials/import", upload, filters.countryId || countries[0]?.id || "");
    setMessage(simple ? `已学习 ${result.imported} 条内容，后续回复会自动参考${result.warnings?.length ? `；${result.warnings.join("；")}` : ""}` : `已导入 ${result.imported} 条：样本 ${result.samples}，知识 ${result.knowledge}${result.warnings?.length ? `；${result.warnings.join("；")}` : ""}`);
    await reload();
  };
  const columns = platform
    ? ["merchantId", "countryName", "filename", "sourceType", "itemCount", "sampleCount", "knowledgeCount", "status", "createdAt"]
    : simple
      ? ["countryName", "filename", "sourceType", "itemCount", "status", "createdAt"]
      : ["countryName", "filename", "sourceType", "itemCount", "sampleCount", "knowledgeCount", "status", "createdAt"];

  return (
    <div className={selected && detail ? "split work-split" : "single-column work-split"}>
      <section className="work-panel">
        {simple && (
          <div className="training-center-hero">
            <div>
              <h3>上传资料，系统自动学习</h3>
              <p>把聊天记录、话本、FAQ、业务规则、Word、TXT、Excel 或截图上传到这里。系统会自动拆解、打标签、整理成后续回复可参考的内容。</p>
            </div>
            <div className="training-steps"><span>1 选择国家</span><span>2 上传或粘贴资料</span><span>3 自动学习并生效</span></div>
          </div>
        )}
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          fields={platform ? ["merchantId", "countryId", "sourceType", "status", "limit"] : ["countryId", "sourceType", "status", "limit"]}
          selects={{ countryId: ["", ...countries.map((country) => country.id)], sourceType: ["", "csv", "xlsx", "docx", "txt", "image"], status: ["", "enabled", "disabled"] }}
          onApply={reload}
        />
        {!platform && (
          <div className="material-uploader compact-uploader training-uploader">
            <div className="toolbar">
              <select value={filters.countryId} onChange={(e) => setFilters({ ...filters, countryId: e.target.value })}>
                {countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}
              </select>
              <input type="file" accept=".csv,.xlsx,.xls,.docx,.txt,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <AsyncButton disabled={!file} busyText="学习中..." onClick={async () => { if (file) await uploadFile(file); }}>
                <Upload size={16}/>{simple ? "上传并学习" : "上传素材"}
              </AsyncButton>
            </div>
            <textarea placeholder={simple ? "也可以直接粘贴真实聊天记录、话本、问答或业务规则，系统会自动学习" : "粘贴聊天记录、话术、问答或业务规则"} value={pasted} onChange={(e) => setPasted(e.target.value)} />
            <AsyncButton disabled={!pasted.trim()} busyText="学习中..." onClick={async () => { if (!pasted.trim()) return; await uploadFile(new File([pasted], "pasted-material.txt", { type: "text/plain" })); setPasted(""); }}>
              <FileText size={16}/>{simple ? "学习粘贴内容" : "导入粘贴文本"}
            </AsyncButton>
            {message && <div className="notice" role="status">{message}</div>}
          </div>
        )}
        <Table rows={pager.rows} columns={columns} onRow={loadDetail} />
        <Pagination pager={pager} />
      </section>
      {selected && detail && (
        <section className="detail-panel">
          <div>
            <h3>{detail.material.filename}</h3>
            <p>{countryLabel(detail.material.countryName)} · {label(detail.material.sourceType)} · {simple ? `已学习 ${detail.material.itemCount} 条内容` : `生成 ${detail.material.itemCount} 条 · 样本 ${detail.material.sampleCount} · 知识 ${detail.material.knowledgeCount}`}</p>
            <div className="toolbar">
              <AsyncButton
                className="danger"
                busyText="删除中..."
                onClick={async () => {
                  if (!window.confirm(simple ? "确认彻底删除这份学习资料？删除后系统不会再参考它。" : "确认彻底删除这个素材？它生成的样本和知识会一起删除。")) return;
                  await deleteTrainingMaterial(base, detail.material.id);
                  setSelected(null);
                  setDetail(null);
                  await reload();
                  notify("success", simple ? "学习资料已彻底删除" : "素材已彻底删除");
                }}
              >
                {simple ? "彻底删除资料" : "彻底删除素材"}
              </AsyncButton>
            </div>
            {detail.material.warnings?.length ? <div className="warning">{detail.material.warnings.join("；")}</div> : null}
            <div className="messages material-items">
              {detail.items.map((item) => (
                <article key={item.id}>
                  <strong>{simple ? "学习内容" : item.kind === "sample" ? "样本" : "知识"} · {languageName(item.language)}</strong>
                  <span>{item.title}</span>
                  <small>{label(item.intent || item.stage)}</small>
                  <p>{item.content}</p>
                </article>
              ))}
            </div>
            <pre>{detail.material.rawText || ""}</pre>
          </div>
        </section>
      )}
    </div>
  );
}
