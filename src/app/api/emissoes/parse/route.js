import pdfParse from 'pdf-parse/lib/pdf-parse.js';

// Returns the value on the next non-empty line after a line matching labelRe
function nextLineAfter(lines, labelRe, startIdx = 0) {
  for (let i = startIdx; i < lines.length - 1; i++) {
    if (labelRe.test(lines[i].trim())) {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const val = lines[j].trim();
        if (val) return { value: val, foundAt: i };
      }
    }
  }
  return null;
}

// Collects up to maxLines non-empty lines after a label, stopping at known section headers
function collectAfterLabel(lines, labelRe, startIdx = 0, maxLines = 8) {
  for (let i = startIdx; i < lines.length - 1; i++) {
    if (!labelRe.test(lines[i].trim())) continue;
    const collected = [];
    for (let j = i + 1; j < lines.length && collected.length < maxLines; j++) {
      const val = lines[j].trim();
      if (!val) continue;
      // Stop at known section boundaries (handles both spaced and space-stripped forms)
      if (/^(TRIBUTA|DEDU[ÇC]|BC\s*ISSQN|Al[ií]quota|Tipo\s*de\s*Imunidade|Opera[çc]|Simples\s*Nacional|Regime|PRESTADOR|TOMADOR|Valor\s*do\s*Servi|ValordoServi|C[óo]digo\s*de\s*Tributa)/i.test(val)) break;
      collected.push(val);
    }
    if (collected.length > 0) return collected.join(' ');
  }
  return null;
}

// ─── NF ────────────────────────────────────────────────────────────────────────
// NOTE: pdf-parse strips spaces from this PDF family, so all patterns use \s*

function extractNFNumero(lines) {
  // "NúmerodaNFS-e" (spaces stripped) or "Número da NFS-e" (normal)
  const res = nextLineAfter(lines, /n[úu]mero\s*da\s*NFS?-?e/i);
  if (res) {
    const m = res.value.match(/^(\d+)/);
    if (m) return m[1];
  }
  // Inline fallback
  for (const line of lines) {
    const m = line.match(/n[úu]mero\s*da\s*NFS?-?e[\s:]*(\d+)/i);
    if (m) return m[1];
  }
  return null;
}

function extractNFCliente(lines) {
  // Find TOMADOR section — may appear as "TOMADORDOSERVIÇO" (municipal NFS-e,
  // spaces stripped) or "TOMADOR/ADQUIRENTE" (NFS-e Nacional / DANFSe v2.0)
  let tomadorIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/TOMADOR\s*(?:DO\s*SERVI[ÇC]O|[\/\\]\s*ADQUIRENTE)/i.test(lines[i].trim())) {
      tomadorIdx = i;
      break;
    }
  }

  const searchFrom = tomadorIdx >= 0 ? tomadorIdx : 0;

  // "Nome/ NomeEmpresarial" or "Nome / Nome Empresarial" (spaces stripped between words)
  const res = nextLineAfter(lines, /nome\s*[\/|]\s*nome\s*empresarial/i, searchFrom)
    || nextLineAfter(lines, /nome\s*empresarial/i, searchFrom)
    || nextLineAfter(lines, /raz[aã]o\s*social/i, searchFrom);

  if (res?.value && res.value.length > 2 && !/^\d{2}[\.\-]/.test(res.value)) return res.value;

  // Fallback: skip first occurrence (emitente) when no TOMADOR section found
  if (tomadorIdx < 0) {
    let skip = 0;
    for (let i = 0; i < lines.length - 1; i++) {
      if (/nome\s*[\/|]\s*nome\s*empresarial/i.test(lines[i].trim())) {
        if (skip === 0) { skip++; continue; }
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const val = lines[j].trim();
          if (val && val.length > 2) return val;
        }
      }
    }
  }
  return null;
}

function extractNFDescricao(lines) {
  // "DescriçãodoServiço" or "Descrição do Serviço"
  return collectAfterLabel(lines, /descri[çc][aã]o\s*do\s*servi[çc]o/i)
    || collectAfterLabel(lines, /discrimina[çc][aã]o\s*dos\s*servi[çc]os?/i)
    || null;
}

function extractNFRetencaoISSQN(lines) {
  const parseM = (str) => { if (!str) return null; const m = str.match(/R?\$?\s*([\d.]+,\d{2})/); return m ? m[1] : null; };
  // "ISSQN Retido" / "Retenção do ISSQN" / "Retido pelo Tomador" — value on next line or same line
  const res = nextLineAfter(lines, /ISSQN\s*Retid[ao]/i)
    || nextLineAfter(lines, /Reten[çc][aã]o\s*do\s*ISSQN/i)
    || nextLineAfter(lines, /ISSQN\s*retido\s*pelo\s*tomador/i);
  if (res?.value) { const p = parseM(res.value); if (p) return p; }
  for (const line of lines) {
    if (/ISSQN\s*Retid[ao]/i.test(line) || /Reten[çc][aã]o\s*do\s*ISSQN/i.test(line)) {
      const p = parseM(line); if (p) return p;
    }
  }
  return null;
}

