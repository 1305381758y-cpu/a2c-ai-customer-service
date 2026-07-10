import React from "react";
import { Upload, Workflow } from "lucide-react";

import type { Filters, MerchantCountry, ScriptFlow } from "../types.js";
import { AsyncButton, FilterBar, Table } from "../ui/components.js";

export function ScriptFlowListPanel({
  platform,
  canEdit,
  countries,
  filters,
  setFilters,
  reload,
  flowName,
  setFlowName,
  setFile,
  file,
  upload,
  createBuiltIn,
  rows,
  selectedId,
  rowsLoading,
  rowsError,
  loadDetail
}: {
  platform: boolean;
  canEdit: boolean;
  countries: MerchantCountry[];
  filters: Filters;
  setFilters: (filters: Filters) => void;
  reload: () => Promise<void>;
  flowName: string;
  setFlowName: (value: string) => void;
  setFile: (file: File | null) => void;
  file: File | null;
  upload: () => Promise<void>;
  createBuiltIn: () => Promise<void>;
  rows: ScriptFlow[];
  selectedId?: string;
  rowsLoading: boolean;
  rowsError: string | null;
  loadDetail: (flow: ScriptFlow) => Promise<void>;
}) {
  return <section className="script-flow-list work-panel">
    <div className="training-center-hero compact">
      <div><h3>话本流程</h3><p>上传话本后，系统会自动分析并生成可编辑流程节点。检查无误后再启用，客户会话才会按新流程推进。</p></div>
    </div>
    <FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "countryId", "status"] : ["countryId", "status"]} selects={{ countryId: ["", ...countries.map((country) => country.id)], status: ["", "draft", "active", "disabled"] }} onApply={reload} />
    {!canEdit && <div className="permission-notice"><strong>当前为只读话本</strong><span>商户运营可以查看节点、话术、跳转和版本，但不能上传、修改、启用或删除流程。</span></div>}
    {canEdit && <div className="material-uploader compact-uploader">
      <div className="toolbar wrap">
        <input placeholder="话本名称，可选" value={flowName} onChange={(event) => setFlowName(event.target.value)} />
        <input type="file" accept=".xlsx,.xls,.docx,.txt,.md,.csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        <AsyncButton disabled={!file || platform && !filters.merchantId.trim()} busyText="分析中..." onClick={upload}><Upload size={16}/>上传并生成节点</AsyncButton>
        <AsyncButton disabled={platform && !filters.merchantId.trim()} busyText="创建中..." onClick={createBuiltIn}><Workflow size={16}/>使用内置11步创建</AsyncButton>
      </div>
      <small>支持 Excel/CSV 标准表头，也支持 Word/TXT/MD 自由话本。也可以直接使用系统内置 11 步生成草稿，右侧逐步修改后再启用。</small>
    </div>}
    <Table
      rows={rows}
      columns={["name", "countryName", "status", "active", "version", "stepCount", "updatedAt"]}
      onRow={loadDetail}
      selectedKey={selectedId}
      rowKey={(row) => row.id}
      loading={rowsLoading}
      error={rowsError}
      onRetry={reload}
      emptyTitle="暂无话本流程"
      emptyDetail="可以上传话本文件，或使用内置 11 步创建一个草稿流程。"
    />
  </section>;
}
