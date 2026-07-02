import { useEffect, useState } from "react";

import type { Filters } from "../types.js";
import { translateSystemMessage } from "../ui/formatters.js";

export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = { ...(options.body === undefined ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) throw new Error(translateSystemMessage((await response.json().catch(() => ({}))).error || response.statusText));
  return response.json() as Promise<T>;
}

export function useRows<T>(url: string): [T[], (rows: T[]) => void] {
  const [rows, setRows] = useState<T[]>([]);
  useEffect(() => {
    if (!url) {
      setRows([]);
      return;
    }
    loadRows<T>(url).then(setRows).catch(() => setRows([]));
  }, [url]);
  return [rows, setRows];
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
