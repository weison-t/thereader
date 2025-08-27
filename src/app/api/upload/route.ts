import { NextRequest } from "next/server";
import Papa from "papaparse";
import { createSupabaseAdmin, ensureBucket } from "@/lib/supabase";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type UploadType = "raw_chat" | "agent_info" | "criteria_scoring";

const CONFIG: Record<UploadType, { bucket: string; storagePrefix: string; table: string }> = {
  raw_chat: {
    bucket: "uploads",
    storagePrefix: "raw_chat",
    table: "raw_chat",
  },
  agent_info: {
    bucket: "uploads",
    storagePrefix: "agent_info",
    table: "agent_info",
  },
  criteria_scoring: {
    bucket: "uploads",
    storagePrefix: "criteria_scoring",
    table: "criteria_scoring",
  },
};

// Columns used by the Data Snapshot view and their normalized names in raw_chat
const SNAPSHOT_DISPLAY_TO_NORMALIZED: Record<string, string> = {
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

async function rebuildDataSnapshot() {
  const pool = await getDb();
  const client = await pool.connect();
  try {
    // Ensure unaccent exists for robust joins
    try {
      await client.query("create extension if not exists unaccent");
    } catch (_) {
      // ignore
    }

    // If raw_chat does not exist, just drop data_snapshot and return
    const rcExistsQ = await client.query("select to_regclass('public.raw_chat') is not null as exists");
    const rcExists = Boolean(rcExistsQ.rows?.[0]?.exists);
    if (!rcExists) {
      await client.query("drop table if exists public.data_snapshot");
      return;
    }

    // Discover present raw_chat columns
    const colsQ = await client.query(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'raw_chat'"
    );
    const presentRaw = new Set<string>(colsQ.rows.map((r: any) => String(r.column_name)));

    // Discover agent_info and its columns (optional)
    const aiExistsQ = await client.query("select to_regclass('public.agent_info') is not null as exists");
    const aiExists = Boolean(aiExistsQ.rows?.[0]?.exists);
    let agentCols = new Set<string>();
    if (aiExists) {
      const aColsQ = await client.query(
        "select column_name from information_schema.columns where table_schema='public' and table_name='agent_info'"
      );
      agentCols = new Set<string>(aColsQ.rows.map((r: any) => String(r.column_name)));
    }

    // Normalization helper
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

    // Raw select subset in the desired order
    const desiredNorms = Object.values(SNAPSHOT_DISPLAY_TO_NORMALIZED);
    const selectedNorms = desiredNorms.filter((n) => presentRaw.has(n));
    const rawSelect = selectedNorms.map((n) => `rc."${n}"`).join(",");

    // Computed columns availability
    const hasSched = agentCols.has("specialist_name_as_per_schedule");
    const hasLive = agentCols.has("specialist_live_chat_name");
    const hasMarket = agentCols.has("market");
    const actualAgentExpr = aiExists && (hasSched || hasLive)
      ? `ai."chosen_actual_agent" as actual_agent`
      : `null::text as actual_agent`;
    const marketExpr = aiExists && hasMarket ? `ai."market" as market` : `null::text as market`;
    const hasCustomVars = presentRaw.has("custom_variables");
    const vipExpr = hasCustomVars
      ? `case when position('type:vip' in lower(coalesce(rc."custom_variables", ''))) > 0 then 'vip' else 'normal' end as vip_status`
      : `null::text as vip_status`;

    // Build join
    let joinClause = "";
    if (aiExists && (hasSched || hasLive)) {
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

    // Compose final select
    const selectParts: string[] = [];
    if (rawSelect) selectParts.push(rawSelect);
    selectParts.push(actualAgentExpr);
    selectParts.push(marketExpr);
    selectParts.push(vipExpr);
    const selectList = selectParts.join(",");

    // Rebuild data_snapshot
    await client.query("drop table if exists public.data_snapshot");
    await client.query(
      `create table public.data_snapshot as select ${selectList} from public.raw_chat rc${joinClause}`
    );
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") || "";
    let type: any;
    let records: string[][] = [];
    let header: string[] = [];
    let objectPath: string | null = null;
    let arrayBuffer: ArrayBuffer | null = null;

    if (ct.includes("application/json")) {
      const body = await req.json();
      type = body?.type;
      objectPath = String(body?.objectPath || "");
      if (type !== "raw_chat" && type !== "agent_info" && type !== "criteria_scoring") {
        return Response.json({ error: "Invalid type" }, { status: 400 });
      }
      if (!objectPath) {
        return Response.json({ error: "Missing objectPath" }, { status: 400 });
      }
      const cfg = CONFIG[type as UploadType];
      const supabase = createSupabaseAdmin();
      const dl = await supabase.storage.from(cfg.bucket).download(objectPath);
      if (dl.error || !dl.data) {
        return Response.json({ error: dl.error?.message || "Download failed" }, { status: 400 });
      }
      arrayBuffer = await dl.data.arrayBuffer();
      const text = new TextDecoder("utf-8").decode(arrayBuffer);
      const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
      if (parsed.errors?.length) {
        return Response.json({ error: parsed.errors[0].message }, { status: 400 });
      }
      const rows = parsed.data as string[][];
      if (!rows.length) {
        return Response.json({ error: "No rows found" }, { status: 400 });
      }
      [header, ...records] = rows;
      // After successful download, purge older objects to keep only latest
      try {
        const list = await supabase.storage.from(cfg.bucket).list(cfg.storagePrefix, { limit: 100 });
        const others = (list.data || [])
          .map((x) => `${cfg.storagePrefix}/${x.name}`)
          .filter((p) => p !== objectPath);
        if (others.length) await supabase.storage.from(cfg.bucket).remove(others);
      } catch (_) {}
    } else {
      const formData = await req.formData();
      type = formData.get("type");
      const file = formData.get("file") as File | null;
      if (type !== "raw_chat" && type !== "agent_info" && type !== "criteria_scoring") {
        return Response.json({ error: "Invalid type" }, { status: 400 });
      }
      if (!file) {
        return Response.json({ error: "Missing file" }, { status: 400 });
      }
      arrayBuffer = await file.arrayBuffer();
      const text = Buffer.from(arrayBuffer).toString("utf8");
      const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
      if (parsed.errors?.length) {
        return Response.json({ error: parsed.errors[0].message }, { status: 400 });
      }
      const rows = parsed.data as string[][];
      if (!rows.length) {
        return Response.json({ error: "No rows found" }, { status: 400 });
      }
      [header, ...records] = rows;
    }
    // Normalize headers and ensure uniqueness to avoid duplicate column errors
    const baseNames = header.map((h, idx) => {
      const raw = (h || "").toString().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
      let name = raw || `col_${idx + 1}`;
      if (!/^[a-z_]/.test(name)) name = `col_${idx + 1}`;
      return name;
    });
    const seen = new Map<string, number>();
    const normalized = baseNames.map((name) => {
      if (!seen.has(name)) {
        seen.set(name, 1);
        return name;
      }
      let suffix = seen.get(name)! + 1;
      let candidate = `${name}_${suffix}`;
      while (seen.has(candidate)) {
        suffix += 1;
        candidate = `${name}_${suffix}`;
      }
      seen.set(name, suffix);
      seen.set(candidate, 1);
      return candidate;
    });

    const cfg = CONFIG[type as UploadType];
    const supabase = createSupabaseAdmin();
    await ensureBucket(cfg.bucket);

    // Replace storage object (keep only one latest)
    let objectName = objectPath;
    if (!objectName) {
      const list = await supabase.storage.from(cfg.bucket).list(cfg.storagePrefix, { limit: 100 });
      if (list.data?.length) {
        const paths = list.data.map((x) => `${cfg.storagePrefix}/${x.name}`);
        await supabase.storage.from(cfg.bucket).remove(paths);
      }
      objectName = `${cfg.storagePrefix}/${Date.now()}_upload.csv`;
      await supabase.storage.from(cfg.bucket).upload(objectName, arrayBuffer!, {
        contentType: "text/csv",
        upsert: true,
      });
    }

    // Create/replace source table and insert rows using direct Postgres connection
    const tableName = cfg.table;
    const client = await getDb().connect();
    try {
      await client.query(`drop table if exists public.${tableName}`);

      const columnsSql = normalized
        .map((c, idx) => `${c || `col_${idx + 1}`} text`)
        .join(", ");
      const createSql = `create table public.${tableName} (${columnsSql});`;
      await client.query(createSql);

      if (records.length) {
        // Build multi-row insert statement
        const values = records
          .map((row) =>
            `(${normalized
              .map((_, i) =>
                row[i] != null
                  ? `'${String(row[i]).replace(/'/g, "''")}'`
                  : "null"
              )
              .join(",")})`
          )
          .join(",");
        const insertSql = `insert into public.${tableName} (${normalized.join(",")}) values ${values};`;
        await client.query(insertSql);
      }
    } finally {
      client.release();
    }

    // Rebuild data_snapshot when raw_chat or agent_info change
    if (type === "raw_chat" || type === "agent_info") {
      await rebuildDataSnapshot();
    }

    return Response.json({ ok: true, table: tableName, object: objectName });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const typeParam = searchParams.get("type");
    const preview = searchParams.get("preview");

    const supabase = createSupabaseAdmin();

    // Preview mode: return first 5 rows from the corresponding table
    if (preview && (typeParam === "raw_chat" || typeParam === "agent_info" || typeParam === "criteria_scoring")) {
      const cfg = CONFIG[typeParam];
      const client = await getDb().connect();
      try {
        const q = await client.query(`select * from public.${cfg.table} limit 5`);
        const countQ = await client.query(`select count(*)::int as c from public.${cfg.table}`);
        const rows = q.rows || [];
        const columns = rows.length ? Object.keys(rows[0]) : [];
        const total = countQ.rows?.[0]?.c ?? 0;
        return Response.json({ type: typeParam, columns, rows, total });
      } finally {
        client.release();
      }
    }

    const pickLatest = (names: string[]) => {
      if (names.length === 0) return null;
      // Our naming is `${prefix}/${timestamp}_${original}`. Sort by timestamp desc
      const sorted = names
        .map((path) => {
          const last = path.split("/").pop() || "";
          const tsPart = last.split("_")[0];
          const ts = Number(tsPart);
          return { path, ts: Number.isFinite(ts) ? ts : 0 };
        })
        .sort((a, b) => b.ts - a.ts);
      return sorted[0].path;
    };

    const buildEntry = async (key: UploadType) => {
      const cfg = CONFIG[key];
      const list = await supabase.storage.from(cfg.bucket).list(cfg.storagePrefix, { limit: 100 });
      const paths = (list.data || []).map((x) => `${cfg.storagePrefix}/${x.name}`);
      const latestPath = pickLatest(paths);
      if (!latestPath) return null;
      const fileName = latestPath.split("/").pop() || latestPath;
      const originalName = fileName.includes("_") ? fileName.substring(fileName.indexOf("_") + 1) : fileName;
      return {
        type: key,
        bucket: cfg.bucket,
        objectPath: latestPath,
        fileName: originalName,
      };
    };

    if (typeParam === "raw_chat" || typeParam === "agent_info" || typeParam === "criteria_scoring") {
      const entry = await buildEntry(typeParam);
      return Response.json({ [typeParam]: entry });
    }

    const [raw, agent, criteria] = await Promise.all([
      buildEntry("raw_chat"),
      buildEntry("agent_info"),
      buildEntry("criteria_scoring"),
    ]);
    return Response.json({ raw_chat: raw, agent_info: agent, criteria_scoring: criteria });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    if (type !== "raw_chat" && type !== "agent_info" && type !== "criteria_scoring") {
      return Response.json({ error: "Invalid type" }, { status: 400 });
    }
    const cfg = CONFIG[type];
    const supabase = createSupabaseAdmin();

    // Remove stored file(s)
    const list = await supabase.storage.from(cfg.bucket).list(cfg.storagePrefix, { limit: 100 });
    if (list.data?.length) {
      const paths = list.data.map((x) => `${cfg.storagePrefix}/${x.name}`);
      await supabase.storage.from(cfg.bucket).remove(paths);
    }

    // Drop source table
    await getDb().query(`drop table if exists public.${cfg.table}`);

    // If removing a source for snapshot, drop data_snapshot as requested
    if (type === "raw_chat" || type === "agent_info") {
      await getDb().query("drop table if exists public.data_snapshot");
    }

    return Response.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

