"use client";

import { useEffect, useState } from "react";

type ApiRow = Record<string, unknown>;

export default function SamplingSelectionPage() {
  const [agentMode, setAgentMode] = useState<"all" | "percent">("all");
  const [agentPercent, setAgentPercent] = useState<number>(50);
  const [chatMode, setChatMode] = useState<"all" | "percent">("all");
  const [chatPercent, setChatPercent] = useState<number>(10);
  const [normalMode, setNormalMode] = useState<"all" | "percent">("all");
  const [normalPercent, setNormalPercent] = useState<number>(100);
  const [vipMode, setVipMode] = useState<"all" | "percent">("all");
  const [vipPercent, setVipPercent] = useState<number>(100);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [generatedCount, setGeneratedCount] = useState<number | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<ApiRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [clearMsg, setClearMsg] = useState<string>("");

  const fetchPreview = async () => {
    setIsBusy(true);
    setError("");
    try {
      const res = await fetch("/api/sampling", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load sampling preview");
      setColumns(data.columns ?? []);
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotal(Number(data.total ?? 0));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error loading preview");
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    fetchPreview();
  }, []);

  const handleGenerate = async () => {
    setIsBusy(true);
    setError("");
    try {
      const res = await fetch("/api/sampling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentMode,
          agentPercent,
          chatMode,
          chatPercent,
          normalMode,
          normalPercent,
          vipMode,
          vipPercent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to generate sampling data");
      setColumns(data.columns ?? []);
      setRows(Array.isArray(data.rows) ? data.rows : []);
      const totalVal = Number(data.total ?? 0);
      setTotal(totalVal);
      setGeneratedCount(totalVal);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setIsBusy(false);
    }
  };

  const handleClear = async () => {
    setIsBusy(true);
    setError("");
    setClearMsg("");
    try {
      const res = await fetch("/api/sampling", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to clear sampling data");
      setColumns([]);
      setRows([]);
      setTotal(0);
      setGeneratedCount(null);
      setClearMsg("Cleared all generated rows");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section aria-label="Sampling Selection" className="min-h-[60vh]">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">Sampling Selection</h1>
        <div className="text-xs text-gray-500 dark:text-gray-400">Current sampling_data: {total.toLocaleString()} rows</div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 sm:grid-cols-2 md:grid-cols-4 max-w-full overflow-hidden">
        <div className="space-y-1">
          <div className="font-medium">Agent</div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="radio" name="agentMode" checked={agentMode === "all"} onChange={() => setAgentMode("all")} /> All agents
            </label>
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="radio" name="agentMode" checked={agentMode === "percent"} onChange={() => setAgentMode("percent")} /> Random x%
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={agentPercent}
              onChange={(e) => setAgentPercent(Math.max(0, Math.min(100, Number(e.target.value || 0))))}
              disabled={agentMode !== "percent"}
              className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
              aria-label="Agent percent"
            />
            <span className="text-xs">%</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="font-medium">Raw Chat</div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="radio" name="chatMode" checked={chatMode === "all"} onChange={() => setChatMode("all")} /> All chats
            </label>
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="radio" name="chatMode" checked={chatMode === "percent"} onChange={() => setChatMode("percent")} /> Random x%
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={chatPercent}
              onChange={(e) => setChatPercent(Math.max(0, Math.min(100, Number(e.target.value || 0))))}
              disabled={chatMode !== "percent"}
              className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
              aria-label="Chat percent"
            />
            <span className="text-xs">%</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="font-medium">Normal (vip_status = normal)</div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="radio" name="normalMode" checked={normalMode === "all"} onChange={() => setNormalMode("all")} /> All normal
            </label>
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="radio" name="normalMode" checked={normalMode === "percent"} onChange={() => setNormalMode("percent")} /> Random x%
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={normalPercent}
              onChange={(e) => setNormalPercent(Math.max(0, Math.min(100, Number(e.target.value || 0))))}
              disabled={normalMode !== "percent"}
              className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
              aria-label="Normal percent"
            />
            <span className="text-xs">%</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="font-medium">VIP (vip_status = vip)</div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="radio" name="vipMode" checked={vipMode === "all"} onChange={() => setVipMode("all")} /> All VIP
            </label>
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="radio" name="vipMode" checked={vipMode === "percent"} onChange={() => setVipMode("percent")} /> Random x%
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={vipPercent}
              onChange={(e) => setVipPercent(Math.max(0, Math.min(100, Number(e.target.value || 0))))}
              disabled={vipMode !== "percent"}
              className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
              aria-label="VIP percent"
            />
            <span className="text-xs">%</span>
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isBusy}
          className="inline-flex h-9 items-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          aria-label="Generate sampling data"
        >
          {isBusy ? "Generating..." : "Generate"}
        </button>
        <button
          type="button"
          onClick={fetchPreview}
          disabled={isBusy}
          className="inline-flex h-9 items-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          aria-label="Refresh preview"
        >
          Refresh Preview
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={isBusy}
          className="inline-flex h-9 items-center rounded-md border border-red-300 bg-white px-4 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-gray-800"
          aria-label="Clear sampling data"
        >
          {isBusy ? "Working..." : "Clear"}
        </button>
        {generatedCount !== null && !isBusy && !error && (
          <span className="text-xs text-green-700 dark:text-green-400">Generated: {generatedCount.toLocaleString()} rows</span>
        )}
        {clearMsg && !isBusy && !error && (
          <span className="text-xs text-blue-700 dark:text-blue-400">{clearMsg}</span>
        )}
        {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-3 py-2 text-left font-semibold">{c}</th>
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
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                {columns.map((c) => (
                  <td key={c} className="px-3 py-2 align-top text-gray-700 dark:text-gray-200">
                    {r[c] === null || r[c] === undefined || r[c] === "" ? "—" : String(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}


