import { useEffect, useState } from "react";

export type PagerState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
};

export function useClientPagination<T>(rows: T[], defaultPageSize = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);
  const start = (safePage - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total: rows.length,
    totalPages,
    setPage,
    setPageSize: (next: number) => {
      setPageSize(next);
      setPage(1);
    }
  };
}

export function Pagination({ pager }: { pager: PagerState }) {
  if (pager.total <= pager.pageSize && pager.page === 1) return <div className="pagination compact">共 {pager.total} 条</div>;
  return <div className="pagination">
    <span>共 {pager.total} 条 · 第 {pager.page} / {pager.totalPages} 页</span>
    <select value={pager.pageSize} onChange={(event) => pager.setPageSize(Number(event.target.value))}>
      {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} 条/页</option>)}
    </select>
    <button className="ghost" disabled={pager.page <= 1} onClick={() => pager.setPage(pager.page - 1)}>上一页</button>
    <button className="ghost" disabled={pager.page >= pager.totalPages} onClick={() => pager.setPage(pager.page + 1)}>下一页</button>
  </div>;
}

export function AccountPagination({ pager }: { pager: PagerState }) {
  if (pager.total <= pager.pageSize && pager.page === 1) return <div className="account-mini-pager single">共 {pager.total} 个账号</div>;
  return <div className="account-mini-pager">
    <span className="account-page-indicator">共 {pager.total} 个 · 第 {pager.page}/{pager.totalPages} 页</span>
    <select aria-label="每页客服账号数量" value={pager.pageSize} onChange={(event) => pager.setPageSize(Number(event.target.value))}>
      {[10, 20, 50].map((size) => <option key={size} value={size}>{size}/页</option>)}
    </select>
    <div className="account-page-buttons">
      <button className="ghost" disabled={pager.page <= 1} onClick={() => pager.setPage(pager.page - 1)}>上一页</button>
      <button className="ghost" disabled={pager.page >= pager.totalPages} onClick={() => pager.setPage(pager.page + 1)}>下一页</button>
    </div>
  </div>;
}
