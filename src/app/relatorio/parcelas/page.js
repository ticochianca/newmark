"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getPersonColor } from '@/lib/personColors';

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (v) => v != null
  ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : '—';
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

function getStatus(p) {
  if (['Paga', 'Reprogramada', 'Congelada'].includes(p.status)) return p.status;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return new Date(p.data_vencimento) < hoje ? 'Em atraso' : 'Pendente';
}

function getInitials(nome) {
  if (!nome) return '';
  const pts = nome.trim().split(' ').filter(Boolean);
  return pts.length === 1 ? pts[0][0].toUpperCase()
    : (pts[0][0] + pts[pts.length - 1][0]).toUpperCase();
}

function getMesPrestacaoShort(p) {
  const isMesmoMes = p.contratos?.cobranca_mesmo_mes;
  const base = p.data_original || p.data_vencimento;
  const d = new Date(base);
  if (!isMesmoMes) d.setUTCMonth(d.getUTCMonth() - 1);
  const mes = d.toLocaleString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '');
  return `${mes.charAt(0).toUpperCase() + mes.slice(1)}/${d.getUTCFullYear()}`;
}

function getActiveAllocations(p) {
  if (!p.contratos?.contrato_atendentes) return [];
  const isMesmoMes = p.contratos?.cobranca_mesmo_mes;
  const base = p.data_original || p.data_vencimento;
  const d = new Date(base);
  if (!isMesmoMes) d.setUTCMonth(d.getUTCMonth() - 1);
  const pDate = d.toISOString().split('T')[0];
  return p.contratos.contrato_atendentes.filter(r =>
    (!r.data_inicio || pDate >= r.data_inicio) && (!r.data_fim || pDate <= r.data_fim)
  );
}

// "YYYY-MM-DD" → "YYYY-MM"  (fallback: use vencimento if pagamento is null)
const toMK = (dateStr) => dateStr ? dateStr.slice(0, 7) : null;
const paidMK = (p) => toMK(p.data_pagamento || p.data_vencimento);

function monthLabel(mk) {
  const [y, m] = mk.split('-');
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  const mes = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
  return `${mes.charAt(0).toUpperCase() + mes.slice(1)}/${y}`;
}

function monthsInRange(startDate, endDate) {
  if (!startDate || !endDate) return [];
  let [sy, sm] = startDate.slice(0, 7).split('-').map(Number);
  const [ey, em] = endDate.slice(0, 7).split('-').map(Number);
  const result = [];
  while (sy < ey || (sy === ey && sm <= em)) {
    result.push(`${sy}-${String(sm).padStart(2, '0')}`);
    if (++sm > 12) { sm = 1; sy++; }
  }
  return result;
}

// ─── main component ──────────────────────────────────────────────────────────