function extractNFValorLiquido(lines) {
  const parseM = (str) => { if (!str) return null; const m = str.match(/R?\$?\s*([\d.]+,\d{2})/); return m ? m[1] : null; };
  const res = nextLineAfter(lines, /valor\s*l[íi]quido\s*da\s*NFS?-?e/i)
    || nextLineAfter(lines, /valor\s*l[íi]quido/i);
  if (res?.value) { const p = parseM(res.value); if (p) return p; }
  for (const line of lines) {
    if (/valor\s*l[íi]quido/i.test(line)) { const p = parseM(line); if (p) return p; }
  }
  return null;
}

function extractNFValor(lines) {
  const parseMonetary = (str) => {
    if (!str) return null;
    const m = str.match(/R?\$?\s*([\d.]+,\d{2})/);
    if (m) return m[1];
    const m2 = str.match(/R?\$?\s*([\d]+\.\d{2})/);
    if (m2) return m2[1];
    return null;
  };

  // "ValordoServiço" (municipal) or "ValordaOperação/Serviço" (NFS-e Nacional / DANFSe)
  const res = nextLineAfter(lines, /valor\s*da\s*opera[çc][aã]o(?:\s*\/\s*servi[çc]o)?/i)
    || nextLineAfter(lines, /valor\s*do\s*servi[çc]o/i)
    || nextLineAfter(lines, /valor\s*total\s*dos\s*servi[çc]os?/i)
    || nextLineAfter(lines, /valor\s*total/i);

  if (res?.value) {
    const parsed = parseMonetary(res.value);
    if (parsed) return parsed;
  }

  // Inline fallback
  for (const line of lines) {
    if (/valor\s*da\s*opera[çc][aã]o/i.test(line) || /valor\s*do\s*servi[çc]o/i.test(line)) {
      const parsed = parseMonetary(line);
      if (parsed) return parsed;
    }
  }
  return null;
}

// ─── Boleto Inter ─────────────────────────────────────────────────────────────

function extractBoletoPagador(lines) {
  const res = nextLineAfter(lines, /^pagador$/i) || nextLineAfter(lines, /^sacado$/i);
  if (res?.value && res.value.length > 2 && !/^\d{3}\.\d{3}/.test(res.value)) return res.value;

  for (const line of lines) {
    const m = line.match(/pagador[:\s]+(.+)/i) || line.match(/sacado[:\s]+(.+)/i);
    if (m) {
      const val = m[1].trim();
      if (val.length > 2 && !/^\d{3}\.\d{3}/.test(val)) return val;
    }
  }
  return null;
}

function extractBoletoNumeroDoc(lines) {
  const res = nextLineAfter(lines, /n[oº°]?\s*do\s+documento/i)
    || nextLineAfter(lines, /n[uú]mero\s+do\s+documento/i)
    || nextLineAfter(lines, /nosso\s+n[uú]mero/i);
  if (res?.value) return res.value.replace(/\s/g, '');

  for (const line of lines) {
    const m = line.match(/(?:n[oº°]?\s*do\s+documento|n[uú]mero\s+do\s+documento|nosso\s+n[uú]mero)[:\s]+([^\s]+)/i);
    if (m) return m[1].trim();
  }
  return null;
}

