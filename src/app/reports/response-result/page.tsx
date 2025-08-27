"use client";

import { useEffect, useState } from "react";

export default function ReportsResponseResultPage() {
  const [status, setStatus] = useState<string>("");
  const [rows, setRows] = useState<number>(0);
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [keyBusy, setKeyBusy] = useState<boolean>(false);
  const [keyMessage, setKeyMessage] = useState<string>("");

  useEffect(() => {
    const init = async () => {
      try {
        setStatus("Initializing table...");
        await fetch("/api/response-result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "init" }) });
        const r = await fetch("/api/response-result?limit=50", { cache: "no-store" });
        const j = await r.json();
        if (r.ok && j?.ok) {
          setRows(Number(j?.rowsTotal ?? 0));
          setColumns(Array.isArray(j?.columns) ? j.columns : []);
          setData(Array.isArray(j?.rows) ? j.rows : []);
          setStatus("Ready");
        } else {
          setStatus(j?.error || "Failed to load");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus(msg);
      }
    };
    init();
  }, []);

  const handleProcess = async () => {
    // 1) Ensure key is present
    setStatus("Checking OpenAI key...");
    try {
      const cfgRes = await fetch("/api/api-configuration", { cache: "no-store" });
      const cfg = await cfgRes.json();
      if (!cfgRes.ok) throw new Error(cfg?.error || "Failed to load API configuration");
      const hasKey = Boolean(cfg?.has_key);
      if (!hasKey) {
        setStatus("Idle");
        setShowKeyModal(true);
        return;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(msg);
      return;
    }

    // 2) Confirm proceed cost
    const ok = window.confirm("Confirm proceed? API cost will be incurred.");
    if (!ok) {
      setStatus("Idle");
      return;
    }

    // 3) Process
    setStatus("Processing - Chat under AIVA evaluation");
    try {
      const res = await fetch("/api/response-result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "process", replace: true }) });
      const d = await res.json();
      if (!res.ok || d?.error) throw new Error(d?.error || "Failed to process");
      const r = await fetch("/api/response-result?limit=50", { cache: "no-store" });
      const j = await r.json();
      if (r.ok && j?.ok) {
        setRows(Number(j?.rowsTotal ?? 0));
        setColumns(Array.isArray(j?.columns) ? j.columns : []);
        setData(Array.isArray(j?.rows) ? j.rows : []);
        setStatus(`Processed ${d?.processed ?? 0}`);
      } else {
        setStatus(j?.error || "Failed to refresh");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(msg);
    }
  };

  const handleDownload = () => {
    window.location.href = "/api/response-result?download=csv";
  };

  return (
    <section aria-label="Response Result" className="min-h-[60vh]">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">Response Result</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleProcess}
            className="inline-flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            aria-label="Process sampling data"
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

      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-lg dark:border-gray-800 dark:bg-gray-950">
            <div className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">OpenAI API key required</div>
            <p className="mb-3 text-xs text-gray-600 dark:text-gray-400">Enter a valid OpenAI key to proceed.</p>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-..."
              className="mb-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              aria-label="OpenAI API key"
            />
            {keyMessage ? (
              <div className="mb-2 text-xs text-gray-600 dark:text-gray-300">{keyMessage}</div>
            ) : null}
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowKeyModal(false);
                  setApiKeyInput("");
                  setKeyMessage("");
                }}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={keyBusy || !apiKeyInput.trim()}
                onClick={async () => {
                  const key = apiKeyInput.trim();
                  if (!key) return;
                  setKeyBusy(true);
                  setKeyMessage("Testing key...");
                  try {
                    // Test
                    const tRes = await fetch("/api/api-configuration", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "test", openai_key: key })
                    });
                    const t = await tRes.json();
                    if (!tRes.ok || t?.error || t?.ok === false) {
                      const errMsg = t?.error || t?.body || "Key test failed";
                      setKeyMessage(String(errMsg).slice(0, 200));
                      setKeyBusy(false);
                      return;
                    }
                    // Save
                    const sRes = await fetch("/api/api-configuration", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ openai_key: key })
                    });
                    const s = await sRes.json();
                    if (!sRes.ok || s?.error) {
                      setKeyMessage(s?.error || "Failed to save key");
                      setKeyBusy(false);
                      return;
                    }
                    setKeyMessage("Key saved. You can proceed.");
                    setShowKeyModal(false);
                    setApiKeyInput("");
                    setKeyBusy(false);
                    // Immediately continue with confirm+process
                    const ok = window.confirm("Confirm proceed? API cost will be incurred.");
                    if (!ok) {
                      setStatus("Idle");
                      return;
                    }
                    setStatus("Processing - Chat under AIVA evaluation");
                    const res = await fetch("/api/response-result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "process", replace: true }) });
                    const d = await res.json();
                    if (!res.ok || d?.error) throw new Error(d?.error || "Failed to process");
                    const r = await fetch("/api/response-result?limit=50", { cache: "no-store" });
                    const j = await r.json();
                    if (r.ok && j?.ok) {
                      setRows(Number(j?.rowsTotal ?? 0));
                      setColumns(Array.isArray(j?.columns) ? j.columns : []);
                      setData(Array.isArray(j?.rows) ? j.rows : []);
                      setStatus(`Processed ${d?.processed ?? 0}`);
                    } else {
                      setStatus(j?.error || "Failed to refresh");
                    }
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    setKeyMessage(msg);
                    setKeyBusy(false);
                  }
                }}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {keyBusy ? "Working..." : "Test & Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm dark:border-gray-800 dark:bg-gray-950">
        <div className="mb-3 text-xs text-gray-600 dark:text-gray-400">Rows: {rows.toLocaleString()}</div>
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

