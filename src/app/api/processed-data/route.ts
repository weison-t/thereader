import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "@/lib/db";

function toNumberFromScoreCell(value: unknown): number | null {
  if (value == null) return null;
  const text = String(value);
  const match = text.match(/(\d{1,3})\s*\/\s*100/);
  if (match) {
    const n = Number(match[1]);
    if (!Number.isNaN(n)) return n;
  }
  const n2 = Number(text);
  return Number.isFinite(n2) ? n2 : null;
}

async function createIfNotExists() {
  await runQuery(`create table if not exists public.processed_data (
    qa_name text,
    agent_caller_name text,
    opening_response_time numeric,
    ongoing_response_time numeric,
    holding_management numeric,
    closing_management numeric,
    verification_efficiency numeric,
    thoroughness numeric,
    proactiveness numeric,
    relevance_and_clarity numeric,
    language_natural_flow numeric,
    correction numeric,
    proper_empathy_acknowledgement numeric,
    breach_confidentiality boolean,
    rudeness_unprofessionalism boolean,
    overall_chat_handling_customer_experience numeric,
    scoring numeric,
    results text,
    agent_status text
  )`);
}

async function recreateTable() {
  await runQuery(`drop table if exists public.processed_data`);
  await createIfNotExists();
  // Ensure default QA name is AIVA
  await runQuery(`alter table public.processed_data alter column qa_name set default 'AIVA'`);
  await runQuery(`comment on column public.processed_data.qa_name is 'QA name'`);
  await runQuery(`comment on column public.processed_data.agent_caller_name is 'Agent caller Name'`);
  await runQuery(`comment on column public.processed_data.opening_response_time is 'Opening Response Time'`);
  await runQuery(`comment on column public.processed_data.ongoing_response_time is 'Ongoing Response Time'`);
  await runQuery(`comment on column public.processed_data.holding_management is 'Holding Management'`);
  await runQuery(`comment on column public.processed_data.closing_management is 'Closing Management'`);
  await runQuery(`comment on column public.processed_data.verification_efficiency is 'Verification Efficiency'`);
  await runQuery(`comment on column public.processed_data.thoroughness is 'Thoroughness'`);
  await runQuery(`comment on column public.processed_data.proactiveness is 'Proactiveness'`);
  await runQuery(`comment on column public.processed_data.relevance_and_clarity is 'Relevance and Clarity'`);
  await runQuery(`comment on column public.processed_data.language_natural_flow is 'Language & Natural Flow'`);
  await runQuery(`comment on column public.processed_data.correction is 'Correction'`);
  await runQuery(`comment on column public.processed_data.proper_empathy_acknowledgement is 'Proper Empathy & Acknowledgement'`);
  await runQuery(`comment on column public.processed_data.breach_confidentiality is 'Breach of Confidentiality'`);
  await runQuery(`comment on column public.processed_data.rudeness_unprofessionalism is 'Rudeness or Unprofessionalism'`);
  await runQuery(`comment on column public.processed_data.overall_chat_handling_customer_experience is 'Overall Chat Handling Customer Experience'`);
  await runQuery(`comment on column public.processed_data.scoring is 'Scoring'`);
  await runQuery(`comment on column public.processed_data.results is 'Results'`);
  await runQuery(`comment on column public.processed_data.agent_status is 'Agent status'`);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action || "process");
    if (action === "reset" || action === "recreate") {
      await recreateTable();
      return NextResponse.json({ ok: true, reset: true });
    }

    if (action === "process") {
      const replace = Boolean(body?.replace);
      if (replace) {
        await recreateTable();
      } else {
        await createIfNotExists();
      }

      // Pull rows from response_result
      const rr = await runQuery(`select * from public.response_result order by created_at asc`);
      const rows = rr.rows as any[];
      let inserted = 0;
      for (const r of rows) {
        const qaName = (r.qa_name && String(r.qa_name).trim()) ? String(r.qa_name).trim() : "AIVA";
        const payload = {
          qa_name: qaName,
          agent_caller_name: r.agent_caller_name ?? null,
          opening_response_time: toNumberFromScoreCell(r.opening_response_time),
          ongoing_response_time: toNumberFromScoreCell(r.ongoing_response_time),
          holding_management: toNumberFromScoreCell(r.holding_management),
          closing_management: toNumberFromScoreCell(r.closing_management),
          verification_efficiency: toNumberFromScoreCell(r.verification_efficiency),
          thoroughness: toNumberFromScoreCell(r.thoroughness),
          proactiveness: toNumberFromScoreCell(r.proactiveness),
          relevance_and_clarity: toNumberFromScoreCell(r.relevance_and_clarity),
          language_natural_flow: toNumberFromScoreCell(r.language_natural_flow),
          correction: toNumberFromScoreCell(r.correction),
          proper_empathy_acknowledgement: toNumberFromScoreCell(r.proper_empathy_acknowledgement),
          breach_confidentiality: String(r.breach_confidentiality_auto_failed || '').toLowerCase() === 'true',
          rudeness_unprofessionalism: String(r.rudeness_unprofessionalism_auto_failed || '').toLowerCase() === 'true',
          overall_chat_handling_customer_experience: toNumberFromScoreCell(r.overall_chat_handling_customer_experience),
          scoring: r.final_score ?? null,
          results: r.quality_assurance_feedback ?? null,
          agent_status: null,
        } as const;

        await runQuery(
          `insert into public.processed_data (
            qa_name, agent_caller_name,
            opening_response_time, ongoing_response_time, holding_management, closing_management,
            verification_efficiency, thoroughness, proactiveness, relevance_and_clarity, language_natural_flow,
            correction, proper_empathy_acknowledgement,
            breach_confidentiality, rudeness_unprofessionalism,
            overall_chat_handling_customer_experience,
            scoring, results, agent_status
          ) values (
            $1,$2,
            $3,$4,$5,$6,
            $7,$8,$9,$10,$11,
            $12,$13,
            $14,$15,
            $16,
            $17,$18,$19
          )`,
          [
            payload.qa_name, payload.agent_caller_name,
            payload.opening_response_time, payload.ongoing_response_time, payload.holding_management, payload.closing_management,
            payload.verification_efficiency, payload.thoroughness, payload.proactiveness, payload.relevance_and_clarity, payload.language_natural_flow,
            payload.correction, payload.proper_empathy_acknowledgement,
            payload.breach_confidentiality, payload.rudeness_unprofessionalism,
            payload.overall_chat_handling_customer_experience,
            payload.scoring, payload.results, payload.agent_status,
          ]
        );
        inserted += 1;
      }

      return NextResponse.json({ ok: true, inserted });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await createIfNotExists();
    const limit = 200;
    const qr = await runQuery(`select * from public.processed_data limit $1`, [limit]);
    const columns = qr.fields?.map((f: any) => f.name) || [];
    return NextResponse.json({ ok: true, rows: qr.rows, columns, total: qr.rowCount ?? qr.rows.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

