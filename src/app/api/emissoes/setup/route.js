import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST() {
  try {
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
    if (listError) throw listError;

    const exists = buckets?.some(b => b.name === 'documentos');
    if (!exists) {
      const { error: createError } = await supabaseAdmin.storage.createBucket('documentos', {
        public: true,
        fileSizeLimit: 10485760, // 10MB
      });
      if (createError) throw createError;
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
