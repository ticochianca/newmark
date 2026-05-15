import { createClient } from '@supabase/supabase-js';
import * as xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getMesPrestacao(p) {
  const isMesmoMes = p.contratos?.cobranca_mesmo_mes;
  const dataBase = p.data_original || p.data_vencimento;
  if (!dataBase) return '';
  const d = new Date(dataBase + 'T12:00:00');
  if (!isMesmoMes) d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toLocaleString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    .replace('. de ', '/').replace('.', '');
}

export async function POST(req) {
  try {
    const { parcela_ids } = await req.json();

    if (!parcela_ids || !parcela_ids.length) {
      return new Response(JSON.stringify({ error: 'Nenhuma parcela selecionada' }), { status: 400 });
    }

    // Fetch the parcels
    const { data: parcelas, error } = await supabaseAdmin
      .from('parcelas')
      .select('*, contratos(id, titulo, cobranca_mesmo_mes, clientes(id, nome, apelido, cnpj, email_cobranca, endereco, numero_endereco, complemento_endereco, bairro, cidade, estado, cep, telefone))')
      .in('id', parcela_ids)
      .order('data_vencimento');

    if (error) {
      throw error;
    }

    // Read the template
    const templatePath = path.join(process.cwd(), 'src', 'lib', 'Template_Inter.xlsx');
    const wb = xlsx.readFile(templatePath);
    const sheetName = 'Cobrança Simples'; // As we saw from previous logs
    const sheet = wb.Sheets[sheetName];
    
    // Convert to array of arrays
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // The template has headers on rows 0, 1, and 2. 
    // Row 3 is an example. We will keep rows 0, 1, 2 and replace everything from 3 onwards.
    const newRows = rows.slice(0, 3);

    // Append our data
    for (const p of parcelas) {
      const cli = p.contratos?.clientes || {};
      const cnpj = (cli.cnpj || '').replace(/\D/g, '');
      const vencDate = new Date(p.data_vencimento + 'T12:00:00');
      const vencStr = `${String(vencDate.getDate()).padStart(2, '0')}/${String(vencDate.getMonth()+1).padStart(2, '0')}/${vencDate.getFullYear()}`;

      const row = [
        cli.nome || cli.apelido || 'Cliente Não Identificado', // 0. Nome
        cnpj || '00000000000', // 1. CPF/CNPJ
        cli.email_cobranca || '', // 2. Email
        cli.telefone || '', // 3. Telefone
        cli.endereco || 'Não informado', // 4. Endereço
        cli.numero_endereco || 'S/N', // 5. Número
        cli.complemento_endereco || '', // 6. Complemento
        cli.bairro || 'Não informado', // 7. Bairro
        cli.cidade || 'Não informado', // 8. Cidade
        cli.estado || 'SP', // 9. Estado
        cli.cep || '00000000', // 10. CEP
        'Não', // 11. Beneficiário final
        '', // 12
        '', // 13
        'Sim', // 14. Boleto com PIX
        'Boleto', // 15. Forma de Pagamento
        Number(p.valor), // 16. Valor
        p.id, // 17. Código da cobrança
        `${p.contratos?.titulo || ''} - Comp: ${getMesPrestacao(p)}`, // 18. Descrição
        vencStr, // 19. Data Vencimento
        'Sim', // 20. Pagamento após vencimento
        30, // 21. Prazo limite pagamento
        'Não aplicar multa', // 22. Multa após venc.
        0, // 23. Multa
        'Não aplicar juros', // 24. Juros após venc.
        0, // 25. Juros
        'Não aplicar desconto', // 26. Desconto antecipação
        0, // 27. Desconto
        '', // 28. Prazo desconto
        'Não', // 29. NF
        '', '', '', '', '', '' // 30-35. NF Details
      ];
      newRows.push(row);
    }

    // Replace the sheet data
    const newSheet = xlsx.utils.aoa_to_sheet(newRows);
    wb.Sheets[sheetName] = newSheet;

    // Write back to buffer
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Cobranca_Lote_Inter.xlsx"'
      }
    });

  } catch (err) {
    console.error('Error generating Excel:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
