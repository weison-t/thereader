import { createSupabaseAdmin } from "@/lib/supabase";
import { runQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const result: {
    storageOk: boolean;
    dbOk: boolean;
    url?: string;
    dbSource?: string;
    storageError?: string;
    dbError?: string;
  } = { storageOk: false, dbOk: false };

  try {
    const supabase = createSupabaseAdmin();
    result.url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { data, error } = await supabase.storage.listBuckets();
    if (error) throw error;
    if (Array.isArray(data)) result.storageOk = true;
  } catch (e: unknown) {
    result.storageError = e instanceof Error ? e.message : "storage error";
  }

  try {
    result.dbSource = process.env.SUPABASE_DB_POOLER_URL ? "pooler" : (process.env.SUPABASE_DB_URL ? "direct" : "none");
    const q = await runQuery("select 1 as ok");
    if (q?.rows?.[0]?.ok === 1) result.dbOk = true;
  } catch (e: unknown) {
    result.dbError = e instanceof Error ? e.message : "db error";
  }

  const status = result.storageOk && result.dbOk ? 200 : 500;
  return Response.json(result, { status });
}

