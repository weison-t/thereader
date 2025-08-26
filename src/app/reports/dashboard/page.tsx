"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type SeriesItem = { key: string; count: number };
type DurationItem = { bucket: string; count: number };

type Insights = {
  source: "processed" | "sampling";
  exists: boolean;
  total: number;
  department: SeriesItem[];
  agent: SeriesItem[];
  actual_agent: SeriesItem[];
  market: SeriesItem[];
  vip_status: SeriesItem[];
  rating: SeriesItem[];
  category: SeriesItem[];
  duration_buckets: DurationItem[];
  country_region: SeriesItem[];
};

const palette = ["#4f46e5", "#06b6d4", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#84cc16", "#14b8a6"];

export default function ReportsDashboardPage() {
  const [activeTab, setActiveTab] = useState<"processed" | "sampling">("processed");
  const [data, setData] = useState<Insights | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const fetchData = async (src: "processed" | "sampling") => {
    setIsBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/insights?source=${src}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load insights");
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab]);

  const renderBar = (items: SeriesItem[], xKey: "key" | "bucket" = "key") => {
    const ds = items.slice(0, 20);
    return (
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={ds} margin={{ top: 8, right: 16, bottom: 32, left: 8 }}>
          <XAxis dataKey={xKey} angle={-20} textAnchor="end" height={50} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const renderPie = (items: SeriesItem[]) => {
    const ds = items.slice(0, 8);
    return (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={ds} dataKey="count" nameKey="key" outerRadius={90} innerRadius={40} paddingAngle={2}>
            {ds.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    );
  };

  return (
    <section aria-label="Reports Dashboard" className="min-h-[60vh]">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <div className="inline-flex rounded-md border border-gray-300 bg-white p-1 text-xs dark:border-gray-700 dark:bg-gray-900">
          <button
            className={`rounded px-3 py-1 ${activeTab === "processed" ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-700 dark:text-gray-200"}`}
            onClick={() => setActiveTab("processed")}
            aria-label="Data Snapshots Insights"
          >
            Data Snapshots Insights
          </button>
          <button
            className={`rounded px-3 py-1 ${activeTab === "sampling" ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-700 dark:text-gray-200"}`}
            onClick={() => setActiveTab("sampling")}
            aria-label="Sampling Insights"
          >
            Sampling Insights
          </button>
        </div>
      </div>

      <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        {isBusy ? "Loading..." : error ? error : data?.exists ? `${data.total.toLocaleString()} rows` : "No data"}
      </div>

      {!data?.exists && !isBusy && !error && (
        <div className="rounded-md border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          No data available for this tab.
        </div>
      )}

      {data?.exists && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.department?.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="mb-2 text-xs font-medium">By Department</div>
              {renderBar(data.department)}
            </div>
          )}

          {data.agent?.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="mb-2 text-xs font-medium">By Agent</div>
              {renderBar(data.agent)}
            </div>
          )}

          {data.actual_agent?.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="mb-2 text-xs font-medium">By Actual Agent</div>
              {renderBar(data.actual_agent)}
            </div>
          )}

          {data.market?.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="mb-2 text-xs font-medium">By Market</div>
              {renderPie(data.market)}
            </div>
          )}

          {data.vip_status?.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="mb-2 text-xs font-medium">By VIP Status</div>
              {renderPie(data.vip_status)}
            </div>
          )}

          {data.rating?.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="mb-2 text-xs font-medium">By Rating</div>
              {renderBar(data.rating)}
            </div>
          )}

          {data.category?.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="mb-2 text-xs font-medium">By Category</div>
              {renderBar(data.category)}
            </div>
          )}

          {data.duration_buckets?.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="mb-2 text-xs font-medium">By Duration (mins)</div>
              {renderBar(data.duration_buckets as unknown as SeriesItem[], "bucket")}
            </div>
          )}

          {data.country_region?.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950 md:col-span-2">
              <div className="mb-2 text-xs font-medium">By Country / Region</div>
              {renderBar(data.country_region)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}


