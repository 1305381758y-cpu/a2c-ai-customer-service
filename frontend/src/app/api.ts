import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { Filters } from "../types.js";
import { translateSystemMessage } from "../ui/formatters.js";

export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = { ...(options.body === undefined ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers, credentials: "same-origin" });
  if (!response.ok) {
    const error = new Error(translateSystemMessage((await response.json().catch(() => ({}))).error || response.statusText));
    Object.assign(error, { status: response.status });
    throw error;
  }
  return response.json() as Promise<T>;
}

export function apiErrorStatus(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : undefined;
}

export type RowsResourceState = {
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useRows<T>(url: string): [T[], Dispatch<SetStateAction<T[]>>, RowsResourceState] {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const reload = useCallback(async () => {
    const requestId = ++requestSequence.current;
    if (!url) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextRows = await loadRows<T>(url);
      if (requestId === requestSequence.current) setRows(nextRows);
    } catch (err) {
      if (requestId === requestSequence.current) setError(err instanceof Error ? err.message : "数据加载失败，请稍后重试。");
      throw err;
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void reload().catch(() => undefined);
    return () => { requestSequence.current += 1; };
  }, [reload]);
  return [rows, setRows, { loading, error, reload }];
}

export async function loadRows<T>(url: string): Promise<T[]> {
  return (await api<{ rows: T[] }>(url)).rows;
}

export function withQuery(base: string, filters: Filters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "") params.set(key, value);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
