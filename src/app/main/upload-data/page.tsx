"use client";

import { useEffect, useState } from "react";
import UploadSection from "@/components/UploadSection";

export default function UploadDataPage() {
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [current, setCurrent] = useState<{ raw_chat: any | null; agent_info: any | null }>({ raw_chat: null, agent_info: null });
  const [preview, setPreview] = useState<{ raw_chat: { columns: string[]; rows: any[]; total?: number } | null; agent_info: { columns: string[]; rows: any[]; total?: number } | null }>({ raw_chat: null, agent_info: null });
  const [showAllRawCols, setShowAllRawCols] = useState<boolean>(false);
  const [showAllAgentCols, setShowAllAgentCols] = useState<boolean>(false);

  const fetchCurrent = async () => {
    try {
      const res = await fetch("/api/upload", { method: "GET", cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setCurrent({ raw_chat: data.raw_chat ?? null, agent_info: data.agent_info ?? null });
      }
    } catch {
      // ignore fetch errors for now
    }
  };

  useEffect(() => {
    fetchCurrent();
    fetchPreview("raw_chat");
    fetchPreview("agent_info");
  }, []);

  const handleUpload = async (type: "raw_chat" | "agent_info", fileList: FileList) => {
    const file = fileList.item(0);
    if (!file) return;
    setIsUploading(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("type", type);
      form.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      setMessage(`Uploaded and loaded into table: ${data.table}`);
      await fetchCurrent();
      await fetchPreview(type);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setMessage(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async (type: "raw_chat" | "agent_info") => {
    setIsUploading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/upload?type=${type}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Remove failed");
      setMessage("Removed file and dropped table");
      await fetchCurrent();
      setPreview((p) => ({ ...p, [type]: null }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Remove failed";
      setMessage(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const fetchPreview = async (type: "raw_chat" | "agent_info") => {
    try {
      const res = await fetch(`/api/upload?type=${type}&preview=1`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setPreview((p) => ({ ...p, [type]: { columns: data.columns ?? [], rows: data.rows ?? [], total: data.total ?? 0 } }));
      }
    } catch {
      // ignore
    }
  };

  return (
    <section aria-label="Upload Data" className="min-h-[60vh]">
      <div className="mb-4 flex items-center gap-3 text-xs">
        <span className="rounded-md bg-gray-200 px-2 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-200">{isUploading ? "Working..." : "Idle"}</span>
        {message ? <span className="text-gray-600 dark:text-gray-300">{message}</span> : null}
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <UploadSection
          title="Raw Chat History"
          description="Accepts .csv only. Max 20 MB."
          allowedExtensions={[".csv"]}
          maxSizeMB={20}
          onFilesSelected={(files) => handleUpload("raw_chat", files)}
        />
        <UploadSection
          title="Agent Info"
          description="Accepts .csv only. Max 5 MB."
          allowedExtensions={[".csv"]}
          maxSizeMB={5}
          onFilesSelected={(files) => handleUpload("agent_info", files)}
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
        <div className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-1 font-medium text-gray-800 dark:text-gray-200">Current Raw Chat file</div>
          {current.raw_chat ? (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-gray-600 dark:text-gray-300" title={current.raw_chat.fileName}>{current.raw_chat.fileName}</span>
              <button
                onClick={() => handleRemove("raw_chat")}
                className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Remove
              </button>
            </div>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">No file uploaded</span>
          )}
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-1 font-medium text-gray-800 dark:text-gray-200">Current Agent Info file</div>
          {current.agent_info ? (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-gray-600 dark:text-gray-300" title={current.agent_info.fileName}>{current.agent_info.fileName}</span>
              <button
                onClick={() => handleRemove("agent_info")}
                className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Remove
              </button>
            </div>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">No file uploaded</span>
          )}
        </div>
      </div>

      {/* Previews */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
          <div className="flex items-center justify-between border-b border-gray-200 p-2 text-xs font-semibold dark:border-gray-800">
            <span>Raw Chat preview (first 5)</span>
            {preview.raw_chat ? (
              <div className="flex items-center gap-2 text-[11px] font-normal text-gray-600 dark:text-gray-300">
                <span>cols: {preview.raw_chat.columns.length}</span>
                <span>rows: {preview.raw_chat.total ?? preview.raw_chat.rows.length}</span>
                <button
                  type="button"
                  onClick={() => setShowAllRawCols((v) => !v)}
                  className="rounded border border-gray-300 bg-white px-2 py-0.5 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
                >
                  {showAllRawCols ? "Show 8 cols" : "Show all cols"}
                </button>
              </div>
            ) : null}
          </div>
          <div className="w-full overflow-auto p-2">
            {preview.raw_chat && preview.raw_chat.rows.length ? (
              <table className="w-full table-fixed border-collapse text-[11px]">
                <thead>
                  <tr>
                    {(showAllRawCols ? preview.raw_chat.columns : preview.raw_chat.columns.slice(0, 8)).map((c) => (
                      <th key={c} className="truncate border-b border-gray-200 px-2 py-1 text-left font-medium text-gray-700 dark:border-gray-800 dark:text-gray-200">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.raw_chat.rows.map((r, idx) => (
                    <tr key={idx} className="odd:bg-gray-50 dark:odd:bg-gray-900/40">
                      {(showAllRawCols ? preview.raw_chat!.columns : preview.raw_chat!.columns.slice(0, 8)).map((c) => (
                        <td key={c} className="truncate px-2 py-1 align-top text-gray-700 dark:text-gray-300">{String(r[c] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-3 text-xs text-gray-500 dark:text-gray-400">No preview</div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
          <div className="flex items-center justify-between border-b border-gray-200 p-2 text-xs font-semibold dark:border-gray-800">
            <span>Agent Info preview (first 5)</span>
            {preview.agent_info ? (
              <div className="flex items-center gap-2 text-[11px] font-normal text-gray-600 dark:text-gray-300">
                <span>cols: {preview.agent_info.columns.length}</span>
                <span>rows: {preview.agent_info.total ?? preview.agent_info.rows.length}</span>
                <button
                  type="button"
                  onClick={() => setShowAllAgentCols((v) => !v)}
                  className="rounded border border-gray-300 bg-white px-2 py-0.5 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
                >
                  {showAllAgentCols ? "Show 8 cols" : "Show all cols"}
                </button>
              </div>
            ) : null}
          </div>
          <div className="w-full overflow-auto p-2">
            {preview.agent_info && preview.agent_info.rows.length ? (
              <table className="w-full table-fixed border-collapse text-[11px]">
                <thead>
                  <tr>
                    {(showAllAgentCols ? preview.agent_info.columns : preview.agent_info.columns.slice(0, 8)).map((c) => (
                      <th key={c} className="truncate border-b border-gray-200 px-2 py-1 text-left font-medium text-gray-700 dark:border-gray-800 dark:text-gray-200">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.agent_info.rows.map((r, idx) => (
                    <tr key={idx} className="odd:bg-gray-50 dark:odd:bg-gray-900/40">
                      {(showAllAgentCols ? preview.agent_info!.columns : preview.agent_info!.columns.slice(0, 8)).map((c) => (
                        <td key={c} className="truncate px-2 py-1 align-top text-gray-700 dark:text-gray-300">{String(r[c] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-3 text-xs text-gray-500 dark:text-gray-400">No preview</div>
            )}
          </div>
        </div>
      </div>
      
    </section>
  );
}

