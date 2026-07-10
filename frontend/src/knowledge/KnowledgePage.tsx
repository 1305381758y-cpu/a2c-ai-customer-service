import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { api, useRows, withQuery } from "../app/api.js";
import type { Filters, Knowledge, MerchantCountry } from "../types.js";
import { AsyncButton, Editor, FilterBar, ResourceErrorNotice, Table } from "../ui/components.js";
import { coercePatch } from "../ui/form.js";
import { countryLabel, label } from "../ui/formatters.js";
import { Pagination } from "../ui/Pagination.js";
import { notify } from "../ui/toast.js";

export function KnowledgePage({ platform }: { platform: boolean }) {
  const base = platform ? "/api/admin/knowledge" : "/api/merchant/knowledge";
  const [countries, , countriesState] = useRows<MerchantCountry>(platform ? "/api/admin/countries" : "/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", type: "", enabled: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const query = platform ? filters : { countryId: filters.countryId, type: filters.type, enabled: filters.enabled };
  const rowsUrl = withQuery(base, { ...query, limit: String(pageSize), offset: String((page - 1) * pageSize) });
  const [rows, setRows] = useState<Knowledge[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pager = { rows, page, pageSize, total, totalPages, setPage: (value: number) => setPage(Math.min(Math.max(1, value), totalPages)), setPageSize: (value: number) => { setPageSize(value); setPage(1); } };
  const [form, setForm] = useState<Record<string, string>>({ merchantId: "default", countryId: "", type: "faq", title: "", content: "", language: "zh", priority: "0" });
  const [selected, setSelected] = useState<Knowledge | null>(null);
  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ rows: Knowledge[]; total: number }>(rowsUrl);
      setRows(result.rows);
      setTotal(result.total);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : "知识库加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void reload(); }, [rowsUrl]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return (
    <div className={selected ? "split work-split" : "single-column work-split"}>
      <section className="work-panel">
        <ResourceErrorNotice label="国家筛选选项" error={countriesState.error} onRetry={countriesState.reload} />
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          fields={platform ? ["merchantId", "countryId", "type", "enabled"] : ["countryId", "type", "enabled"]}
          selects={{ countryId: ["", ...countries.map((country) => country.id)], type: ["", "faq", "script", "rule", "forbidden"], enabled: ["", "true", "false"] }}
          onApply={async () => { if (page === 1) await reload(); else setPage(1); }}
        />
        <div className="toolbar wrap compact-create">
          {platform && <input placeholder={label("merchantId")} value={form.merchantId} onChange={(e) => setForm({ ...form, merchantId: e.target.value })} />}
          <select value={form.countryId || filters.countryId || countries[0]?.id || ""} onChange={(e) => setForm({ ...form, countryId: e.target.value })}>
            {countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}
          </select>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="faq">{label("faq")}</option>
            <option value="script">{label("script")}</option>
            <option value="rule">{label("rule")}</option>
            <option value="forbidden">{label("forbidden")}</option>
          </select>
          <input placeholder="标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input placeholder="内容" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          <AsyncButton
            disabled={!form.title.trim() || !form.content.trim()}
            busyText="新增中..."
            onClick={async () => {
              await api(base, { method: "POST", body: JSON.stringify(coercePatch({ ...form, countryId: form.countryId || filters.countryId || countries[0]?.id || "" })) });
              setForm({ ...form, title: "", content: "" });
              await reload();
            }}
          >
            <Plus size={16}/>新增知识
          </AsyncButton>
        </div>
        <Table
          rows={rows}
          columns={["countryId", "type", "title", "content", "language", "priority", "enabled"]}
          onRow={setSelected}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="暂无知识内容"
          emptyDetail="可以新增 FAQ、话术、规则或禁用表达，供后续回复参考。"
        />
        <Pagination pager={pager} />
      </section>
      {selected && (
        <section className="detail-panel">
          <Editor
            title="知识库编辑"
            value={selected as any}
            fields={["countryId", "type", "title", "content", "language", "priority", "enabled"]}
            selects={{ type: ["faq", "script", "rule", "forbidden"], enabled: ["true", "false"] }}
            deleteTitle="确认彻底删除知识？"
            deleteDetail="删除后，该知识不会再被后续回复参考。此操作不可恢复，请确认不是正在使用的业务规则或话术。"
            deleteConfirmText="彻底删除"
            onSave={async (patch) => {
              await api(`${base}/${selected.id}`, { method: "PATCH", body: JSON.stringify(coercePatch(patch)) });
              await reload();
            }}
            onDelete={async () => {
              await api(`${base}/${selected.id}`, { method: "DELETE" });
              setSelected(null);
              await reload();
              notify("success", "知识已彻底删除");
            }}
          />
        </section>
      )}
    </div>
  );
}
