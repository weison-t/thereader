import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const client = await getDb().connect();
    try {
      const tables = ["raw_chat", "agent_info", "criteria_scoring", "processed_data"] as const;
      const results: Record<string, { exists: boolean; rowCount: number }> = {};
      for (const t of tables) {
        const existsQuery = await client.query(
          "select to_regclass($1) is not null as exists",
          ["public." + t]
        );
        const exists = Boolean(existsQuery.rows?.[0]?.exists);
        let rowCount = 0;
        if (exists) {
          const c = await client.query(`select count(*)::int as c from public.${t}`);
          rowCount = c.rows?.[0]?.c ?? 0;
        }
        results[t] = { exists, rowCount };
      }
      return Response.json(results);
    } finally {
      client.release();
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

