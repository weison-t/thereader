"use client";

import { useEffect, useState } from "react";

type Config = { rubric_understanding: string };

export default function AiAgentConfigPage() {
  const [config, setConfig] = useState<Config>({ rubric_understanding: "" });
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState("");

  const fetchConfig = async () => {
    setIsBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ai-agent-config", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load config");
      const c = data.config || {};
      setConfig({ rubric_understanding: String(c.rubric_understanding ?? "") });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleInsertCriteriaOverview = async () => {
    if (!isEditing) return;
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/criteria-scoring", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load criteria");

      const columns: string[] = Array.isArray(data?.columns) ? data.columns : [];
      const rows: Array<Record<string, unknown>> = Array.isArray(data?.rows) ? data.rows : [];
      const totals = (data?.totals ?? {}) as { normal?: number; premier?: number };

      const findColumn = (candidates: string[]): string | undefined => {
        const lower = new Map(columns.map((c) => [c.toLowerCase(), c] as const));
        for (const cand of candidates) {
          if (lower.has(cand)) return lower.get(cand);
        }
        // fallback: includes
        for (const c of columns) {
          const lc = c.toLowerCase();
          if (candidates.some((cand) => lc.includes(cand))) return c;
        }
        return undefined;
      };

      const ctCol = findColumn(["customer_type", "customer type", "cust_type", "type"]);
      const criteriaCol = findColumn(["criteria", "criterion"]);
      const weightCol = findColumn(["weightage", "weight", "score", "points"]);

      type CT = "normal" | "premier" | "other";
      const normalizeCT = (v: unknown): CT => {
        const s = String(v ?? "").toLowerCase();
        if (s.includes("prem")) return "premier";
        if (s.includes("norm")) return "normal";
        return "other";
      };

      const byType: Record<CT, Map<string, number>> = {
        normal: new Map(),
        premier: new Map(),
        other: new Map(),
      };

      for (const r of rows) {
        const ct = normalizeCT(ctCol ? (r as any)[ctCol] : "");
        const critRaw = criteriaCol ? (r as any)[criteriaCol] : undefined;
        const wRaw = weightCol ? (r as any)[weightCol] : undefined;
        const criteriaName = String(critRaw ?? "").trim();
        if (!criteriaName) continue;
        const weightNum = Number(String(wRaw ?? "").replace(/[^0-9.\-]+/g, ""));
        if (!Number.isFinite(weightNum)) continue;
        const bucket = byType[ct];
        const prev = bucket.get(criteriaName) ?? -Infinity;
        if (weightNum > prev) bucket.set(criteriaName, weightNum);
      }

      const summarize = (label: string, m: Map<string, number>): string => {
        const totalCriteria = m.size;
        const top = Array.from(m.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([k, v]) => `${k} (${v})`)
          .join(", ");
        const topLine = top ? `Top: ${top}` : "";
        return `- ${label}: ${totalCriteria} unique criteria${topLine ? "; " + topLine : ""}`;
      };

      const lines: string[] = [];
      lines.push("Rubric overview (from criteria_scoring):");
      const totalsBits: string[] = [];
      if (typeof totals.normal === "number") totalsBits.push(`Normal CX total=${totals.normal}`);
      if (typeof totals.premier === "number") totalsBits.push(`Premier CX total=${totals.premier}`);
      if (totalsBits.length) lines.push(`Totals: ${totalsBits.join(", ")}`);
      lines.push(summarize("Normal CX", byType.normal));
      lines.push(summarize("Premier CX", byType.premier));
      const summary = lines.join("\n");

      setConfig((c) => ({
        ...c,
        domain_knowledge: c.domain_knowledge ? `${c.domain_knowledge}\n\n${summary}` : summary,
      }));
      setMessage("Inserted criteria overview");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to insert criteria overview");
    } finally {
      setIsBusy(false);
    }
  };

  const handleInsertDetailedRubric = async () => {
    if (!isEditing) return;
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/criteria-scoring", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load criteria");

      const columns: string[] = Array.isArray(data?.columns) ? data.columns : [];
      const rows: Array<Record<string, unknown>> = Array.isArray(data?.rows) ? data.rows : [];
      const totals = (data?.totals ?? {}) as { normal?: number; premier?: number };

      const findColumn = (candidates: string[]): string | undefined => {
        const lower = new Map(columns.map((c) => [c.toLowerCase(), c] as const));
        for (const cand of candidates) {
          if (lower.has(cand)) return lower.get(cand);
        }
        for (const c of columns) {
          const lc = c.toLowerCase();
          if (candidates.some((cand) => lc.includes(cand))) return c;
        }
        return undefined;
      };

      const ctCol = findColumn(["customer_type", "customer type", "cust_type", "type"]);
      const criteriaCol = findColumn(["criteria", "criterion"]);
      const weightCol = findColumn(["weightage", "weight", "score", "points"]);
      const levelCol = findColumn(["criteria_level", "level", "criteria level"]);
      const explainCol = findColumn(["marketing_explanation", "explanation", "desc", "description"]);

      type CT = "normal" | "premier" | "other";
      const normalizeCT = (v: unknown): CT => {
        const s = String(v ?? "").toLowerCase();
        if (s.includes("prem")) return "premier";
        if (s.includes("norm")) return "normal";
        return "other";
      };

      type Acc = {
        levels: Set<string>;
        maxWeight: number;
        explanations: Set<string>;
      };
      const byType: Record<CT, Map<string, Acc>> = {
        normal: new Map(),
        premier: new Map(),
        other: new Map(),
      };

      for (const r of rows) {
        const ct = normalizeCT(ctCol ? (r as any)[ctCol] : "");
        const critRaw = criteriaCol ? (r as any)[criteriaCol] : undefined;
        const weightRaw = weightCol ? (r as any)[weightCol] : undefined;
        const levelRaw = levelCol ? (r as any)[levelCol] : undefined;
        const explainRaw = explainCol ? (r as any)[explainCol] : undefined;
        const criteriaName = String(critRaw ?? "").trim();
        if (!criteriaName) continue;
        const weightNum = Number(String(weightRaw ?? "").replace(/[^0-9.\-]+/g, ""));
        const levelStr = String(levelRaw ?? "").toString().trim();
        const explanation = String(explainRaw ?? "").toString().trim();

        let acc = byType[ct].get(criteriaName);
        if (!acc) {
          acc = { levels: new Set<string>(), maxWeight: Number.isFinite(weightNum) ? weightNum : -Infinity, explanations: new Set<string>() };
          byType[ct].set(criteriaName, acc);
        }
        if (levelStr) acc.levels.add(levelStr);
        if (Number.isFinite(weightNum) && weightNum > acc.maxWeight) acc.maxWeight = weightNum;
        if (explanation) acc.explanations.add(explanation);
      }

      const summarizeType = (label: string, m: Map<string, Acc>): string[] => {
        const entries = Array.from(m.entries()).sort((a, b) => (b[1].maxWeight || 0) - (a[1].maxWeight || 0)).slice(0, 10);
        const lines: string[] = [];
        lines.push(`- ${label}: ${m.size} criteria (showing top ${entries.length} by weight)`);
        for (const [crit, acc] of entries) {
          const levels = Array.from(acc.levels.values());
          const levelsText = levels.length ? `levels: [${levels.join(", ")}]` : "levels: [n/a]";
          const exps = Array.from(acc.explanations.values())
            .slice(0, 2)
            .map((s) => (s.length > 180 ? `${s.slice(0, 177)}...` : s));
          const expText = exps.length ? `notes: ${exps.join("; ")}` : "notes: n/a";
          lines.push(`  • ${crit} — max_weight=${Number.isFinite(acc.maxWeight) ? acc.maxWeight : "n/a"}; ${levelsText}; ${expText}`);
        }
        return lines;
      };

      const out: string[] = [];
      out.push("Detailed rubric (from criteria_scoring):");
      const totalsBits: string[] = [];
      if (typeof totals.normal === "number") totalsBits.push(`Normal CX total=${totals.normal}`);
      if (typeof totals.premier === "number") totalsBits.push(`Premier CX total=${totals.premier}`);
      if (totalsBits.length) out.push(`Totals: ${totalsBits.join(", ")}`);
      out.push(...summarizeType("Normal CX", byType.normal));
      out.push(...summarizeType("Premier CX", byType.premier));

      const block = out.join("\n");
      setConfig((c) => ({
        ...c,
        domain_knowledge: c.domain_knowledge ? `${c.domain_knowledge}\n\n${block}` : block,
      }));
      setMessage("Inserted detailed rubric");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to insert detailed rubric");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSave = async () => {
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/ai-agent-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save");
      setIsEditing(false);
      setMessage("Saved");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setIsBusy(false);
    }
  };

  const handleGenerateRubricUnderstanding = async (mode: "summary" | "detailed") => {
    if (!isEditing) return;
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/criteria-scoring", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load criteria");
      const columns: string[] = Array.isArray(data?.columns) ? data.columns : [];
      const rows: Array<Record<string, unknown>> = Array.isArray(data?.rows) ? data.rows : [];
      const totals = (data?.totals ?? {}) as { normal?: number; premier?: number };

      const findColumn = (candidates: string[]): string | undefined => {
        const lower = new Map(columns.map((c) => [c.toLowerCase(), c] as const));
        for (const cand of candidates) if (lower.has(cand)) return lower.get(cand);
        for (const c of columns) {
          const lc = c.toLowerCase();
          if (candidates.some((cand) => lc.includes(cand))) return c;
        }
        return undefined;
      };

      const ctCol = findColumn(["customer_type", "customer type", "cust_type", "type"]);
      const criteriaCol = findColumn(["criteria", "criterion"]);
      const weightCol = findColumn(["weightage", "weight", "score", "points"]);
      const levelCol = findColumn(["criteria_level", "level", "criteria level"]);
      const explainCol = findColumn(["marketing_explanation", "explanation", "desc", "description"]);

      type CT = "normal" | "premier" | "other";
      const normalizeCT = (v: unknown): CT => {
        const s = String(v ?? "").toLowerCase();
        if (s.includes("prem")) return "premier";
        if (s.includes("norm")) return "normal";
        return "other";
      };

      if (mode === "summary") {
        const byType: Record<CT, Map<string, number>> = { normal: new Map(), premier: new Map(), other: new Map() };
        for (const r of rows) {
          const ct = normalizeCT(ctCol ? (r as any)[ctCol] : "");
          const crit = String(criteriaCol ? (r as any)[criteriaCol] : "").trim();
          if (!crit) continue;
          const wNum = Number(String(weightCol ? (r as any)[weightCol] : "").replace(/[^0-9.\-]+/g, ""));
          const m = byType[ct];
          const prev = m.get(crit) ?? -Infinity;
          if (Number.isFinite(wNum) && wNum > prev) m.set(crit, wNum);
        }
        const lines: string[] = [];
        lines.push("Rubric understanding (summary):");
        const totalsBits: string[] = [];
        if (typeof totals.normal === "number") totalsBits.push(`Normal CX total=${totals.normal}`);
        if (typeof totals.premier === "number") totalsBits.push(`Premier CX total=${totals.premier}`);
        if (totalsBits.length) lines.push(`Totals: ${totalsBits.join(", ")}`);
        const summarize = (label: string, m: Map<string, number>) => {
          const top = Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} (${v})`).join(", ");
          lines.push(`- ${label}: ${m.size} criteria${top ? "; top: " + top : ""}`);
        };
        summarize("Normal CX", byType.normal);
        summarize("Premier CX", byType.premier);
        setConfig((c) => ({ ...c, rubric_understanding: lines.join("\n") }));
      } else {
        type Acc = { levels: Set<string>; maxWeight: number; explanations: Set<string> };
        const byType: Record<CT, Map<string, Acc>> = { normal: new Map(), premier: new Map(), other: new Map() };
        for (const r of rows) {
          const ct = normalizeCT(ctCol ? (r as any)[ctCol] : "");
          const crit = String(criteriaCol ? (r as any)[criteriaCol] : "").trim();
          if (!crit) continue;
          const wNum = Number(String(weightCol ? (r as any)[weightCol] : "").replace(/[^0-9.\-]+/g, ""));
          const lvl = String(levelCol ? (r as any)[levelCol] : "").trim();
          const exp = String(explainCol ? (r as any)[explainCol] : "").trim();
          let acc = byType[ct].get(crit);
          if (!acc) { acc = { levels: new Set(), maxWeight: Number.isFinite(wNum) ? wNum : -Infinity, explanations: new Set() }; byType[ct].set(crit, acc); }
          if (lvl) acc.levels.add(lvl);
          if (Number.isFinite(wNum) && wNum > acc.maxWeight) acc.maxWeight = wNum;
          if (exp) acc.explanations.add(exp);
        }
        const out: string[] = [];
        out.push("Rubric understanding (detailed):");
        const totalsBits: string[] = [];
        if (typeof totals.normal === "number") totalsBits.push(`Normal CX total=${totals.normal}`);
        if (typeof totals.premier === "number") totalsBits.push(`Premier CX total=${totals.premier}`);
        if (totalsBits.length) out.push(`Totals: ${totalsBits.join(", ")}`);
        const emit = (label: string, m: Map<string, Acc>) => {
          const list = Array.from(m.entries()).sort((a, b) => (b[1].maxWeight || 0) - (a[1].maxWeight || 0)).slice(0, 10);
          out.push(`- ${label}: ${m.size} criteria (showing top ${list.length})`);
          for (const [crit, acc] of list) {
            const levels = Array.from(acc.levels.values());
            const levelsText = levels.length ? `levels: [${levels.join(", ")}]` : "levels: [n/a]";
            const exps = Array.from(acc.explanations.values()).slice(0, 2).map((s) => (s.length > 180 ? `${s.slice(0, 177)}...` : s));
            const expText = exps.length ? `notes: ${exps.join("; ")}` : "notes: n/a";
            out.push(`  • ${crit} — max_weight=${Number.isFinite(acc.maxWeight) ? acc.maxWeight : "n/a"}; ${levelsText}; ${expText}`);
          }
        };
        emit("Normal CX", byType.normal);
        emit("Premier CX", byType.premier);
        setConfig((c) => ({ ...c, rubric_understanding: out.join("\n") }));
      }
      setMessage("Generated rubric understanding");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate rubric understanding");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section aria-label="AI Agent Config" className="min-h-[60vh]">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">AI Agent Configuration</h1>
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
            aria-label="Save configuration"
          >
            {isBusy ? "Saving..." : "Save"}
          </button>
          {message && <span className="text-xs text-green-700 dark:text-green-400">{message}</span>}
          {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
        </div>
      </div>

      {/* Removed legacy sections */}

      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold">Rubric Understanding</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleGenerateRubricUnderstanding("summary")}
              disabled={!isEditing || isBusy}
              className="inline-flex h-7 items-center rounded-md border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              aria-label="Generate summary understanding"
            >
              Generate summary
            </button>
            <button
              type="button"
              onClick={() => handleGenerateRubricUnderstanding("detailed")}
              disabled={!isEditing || isBusy}
              className="inline-flex h-7 items-center rounded-md border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              aria-label="Generate detailed understanding"
            >
              Generate detailed
            </button>
          </div>
        </div>
        <textarea
          className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          value={config.rubric_understanding}
          onChange={(e) => setConfig((c) => ({ ...c, rubric_understanding: e.target.value }))}
          disabled={!isEditing}
          rows={10}
          placeholder="Agent-readable summary of how to evaluate criteria, levels, and weights"
          aria-label="Rubric understanding"
        />
        <div className="-mt-2 text-[11px] text-gray-500 dark:text-gray-400">Tip: Edit as needed. Saved to <span className="font-medium">ai_agent_config.rubric_understanding</span>.</div>
      </div>
    </section>
  );
}


