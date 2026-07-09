import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { api, loadRows, useRows, withQuery } from "../app/api.js";
import type { Filters, Knowledge, MerchantCountry } from "../types.js";
import { AsyncButton, Editor, FilterBar, Table } from "../ui/components.js";
import { coercePatch } from "../ui/form.js";
import { countryLabel, label } from "../ui/formatters.js";
import { Pagination, useClientPagination } from "../ui/Pagination.js";
import { notify } from "../ui/toast.js";

export function KnowledgePage({ platform }: { platform: boolean }) {
  const base = platform ? "/api/admin/knowledge" : "/api/merchant/knowledge";
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", type: "", enabled: "" });
  const rowsUrl = withQuery(base, platform ? filters : { countryId: filters.countryId, type: filters.type, enabled: filters.enabled });
  const [rows, setRows] = useState<Knowledge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pager = useClientPagination(rows, 20);
  const [form, setForm] = useState<Record<string, string>>({ merchantId: "default", countryId: "", type: "faq", title: "", content: "", language: "zh", priority: "0" });
  const [selected, setSelected] = useState<Knowledge | null>(null);
  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await loadRows(rowsUrl));
      pager.setPage(1);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "知识库加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void reload(); }, [rowsUrl]);

  return (
    <div className={selected ? "split work-split" : "single-column work-split"}>
      <section className="work-panel">
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          fields={platform ? ["merchantId", "countryId", "type", "enabled"] : ["countryId", "type", "enabled"]}
          selects={{ countryId: ["", ...countries.map((country) => country.id)], type: ["", "faq", "script", "rule", "forbidden"], enabled: ["", "true", "false"] }}
          onApply={reload}
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
          rows={pager.rows}
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
