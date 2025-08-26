"use client";

import { useEffect, useState } from "react";
import UploadSection from "@/components/UploadSection";

export default function CriteriaSettingPage() {
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [current, setCurrent] = useState<any | null>(null);
  const [grid, setGrid] = useState<{ columns: string[]; rows: any[]; totals?: { normal?: number; premier?: number } } | null>(null);
  const [activeTab, setActiveTab] = useState<"normal" | "premier">("normal");
  const [pendingEdits, setPendingEdits] = useState<Record<number, Record<string, string>>>({});
  const [isEditing, setIsEditing] = useState<boolean>(false);

  const fetchCurrent = async () => {
    try {
      const res = await fetch("/api/upload?type=criteria_scoring", { method: "GET", cache: "no-store" });
      const data = await res.json();
      if (res.ok) setCurrent(data.criteria_scoring ?? null);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchCurrent();
    fetchGrid();
  }, []);

  const handleUpload = async (fileList: FileList) => {
    const file = fileList.item(0);
    if (!file) return;
    setIsBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("type", "criteria_scoring");
      form.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      setMessage("Uploaded successfully");
      await fetchCurrent();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setMessage(msg);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemove = async () => {
    setIsBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/upload?type=criteria_scoring", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Remove failed");
      setMessage("Removed successfully");
      await fetchCurrent();
      await fetchGrid();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Remove failed";
      setMessage(msg);
    } finally {
      setIsBusy(false);
    }
  };

  const fetchGrid = async () => {
    try {
      const res = await fetch("/api/criteria-scoring", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setGrid({ columns: data.columns ?? [], rows: data.rows ?? [], totals: data.totals ?? {} });
    } catch {
      // ignore for now
    }
  };

  const handleSave = async () => {
    const updates = Object.entries(pendingEdits).map(([id, updates]) => ({ id: Number(id), updates }));
    if (updates.length === 0) {
      setMessage("No changes to save");
      return;
    }
    setIsBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/criteria-scoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "batchUpdate", updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Save failed");
      setMessage("Saved successfully");
      setPendingEdits({});
      setIsEditing(false);
      await fetchGrid();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setMessage(msg);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDefault = async () => {
    setIsBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/criteria-scoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Reset failed");
      setMessage("Reverted to last uploaded file data");
      setPendingEdits({});
      setIsEditing(false);
      await fetchGrid();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Reset failed";
      setMessage(msg);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section aria-label="Criteria Setting" className="min-h-[60vh]">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <UploadSection
          title="Criteria and Scoring"
          description="Upload criteria and scoring CSV. Only the latest file is kept."
          allowedExtensions={[".csv"]}
          maxSizeMB={10}
          onFilesSelected={(files) => handleUpload(files)}
        />

        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-2 text-sm font-medium">Current Criteria file</div>
          {current ? (
            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
              <span className="truncate" title={current.fileName}>{current.fileName}</span>
              <button
                type="button"
                onClick={handleRemove}
                disabled={isBusy}
                className="ml-3 rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                aria-label="Remove criteria file"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-gray-300 p-4 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No file uploaded yet
            </div>
          )}
        </div>
      </div>

      {message && (
        <p className="mt-4 text-sm text-gray-700 dark:text-gray-300" role="status">{message}</p>
      )}

      {/* Editable tables */}
      <div className="mt-6">
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("normal")}
            className={`rounded-md px-3 py-1 text-xs ${activeTab === "normal" ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"}`}
            aria-label="Show Normal CX"
          >
            Normal CX
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("premier")}
            className={`rounded-md px-3 py-1 text-xs ${activeTab === "premier" ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"}`}
            aria-label="Show Premier CX"
          >
            Premier CX
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
          <div className="flex items-center justify-between border-b border-gray-200 p-2 text-xs font-semibold dark:border-gray-800">
            <span>
              {activeTab === "normal" ? "Normal CX" : "Premier CX"} table (editable)
            </span>
            <div className="flex items-center gap-2">
              <div className="text-[11px] font-normal text-gray-600 dark:text-gray-300">
                rows: {(() => {
                  const rows = (grid?.rows ?? []).filter((r) => String(r.customer_type || "").toLowerCase().includes(activeTab === "normal" ? "normal" : "premier"));
                  return rows.length;
                })()} | total weightage: {(activeTab === "normal" ? grid?.totals?.normal : grid?.totals?.premier) ?? 0}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                {isEditing && Object.keys(pendingEdits).length ? `unsaved: ${Object.keys(pendingEdits).length} row(s)` : ""}
              </div>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                disabled={isBusy || isEditing}
                className="rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                aria-label="Enable modify mode"
              >
                Modify
              </button>
              <button
                type="button"
                onClick={handleDefault}
                disabled={isBusy}
                className="rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                aria-label="Revert to default (last uploaded file)"
              >
                Default
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isBusy || !isEditing || Object.keys(pendingEdits).length === 0}
                className="rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                aria-label="Save changes"
              >
                Save
              </button>
            </div>
          </div>

          <div className="w-full overflow-auto p-2">
            {grid && grid.rows.length ? (
              <table className="w-full table-fixed border-collapse text-[11px]">
                <thead>
                  <tr>
                    {grid.columns.map((c) => (
                      <th key={c} className="truncate border-b border-gray-200 px-2 py-1 text-left font-medium text-gray-700 dark:border-gray-800 dark:text-gray-200">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows
                    .filter((r) => String(r.customer_type || "").toLowerCase().includes(activeTab === "normal" ? "normal" : "premier"))
                    .map((r, idx) => (
                      <tr key={r._row_id ?? idx} className="odd:bg-gray-50 dark:odd:bg-gray-900/40">
                        {grid.columns.map((c) => (
                          <td key={c} className="px-2 py-1 align-top text-gray-700 dark:text-gray-300">
                            {c === "_row_id" ? (
                              <span className="text-gray-500">{r[c]}</span>
                            ) : (
                              <input
                                value={
                                  pendingEdits[r._row_id]?.[c] !== undefined
                                    ? pendingEdits[r._row_id][c]
                                    : r[c] ?? ""
                                }
                                onChange={(e) => {
                                  if (!isEditing) return;
                                  const next = e.currentTarget.value;
                                  setPendingEdits((prev) => ({
                                    ...prev,
                                    [Number(r._row_id)]: { ...(prev[Number(r._row_id)] || {}), [c]: next },
                                  }));
                                }}
                                disabled={!isEditing}
                                className={`w-full rounded border px-2 py-1 outline-none ${
                                  isEditing
                                    ? "border-gray-300 bg-white focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900"
                                    : "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-500"
                                }`}
                                aria-label={`Edit ${c}`}
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <div className="p-3 text-xs text-gray-500 dark:text-gray-400">No data</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

