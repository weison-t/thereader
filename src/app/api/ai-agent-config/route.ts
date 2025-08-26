import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type Config = {
  rubric_understanding?: string;
};

async function ensureTable() {
  const pool = await getDb();
  const client = await pool.connect();
  try {
    await client.query(
      `create table if not exists public.ai_agent_config (
        id int primary key default 1,
        rubric_understanding text
      )`
    );
    // Cleanup legacy columns if present
    await client.query("alter table public.ai_agent_config drop column if exists role_persona");
    await client.query("alter table public.ai_agent_config drop column if exists domain_knowledge");
    await client.query("alter table public.ai_agent_config drop column if exists goals_objectives");
    await client.query("alter table public.ai_agent_config drop column if exists temperature");
    await client.query("alter table public.ai_agent_config drop column if exists cot_depth");
    await client.query("alter table public.ai_agent_config drop column if exists constraint_rules");
    await client.query("alter table public.ai_agent_config drop column if exists guardrails");
    await client.query("insert into public.ai_agent_config (id) values (1) on conflict (id) do nothing");
  } finally {
    client.release();
  }
}

export async function GET() {
  await ensureTable();
  const pool = await getDb();
  const client = await pool.connect();
  try {
    const q = await client.query("select rubric_understanding from public.ai_agent_config where id=1");
    const row = q.rows?.[0] || {};
    return Response.json({ config: row });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PUT(req: NextRequest) {
  await ensureTable();
  const body = (await req.json()) as Config;
  const pool = await getDb();
  const client = await pool.connect();
  try {
    const fields = {
      rubric_understanding: body.rubric_understanding ?? null,
    };
    const keys = Object.keys(fields);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const values = keys.map((k) => (fields as any)[k]);
    await client.query(`update public.ai_agent_config set ${sets} where id=1`, values);
    return Response.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}