function RelatorioParcelas() {
  const sp = useSearchParams();
  const de = sp.get('de') || '';
  const ate = sp.get('ate') || '';
  const cliente = sp.get('cliente') || '';
  const comAlocacao = sp.get('alocacao') === '1';

  const [parcelas, setParcelas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usuario, setUsuario] = useState('');

  const [filtDe, setFiltDe] = useState(de);
  const [filtAte, setFiltAte] = useState(ate);
  const [filtCliente, setFiltCliente] = useState(cliente);
  const [filtAlocacao, setFiltAlocacao] = useState(comAlocacao);
  const [gen, setGen] = useState({ de, ate, cliente, alocacao: comAlocacao });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return; }
      setUsuario(session.user.email);
    });
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const start = gen.de  || `${new Date().getFullYear()}-01-01`;
    const end   = gen.ate || `${new Date().getFullYear()}-12-31`;

    const { data, error } = await supabase
      .from('parcelas')
      .select('*, contratos(id, titulo, cobranca_mesmo_mes, clientes(nome, apelido), contrato_atendentes(*, profiles(nome)))')
      .eq('status', 'Paga')
      .gte('data_pagamento', start)
      .lte('data_pagamento', end)
      .order('data_pagamento', { ascending: true });

    if (error) { console.error(error); setLoading(false); return; }

    let filtered = (data || []).filter(p => !p.status?.includes('ghost'));
    if (gen.cliente) {
      const t = gen.cliente.toLowerCase();
      filtered = filtered.filter(p => {
        const n = (p.contratos?.clientes?.nome || '').toLowerCase();
        const a = (p.contratos?.clientes?.apelido || '').toLowerCase();
        return n.includes(t) || a.includes(t);
      });
    }
    setParcelas(filtered);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [gen]);

  // ── Build pivot ────────────────────────────────────────────────────────────

  const rangeStart = gen.de  || `${new Date().getFullYear()}-01-01`;
  const rangeEnd   = gen.ate || `${new Date().getFullYear()}-12-31`;

  // Only paid parcelas drive the pivot
  const paidParcelas = parcelas.filter(p => getStatus(p) === 'Paga');

  // Months: range + any extra months from paid payments
  const paidMKs = new Set(paidParcelas.map(p => paidMK(p)).filter(Boolean));
  const months = Array.from(new Set([...monthsInRange(rangeStart, rangeEnd), ...paidMKs])).sort();

  // Rows: one per (cliente, contrato)
  // rowKey = contratoId to keep uniqueness; display = clienteName + contratoTitulo
  const rowMap = {}; // contratoId → { clienteName, contratoTitulo, months: { mk → parcela[] } }
  paidParcelas.forEach(p => {
    const contratoId = p.contratos?.id || p.contrato_id || 'sem-contrato';
    if (!rowMap[contratoId]) {
      rowMap[contratoId] = {
        contratoId,
        clienteName: p.contratos?.clientes?.apelido || p.contratos?.clientes?.nome || 'Sem cliente',
        contratoTitulo: p.contratos?.titulo || 'Sem título',
        months: {},
      };
    }
    const mk = paidMK(p);
    if (!mk) return;
    if (!rowMap[contratoId].months[mk]) rowMap[contratoId].months[mk] = [];
    rowMap[contratoId].months[mk].push(p);
  });

  const rows = Object.values(rowMap).sort((a, b) => {
    const c = a.clienteName.localeCompare(b.clienteName, 'pt-BR');
    return c !== 0 ? c : a.contratoTitulo.localeCompare(b.contratoTitulo, 'pt-BR');
  });

  // Column totals (paid only, all rows)
  const colTotals = Object.fromEntries(months.map(mk => [mk, 0]));
  const colPersonTotals = Object.fromEntries(months.map(mk => [mk, {}]));

  paidParcelas.forEach(p => {
    const mk = paidMK(p);
    if (!mk) return;
    if (colTotals[mk] === undefined) colTotals[mk] = 0;
    colTotals[mk] += Number(p.valor);
    if (gen.alocacao) {
      if (!colPersonTotals[mk]) colPersonTotals[mk] = {};
      getActiveAllocations(p).forEach(a => {
        const inits = getInitials(a.profiles?.nome);
        if (!colPersonTotals[mk][inits]) colPersonTotals[mk][inits] = 0;
        colPersonTotals[mk][inits] += (Number(p.valor) * Number(a.percentual)) / 100;
      });
    }
  });

  // Grand total: direct sum (matches ParcelasModule "Total Recebido")
  const grandTotal = paidParcelas.reduce((s, p) => s + Number(p.valor), 0);

  const labelPeriodo = gen.de || gen.ate
    ? `${gen.de ? fmtDate(gen.de) : '—'} a ${gen.ate ? fmtDate(gen.ate) : '—'}`
    : 'Ano corrente';

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1e293b; background: #fff; }

        .controls {
          display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
          background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 12px 20px;
        }
        .controls input { border: 1px solid #cbd5e1; border-radius: 5px; padding: 5px 8px; font-size: 12px; color: #334155; background: #fff; }
        .controls label { font-size: 12px; font-weight: 600; color: #64748b; }
        .btn-print { margin-left: auto; background: #0f172a; color: #fff; border: none; border-radius: 6px; padding: 8px 20px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .btn-apply { background: #1d4ed8; color: #fff; border: none; border-radius: 6px; padding: 7px 16px; font-size: 12px; font-weight: 600; cursor: pointer; }

        .report { padding: 20px 24px; max-width: 900px; margin: 0 auto; }
        .report-header { margin-bottom: 14px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
        .report-header h1 { font-size: 16px; font-weight: 700; color: #0f172a; }
        .report-meta { display: flex; gap: 16px; margin-top: 5px; font-size: 11px; color: #64748b; flex-wrap: wrap; }
        .report-meta strong { color: #334155; }

        .pivot-wrap { overflow-x: auto; }

        table { border-collapse: collapse; width: 100%; font-size: 11px; }

        th {
          background: #0f172a; color: #fff; padding: 7px 8px;
          text-align: center; font-size: 10px; font-weight: 700;
          white-space: nowrap; border: 1px solid #1e3a5f;
        }
        th.th-client { text-align: left; min-width: 150px; position: sticky; left: 0; z-index: 2; }
        th.th-grand  { background: #1e3a5f; border-left: 2px solid #60a5fa; white-space: nowrap; }

        td { border: 1px solid #e2e8f0; padding: 5px 7px; vertical-align: top; }

        td.td-client {
          background: #f8fafc; position: sticky; left: 0; z-index: 1;
          border-right: 2px solid #cbd5e1; min-width: 150px;
        }
        tr:nth-child(even) td.td-client { background: #f1f5f9; }
        .client-name     { font-weight: 700; font-size: 11px; color: #0f172a; display: block; }
        .contrato-name   { font-size: 10px; color: #64748b; display: block; }

        td.cell-paid  { background: #f0fdf4; }
        td.cell-empty { text-align: center; color: #e2e8f0; vertical-align: middle !important; font-size: 11px; }

        .cell-amount { font-weight: 700; font-size: 11px; color: #0f172a; line-height: 1.3; }
        .cell-comp   { font-size: 9px; color: #64748b; margin-top: 2px; }
        .cell-allocs { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 3px; }
        .cell-tag    { font-size: 8px; font-weight: 700; padding: 1px 3px; border-radius: 3px; border: 1px solid; white-space: nowrap; }

        td.td-grand {
          background: #1e3a5f; color: #fff; font-weight: 700; font-size: 11px;
          text-align: center; vertical-align: middle;
          border-left: 2px solid #60a5fa; white-space: nowrap;
        }

        tr.total-row td {
          background: #0f172a; color: #fff; font-weight: 700; font-size: 10px;
          padding: 7px 8px; text-align: center; border: 1px solid #1e3a5f;
          vertical-align: top;
        }
        tr.total-row td.td-client {
          background: #0f172a !important; color: #fff; text-align: left;
          font-size: 11px; position: sticky; left: 0;
        }
        tr.total-row td.td-grand {
          background: #1d4ed8; font-size: 12px; vertical-align: middle;
          border-left: 2px solid #60a5fa;
        }
        .total-alloc { font-size: 8px; font-weight: 700; color: #93c5fd; margin-top: 2px; }

        .no-data { text-align: center; padding: 48px 0; color: #94a3b8; font-size: 14px; }
        .loading  { display: flex; align-items: center; justify-content: center; height: 300px; font-size: 14px; color: #64748b; }

        @media print {
          .controls { display: none !important; }
          body { font-size: 9px; }
          .report { padding: 8px 10px; max-width: 100%; margin: 0; }
          th { font-size: 8px; padding: 4px 5px; }
          td { padding: 3px 4px; }
          td.td-client, th.th-client { position: static; min-width: 0; }
          .client-name   { font-size: 9px; }
          .contrato-name { font-size: 8px; }
          .cell-amount   { font-size: 9px; }
          .cell-comp     { font-size: 8px; }
          .cell-tag      { font-size: 7px; }
          @page { margin: 1cm; size: A4 portrait; }
        }
      `}</style>

      {/* Controls */}
      <div className="controls">
        <label>De:</label>
        <input type="date" value={filtDe} onChange={e => setFiltDe(e.target.value)} />
        <label>Até:</label>
        <input type="date" value={filtAte} onChange={e => setFiltAte(e.target.value)} />
        <label>Cliente:</label>
        <input type="text" placeholder="Filtrar…" value={filtCliente} onChange={e => setFiltCliente(e.target.value)} style={{ width: 130 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <input type="checkbox" checked={filtAlocacao} onChange={e => setFiltAlocacao(e.target.checked)} />
          Mostrar Alocação
        </label>
        <button className="btn-apply" onClick={() => setGen({ de: filtDe, ate: filtAte, cliente: filtCliente, alocacao: filtAlocacao })}>
          Gerar
        </button>
        <button className="btn-print" onClick={() => window.print()}>🖨 Imprimir / Salvar PDF</button>
      </div>

      {loading ? (
        <div className="loading">Carregando dados…</div>
      ) : (
        <div className="report">
          <div className="report-header">
            <h1>Relatório de Recebimentos — Newmark</h1>
            <div className="report-meta">
              <span>Período: <strong>{labelPeriodo}</strong></span>
              {gen.cliente && <span>Cliente: <strong>{gen.cliente}</strong></span>}
              <span>Emitido em: <strong>{new Date().toLocaleString('pt-BR')}</strong></span>
              {usuario && <span>Usuário: <strong>{usuario}</strong></span>}
            </div>
          </div>

          <div className="pivot-wrap">
            {rows.length === 0 ? (
              <div className="no-data">Nenhum recebimento encontrado para o período.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th className="th-client">Cliente / Contrato</th>
                    {months.map(mk => <th key={mk}>{monthLabel(mk)}</th>)}
                    <th className="th-grand">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const rowTotal = months.reduce((s, mk) => {
                      return s + (row.months[mk] || []).reduce((a, p) => a + Number(p.valor), 0);
                    }, 0);

                    return (
                      <tr key={row.contratoId}>
                        <td className="td-client">
                          <span className="client-name">{row.clienteName}</span>
                          <span className="contrato-name">{row.contratoTitulo}</span>
                        </td>

                        {months.map(mk => {
                          const parcs = row.months[mk] || [];
                          if (parcs.length === 0) return <td key={mk} className="cell-empty">—</td>;

                          const total = parcs.reduce((s, p) => s + Number(p.valor), 0);
                          const comps = [...new Set(parcs.map(p => getMesPrestacaoShort(p)))].join(', ');

                          // Per-person allocation
                          const personAllocs = {};
                          if (gen.alocacao) {
                            parcs.forEach(p => {
                              getActiveAllocations(p).forEach(a => {
                                const inits = getInitials(a.profiles?.nome);
                                if (!personAllocs[inits]) personAllocs[inits] = { value: 0, color: getPersonColor(inits) };
                                personAllocs[inits].value += (Number(p.valor) * Number(a.percentual)) / 100;
                              });
                            });
                          }

                          return (
                            <td key={mk} className="cell-paid">
                              <div className="cell-amount">R$ {fmt(total)}</div>
                              <div className="cell-comp">{comps}</div>
                              {gen.alocacao && Object.keys(personAllocs).length > 0 && (
                                <div className="cell-allocs">
                                  {Object.entries(personAllocs).map(([inits, { value, color }]) => (
                                    <span key={inits} className="cell-tag"
                                      style={{ background: color.bg, color: color.text, borderColor: color.border }}>
                                      {inits} {fmt(value)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}

                        <td className="td-grand">R$ {fmt(rowTotal)}</td>
                      </tr>
                    );
                  })}

                  {/* Totals row */}
                  <tr className="total-row">
                    <td className="td-client">TOTAL RECEBIDO</td>
                    {months.map(mk => {
                      const total = colTotals[mk] || 0;
                      const personEntries = Object.entries(colPersonTotals[mk] || {}).sort((a, b) => b[1] - a[1]);
                      return (
                        <td key={mk}>
                          <div>{total > 0 ? `R$ ${fmt(total)}` : '—'}</div>
                          {gen.alocacao && personEntries.map(([inits, val]) => (
                            <div key={inits} className="total-alloc">{inits}: {fmt(val)}</div>
                          ))}
                        </td>
                      );
                    })}
                    <td className="td-grand">R$ {fmt(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: 14, color: '#64748b' }}>Carregando…</div>}>
      <RelatorioParcelas />
    </Suspense>
  );
}
