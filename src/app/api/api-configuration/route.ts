import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

type ApiConfig = {
  provider?: string;
  model?: string;
  openai_key?: string; // plaintext incoming only
  monthly_budget_usd?: number; // optional budget cap
};

async function ensureTable() {
  await runQuery(
    `create table if not exists public.api_configuration (
      id int primary key default 1,
      provider text,
      model text,
      openai_key_encrypted text,
      monthly_budget_usd numeric,
      usage_month text,
      usage_tokens bigint,
      updated_at timestamptz default now()
    )`
  );
  // Backfill columns for existing installations
  await runQuery(`alter table public.api_configuration add column if not exists openai_key_encrypted text`);
  await runQuery(`alter table public.api_configuration add column if not exists monthly_budget_usd numeric`);
  await runQuery(`alter table public.api_configuration add column if not exists usage_month text`);
  await runQuery(`alter table public.api_configuration add column if not exists usage_tokens bigint`);
  // Ensure a singleton row exists
  await runQuery(
    `insert into public.api_configuration (id, provider, model, monthly_budget_usd, usage_month, usage_tokens)
     values (1, 'OpenAI', 'GPT-5 mini', null, to_char(now(), 'YYYY-MM'), 0)
     on conflict (id) do nothing`
  );
  // Initialize null fields if the row already existed
  await runQuery(
    `update public.api_configuration
     set usage_month = coalesce(usage_month, to_char(now(), 'YYYY-MM')),
         usage_tokens = coalesce(usage_tokens, 0)
     where id = 1`
  );
}

export async function GET(req: NextRequest) {
  try {
    await ensureTable();
    const search = req.nextUrl.searchParams;
    const mode = search.get("mode");
    const q = await runQuery(
      `select provider, model, monthly_budget_usd, usage_month, usage_tokens, openai_key_encrypted from public.api_configuration where id = 1`
    );
    const row = q.rows[0] as any;
    if (mode === "usage") {
      return NextResponse.json({
        month: row?.usage_month ?? null,
        tokens: typeof row?.usage_tokens === "number" ? row.usage_tokens : Number(row?.usage_tokens ?? 0),
        monthly_budget_usd: row?.monthly_budget_usd ?? null,
      });
    }
    return NextResponse.json({
      provider: row?.provider ?? null,
      model: row?.model ?? null,
      monthly_budget_usd: row?.monthly_budget_usd ?? null,
      has_key: Boolean(row?.openai_key_encrypted),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureTable();
    const body = (await req.json()) as ApiConfig & { action?: string };
    const provider = typeof body.provider === "string" ? body.provider.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim() : "";
    const keyPlain = typeof body.openai_key === "string" ? body.openai_key.trim() : "";
    const monthlyBudget = typeof body.monthly_budget_usd === "number" && !Number.isNaN(body.monthly_budget_usd)
      ? body.monthly_budget_usd
      : null;

    if (provider && provider !== "OpenAI") {
      return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
    }
    const allowedModels = new Set(["GPT-5", "GPT-5 mini", "GPT-5 nano", "GPT-4.1"]);
    const modelMap: Record<string, string> = {
      // Map friendly labels to closest OpenAI model IDs
      "GPT-5": "gpt-4.1",
      "GPT-5 mini": "gpt-4o-mini",
      "GPT-5 nano": "gpt-4o-mini",
      "GPT-4.1": "gpt-4.1",
    };
    if (model && !allowedModels.has(model)) {
      return NextResponse.json({ error: "Unsupported model" }, { status: 400 });
    }

    // Test connection path (does not persist key unless also saving)
    if (body.action === "test") {
      if (!keyPlain) return NextResponse.json({ error: "Missing key" }, { status: 400 });
      // Minimal test by calling OpenAI models list (no SDK to avoid extra deps)
      try {
        const resp = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${keyPlain}` },
          cache: "no-store",
        });
        if (!resp.ok) {
          const t = await resp.text().catch(() => "");
          return NextResponse.json({ ok: false, status: resp.status, body: t.slice(0, 300) }, { status: 200 });
        }
        return NextResponse.json({ ok: true }, { status: 200 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ ok: false, error: msg }, { status: 200 });
      }
    }

    // Test model path: validate provider+model using provided key or stored encrypted key
    if (body.action === "testModel") {
      const effectiveProvider = provider || "OpenAI";
      if (effectiveProvider !== "OpenAI") {
        return NextResponse.json({ ok: false, error: "Unsupported provider" }, { status: 200 });
      }

      // Determine model to test
      let effectiveModel = model;
      if (!effectiveModel) {
        const mq = await runQuery(`select model from public.api_configuration where id = 1`);
        effectiveModel = (mq.rows[0] as any)?.model || "GPT-5 mini";
      }
      if (!allowedModels.has(effectiveModel)) {
        return NextResponse.json({ ok: false, error: "Unsupported model" }, { status: 200 });
      }
      const apiModel = modelMap[effectiveModel] || effectiveModel;

      // Determine key to use: prefer plaintext from request, else stored encrypted
      let keyToUse = keyPlain;
      if (!keyToUse) {
        const kq = await runQuery(`select openai_key_encrypted from public.api_configuration where id = 1`);
        const enc = (kq.rows[0] as any)?.openai_key_encrypted as string | null;
        if (enc) {
          try {
            keyToUse = decryptSecret(enc);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return NextResponse.json({ ok: false, error: `Decryption failed: ${msg}` }, { status: 200 });
          }
        }
      }
      if (!keyToUse) {
        return NextResponse.json({ ok: false, error: "Missing API key (enter a key or save one first)" }, { status: 200 });
      }

      try {
        // Minimal chat completion probe
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${keyToUse}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: apiModel,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          }),
        });
        if (!resp.ok) {
          const t = await resp.text().catch(() => "");
          return NextResponse.json({ ok: false, status: resp.status, body: t.slice(0, 300) }, { status: 200 });
        }
        return NextResponse.json({ ok: true }, { status: 200 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ ok: false, error: msg }, { status: 200 });
      }
    }

    // Save configuration
    const encrypted = keyPlain ? encryptSecret(keyPlain) : null;
    await runQuery(
      `insert into public.api_configuration (id, provider, model, openai_key_encrypted, monthly_budget_usd, updated_at)
       values (1, coalesce($1, 'OpenAI'), coalesce($2, 'GPT-5 mini'), $3, $4, now())
       on conflict (id) do update set
         provider = coalesce(excluded.provider, public.api_configuration.provider),
         model = coalesce(excluded.model, public.api_configuration.model),
         openai_key_encrypted = coalesce(excluded.openai_key_encrypted, public.api_configuration.openai_key_encrypted),
         monthly_budget_usd = excluded.monthly_budget_usd,
         updated_at = now()`,
      [provider || null, model || null, encrypted, monthlyBudget]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

