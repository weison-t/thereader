"use client";

import { useEffect, useMemo, useState } from "react";

type ApiRow = Record<string, unknown>;

export default function SamplingPage() {
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<ApiRow[]>([]);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [total, setTotal] = useState<number>(0);

  const totalPages = useMemo(() => (pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1), [total, pageSize]);

  const fetchPage = async (pageNum: number, pageSizeNum: number) => {
    setIsBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/raw-chat?page=${pageNum}&pageSize=${pageSizeNum}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load raw chat data");
      setColumns(data.columns ?? []);
      setMapping(data.mapping ?? {});
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotal(Number(data.total ?? 0));
      setPage(Number(data.page ?? pageNum));
      setPageSize(Number(data.pageSize ?? pageSizeNum));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error loading data");
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    fetchPage(page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => fetchPage(page, pageSize);
  const handlePrev = () => fetchPage(Math.max(1, page - 1), pageSize);
  const handleNext = () => fetchPage(Math.min(totalPages, page + 1), pageSize);

  return (
    <section aria-label="Sampling" className="min-h-[60vh]">
      <div className="flex items-center justify-between pb-4">
        <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">Data Snapshot</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex h-8 items-center rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            aria-label="Refresh raw chat data"
            title="Refresh"
          >
            Refresh
          </button>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {total.toLocaleString()} rows • Page {page} / {totalPages}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <tr>
              {columns.map((label) => (
                <th key={label} scope="col" className="px-3 py-2 text-left font-semibold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-900">
            {rows.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, columns.length)} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                  {isBusy ? "Loading..." : "No data"}
                </td>
              </tr>
            )}
            {rows.map((r, idx) => (
              <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                {columns.map((label) => {
                  const key = mapping[label] ?? label;
                  const value = r[key];
                  return (
                    <td key={label} className="px-3 py-2 align-top text-gray-700 dark:text-gray-200">
                      {value === null || value === undefined || value === "" ? "—" : String(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Showing {(rows.length > 0 ? (page - 1) * pageSize + 1 : 0).toLocaleString()}–{((page - 1) * pageSize + rows.length).toLocaleString()} of {total.toLocaleString()}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={isBusy || page <= 1}
            className="inline-flex h-8 items-center rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            aria-label="Previous page"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={isBusy || page >= totalPages}
            className="inline-flex h-8 items-center rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}
    </section>
  );
}

