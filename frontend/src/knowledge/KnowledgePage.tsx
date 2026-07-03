import { Plus } from "lucide-react";
import { useState } from "react";

import { useRows } from "../app/api.js";
import type { Filters, Knowledge, MerchantCountry } from "../types.js";
import { AsyncButton, Editor, FilterBar, Table } from "../ui/components.js";
import { countryLabel, label } from "../ui/formatters.js";
import { Pagination, useClientPagination } from "../ui/Pagination.js";
import { notify } from "../ui/toast.js";
import {
  buildKnowledgeUrl,
  createKnowledgeItem,
  deleteKnowledgeItem,
  knowledgeBase,
  loadKnowledgeItems,
  updateKnowledgeItem
} from "./knowledgeApi.js";

export function KnowledgePage({ platform }: { platform: boolean }) {
  const base = knowledgeBase(platform);
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", type: "", enabled: "" });
  const rowsUrl = buildKnowledgeUrl(platform, filters);
  const [rows, setRows] = useRows<Knowledge>(rowsUrl);
  const pager = useClientPagination(rows, 20);
  const [form, setForm] = useState<Record<string, string>>({ merchantId: "default", countryId: "", type: "faq", title: "", content: "", language: "zh", priority: "0" });
  const [selected, setSelected] = useState<Knowledge | null>(null);
  const reload = async () => {
    setRows(await loadKnowledgeItems(rowsUrl));
    pager.setPage(1);
  };

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
              await createKnowledgeItem(base, form, form.countryId || filters.countryId || countries[0]?.id || "");
              setForm({ ...form, title: "", content: "" });
              await reload();
            }}
          >
            <Plus size={16}/>新增知识
          </AsyncButton>
        </div>
        <Table rows={pager.rows} columns={["countryId", "type", "title", "content", "language", "priority", "enabled"]} onRow={setSelected} />
        <Pagination pager={pager} />
      </section>
      {selected && (
        <section className="detail-panel">
          <Editor
            title="知识库编辑"
            value={selected as any}
            fields={["countryId", "type", "title", "content", "language", "priority", "enabled"]}
            selects={{ type: ["faq", "script", "rule", "forbidden"], enabled: ["true", "false"] }}
            onSave={async (patch) => {
              await updateKnowledgeItem(base, selected.id, patch);
              await reload();
            }}
            onDelete={async () => {
              if (!window.confirm("确认彻底删除这条知识？删除后 AI 不会再引用它。")) return;
              await deleteKnowledgeItem(base, selected.id);
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
