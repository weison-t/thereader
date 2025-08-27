"use client";

import { useEffect, useState } from "react";

export default function ReportsProcessedResultsPage() {
  const [status, setStatus] = useState<string>("");
  const [rowsCount, setRowsCount] = useState<number>(0);
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);

  const load = async () => {
    try {
      setStatus("Loading...");
      const res = await fetch("/api/scoring-data", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || "Failed to load processed data");
      setRowsCount(Number(j?.total ?? (j?.rows || []).length || 0));
      setColumns(Array.isArray(j?.columns) ? j.columns : []);
      setData(Array.isArray(j?.rows) ? j.rows : []);
      setStatus("Ready");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(msg);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleProcess = async () => {
    setStatus("Processing...");
    try {
      const res = await fetch("/api/scoring-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "process", replace: true }) });
      const d = await res.json();
      if (!res.ok || d?.error) throw new Error(d?.error || "Failed to process");
      await load();
      setStatus(`Processed ${d?.inserted ?? 0}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(msg);
    }
  };

  const handleDownload = () => {
    // Build CSV client-side to keep API minimal
    const hdr = columns;
    const lines = data.map((r) => hdr.map((h) => JSON.stringify(r[h] ?? "")).join(","));
    const csv = [hdr.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scoring_data.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-label="Processed Results" className="min-h-[60vh]">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">Processed Results</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleProcess}
            className="inline-flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            aria-label="Process processed data"
          >
            Process
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            aria-label="Download CSV"
          >
            Download CSV
          </button>
          <span className="text-xs text-gray-600 dark:text-gray-400">{status}</span>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm dark:border-gray-800 dark:bg-gray-950">
        <div className="mb-3 text-xs text-gray-600 dark:text-gray-400">Rows: {rowsCount.toLocaleString()}</div>
        {data.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 p-6 text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No results yet. Click Process to generate.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900">
                  {columns.map((c) => (
                    <th key={c} className="border-b border-gray-200 px-2 py-2 text-left font-medium dark:border-gray-800">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={i} className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-950 dark:even:bg-gray-900">
                    {columns.map((c) => (
                      <td key={c} className="border-b border-gray-100 px-2 py-2 align-top dark:border-gray-900">{String(r[c] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

