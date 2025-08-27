import { NextRequest } from "next/server";
import { createSupabaseAdmin, ensureBucket } from "@/lib/supabase";

export const runtime = "nodejs";

type UploadType = "raw_chat" | "agent_info" | "criteria_scoring";

const CONFIG: Record<UploadType, { bucket: string; storagePrefix: string }> = {
  raw_chat: { bucket: "uploads", storagePrefix: "raw_chat" },
  agent_info: { bucket: "uploads", storagePrefix: "agent_info" },
  criteria_scoring: { bucket: "uploads", storagePrefix: "criteria_scoring" },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type = String(body?.type || "");
    const filename = String(body?.filename || "").trim();
    if (type !== "raw_chat" && type !== "agent_info" && type !== "criteria_scoring") {
      return Response.json({ error: "Invalid type" }, { status: 400 });
    }
    if (!filename) {
      return Response.json({ error: "Missing filename" }, { status: 400 });
    }

    const cfg = CONFIG[type as UploadType];
    const supabase = createSupabaseAdmin();
    await ensureBucket(cfg.bucket);

    const safeName = filename.replace(/[^A-Za-z0-9._-]+/g, "_");
    const path = `${cfg.storagePrefix}/${Date.now()}_${safeName}`;
    const { data, error } = await supabase.storage
      .from(cfg.bucket)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return Response.json({ error: error?.message || "Failed to create signed URL" }, { status: 500 });
    }
    return Response.json({ bucket: cfg.bucket, path, token: data.token });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

