import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function competencia(p) {
  const isMesmoMes = p.contratos?.cobranca_mesmo_mes;
  const dataBase = p.data_original || p.data_vencimento;
  if (!dataBase) return '';
  const d = new Date(dataBase + 'T12:00:00');
  if (!isMesmoMes) d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toLocaleString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    .replace('. de ', '/').replace('.', '');
}

function csvQuote(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('parcelas')
    .select('id, valor, data_vencimento, data_original, status, nf_numero, data_pagamento, contratos(titulo, cobranca_mesmo_mes, clientes(nome, apelido))')
    .lte('data_vencimento', '2026-04-30')
    .or('status.neq.Paga,nf_numero.is.null')
    .order('data_vencimento');

  if (error) return new Response('Erro: ' + error.message, { status: 500 });

  const BOM = '﻿';
  const header = 'ID,Cliente,Contrato,Competência,Valor,Vencimento,Status,Nº NF,Data Pagamento\n';

  const rows = (data || []).map(p => {
    const cli = p.contratos?.clientes;
    const nome = cli?.apelido || cli?.nome || '';
    const venc = new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR');
    const dataPag = p.data_pagamento
      ? new Date(p.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')
      : '';
    return [
      p.id,
      csvQuote(nome),
      csvQuote(p.contratos?.titulo || ''),
      csvQuote(competencia(p)),
      Number(p.valor).toFixed(2).replace('.', ','),
      venc,
      p.status,
      csvQuote(p.nf_numero || ''),
      dataPag,
    ].join(',');
  }).join('\n');

  return new Response(BOM + header + rows, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="parcelas-ate-abril-2026.csv"',
    },
  });
}
