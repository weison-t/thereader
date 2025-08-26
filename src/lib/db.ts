import { Pool } from "pg";

let pool: Pool | null = null;

export const getDb = () => {
  if (pool) return pool;
  const raw = process.env.SUPABASE_DB_POOLER_URL || process.env.SUPABASE_DB_URL;
  const connectionString = typeof raw === "string" ? raw.trim() : undefined;
  if (!connectionString) {
    throw new Error("Missing SUPABASE_DB_POOLER_URL or SUPABASE_DB_URL env var");
  }
  // Basic sanity check to help catch malformed values early
  if (!/^postgres(ql)?:\/\//i.test(connectionString)) {
    throw new Error("Invalid Postgres URI: ensure it starts with postgresql:// and is URL-encoded");
  }
  // Parse URL to catch malformed inputs early and pass structured config to pg
  try {
    const url = new URL(connectionString);
    const database = url.pathname?.replace(/^\//, "") || "postgres";
    const host = url.hostname;
    const port = url.port ? Number(url.port) : 5432;
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);

    pool = new Pool({ host, port, user, password, database, ssl: { rejectUnauthorized: false } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid SUPABASE_DB_* URL: ${message}`);
  }
  return pool;
};

export const runQuery = async (sql: string, params?: ReadonlyArray<unknown>) => {
  const client = await getDb().connect();
  try {
    if (typeof params === "undefined") {
      return await client.query(sql);
    }
    return await client.query(sql, params as unknown[]);
  } finally {
    client.release();
  }
};

