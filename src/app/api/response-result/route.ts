import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { createHash } from "crypto";

async function ensureExtensions() {
  await runQuery(`create extension if not exists pgcrypto`);
}

async function ensureTable() {
  await ensureExtensions();
  await runQuery(
    `create table if not exists public.response_result (
      id uuid primary key default gen_random_uuid(),
      source_key text,
      sampling_id text,
      start_time timestamptz,
      completion_time timestamptz,
      qa_name text,
      chat_link text,
      agent_caller_name text,
      chat_date_time timestamptz,
      chat_duration text,
      opening_response_time text,
      ongoing_response_time text,
      holding_management text,
      closing_management text,
      verification_efficiency text,
      thoroughness text,
      proactiveness text,
      relevance_and_clarity text,
      language_natural_flow text,
      correction text,
      proper_empathy_acknowledgement text,
      breach_confidentiality_auto_failed text,
      rudeness_unprofessionalism_auto_failed text,
      overall_chat_handling_customer_experience text,
      csat_rating text,
      csat_handling_category text,
      quality_assurance_feedback text,
      final_score numeric,
      created_at timestamptz default now()
    )`
  );
  // Backfill for older installs
  await runQuery(`alter table public.response_result add column if not exists source_key text`);
  await runQuery(`alter table public.response_result add column if not exists sampling_id text`);
  await runQuery(`alter table public.response_result add column if not exists created_at timestamptz default now()`);
  await runQuery(`create unique index if not exists ux_response_result_source_key on public.response_result(source_key)`);
  await runQuery(`create unique index if not exists ux_response_result_sampling_id on public.response_result(sampling_id)`);
  await runQuery(`create unique index if not exists ux_response_result_source_key on public.response_result(source_key)`);
  // Friendly labels as comments
  await runQuery(`comment on column public.response_result.opening_response_time is 'Opening Response Time (4%) — Was the agent’s initial response within the opening response timing?'`);
  await runQuery(`comment on column public.response_result.ongoing_response_time is 'Ongoing Response Time (4%) — Were follow-up responses timely, within the 2-minute silent gap as per SOP?'`);
  await runQuery(`comment on column public.response_result.holding_management is 'Holding Management (4%) — Was hold time within SOP’s 5-minute requirement, with appropriate updates? (1 inquiry 2 holding)'`);
  await runQuery(`comment on column public.response_result.closing_management is 'Closing Management (4%) — Did the agent resolve the issue or provide next steps per SOP guidelines?'`);
  await runQuery(`comment on column public.response_result.verification_efficiency is 'Verification Efficiency (20%) — Did the agent comply & verify the customer’s identity as per SOP?'`);
  await runQuery(`comment on column public.response_result.thoroughness is 'Thoroughness (20%) — Did the agent completely solve the issue, provide next steps, as and when needed?'`);
  await runQuery(`comment on column public.response_result.proactiveness is 'Proactiveness (4%) — Did the agent take initiative to anticipate customer further needs or offer extra miles?'`);
  await runQuery(`comment on column public.response_result.relevance_and_clarity is 'Relevance and Clarity (4%) — Did the agent understand the problem and give a relevant response/probing to the customer?'`);
  await runQuery(`comment on column public.response_result.language_natural_flow is 'Language & Natural Flow (10%) — Natural (non-robotic) tonality, appropriate emojis, consistent language'`);
  await runQuery(`comment on column public.response_result.correction is 'Correction (7%) — Did agent manage to fix their mistake (wrong process/acknowledgement/empathy/language)'`);
  await runQuery(`comment on column public.response_result.proper_empathy_acknowledgement is 'Proper Empathy & Acknowledgement (14%) — Appropriate empathy and acknowledgement of customer''s specific concern (at least first inquiry)'`);
  await runQuery(`comment on column public.response_result.breach_confidentiality_auto_failed is 'Breach of Confidentiality (Auto Failed) — Disclosed sensitive info (e.g., template revealing another brand)?'`);
  await runQuery(`comment on column public.response_result.rudeness_unprofessionalism_auto_failed is 'Rudeness or Unprofessionalism (Auto Failed) — Any unprofessional language (e.g., explicit words, ALL CAPS)?'`);
  await runQuery(`comment on column public.response_result.overall_chat_handling_customer_experience is 'Overall Chat Handling Customer Experience (5%) — Customer-centric, smooth, supportive?'`);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action || "init");
    if (action === "reset") {
      await runQuery(`drop table if exists public.response_result`);
      await ensureTable();
      // Ensure sampling_data exists
      const sdExistsQ = await runQuery(`select to_regclass('public.sampling_data') is not null as exists`);
      const sdExists = Boolean(sdExistsQ.rows?.[0]?.exists);
      if (!sdExists) return NextResponse.json({ error: "sampling_data table not found" }, { status: 400 });
      return NextResponse.json({ ok: true, reset: true });
    }
    if (action === "init") {
      await ensureTable();
      return NextResponse.json({ ok: true });
    }

    if (action === "process") {
      await ensureTable();
      if (body?.replace) {
        await runQuery(`truncate table public.response_result`);
      }
      // Load provider/model/key
      const q = await runQuery(`select provider, model, openai_key_encrypted from public.api_configuration where id = 1`);
      const row = q.rows[0] as any;
      if (!row) return NextResponse.json({ error: "API configuration not set" }, { status: 400 });
      const modelLabel = String(row.model || "GPT-5 mini");
      const modelMap: Record<string, string> = { "GPT-5": "gpt-4.1", "GPT-5 mini": "gpt-4o-mini", "GPT-5 nano": "gpt-4o-mini", "GPT-4.1": "gpt-4.1" };
      const modelId = modelMap[modelLabel] || modelLabel;
      const enc = row.openai_key_encrypted as string | null;
      if (!enc) return NextResponse.json({ error: "Missing OpenAI key" }, { status: 400 });
      let apiKey = "";
      try { apiKey = decryptSecret(enc); } catch (e) { return NextResponse.json({ error: "Failed to decrypt API key" }, { status: 500 }); }

      // Load criteria rubric (optional detail for the model)
      const rc = await runQuery(`select * from public.criteria_scoring order by customer_type, criteria`);
      const rubric = rc.rows;

      // Weights map (percent of 100)
      const weights: Record<string, number> = {
        opening_response_time: 4,
        ongoing_response_time: 4,
        holding_management: 4,
        closing_management: 4,
        verification_efficiency: 20,
        thoroughness: 20,
        proactiveness: 4,
        relevance_and_clarity: 4,
        language_natural_flow: 10,
        correction: 7,
        proper_empathy_acknowledgement: 14,
        overall_chat_handling_customer_experience: 5,
      };
      const weightedKeys = Object.keys(weights);

      // Load sampling_data to process
      const limit = body?.limit == null ? null : Math.max(1, Math.min(1000, Number(body?.limit)));
      const sd = limit == null
        ? await runQuery(`select * from public.sampling_data`)
        : await runQuery(`select * from public.sampling_data limit $1`, [limit]);
      const chats = sd.rows as any[];
      if (chats.length === 0) return NextResponse.json({ ok: true, processed: 0 });

      let processed = 0;
      for (const chat of chats) {
        // Prefer canonical fields; otherwise build a transcript from all short string fields
        let rawContent = chat.content ?? chat.message ?? chat.chat_content ?? chat.transcript ?? null;
        if (!rawContent) {
          const parts: string[] = [];
          for (const [k, v] of Object.entries(chat)) {
            if (typeof v === "string" && v && v.length <= 2000) parts.push(`${k}: ${v}`);
            if (parts.length >= 20) break;
          }
          rawContent = parts.join("\n");
        }
        const content = String(rawContent ?? "").slice(0, 20000);
        const agent = String(chat.actual_agent ?? chat.agent ?? chat.agent_name ?? chat["Agent"] ?? "");
        const startTime = chat.start_time ? new Date(chat.start_time) : (chat.Start_Time ? new Date(chat.Start_Time) : null);
        const endTime = chat.end_time ? new Date(chat.end_time) : (chat.End_Time ? new Date(chat.End_Time) : null);
        if (!content) { continue; }
        // Compose prompt and expected JSON
        const system = `You are a QA evaluator. Score the chat against the rubric. Return strict JSON (no prose) with this shape:
{
  "criteria": {
    "opening_response_time": { "score": 0-100, "comment": string },
    "ongoing_response_time": { "score": 0-100, "comment": string },
    "holding_management": { "score": 0-100, "comment": string },
    "closing_management": { "score": 0-100, "comment": string },
    "verification_efficiency": { "score": 0-100, "comment": string },
    "thoroughness": { "score": 0-100, "comment": string },
    "proactiveness": { "score": 0-100, "comment": string },
    "relevance_and_clarity": { "score": 0-100, "comment": string },
    "language_natural_flow": { "score": 0-100, "comment": string },
    "correction": { "score": 0-100, "comment": string },
    "proper_empathy_acknowledgement": { "score": 0-100, "comment": string },
    "overall_chat_handling_customer_experience": { "score": 0-100, "comment": string }
  },
  "breach_confidentiality_auto_failed": true|false,
  "rudeness_unprofessionalism_auto_failed": true|false,
  "csat_rating": string,
  "csat_handling_category": string,
  "quality_assurance_feedback": string
}
If either auto-fail is true, the overall final score is 0. Base scores on the transcript only. Just return JSON.`;
        const rubricSnippet = JSON.stringify(rubric).slice(0, 8000);
        const user = `Rubric (rows): ${rubricSnippet}\n\nAgent: ${agent}\nStart: ${startTime ?? ""}\nEnd: ${endTime ?? ""}\nChat content (UTF-8):\n${content}`;
        let resultJson: any = null;
        try {
          const resp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: modelId,
              messages: [{ role: "system", content: system }, { role: "user", content: user }],
              temperature: 0,
              max_tokens: 900,
              response_format: { type: "json_object" }
            }),
          });
          const jr = await resp.json();
          const text = String(jr?.choices?.[0]?.message?.content ?? "{}");
          try { resultJson = JSON.parse(text); } catch { resultJson = { quality_assurance_feedback: text }; }
        } catch (e) {
          resultJson = { quality_assurance_feedback: `Model error: ${e instanceof Error ? e.message : String(e)}` };
        }

        // Build fields: stringify per-criterion as "{score}/100 - comment"
        const c = (resultJson?.criteria ?? {}) as Record<string, { score?: number; comment?: string }>;
        const field = (k: string) => {
          const s = Math.max(0, Math.min(100, Number(c?.[k]?.score ?? 0)));
          const cm = String(c?.[k]?.comment ?? "").slice(0, 500);
          return `${s}/100 - ${cm}`;
        };
        // Compute final score
        let autoFail = Boolean(resultJson?.breach_confidentiality_auto_failed) || Boolean(resultJson?.rudeness_unprofessionalism_auto_failed);
        let finalScore = 0;
        if (!autoFail) {
          let total = 0;
          let wsum = 0;
          for (const k of weightedKeys) {
            const s = Math.max(0, Math.min(100, Number(c?.[k]?.score ?? 0)));
            const w = weights[k] ?? 0;
            total += s * w;
            wsum += w;
          }
          finalScore = wsum > 0 ? Math.round((total / wsum) * 100) / 100 : 0;
        }

        // Build linkage keys
        const samplingId = String(chat.id ?? chat.ID ?? chat.chat_id ?? chat.uuid ?? "");
        const base = samplingId + "|" + String(startTime ?? "") + "|" + content.slice(0, 256);
        const sourceKey = createHash("sha256").update(base).digest("hex");

        // Upsert row tied to sampling_id (preferred). If sampling_id is null/empty, unique by source_key fallback.
        await runQuery(
          `insert into public.response_result (
            source_key,
            sampling_id,
            start_time, completion_time, qa_name, chat_link, agent_caller_name, chat_date_time, chat_duration,
            opening_response_time, ongoing_response_time, holding_management, closing_management,
            verification_efficiency, thoroughness, proactiveness, relevance_and_clarity, language_natural_flow,
            correction, proper_empathy_acknowledgement, breach_confidentiality_auto_failed, rudeness_unprofessionalism_auto_failed,
            overall_chat_handling_customer_experience, csat_rating, csat_handling_category, quality_assurance_feedback, final_score
          ) values (
            $1,
            nullif($2, ''),
            $3,$4,$5,$6,$7,$8,$9,
            $10,$11,$12,$13,
            $14,$15,$16,$17,$18,
            $19,$20,$21,$22,
            $23,$24,$25,$26,$27
          )
          on conflict (sampling_id) do update set
            start_time = excluded.start_time,
            completion_time = excluded.completion_time,
            qa_name = excluded.qa_name,
            chat_link = excluded.chat_link,
            agent_caller_name = excluded.agent_caller_name,
            chat_date_time = excluded.chat_date_time,
            chat_duration = excluded.chat_duration,
            opening_response_time = excluded.opening_response_time,
            ongoing_response_time = excluded.ongoing_response_time,
            holding_management = excluded.holding_management,
            closing_management = excluded.closing_management,
            verification_efficiency = excluded.verification_efficiency,
            thoroughness = excluded.thoroughness,
            proactiveness = excluded.proactiveness,
            relevance_and_clarity = excluded.relevance_and_clarity,
            language_natural_flow = excluded.language_natural_flow,
            correction = excluded.correction,
            proper_empathy_acknowledgement = excluded.proper_empathy_acknowledgement,
            breach_confidentiality_auto_failed = excluded.breach_confidentiality_auto_failed,
            rudeness_unprofessionalism_auto_failed = excluded.rudeness_unprofessionalism_auto_failed,
            overall_chat_handling_customer_experience = excluded.overall_chat_handling_customer_experience,
            csat_rating = excluded.csat_rating,
            csat_handling_category = excluded.csat_handling_category,
            quality_assurance_feedback = excluded.quality_assurance_feedback,
            final_score = excluded.final_score
          `,
          [
            sourceKey,
            samplingId,
            startTime, endTime, resultJson?.qa_name ?? null, resultJson?.chat_link ?? null, agent || null, startTime, resultJson?.chat_duration ?? null,
            field('opening_response_time'), field('ongoing_response_time'), field('holding_management'), field('closing_management'),
            field('verification_efficiency'), field('thoroughness'), field('proactiveness'), field('relevance_and_clarity'), field('language_natural_flow'),
            field('correction'), field('proper_empathy_acknowledgement'), String(Boolean(resultJson?.breach_confidentiality_auto_failed)), String(Boolean(resultJson?.rudeness_unprofessionalism_auto_failed)),
            field('overall_chat_handling_customer_experience'), resultJson?.csat_rating ?? null, resultJson?.csat_handling_category ?? null, resultJson?.quality_assurance_feedback ?? null, finalScore
          ]
        );
        processed += 1;
      }

      return NextResponse.json({ ok: true, processed });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await ensureTable();
    const search = req.nextUrl.searchParams;
    const mode = search.get("download");
    if (mode === "csv") {
      const qr = await runQuery(`select * from public.response_result order by created_at desc limit 1000`);
      const rows = qr.rows as any[];
      const cols = qr.fields?.map((f: any) => f.name) || Object.keys(rows[0] || {});
      const header = cols.join(",");
      const lines = rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","));
      const csv = [header, ...lines].join("\n");
      return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=response_result.csv" } });
    }
    const limit = Math.max(1, Math.min(200, Number(search.get("limit") ?? 50)));
    const offset = Math.max(0, Number(search.get("offset") ?? 0));
    const qr = await runQuery(`select * from public.response_result order by created_at desc limit $1 offset $2`, [limit, offset]);
    const count = await runQuery(`select count(*)::int as rows from public.response_result`);
    const rows = (count.rows[0] as any)?.rows ?? 0;
    const columns = qr.fields?.map((f: any) => f.name) || [];
    return NextResponse.json({ ok: true, rowsTotal: rows, columns, rows: qr.rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

