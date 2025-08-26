import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type Source = "processed" | "sampling";

type Series = { key: string; count: number }[];
type DurationSeries = { bucket: string; count: number }[];
type VipByAgent = { agent: string; vip: number; normal: number }[];

type Insights = {
  source: Source;
  exists: boolean;
  total: number;
  department: Series;
  agent: Series;
  actual_agent: Series;
  market: Series;
  vip_status: Series;
  rating: Series;
  category: Series;
  duration_buckets: DurationSeries;
  country_region: Series;
  kpis: {
    unique_agents: number;
    vip_percent: number; // 0-100
    avg_duration_minutes: number | null;
    avg_rating: number | null;
  };
  timeseries: { date: string; count: number }[];
  vip_by_agent: VipByAgent;
};

function resolveTable(source: Source): string {
  // For "processed" (Data Snapshots) use data_snapshot if available, else fallback to processed_data
  // sampling continues to use sampling_data
  return source === "processed" ? "public.data_snapshot" : "public.sampling_data";
}

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams;
  const sourceParam = (search.get("source") || "processed").toLowerCase();
  const source: Source = sourceParam === "sampling" ? "sampling" : "processed";
  const daysParam = search.get("days");
  const days = daysParam ? Math.max(0, parseInt(daysParam, 10) || 0) : null;
  const daysArg = days !== null ? String(days) : null;

  const pool = await getDb();
  const client = await pool.connect();
  try {
    const table = resolveTable(source);
    const isProcessed = source === "processed";
    const existsQ = await client.query(`select to_regclass($1) is not null as exists`, [table]);
    const exists = Boolean(existsQ.rows?.[0]?.exists);
    if (!exists) {
      const empty: Insights = {
        source,
        exists: false,
        total: 0,
        department: [],
        agent: [],
        actual_agent: [],
        market: [],
        vip_status: [],
        rating: [],
        category: [],
        duration_buckets: [],
        country_region: [],
      };
      return Response.json(empty);
    }

    // Discover available columns for dynamic behavior
    const [schema, tableName] = table.includes('.') ? table.split('.') : ["public", table];
    const colsQ = await client.query(
      `select column_name from information_schema.columns where table_schema=$1 and table_name=$2`,
      [schema, tableName]
    );
    const present = new Set<string>((colsQ.rows || []).map((r: any) => String(r.column_name)));
    const has = (c: string) => present.has(c);

    const hasTimeCols = has('start_time') || has('end_time');
    const baseWith = hasTimeCols
      ? `with base as (
           select *,
             (case
               ${has('start_time') ? `when start_time ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then start_time::timestamp` : ''}
               ${has('end_time') ? `when end_time   ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then end_time::timestamp` : ''}
               else null
             end) as ts
           from ${table}
         )`
      : `with base as ( select *, null::timestamp as ts from ${table} )`;

    const whereTs = ` where ($1::text is null or (ts is not null and ts >= now() - (($1::text) || ' days')::interval))`;

    const totalQ = await client.query(`${baseWith} select count(*)::int as c from base${whereTs}`, [daysArg]);
    const total = Number(totalQ.rows?.[0]?.c ?? 0);

    const topLimit = 50;
    const q = async (col: string): Promise<Series> => {
      const sql = `${baseWith} select coalesce(${col}::text,'(blank)') as k, count(*)::int as c from base${whereTs} group by 1 order by c desc limit ${topLimit}`;
      const r = await client.query(sql, [daysArg]);
      return (r.rows || []).map((row: any) => ({ key: String(row.k), count: Number(row.c) }));
    };

    // Duration buckets only when duration column exists
    let duration_buckets: DurationSeries = [];
    if (has('duration')) {
      const durationQ = await client.query(
        `${baseWith}, parsed as (
           select case
             when duration ~ '^[0-9]+(\\.[0-9]+)?$' then duration::float
             when duration like '%:%:%' then (
               split_part(duration, ':', 1)::float * 60
               + split_part(duration, ':', 2)::float
               + coalesce(nullif(split_part(duration, ':', 3), '')::float, 0) / 60
             )
             when duration like '%:%' then (
               split_part(duration, ':', 1)::float
               + coalesce(nullif(split_part(duration, ':', 2), '')::float, 0) / 60
             )
             else 0
           end as minutes, ts
           from base
         )
         select bucket, count(*)::int as c from (
           select case
             when minutes < 5 then '<5'
             when minutes < 10 then '<10'
             when minutes < 15 then '<15'
             when minutes < 20 then '<20'
             else '20+'
           end as bucket
           from parsed where ($1::text is null or (ts is not null and ts >= now() - (($1::text) || ' days')::interval))
         ) s group by bucket order by
           case bucket when '<5' then 1 when '<10' then 2 when '<15' then 3 when '<20' then 4 else 5 end`,
        [daysArg]
      );
      duration_buckets = (durationQ.rows || []).map((r: any) => ({ bucket: String(r.bucket), count: Number(r.c) }));
    }

    let department: Series = [];
    let agent: Series = [];
    let actual_agent: Series = [];
    let market: Series = [];
    let vip_status: Series = [];
    let rating: Series = [];
    let category: Series = [];
    let country_region: Series = [];
    const agentCol = has('agent_caller_name') ? 'agent_caller_name' : (has('agent') ? 'agent' : null);
    if (has('department')) department = await q('department');
    if (agentCol) agent = await q(agentCol);
    if (has('actual_agent')) actual_agent = await q('actual_agent');
    if (has('market')) market = await q('market');
    if (has('vip_status')) vip_status = await q('vip_status');
    if (has('rating')) rating = await q('rating');
    if (has('category')) category = await q('category');
    if (has('country_region')) country_region = await q('"country_region"');

    // KPIs
    let uniqueAgentsQ;
    if (has('actual_agent') || agentCol) {
      uniqueAgentsQ = await client.query(`${baseWith} select count(distinct coalesce(${has('actual_agent') ? 'actual_agent' : 'null'}, ${agentCol ?? 'null'}))::int as c from base${whereTs}`, [daysArg]);
    } else {
      uniqueAgentsQ = { rows: [{ c: 0 }] } as any;
    }

    const vipPctQ = has('vip_status')
      ? await client.query(`${baseWith} select (100.0 * sum(case when coalesce(vip_status,'normal')='vip' then 1 else 0 end) / greatest(count(*),1))::float as p from base${whereTs}`, [daysArg])
      : { rows: [{ p: 0 }] } as any;

    const avgDurationQ = has('duration')
      ? await client.query(
          `${baseWith}, parsed as (
            select case
              when duration ~ '^[0-9]+(\\.[0-9]+)?$' then duration::float
              when duration like '%:%:%' then (
                split_part(duration, ':', 1)::float * 60
                + split_part(duration, ':', 2)::float
                + coalesce(nullif(split_part(duration, ':', 3), '')::float, 0) / 60
              )
              when duration like '%:%' then (
                split_part(duration, ':', 1)::float
                + coalesce(nullif(split_part(duration, ':', 2), '')::float, 0) / 60
              )
              else null
            end as minutes, ts from base
          ) select avg(minutes)::float as a from parsed where minutes is not null and ($1::text is null or (ts is not null and ts >= now() - (($1::text) || ' days')::interval))`,
          [daysArg]
        )
      : { rows: [{ a: null }] } as any;

    const avgRatingQ = has('rating')
      ? await client.query(`${baseWith} select avg(nullif(rating,'')::float)::float as a from base${whereTs}`, [daysArg])
      : { rows: [{ a: null }] } as any;

    const kpis = {
      unique_agents: Number(uniqueAgentsQ.rows?.[0]?.c ?? 0),
      vip_percent: Number(vipPctQ.rows?.[0]?.p ?? 0),
      avg_duration_minutes: avgDurationQ.rows?.[0]?.a !== null && avgDurationQ.rows?.[0]?.a !== undefined ? Number(avgDurationQ.rows[0].a) : null,
      avg_rating: avgRatingQ.rows?.[0]?.a !== null && avgRatingQ.rows?.[0]?.a !== undefined ? Number(avgRatingQ.rows[0].a) : null,
    };

    // Timeseries by day
    const timeseries = hasTimeCols
      ? (await (async () => {
          const tsQ = await client.query(`${baseWith} select to_char(date(ts), 'YYYY-MM-DD') as d, count(*)::int as c from base${whereTs.replace('ts is not null and ', '')} and ts is not null group by 1 order by 1`, [daysArg]);
          return (tsQ.rows || []).map((r: any) => ({ date: String(r.d), count: Number(r.c) }));
        })())
      : [];

    // VIP by Agent (stacked), top 10 agents by total
    let vip_by_agent: VipByAgent = [];
    if (agentCol || has('actual_agent')) {
      if (has('vip_status')) {
        const vipByAgentQ = await client.query(
          `${baseWith} select agent_key as agent,
             sum(case when coalesce(vip_status,'normal')='vip' then 1 else 0 end)::int as vip,
             sum(case when coalesce(vip_status,'normal')='vip' then 0 else 1 end)::int as normal
           from (
             select coalesce(${has('actual_agent') ? 'actual_agent' : 'null'}, ${agentCol ?? 'null'}) as agent_key, vip_status, ts from base
           ) s
           where ($1::text is null or (ts is not null and ts >= now() - (($1::text) || ' days')::interval))
           group by agent_key
           order by (sum(1)) desc
           limit 10`,
          [daysArg]
        );
        vip_by_agent = (vipByAgentQ.rows || []).map((r: any) => ({ agent: String(r.agent), vip: Number(r.vip), normal: Number(r.normal) }));
      } else {
        const r = await client.query(
          `${baseWith} select coalesce(${has('actual_agent') ? 'actual_agent' : 'null'}, ${agentCol ?? 'null'}) as agent, 0::int as vip, count(*)::int as normal from base${whereTs} group by 1 order by normal desc limit 10`,
          [daysArg]
        );
        vip_by_agent = (r.rows || []).map((row: any) => ({ agent: String(row.agent), vip: Number(row.vip), normal: Number(row.normal) }));
      }
    }

    const data: Insights = {
      source,
      exists: true,
      total,
      department,
      agent,
      actual_agent,
      market,
      vip_status,
      rating,
      category,
      duration_buckets,
      country_region,
      kpis,
      timeseries,
      vip_by_agent,
    };

    return Response.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}

