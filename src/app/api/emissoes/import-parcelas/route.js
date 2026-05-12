import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseDateBR(str) {
  if (!str) return null;
  const m = str.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return Response.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });

    const text = await file.text();
    // Remove BOM if present
    const clean = text.replace(/^﻿/, '');
    const lines = clean.split(/\r?\n/).slice(1).filter(l => l.trim());

    let atualizadas = 0;
    const erros = [];

    for (const line of lines) {
      const cols = parseCSVLine(line);
      // Columns: ID, Cliente, Contrato, Competência, Valor, Vencimento, Status, Nº NF, Data Pagamento
      const [id, , , , , , , nfNum, dataPag] = cols;
      if (!id || id.length < 10) continue;

      const updates = {};
      if (nfNum) updates.nf_numero = nfNum;
      if (dataPag) {
        const iso = parseDateBR(dataPag);
        if (iso) {
          updates.data_pagamento = iso;
          updates.status = 'Paga';
        }
      }

      if (Object.keys(updates).length === 0) continue;

      const { error } = await supabaseAdmin
        .from('parcelas')
        .update(updates)
        .eq('id', id);

      if (error) erros.push(`${id}: ${error.message}`);
      else atualizadas++;
    }

    return Response.json({ ok: true, atualizadas, erros });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
