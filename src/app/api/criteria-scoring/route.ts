import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { createSupabaseAdmin } from "@/lib/supabase";
import Papa from "papaparse";

export const runtime = "nodejs";

type Totals = {
  normal?: number;
  premier?: number;
};

export async function GET() {
  const client = await getDb().connect();
  try {
    // Ensure helper primary key exists for editing
    await client.query(
      "create table if not exists public.criteria_scoring (_row_id bigserial primary key);"
    );
    await client.query(
      "alter table public.criteria_scoring add column if not exists _row_id bigserial;"
    );

    // Get column list from information_schema to render even when empty
    const colsQ = await client.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name='criteria_scoring' order by ordinal_position"
    );
    const columns = colsQ.rows.map((r: any) => r.column_name as string);

    // Fetch rows (first 1000 for safety)
    const rowsQ = await client.query(
      "select * from public.criteria_scoring order by _row_id limit 1000"
    );
    const rows = rowsQ.rows ?? [];

    // Totals by customer_type: sum of highest weightage per unique criteria
    const totals: Totals = {};
    const totalsQ = await client.query(
      "select t, coalesce(sum(max_w),0)::float as total from (select coalesce(customer_type,'') as t, coalesce(criteria,'') as c, max(coalesce(nullif(weightage,''),'0')::float) as max_w from public.criteria_scoring group by 1,2) s group by t"
    );
    for (const r of totalsQ.rows) {
      const t = String(r.t || "").toLowerCase();
      if (t.includes("normal")) totals.normal = Number(r.total) || 0;
      if (t.includes("premier")) totals.premier = Number(r.total) || 0;
    }

    return Response.json({ columns, rows, totals });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  } finally {
    // Always release
    // eslint-disable-next-line no-unsafe-finally
    client.release();
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body?.id as number | undefined;
    const updates = body?.updates as Record<string, unknown> | undefined;
    if (!id || !updates || typeof updates !== "object") {
      return Response.json({ error: "id and updates required" }, { status: 400 });
    }

    const client = await getDb().connect();
    try {
      // Determine actual columns to guard against invalid updates
      const colsQ = await client.query(
        "select column_name from information_schema.columns where table_schema='public' and table_name='criteria_scoring'"
      );
      const validCols = new Set<string>(colsQ.rows.map((r: any) => r.column_name as string));
      validCols.delete("_row_id");

      const setCols: string[] = [];
      const params: unknown[] = [];
      for (const [k, v] of Object.entries(updates)) {
        if (!validCols.has(k)) continue;
        params.push(v);
        setCols.push(`${k} = $${params.length}`);
      }
      if (setCols.length === 0) {
        return Response.json({ ok: true, unchanged: true });
      }
      params.push(id);
      const sql = `update public.criteria_scoring set ${setCols.join(", ")} where _row_id = $${params.length} returning *`;
      const res = await client.query(sql, params);
      return Response.json({ ok: true, row: res.rows?.[0] });
    } finally {
      client.release();
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body?.action || "");

    if (action === "batchUpdate") {
      const updates = Array.isArray(body?.updates) ? (body.updates as Array<{ id: number; updates: Record<string, unknown> }>) : [];
      if (updates.length === 0) {
        return Response.json({ error: "updates array required" }, { status: 400 });
      }

      const client = await getDb().connect();
      try {
        const colsQ = await client.query(
          "select column_name from information_schema.columns where table_schema='public' and table_name='criteria_scoring'"
        );
        const validCols = new Set<string>(colsQ.rows.map((r: any) => r.column_name as string));
        validCols.delete("_row_id");

        await client.query("begin");
        let affected = 0;
        for (const item of updates) {
          const id = item?.id;
          const upd = item?.updates;
          if (!id || !upd || typeof upd !== "object") continue;
          const setCols: string[] = [];
          const params: unknown[] = [];
          for (const [k, v] of Object.entries(upd)) {
            if (!validCols.has(k)) continue;
            params.push(v);
            setCols.push(`${k} = $${params.length}`);
          }
          if (setCols.length === 0) continue;
          params.push(id);
          const sql = `update public.criteria_scoring set ${setCols.join(", ")} where _row_id = $${params.length}`;
          const res = await client.query(sql, params);
          affected += res.rowCount || 0;
        }
        await client.query("commit");
        return Response.json({ ok: true, affected });
      } catch (e) {
        await (async () => {
          try {
            await client.query("rollback");
          } catch {
            // ignore
          }
        })();
        const message = e instanceof Error ? e.message : "Server error";
        return Response.json({ error: message }, { status: 500 });
      } finally {
        // eslint-disable-next-line no-unsafe-finally
        client.release();
      }
    }

    if (action === "reset") {
      // Recreate criteria_scoring from the latest uploaded CSV file in storage
      const supabase = createSupabaseAdmin();
      const bucket = "uploads";
      const prefix = "criteria_scoring";
      const list = await supabase.storage.from(bucket).list(prefix, { limit: 100 });
      const paths = (list.data || []).map((x) => `${prefix}/${x.name}`);
      if (!paths.length) {
        return Response.json({ error: "No criteria file found in storage" }, { status: 400 });
      }
      const pickLatest = (names: string[]) => {
        const sorted = names
          .map((p) => {
            const last = p.split("/").pop() || "";
            const tsPart = last.split("_")[0];
            const ts = Number(tsPart);
            return { p, ts: Number.isFinite(ts) ? ts : 0 };
          })
          .sort((a, b) => b.ts - a.ts);
        return sorted[0].p;
      };
      const latestPath = pickLatest(paths);
      const dl = await supabase.storage.from(bucket).download(latestPath);
      if (dl.error || !dl.data) {
        return Response.json({ error: dl.error?.message || "Failed to download criteria file" }, { status: 500 });
      }
      const arrayBuffer = await dl.data.arrayBuffer();
      const text = Buffer.from(arrayBuffer).toString("utf8");

      const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
      if (parsed.errors?.length) {
        return Response.json({ error: parsed.errors[0].message }, { status: 400 });
      }
      const rows = parsed.data as string[][];
      if (!rows.length) {
        return Response.json({ error: "No rows found in CSV" }, { status: 400 });
      }

      const [header, ...records] = rows;
      // Normalize headers and ensure uniqueness (match upload behavior)
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

      const client = await getDb().connect();
      try {
        await client.query("drop table if exists public.criteria_scoring");
        const columnsSql = normalized.map((c, idx) => `${c || `col_${idx + 1}`} text`).join(", ");
        const createSql = `create table public.criteria_scoring (${columnsSql});`;
        await client.query(createSql);
        if (records.length) {
          const values = records
            .map((row) =>
              `(${normalized
                .map((_, i) => (row[i] != null ? `'${String(row[i]).replace(/'/g, "''")}'` : "null"))
                .join(",")})`
            )
            .join(",");
          const insertSql = `insert into public.criteria_scoring (${normalized.join(",")}) values ${values};`;
          await client.query(insertSql);
        }
        return Response.json({ ok: true, reset: true });
      } finally {
        client.release();
      }
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

