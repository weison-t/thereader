"use client";

import { useEffect, useState } from "react";

type ApiConfig = { provider: string; model: string; openai_key?: string; monthly_budget_usd?: number | null };

export default function ApiConfigurationPage() {
  const [config, setConfig] = useState<ApiConfig>({ provider: "OpenAI", model: "GPT-5 mini", openai_key: "", monthly_budget_usd: null });
  const [isEditing, setIsEditing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"settings" | "usage">("settings");
  const [usage, setUsage] = useState<{ month: string | null; tokens: number; monthly_budget_usd: number | null }>({ month: null, tokens: 0, monthly_budget_usd: null });
  const [testStatus, setTestStatus] = useState<string>("");
  const MASK = "••••••••••••••••";
  const [maskActive, setMaskActive] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/api-configuration", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load");
        const persistedKey = typeof window !== "undefined" ? sessionStorage.getItem("api_config_openai_key") || "" : "";
        setConfig({
          provider: data?.provider ?? "OpenAI",
          model: data?.model ?? "GPT-5 mini",
          monthly_budget_usd: typeof data?.monthly_budget_usd === "number" ? data.monthly_budget_usd : null,
          openai_key: persistedKey,
        });
        const has = Boolean(data?.has_key);
        setHasSavedKey(has);
        // Show mask only if a key exists and there is no unsaved key in session
        setMaskActive(has && !persistedKey);
      } catch (e) {
        // non-fatal; keep defaults
      }
      try {
        const r = await fetch("/api/api-configuration?mode=usage", { cache: "no-store" });
        const u = await r.json();
        if (r.ok) {
          setUsage({ month: u?.month ?? null, tokens: Number(u?.tokens ?? 0), monthly_budget_usd: u?.monthly_budget_usd ?? null });
          setConfig((c) => ({ ...c, monthly_budget_usd: u?.monthly_budget_usd ?? c.monthly_budget_usd ?? null }));
        }
      } catch {}
    };
    run();
  }, []);

  const [hasSavedKey, setHasSavedKey] = useState(false);

  const handleSave = async () => {
    if (!isEditing) return;
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      const body: any = {
        provider: config.provider,
        model: config.model,
        monthly_budget_usd: config.monthly_budget_usd ?? null,
      };
      if (!maskActive && config.openai_key) {
        body.openai_key = config.openai_key;
      }
      const res = await fetch("/api/api-configuration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save");
      setMessage("Saved");
      setIsEditing(false);
      const savedNewKey = Boolean(body.openai_key);
      setHasSavedKey(savedNewKey || hasSavedKey);
      // After save, reapply mask if a key exists
      setMaskActive(savedNewKey || hasSavedKey);
      // Clear plaintext from state/storage
      setConfig((c) => ({ ...c, openai_key: "" }));
      if (typeof window !== "undefined") sessionStorage.removeItem("api_config_openai_key");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setIsBusy(false);
    }
  };

  const models = ["GPT-5", "GPT-5 mini", "GPT-5 nano", "GPT-4.1"] as const;
  const handleTestConnection = async () => {
    setTestStatus("");
    setError("");
    if (!config.openai_key || maskActive) {
      setTestStatus("Please enter a key");
      return;
    }
    try {
      const res = await fetch("/api/api-configuration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", openai_key: config.openai_key }),
      });
      const data = await res.json();
      if (data?.ok) setTestStatus("Connection OK");
      else setTestStatus(`Failed${data?.status ? ` (${data.status})` : ""}${data?.body ? `: ${String(data.body).slice(0, 120)}` : data?.error ? `: ${String(data.error).slice(0, 120)}` : ""}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestStatus(`Error: ${msg}`);
    }
  };

  const [testModelStatus, setTestModelStatus] = useState<string>("");
  const handleTestModel = async () => {
    setTestModelStatus("");
    setError("");
    try {
      const res = await fetch("/api/api-configuration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "testModel", provider: config.provider, model: config.model, openai_key: maskActive ? undefined : (config.openai_key || undefined) }),
      });
      const data = await res.json();
      if (data?.ok) setTestModelStatus("Model OK");
      else setTestModelStatus(`Failed${data?.status ? ` (${data.status})` : ""}${data?.body ? `: ${String(data.body).slice(0, 120)}` : data?.error ? `: ${String(data.error).slice(0, 120)}` : ""}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestModelStatus(`Error: ${msg}`);
    }
  };

  return (
    <section aria-label="API Configuration" className="min-h-[60vh]">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">API Configuration</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            className="inline-flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            aria-label="Toggle edit"
          >
            {isEditing ? "Cancel" : "Modify"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isBusy || !isEditing}
            className="inline-flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            aria-label="Save API configuration"
          >
            {isBusy ? "Saving..." : "Save"}
          </button>
          {message && <span className="text-xs text-green-700 dark:text-green-400">{message}</span>}
          {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
        </div>
      </div>

      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`h-8 rounded-md px-3 text-sm ${activeTab === "settings" ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "bg-white text-gray-700 dark:bg-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-700"}`}
          aria-label="Settings tab"
        >
          Settings
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("usage")}
          className={`h-8 rounded-md px-3 text-sm ${activeTab === "usage" ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "bg-white text-gray-700 dark:bg-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-700"}`}
          aria-label="Usage tab"
        >
          Usage
        </button>
      </div>

      {activeTab === "settings" && (
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-medium">Provider</label>
            <select
              className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              value={config.provider}
              onChange={(e) => setConfig((c) => ({ ...c, provider: e.target.value }))}
              disabled={!isEditing}
              aria-label="Provider"
            >
              <option value="OpenAI">OpenAI</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium">Model</label>
            <select
              className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              value={config.model}
              onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
              disabled={!isEditing}
              aria-label="Model"
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium">OpenAI API Key</label>
            <input
              type="password"
              className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              value={maskActive ? MASK : (config.openai_key ?? "")}
              onChange={(e) => {
                const v = e.target.value;
                setConfig((c) => ({ ...c, openai_key: v }));
                if (typeof window !== "undefined") sessionStorage.setItem("api_config_openai_key", v);
              }}
              onFocus={() => {
                if (maskActive) {
                  setMaskActive(false);
                  setConfig((c) => ({ ...c, openai_key: "" }));
                  if (typeof window !== "undefined") sessionStorage.removeItem("api_config_openai_key");
                }
              }}
              disabled={!isEditing}
              aria-label="OpenAI API Key"
              placeholder="sk-..."
            />
            {hasSavedKey && maskActive && (
              <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Saved (hidden). Focus to replace.</div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={!isEditing || !config.openai_key}
                className="inline-flex h-8 items-center rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                aria-label="Test connection"
              >
                Test connection
              </button>
              <button
                type="button"
                onClick={handleTestModel}
                disabled={!isEditing || (!config.openai_key && !hasSavedKey)}
                className="inline-flex h-8 items-center rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                aria-label="Test model"
              >
                Test model
              </button>
              {testStatus && <span className="text-[11px] text-gray-600 dark:text-gray-400">{testStatus}</span>}
              {testModelStatus && <span className="text-[11px] text-gray-600 dark:text-gray-400">{testModelStatus}</span>}
            </div>
            <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">Key stored encrypted (AES-256-GCM). Set CONFIG_ENCRYPTION_KEY in .env.local.</div>
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium">Monthly budget (USD)</label>
            <input
              type="number"
              step="0.01"
              min={0}
              value={config.monthly_budget_usd ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, monthly_budget_usd: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) }))}
              disabled={!isEditing}
              className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              aria-label="Monthly budget"
              placeholder="e.g., 200.00"
            />
          </div>
        </div>
        <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
          Note: Only OpenAI is available now. Supported models: GPT-5, GPT-5 mini, GPT-5 nano, GPT-4.1.
        </div>
      </div>
      )}

      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950" aria-label="Model guidance">
        <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Model guidance</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
            <div className="mb-1 font-medium">GPT-5</div>
            <ul className="list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
              <li><span className="font-semibold">Best for</span>: complex QA, long transcripts, policy/risk analysis</li>
              <li><span className="font-semibold">Pros</span>: highest reasoning, long-context, strong adherence</li>
              <li><span className="font-semibold">Cons</span>: higher cost and latency</li>
            </ul>
          </div>
          <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
            <div className="mb-1 font-medium">GPT-5 mini</div>
            <ul className="list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
              <li><span className="font-semibold">Best for</span>: daily scoring, summaries, data cleanup</li>
              <li><span className="font-semibold">Pros</span>: strong quality/cost, lower latency</li>
              <li><span className="font-semibold">Cons</span>: can miss rare edge cases</li>
            </ul>
          </div>
          <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
            <div className="mb-1 font-medium">GPT-5 nano</div>
            <ul className="list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
              <li><span className="font-semibold">Best for</span>: fast UI hints, simple rule checks</li>
              <li><span className="font-semibold">Pros</span>: cheapest, fastest, high throughput</li>
              <li><span className="font-semibold">Cons</span>: weakest reasoning, short context</li>
            </ul>
          </div>
          <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
            <div className="mb-1 font-medium">GPT-4.1</div>
            <ul className="list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
              <li><span className="font-semibold">Best for</span>: compatibility/fallback, simple summaries</li>
              <li><span className="font-semibold">Pros</span>: mature, predictable, often cost-effective</li>
              <li><span className="font-semibold">Cons</span>: less capable than GPT-5 family, shorter context</li>
            </ul>
          </div>
        </div>
      </div>

      {activeTab === "usage" && (
      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950" aria-label="API usage">
        <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Usage</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 text-sm">
          <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">Month</div>
            <div className="mt-1 font-medium">{usage.month ?? "-"}</div>
          </div>
          <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">Tokens used</div>
            <div className="mt-1 font-medium">{usage.tokens.toLocaleString()}</div>
          </div>
          <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">Monthly budget (USD)</div>
            <div className="mt-1 font-medium">{(usage.monthly_budget_usd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">Usage tracking is scaffolded. Hook your metering to update usage_tokens monthly.</div>
      </div>
      )}
    </section>
  );
}

