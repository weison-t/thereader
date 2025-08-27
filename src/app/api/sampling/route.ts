import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type GenerateBody = {
  agentMode?: "all" | "percent";
  agentPercent?: number; // 0-100
  chatMode?: "all" | "percent";
  chatPercent?: number; // 0-100
  normalMode?: "all" | "percent"; // based on vip_status = 'normal'
  normalPercent?: number; // 0-100
  vipMode?: "all" | "percent"; // based on vip_status = 'vip'
  vipPercent?: number; // 0-100
};

export async function GET() {
  const pool = await getDb();
  const client = await pool.connect();
  try {
    const existsQ = await client.query("select to_regclass('public.sampling_data') is not null as exists");
    const exists = Boolean(existsQ.rows?.[0]?.exists);
    if (!exists) return Response.json({ exists: false, columns: [], rows: [], total: 0 });
    const q = await client.query("select * from public.sampling_data limit 50");
    const countQ = await client.query("select count(*)::int as c from public.sampling_data");
    const rows = q.rows ?? [];
    const columns = rows.length ? Object.keys(rows[0]) : [];
    const total = Number(countQ.rows?.[0]?.c ?? 0);
    return Response.json({ exists: true, columns, rows, total });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const pool = await getDb();
  const client = await pool.connect();
  try {
    const body = (await req.json()) as GenerateBody;
    const agentMode = body.agentMode === "percent" ? "percent" : "all";
    const chatMode = body.chatMode === "percent" ? "percent" : "all";
    const normalMode = body.normalMode === "percent" ? "percent" : "all";
    const vipMode = body.vipMode === "percent" ? "percent" : "all";
    const agentPercent = Math.max(0, Math.min(100, Number(body.agentPercent ?? 100)));
    const chatPercent = Math.max(0, Math.min(100, Number(body.chatPercent ?? 100)));
    const normalPercent = Math.max(0, Math.min(100, Number(body.normalPercent ?? 100)));
    const vipPercent = Math.max(0, Math.min(100, Number(body.vipPercent ?? 100)));

    // Ensure data_snapshot exists (Sampling Selection is based on Data Snapshot)
    const dsQ = await client.query("select to_regclass('public.data_snapshot') is not null as exists");
    const dsExists = Boolean(dsQ.rows?.[0]?.exists);
    if (!dsExists) return Response.json({ error: "data_snapshot missing" }, { status: 400 });

    // Build agents sample temp table
    await client.query("drop table if exists tmp_agents");
    await client.query("create temporary table tmp_agents as select distinct coalesce(actual_agent, agent) as agent_key from public.data_snapshot");
    const agentsCountQ = await client.query("select count(*)::int as c from tmp_agents");
    const totalAgents = Number(agentsCountQ.rows?.[0]?.c ?? 0);
    const takeAgents = agentMode === "all" ? totalAgents : Math.ceil((agentPercent / 100) * totalAgents);
    await client.query("drop table if exists tmp_agents_pick");
    await client.query(
      "create temporary table tmp_agents_pick as select agent_key from tmp_agents order by random() limit $1",
      [takeAgents]
    );

    // Filter processed_data by selected agents
    await client.query("drop table if exists tmp_pd_filtered");
    await client.query(
      "create temporary table tmp_pd_filtered as select * from public.data_snapshot pd where coalesce(pd.actual_agent, pd.agent) in (select agent_key from tmp_agents_pick)"
    );

    // Within filtered rows, sample normal and vip portions separately based on vip_status
    await client.query("drop table if exists tmp_pd_class_sampled");
    const normalClause = normalMode === "all"
      ? "select * from tmp_pd_filtered where coalesce(vip_status,'normal')='normal'"
      : `select * from tmp_pd_filtered where coalesce(vip_status,'normal')='normal' order by random() limit ${"$1"}`;
    const vipClause = vipMode === "all"
      ? "select * from tmp_pd_filtered where coalesce(vip_status,'normal')='vip'"
      : `select * from tmp_pd_filtered where coalesce(vip_status,'normal')='vip' order by random() limit ${"$2"}`;

    // Calculate per-class counts
    const normalCountQ = await client.query("select count(*)::int as c from tmp_pd_filtered where coalesce(vip_status,'normal')='normal'");
    const totalNormal = Number(normalCountQ.rows?.[0]?.c ?? 0);
    const takeNormal = normalMode === "all" ? totalNormal : Math.ceil((normalPercent / 100) * totalNormal);
    const vipCountQ = await client.query("select count(*)::int as c from tmp_pd_filtered where coalesce(vip_status,'normal')='vip'");
    const totalVip = Number(vipCountQ.rows?.[0]?.c ?? 0);
    const takeVip = vipMode === "all" ? totalVip : Math.ceil((vipPercent / 100) * totalVip);

    // Build temp sampled union
    if (normalMode === "all" && vipMode === "all") {
      await client.query(
        `create temporary table tmp_pd_class_sampled as ${normalClause} union all ${vipClause}`
      );
    } else if (normalMode !== "all" && vipMode === "all") {
      await client.query(
        `create temporary table tmp_pd_class_sampled as ${normalClause} union all ${vipClause}`,
        [takeNormal]
      );
    } else if (normalMode === "all" && vipMode !== "all") {
      await client.query(
        `create temporary table tmp_pd_class_sampled as ${normalClause} union all ${vipClause}`,
        [takeVip]
      );
    } else {
      await client.query(
        `create temporary table tmp_pd_class_sampled as ${normalClause} union all ${vipClause}`,
        [takeNormal, takeVip]
      );
    }

    // Sample chats percent if requested from the class-sampled union
    await client.query("drop table if exists tmp_pd_sampled");
    if (chatMode === "all") {
      await client.query("create temporary table tmp_pd_sampled as select * from tmp_pd_class_sampled");
    } else {
      const chatCountQ = await client.query("select count(*)::int as c from tmp_pd_class_sampled");
      const totalChats = Number(chatCountQ.rows?.[0]?.c ?? 0);
      const takeChats = Math.ceil((chatPercent / 100) * totalChats);
      await client.query(
        "create temporary table tmp_pd_sampled as select * from tmp_pd_class_sampled order by random() limit $1",
        [takeChats]
      );
    }

    // Create or replace sampling_data
    await client.query("drop table if exists public.sampling_data");
    await client.query("create table public.sampling_data as select * from tmp_pd_sampled");

    const previewQ = await client.query("select * from public.sampling_data limit 50");
    const countQ = await client.query("select count(*)::int as c from public.sampling_data");
    const rows = previewQ.rows ?? [];
    const columns = rows.length ? Object.keys(rows[0]) : [];
    const total = Number(countQ.rows?.[0]?.c ?? 0);
    return Response.json({ ok: true, columns, rows, total });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE() {
  const pool = await getDb();
  const client = await pool.connect();
  try {
    await client.query("drop table if exists public.sampling_data cascade");
    return Response.json({ ok: true, dropped: true, total: 0 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}

