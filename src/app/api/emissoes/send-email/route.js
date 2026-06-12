import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const { para, assunto, mensagem, anexos, parcelaIds } = await request.json();

    if (!para || !assunto || !mensagem) {
      return Response.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }

    const destinatarios = para.split(',').map(e => e.trim()).filter(Boolean);
    if (destinatarios.length === 0) {
      return Response.json({ error: 'Nenhum e-mail de destino válido' }, { status: 400 });
    }

    // Busca os arquivos do Supabase Storage e converte para base64
    const attachments = [];
    for (const a of (anexos || [])) {
      try {
        // Extrai o caminho dentro do bucket a partir da URL pública
        const url = new URL(a.url);
        const pathInBucket = url.pathname.replace(/^\/storage\/v1\/object\/public\/documentos\//, '');
        const { data: blob, error: dlErr } = await supabaseAdmin.storage
          .from('documentos')
          .download(pathInBucket);
        if (!dlErr && blob) {
          const buffer = Buffer.from(await blob.arrayBuffer());
          const rawName = a.label.trim().replace(/[/\\:*?"<>|]/g, '-');
          const filename = rawName.endsWith('.pdf') ? rawName : `${rawName}.pdf`;
          attachments.push({ filename, content: buffer.toString('base64') });
        }
      } catch (_) {
        // ignora erros individuais de download
      }
    }

    const corpoHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#1e293b;font-size:14px;line-height:1.75;">
        <div style="background:#f8fafc;border-bottom:3px solid #1e3a5f;padding:20px 28px;margin-bottom:24px;">
          <img src="https://newmark-app.vercel.app/logo.png" alt="Newmark" style="height:36px;" />
        </div>
        <div style="padding:0 28px 28px;">
          <div style="margin:0 0 16px;">${
            mensagem
              .replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .split(/\n---\n/)
              .map(bloco => bloco.trim().split('\n').map(l => l === '' ? '<br>' : `<span>${l}</span><br>`).join(''))
              .join('<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">')
          }</div>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px;" />
          <p style="font-size:12px;color:#94a3b8;margin:0;">
            Este e-mail foi enviado automaticamente pela plataforma Newmark.<br/>
            Em caso de dúvidas, responda diretamente a este e-mail.
          </p>
        </div>
      </div>
    `;

    const { error: sendError } = await resend.emails.send({
      from: 'Newmark Financeiro <financeiro@newmark.com.br>',
      to: destinatarios,
      bcc: ['financeiro@newmark.com.br'],
      subject: assunto,
      html: corpoHtml,
      ...(attachments.length > 0 && { attachments }),
    });

    if (sendError) {
      return Response.json({ error: sendError.message }, { status: 500 });
    }

    // Marca as parcelas como e-mail enviado
    if (parcelaIds && parcelaIds.length > 0) {
      await supabaseAdmin
        .from('parcelas')
        .update({ email_enviado: true, email_enviado_em: new Date().toISOString() })
        .in('id', parcelaIds);
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
