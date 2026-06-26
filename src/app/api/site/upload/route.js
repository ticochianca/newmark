import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const tipo = formData.get('tipo'); // 'cases' | 'artigos'
    const itemId = formData.get('itemId');

    if (!file || !tipo || !itemId) {
      return Response.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }

    const ext = file.name.split('.').pop().toLowerCase();
    const path = `site/${tipo}/${itemId}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from('documentos')
      .upload(path, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseAdmin.storage
      .from('documentos')
      .getPublicUrl(path);

    return Response.json({ url: urlData.publicUrl });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
