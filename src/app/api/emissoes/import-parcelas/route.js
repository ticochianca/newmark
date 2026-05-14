import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseCSVLine(line, sep) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

const PT_MONTHS = { jan:1, fev:2, mar:3, abr:4, mai:5, jun:6, jul:7, ago:8, set:9, out:10, nov:11, dez:12 };

function parseDateBR(str) {
  if (!str) return null;
  const s = str.trim();

  // Excel serial number (e.g. 45868)
  if (/^\d{5}$/.test(s)) {
    const serial = parseInt(s, 10);
    const d = new Date((serial - 25569) * 86400 * 1000);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dy = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${dy}`;
  }

  // Abbreviated: "27/abr" or "27/abr/2026"
  const abbrM = s.match(/^(\d{1,2})[\/\-]([a-záéíóúâêîôûãõç]{3})(?:[\/\-](\d{4}))?$/i);
  if (abbrM) {
    const day = abbrM[1].padStart(2, '0');
    const mon = PT_MONTHS[abbrM[2].toLowerCase()];
    if (mon) {
      const year = abbrM[3] || new Date().getUTCFullYear().toString();
      return `${year}-${String(mon).padStart(2, '0')}-${day}`;
    }
  }

  // Standard dd/mm/yyyy or dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
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
    const allLines = clean.split(/\r?\n/).filter(l => l.trim());
    // Detect separator from header line
    const sep = allLines[0]?.includes(';') ? ';' : ',';
    const lines = allLines.slice(1);

    let atualizadas = 0;
    const erros = [];

    for (const line of lines) {
      const cols = parseCSVLine(line, sep);
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
