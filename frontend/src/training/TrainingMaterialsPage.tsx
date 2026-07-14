import React, { useEffect, useState } from "react";
import { FileText, Upload } from "lucide-react";

import { api, useRows } from "../app/api.js";
import type { Filters, MerchantCountry, TrainingMaterial, TrainingMaterialItem } from "../types.js";
import { AsyncButton, ConfirmActionButton, FilterBar, ResourceErrorNotice, Table } from "../ui/components.js";
import { countryLabel, label, languageName } from "../ui/formatters.js";
import { Pagination } from "../ui/Pagination.js";
import { notify } from "../ui/toast.js";
import { trainingImportEndpoint, trainingImportMessage, trainingMaterialColumns, trainingMaterialsBase, trainingMaterialsRowsUrl, trainingPasteFile, trainingSelectedCountryId, type TrainingImportResult } from "./TrainingMaterialsPageHelpers.js";

export function TrainingMaterialsPage({ platform = false, simple = false }: { platform?: boolean; simple?: boolean }) {
  const base = trainingMaterialsBase(platform);
  const [countries, , countriesState] = useRows<MerchantCountry>(platform ? "/api/admin/countries" : "/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", sourceType: "", status: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const rowsUrl = trainingMaterialsRowsUrl(platform, filters, page, pageSize);
  const [rows, setRows] = useState<TrainingMaterial[]>([]);
  const [total, setTotal] = useState(0);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pager = { rows, page, pageSize, total, totalPages, setPage: (value: number) => setPage(Math.min(Math.max(1, value), totalPages)), setPageSize: (value: number) => { setPageSize(value); setPage(1); } };
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [selected, setSelected] = useState<TrainingMaterial | null>(null);
  const [detail, setDetail] = useState<{ material: TrainingMaterial; items: TrainingMaterialItem[] } | null>(null);
  const [message, setMessage] = useState("");

  const reload = async () => {
    setMaterialsLoading(true);
    setMaterialsError(null);
    try {
      const result = await api<{ rows: TrainingMaterial[]; total: number }>(rowsUrl);
      setRows(result.rows);
      setTotal(result.total);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setMaterialsError(err instanceof Error ? err.message : "学习资料加载失败，请稍后重试。");
    } finally {
      setMaterialsLoading(false);
    }
  };
  useEffect(() => { void reload(); }, [rowsUrl]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const loadDetail = async (row: TrainingMaterial) => {
    setSelected(row);
    setDetail(await api<{ material: TrainingMaterial; items: TrainingMaterialItem[] }>(`${base}/${row.id}`));
  };

  const uploadFile = async (upload: File) => {
    const body = new FormData();
    body.append("countryId", trainingSelectedCountryId(filters, countries));
    body.append("file", upload);
    const response = await fetch(trainingImportEndpoint(platform), {
      method: "POST",
      body,
      credentials: "same-origin",
      headers: { "X-Portal-Mode": platform ? "admin" : "merchant" }
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "上传失败");
    const result = await response.json() as TrainingImportResult;
    setMessage(trainingImportMessage(result, simple));
    await reload();
  };

  const columns = trainingMaterialColumns(platform, simple);

  return <div className={`training-materials-layout ${selected && detail ? "has-detail" : ""}`}>
    <section className="work-panel">
      <ResourceErrorNotice label="国家选项" error={countriesState.error} onRetry={countriesState.reload} />
      {simple && <div className="training-center-hero">
        <div>
          <h3>上传资料，系统自动学习</h3>
          <p>把聊天记录、话本、FAQ、业务规则、Word、TXT、Excel 或截图上传到这里。系统会自动拆解、打标签、整理成后续回复可参考的内容。</p>
        </div>
        <div className="training-steps"><span>1 选择国家</span><span>2 上传或粘贴资料</span><span>3 自动学习并生效</span></div>
      </div>}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        fields={platform ? ["merchantId", "countryId", "sourceType", "status"] : ["countryId", "sourceType", "status"]}
        selects={{ countryId: ["", ...countries.map((country) => country.id)], sourceType: ["", "csv", "xlsx", "docx", "txt", "image"], status: ["", "enabled", "disabled"] }}
        onApply={async () => { if (page === 1) await reload(); else setPage(1); }}
      />
      {!platform && <div className="material-uploader compact-uploader training-uploader">
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
        <AsyncButton disabled={!pasted.trim()} busyText="学习中..." onClick={async () => {
          if (!pasted.trim()) return;
          await uploadFile(trainingPasteFile(pasted));
          setPasted("");
        }}>
          <FileText size={16}/>{simple ? "学习粘贴内容" : "导入粘贴文本"}
        </AsyncButton>
        {message && <div className="notice" role="status">{message}</div>}
      </div>}
      <Table
        rows={rows}
        columns={columns}
        onRow={loadDetail}
        loading={materialsLoading}
        error={materialsError}
        onRetry={reload}
        emptyTitle={simple ? "暂无学习资料" : "暂无素材记录"}
        emptyDetail={simple ? "上传聊天记录、话本、FAQ、业务规则或截图后，系统会自动学习。" : "上传素材后会在这里展示解析结果。"}
      />
      <Pagination pager={pager} />
    </section>
    {selected && detail && <>
      <button type="button" className="training-material-detail-backdrop" aria-label="关闭资料详情" onClick={() => { setSelected(null); setDetail(null); }} />
      <aside className="detail-panel training-material-detail" aria-label="学习资料详情">
        <div className="training-material-detail-inner">
          <div className="section-heading-row">
            <div className="training-material-detail-title">
              <span className="eyebrow">学习资料详情</span>
              <h3 title={detail.material.filename}>{detail.material.filename}</h3>
            </div>
            <button type="button" className="ghost icon-only panel-close-button" title="关闭详情" aria-label="关闭详情" onClick={() => { setSelected(null); setDetail(null); }}>×</button>
          </div>
          <div className="training-material-detail-meta">
            <span>{countryLabel(detail.material.countryName)}</span>
            <span>{label(detail.material.sourceType)}</span>
            <span>{simple ? `已学习 ${detail.material.itemCount} 条` : `生成 ${detail.material.itemCount} 条`}</span>
          </div>
          <div className="training-material-detail-actions">
            <ConfirmActionButton
              className="danger"
              busyText="删除中..."
              title={simple ? "确认彻底删除学习资料？" : "确认彻底删除素材？"}
              detail={simple ? "删除后系统不会再参考这份学习资料，此操作不可恢复。" : "删除后该素材及其生成的样本和知识会一起删除，后续回复不会再参考它们。"}
              confirmText={simple ? "彻底删除资料" : "彻底删除素材"}
              onConfirm={async () => {
                await api(`${base}/${detail.material.id}`, { method: "DELETE" });
                setSelected(null);
                setDetail(null);
                await reload();
                notify("success", simple ? "学习资料已彻底删除" : "素材已彻底删除");
              }}
            >
              {simple ? "彻底删除资料" : "彻底删除素材"}
            </ConfirmActionButton>
          </div>
          {detail.material.warnings?.length ? <div className="warning">{detail.material.warnings.join("；")}</div> : null}
          <details className="training-detail-section" open>
            <summary>学习内容 <span>{detail.items.length} 条</span></summary>
            <div className="messages material-items training-detail-scroll">
              {detail.items.map((item) => <article key={item.id}>
                <strong>{simple ? "学习内容" : item.kind === "sample" ? "样本" : "知识"} · {languageName(item.language)}</strong>
                <span>{item.title}</span>
                <small>{label(item.intent || item.stage)}</small>
                <p>{item.content}</p>
              </article>)}
            </div>
          </details>
          {detail.material.rawText && <details className="training-detail-section">
            <summary>原始文件内容 <span>仅供查看</span></summary>
            <pre className="training-raw-text">{detail.material.rawText}</pre>
          </details>}
        </div>
      </aside>
    </>}
  </div>;
}
