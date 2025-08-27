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
  await runQuery(`create table if not exists public.scoring_data (
    qa_name text default 'AIVA',
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
  // Helpful comments for clarity (UI uses returned field names directly)
  await runQuery(`comment on column public.scoring_data.qa_name is 'QA name'`);
  await runQuery(`comment on column public.scoring_data.agent_caller_name is 'Agent caller Name'`);
  await runQuery(`comment on column public.scoring_data.opening_response_time is 'Opening Response Time'`);
  await runQuery(`comment on column public.scoring_data.ongoing_response_time is 'Ongoing Response Time'`);
  await runQuery(`comment on column public.scoring_data.holding_management is 'Holding Management'`);
  await runQuery(`comment on column public.scoring_data.closing_management is 'Closing Management'`);
  await runQuery(`comment on column public.scoring_data.verification_efficiency is 'Verification Efficiency'`);
  await runQuery(`comment on column public.scoring_data.thoroughness is 'Thoroughness'`);
  await runQuery(`comment on column public.scoring_data.proactiveness is 'Proactiveness'`);
  await runQuery(`comment on column public.scoring_data.relevance_and_clarity is 'Relevance and Clarity'`);
  await runQuery(`comment on column public.scoring_data.language_natural_flow is 'Language & Natural Flow'`);
  await runQuery(`comment on column public.scoring_data.correction is 'Correction'`);
  await runQuery(`comment on column public.scoring_data.proper_empathy_acknowledgement is 'Proper Empathy & Acknowledgement'`);
  await runQuery(`comment on column public.scoring_data.breach_confidentiality is 'Breach of Confidentiality'`);
  await runQuery(`comment on column public.scoring_data.rudeness_unprofessionalism is 'Rudeness or Unprofessionalism'`);
  await runQuery(`comment on column public.scoring_data.overall_chat_handling_customer_experience is 'Overall Chat Handling Customer Experience'`);
  await runQuery(`comment on column public.scoring_data.scoring is 'Scoring'`);
  await runQuery(`comment on column public.scoring_data.results is 'Results'`);
  await runQuery(`comment on column public.scoring_data.agent_status is 'Agent status'`);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action || "process");

    if (action === "reset" || action === "recreate") {
      await runQuery(`drop table if exists public.scoring_data`);
      await createIfNotExists();
      return NextResponse.json({ ok: true, reset: true });
    }

    if (action === "process") {
      const replace = Boolean(body?.replace);
      if (replace) {
        await runQuery(`drop table if exists public.scoring_data`);
      }
      await createIfNotExists();

      // Ensure processed_data exists
      const pd = await runQuery(`select to_regclass('public.processed_data') is not null as exists`);
      const hasPd = Boolean(pd.rows?.[0]?.exists);
      if (!hasPd) {
        return NextResponse.json({ error: "processed_data missing" }, { status: 400 });
      }

      // Populate scoring_data directly from processed_data (columns align)
      const ins = await runQuery(`
        insert into public.scoring_data (
          qa_name, agent_caller_name,
          opening_response_time, ongoing_response_time, holding_management, closing_management,
          verification_efficiency, thoroughness, proactiveness, relevance_and_clarity, language_natural_flow,
          correction, proper_empathy_acknowledgement,
          breach_confidentiality, rudeness_unprofessionalism,
          overall_chat_handling_customer_experience,
          scoring, results, agent_status
        )
        select
          coalesce(pd.qa_name, 'AIVA') as qa_name,
          pd.agent_caller_name,
          pd.opening_response_time, pd.ongoing_response_time, pd.holding_management, pd.closing_management,
          pd.verification_efficiency, pd.thoroughness, pd.proactiveness, pd.relevance_and_clarity, pd.language_natural_flow,
          pd.correction, pd.proper_empathy_acknowledgement,
          pd.breach_confidentiality, pd.rudeness_unprofessionalism,
          pd.overall_chat_handling_customer_experience,
          pd.scoring, pd.results, pd.agent_status
        from public.processed_data pd
      `);

      return NextResponse.json({ ok: true, inserted: ins.rowCount ?? null });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    await createIfNotExists();
    const limit = 200;
    const qr = await runQuery(`select * from public.scoring_data limit $1`, [limit]);
    const columns = qr.fields?.map((f: any) => f.name) || [];
    return NextResponse.json({ ok: true, rows: qr.rows, columns, total: qr.rowCount ?? qr.rows.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

