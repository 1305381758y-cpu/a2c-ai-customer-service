import { useState } from "react";

import { loadRows, useRows, withQuery } from "../app/api.js";
import type { Conversation, Filters } from "../types.js";
import { useClientPagination } from "../ui/Pagination.js";

export function usePlatformConversationsController({ handoffs = false }: { handoffs?: boolean }) {
  const base = "/api/admin/conversations";
  const [filters, setFiltersState] = useState<Filters>({ merchantId: "", status: handoffs ? "human_handoff" : "", handoffStatus: handoffs ? "pending" : "", language: "", limit: "100" });
  const rowsUrl = withQuery(base, filters);
  const [rows, setRows] = useRows<Conversation>(rowsUrl);
  const pager = useClientPagination(rows, 20);
  const [selected, setSelected] = useState<Conversation | null>(null);

  const reload = async () => {
    setRows(await loadRows(rowsUrl));
    pager.setPage(1);
  };
  const refreshSelected = async () => {
    setRows(await loadRows(rowsUrl));
  };
  const setFilters = (next: Filters) => {
    setFiltersState(handoffs ? { ...next, status: "human_handoff", handoffStatus: "pending" } : next);
  };
  const onDeleted = async () => {
    setSelected(null);
    await reload();
  };

  return {
    filters,
    pager,
    reload,
    refreshSelected,
    selected,
    setFilters,
    setSelected,
    onDeleted
  };
}
