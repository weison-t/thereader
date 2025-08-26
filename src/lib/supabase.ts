import { createClient } from "@supabase/supabase-js";

export const createSupabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase env not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
};

export const ensureBucket = async (bucket: string) => {
  const supabase = createSupabaseAdmin();
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === bucket);
  if (!exists) {
    await supabase.storage.createBucket(bucket, { public: false });
  }
};

