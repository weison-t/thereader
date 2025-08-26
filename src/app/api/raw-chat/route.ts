import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type ApiRow = Record<string, unknown>;

// Desired display columns and their normalized counterparts (for raw_chat only)
const DISPLAY_TO_NORMALIZED: Record<string, string> = {
  "ID": "id",
  "Name": "name",
  "Department": "department",
  "Agent": "agent",
  "Content": "content",
  "Start Time": "start_time",
  "End Time": "end_time",
  "Request Page": "request_page",
  "Custom Variables": "custom_variables",
  "Rating": "rating",
  "Rating Comment": "rating_comment",
  "Category": "category",
  "Duration": "duration",
  "Campaign": "campaign",
  "Country/Region": "country_region",
};

// Base order from raw_chat, with extra computed columns inserted after Agent
const ORDERED_BASE = Object.keys(DISPLAY_TO_NORMALIZED);
const ORDERED_DISPLAY = (() => {
  const out: string[] = [];
  for (const label of ORDERED_BASE) {
    out.push(label);
    if (label === "Agent") {
      out.push("Actual Agent");
      out.push("Market");
    }
    if (label === "Custom Variables") {
      out.push("VIP Status");
    }
  }
  return out;
})();

export async function GET(req: NextRequest) {
  const pool = await getDb();
  const { searchParams } = new URL(req.url);

  const pageParam = Number(searchParams.get("page") ?? "1");
  const pageSizeParam = Number(searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0 && pageSizeParam <= 200 ? pageSizeParam : 20;
  const offset = (page - 1) * pageSize;

  let client;
  try {
    client = await pool.connect();

    // Check table exists
    const tableExistsQ = await client.query(
      "select to_regclass('public.raw_chat') is not null as exists"
    );
    const exists = Boolean(tableExistsQ.rows?.[0]?.exists);
    if (!exists) {
      return Response.json({
        columns: ORDERED_DISPLAY,
        rows: [],
        total: 0,
        page,
        pageSize,
        presentColumns: [],
        tableMissing: true,
      });
    }

    // Discover present raw_chat columns
    const colsQ = await client.query(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'raw_chat'`
    );
    const presentRaw = new Set<string>(colsQ.rows.map((r: any) => String(r.column_name)));

    // Ensure unaccent exists (for diacritic-insensitive matching); ignore errors if not allowed
    try {
      await client.query("create extension if not exists unaccent");
    } catch (_) {
      // no-op
    }

    // Discover agent_info table and columns
    const agentInfoExistsQ = await client.query(`select to_regclass('public.agent_info') is not null as exists`);
    const agentInfoExists = Boolean(agentInfoExistsQ.rows?.[0]?.exists);
    let agentCols = new Set<string>();
    if (agentInfoExists) {
      const aColsQ = await client.query(
        `select column_name from information_schema.columns where table_schema='public' and table_name='agent_info'`
      );
      agentCols = new Set<string>(aColsQ.rows.map((r: any) => String(r.column_name)));
    }

    // Check if unaccent is available
    let hasUnaccent = false;
    try {
      const uQ = await client.query("select exists(select 1 from pg_extension where extname = 'unaccent') as has");
      hasUnaccent = Boolean(uQ.rows?.[0]?.has);
    } catch (_) {
      hasUnaccent = false;
    }
    const normalize = (expr: string) =>
      hasUnaccent
        ? `lower(regexp_replace(unaccent(btrim(${expr})), '[[:space:][:punct:]]+', '', 'g'))`
        : `lower(regexp_replace(btrim(${expr}), '[[:space:][:punct:]]+', '', 'g'))`;

    // Build select list for raw_chat existing columns (prefixed with rc.)
    const selectedRawDisplays = ORDERED_BASE.filter((d) => presentRaw.has(DISPLAY_TO_NORMALIZED[d]));
    const rawSelect = selectedRawDisplays
      .map((d) => `rc."${DISPLAY_TO_NORMALIZED[d]}"`)
      .join(",");

    // Build computed selections for extras
    const hasSched = agentCols.has("specialist_name_as_per_schedule");
    const hasLive = agentCols.has("specialist_live_chat_name");
    const hasMarket = agentCols.has("market");
    const actualAgentExpr = agentInfoExists && (hasSched || hasLive)
      ? `ai."chosen_actual_agent" as actual_agent`
      : `null::text as actual_agent`;
    const marketExpr = agentInfoExists && hasMarket ? `ai."market" as market` : `null::text as market`;

    // Compose final select list
    const selectParts = [] as string[];
    if (rawSelect) selectParts.push(rawSelect);
    selectParts.push(actualAgentExpr);
    selectParts.push(marketExpr);
    const hasCustomVars = presentRaw.has("custom_variables");
    const vipExpr = hasCustomVars
      ? `case when position('type:vip' in lower(coalesce(rc."custom_variables", ''))) > 0 then 'vip' else 'normal' end as vip_status`
      : `null::text as vip_status`;
    selectParts.push(vipExpr);
    const selectList = selectParts.join(",");

    // Build FROM with optional join
    let joinClause = "";
    if (agentInfoExists && (hasSched || hasLive)) {
      const unionParts: string[] = [];
      if (hasSched) {
        unionParts.push(
          `select ${normalize('s."specialist_name_as_per_schedule"')} as norm_name, s."specialist_name_as_per_schedule" as chosen_actual_agent, s."market" as market, 1 as p from public.agent_info s where s."specialist_name_as_per_schedule" is not null and btrim(s."specialist_name_as_per_schedule") <> ''`
        );
      }
      if (hasLive) {
        const liveChosen = hasSched
          ? `coalesce(s."specialist_name_as_per_schedule", s."specialist_live_chat_name")`
          : `s."specialist_live_chat_name"`;
        unionParts.push(
          `select ${normalize('s."specialist_live_chat_name"')} as norm_name, ${liveChosen} as chosen_actual_agent, s."market" as market, 2 as p from public.agent_info s where s."specialist_live_chat_name" is not null and btrim(s."specialist_live_chat_name") <> ''`
        );
      }
      const aiSub = unionParts.length > 0
        ? `left join (select distinct on (norm_name) norm_name, chosen_actual_agent, market from ( ${unionParts.join(" union all ")} ) t order by norm_name, p) ai on ${normalize('rc."agent"')} = ai.norm_name`
        : "";
      joinClause = aiSub ? ` ${aiSub}` : "";
    }

    // Build ORDER BY for stability and better variety on first pages
    let orderClause = "";
    if (presentRaw.has("start_time") || presentRaw.has("id")) {
      const parts: string[] = [];
      if (presentRaw.has("start_time")) parts.push('rc."start_time" desc');
      if (presentRaw.has("id")) parts.push('rc."id" asc');
      if (parts.length > 0) orderClause = ` order by ${parts.join(", ")}`;
    }

    const dataQ = await client.query(
      `select ${selectList} from public.raw_chat rc${joinClause}${orderClause} offset $1 limit $2`,
      [offset, pageSize]
    );

    // Map rows to ordered display labels; keep keys as normalized for client simplicity
    const rows: ApiRow[] = dataQ.rows.map((r) => r as unknown as ApiRow);

    const totalQ = await client.query("select count(*)::int as c from public.raw_chat");
    const total = Number(totalQ.rows?.[0]?.c ?? 0);

    // Build mapping display -> normalized for the client to dereference values
    const mapping: Record<string, string> = {};
    // map present raw_chat columns
    for (const d of ORDERED_BASE) {
      const norm = DISPLAY_TO_NORMALIZED[d];
      if (presentRaw.has(norm)) mapping[d] = norm;
    }
    // map computed columns
    mapping["Actual Agent"] = "actual_agent";
    mapping["Market"] = "market";
    mapping["VIP Status"] = "vip_status";

    // columns include extras in desired order
    return Response.json({
      columns: ORDERED_DISPLAY,
      rows,
      total,
      page,
      pageSize,
      presentColumns: ORDERED_DISPLAY,
      mapping,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  } finally {
    client?.release?.();
  }
}