function extractBoletoVencimento(lines) {
  const toISO = (str) => {
    if (!str) return null;
    const m = str.match(/(\d{2})[\/\.](\d{2})[\/\.](\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  };

  const res = nextLineAfter(lines, /^vencimento$/i) || nextLineAfter(lines, /data\s+de\s+vencimento/i);
  if (res?.value) {
    const iso = toISO(res.value);
    if (iso) return iso;
  }

  for (let i = 0; i < lines.length; i++) {
    if (/vencimento/i.test(lines[i])) {
      const iso = toISO(lines[i]) || toISO(lines[i + 1] || '');
      if (iso) return iso;
    }
  }
  return null;
}

function extractBoletoValor(lines) {
  const res = nextLineAfter(lines, /^valor\s+do\s+documento$/i)
    || nextLineAfter(lines, /^valor$/i);
  if (res?.value) {
    const m = res.value.match(/R?\$?\s*([\d.]+,\d{2})/);
    if (m) return m[1];
  }
  return null;
}

// ─── Endereço do Tomador (NFS-e Nacional) ────────────────────────────────────

function extractNFTomador(lines) {
  let tomadorIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/TOMADOR\s*(?:DO\s*SERVI[ÇC]O|[\/\\]\s*ADQUIRENTE)/i.test(lines[i].trim())) { tomadorIdx = i; break; }
  }
  if (tomadorIdx < 0) return {};

  const result = {};

  // Endereço — pode vir como "Rua X, 123" ou em campos separados
  const endRes = nextLineAfter(lines, /^endere[çc]o(?:\s*completo)?$/i, tomadorIdx);
  if (endRes?.value) {
    const m = endRes.value.match(/^(.+?),?\s*n[°º]?\s*\.?\s*(\d{1,6}[A-Za-z]?)\s*$/i)
      || endRes.value.match(/^(.+?)[,\s]+(\d{1,6})$/);
    if (m) { result.endereco = m[1].trim(); result.numero = m[2].trim(); }
    else result.endereco = endRes.value;
  }

  // Número separado (caso não tenha vindo junto com o endereço)
  if (!result.numero) {
    const nRes = nextLineAfter(lines, /^n[úu]mero$|^n[°º]$/i, tomadorIdx);
    if (nRes?.value && /^\d/.test(nRes.value)) result.numero = nRes.value.trim();
  }

  // Complemento
  const cmpRes = nextLineAfter(lines, /^complemento$/i, tomadorIdx);
  if (cmpRes?.value) result.complemento = cmpRes.value;

  // Bairro
  const bRes = nextLineAfter(lines, /^bairro(?:\s*[\/\\]\s*distrito)?$/i, tomadorIdx);
  if (bRes?.value && !/^\d{5}/.test(bRes.value)) result.bairro = bRes.value;

  // Cidade (Município)
  const cidRes = nextLineAfter(lines, /^munic[íi]pio$/i, tomadorIdx)
    || nextLineAfter(lines, /^cidade$/i, tomadorIdx);
  if (cidRes?.value) result.cidade = cidRes.value;

  // Estado (UF)
  const ufRes = nextLineAfter(lines, /^UF$/i, tomadorIdx);
  if (ufRes?.value && /^[A-Z]{2}$/.test(ufRes.value.trim())) result.estado = ufRes.value.trim();

  // CEP
  const cepRes = nextLineAfter(lines, /^CEP$/i, tomadorIdx);
  if (cepRes?.value) {
    const m = cepRes.value.match(/(\d{5})[-\s]?(\d{3})/);
    if (m) result.cep = m[1] + m[2];
  }
  if (!result.cep) {
    for (let i = tomadorIdx; i < Math.min(tomadorIdx + 40, lines.length); i++) {
      const m = lines[i].match(/\b(\d{5})[-\s]?(\d{3})\b/);
      if (m) { result.cep = m[1] + m[2]; break; }
    }
  }

  // CNPJ do tomador — label "CPF/CNPJ" (municipal) ou "CNPJ/CPF/NIF" (NFS-e Nacional)
  const cnpjRes = nextLineAfter(lines, /^(?:CPF|CNPJ)\s*[\/\\]?\s*(?:CPF|CNPJ)(?:\s*[\/\\]?\s*NIF)?$/i, tomadorIdx);
  if (cnpjRes?.value) {
    const digits = cnpjRes.value.replace(/\D/g, '');
    if (digits.length === 14 || digits.length === 11) result.cnpj = digits;
  }

  // Telefone
  const telRes = nextLineAfter(lines, /^telefone$|^fone$/i, tomadorIdx);
  if (telRes?.value && telRes.value.replace(/\D/g, '').length >= 8) result.telefone = telRes.value;

  return result;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const tipo = formData.get('tipo');

    if (!file || !tipo) {
      return Response.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { text } = await pdfParse(buffer);

    // NFC normalization handles PDFs that encode accented chars as base+combining
    const lines = text.split(/\r?\n/).map(l => l.normalize('NFC'));

    if (tipo === 'nf') {
      const tomador = extractNFTomador(lines);
      const result = {
        numero:         extractNFNumero(lines),
        cliente:        extractNFCliente(lines),
        descricao:      extractNFDescricao(lines),
        valor:          extractNFValor(lines),
        retencao_issqn: extractNFRetencaoISSQN(lines),
        valor_liquido:  extractNFValorLiquido(lines),
        ...tomador,
      };
      // Include raw lines for diagnosis when nothing was found
      if (!result.numero && !result.cliente && !result.descricao) {
        result._debug = lines.slice(0, 80).filter(l => l.trim());
      }
      return Response.json(result);
    } else {
      return Response.json({
        pagador:         extractBoletoPagador(lines),
        numeroDocumento: extractBoletoNumeroDoc(lines),
        vencimento:      extractBoletoVencimento(lines),
        valor:           extractBoletoValor(lines),
      });
    }
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
