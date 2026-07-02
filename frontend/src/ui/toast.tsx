import React, { useEffect, useState } from "react";
import { X } from "lucide-react";

import type { Toast } from "../types.js";

let emitToast: (toast: Omit<Toast, "id">) => void = () => undefined;

export function notify(type: Toast["type"], title: string, detail?: string) {
  emitToast({ type, title, detail });
}

export function notifyExportStarted(format: "csv" | "jsonl") {
  notify("success", format === "csv" ? "正在导出 CSV" : "正在导出 JSONL", "浏览器会开始下载对话数据文件。");
}

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    emitToast = (toast) => {
      const id = Date.now() + Math.random();
      setItems((current) => [...current, { ...toast, id }].slice(-4));
      window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 3600);
    };
    return () => { emitToast = () => undefined; };
  }, []);
  return <div className="toast-host">{items.map((item) => <article key={item.id} className={`toast ${item.type}`}><strong>{item.title}</strong>{item.detail && <p>{item.detail}</p>}<button className="ghost icon-only" onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))}><X size={15}/></button></article>)}</div>;
}
