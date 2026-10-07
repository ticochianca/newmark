"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// ─── helpers ────────────────────────────────────────────────────────────────

const fmtR$ = (v) => `R$ ${Math.round(v || 0).toLocaleString('pt-BR')}`;
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

const getQuarterKey = (dateStr) => {
  const [y, m] = dateStr.split('-').map(Number);
  return `${y}-Q${Math.ceil(m / 3)}`;
};
const quarterLabel = (key) => {
  const [y, q] = key.split('-Q');
  return `T${q}/${y.slice(2)}`;
};

const getVariacao = (atual, anterior) => {
  if (atual == null || !anterior) return null;
  const pct = ((atual - anterior) / anterior) * 100;
  if (Math.abs(pct) < 0.5) return { dir: 'flat', pct };
  return { dir: pct > 0 ? 'up' : 'down', pct };
};

// ─── main component ──────────────────────────────────────────────────────────

function RelatorioTrimestral() {
  const sp = useSearchParams();
  const de = sp.get('de') || '';
  const ate = sp.get('ate') || '';
  const cliente = sp.get('cliente') || '';

  const [parcelas, setParcelas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usuario, setUsuario] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return; }
      setUsuario(session.user.email);
    });
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('parcelas')
        .select('valor, data_pagamento, data_antecipacao, contratos(clientes(nome, apelido))')
        .eq('status', 'Paga')
        .not('data_pagamento', 'is', null)
        .order('data_pagamento', { ascending: true });

      if (error) { console.error(error); setLoading(false); return; }

      // data_antecipacao, quando preenchida, substitui data_pagamento só para fins de agrupamento
      let filtered = (data || []).map(p => ({ ...p, _data: p.data_antecipacao || p.data_pagamento }));
      if (de) filtered = filtered.filter(p => p._data >= de);
      if (ate) filtered = filtered.filter(p => p._data <= ate);
      if (cliente) {
        const t = cliente.toLowerCase();
        filtered = filtered.filter(p => {
          const n = (p.contratos?.clientes?.nome || '').toLowerCase();
          const a = (p.contratos?.clientes?.apelido || '').toLowerCase();
          return n.includes(t) || a.includes(t);
        });
      }
      setParcelas(filtered);
      setLoading(false);
    };
    fetchData();
  }, [de, ate, cliente]);

  // ── Build pivot ────────────────────────────────────────────────────────────

  const trimestres = Array.from(new Set(parcelas.map(p => getQuarterKey(p._data)))).sort();

  const clientesTrimestre = {}; // nome do cliente → { trimestreKey: totalRecebido }
  parcelas.forEach(p => {
    const nome = p.contratos?.clientes?.apelido || p.contratos?.clientes?.nome || 'Sem cliente';
    const qk = getQuarterKey(p._data);
    if (!clientesTrimestre[nome]) clientesTrimestre[nome] = {};
    clientesTrimestre[nome][qk] = (clientesTrimestre[nome][qk] || 0) + Number(p.valor || 0);
  });
  const clientesOrdenados = Object.keys(clientesTrimestre).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const totaisTrimestre = {};
  parcelas.forEach(p => {
    const qk = getQuarterKey(p._data);
    totaisTrimestre[qk] = (totaisTrimestre[qk] || 0) + Number(p.valor || 0);
  });

  const grandTotal = Object.values(totaisTrimestre).reduce((s, v) => s + v, 0);

  const labelPeriodo = de || ate
    ? `${de ? fmtDate(de) : '—'} a ${ate ? fmtDate(ate) : '—'}`
    : 'Todo o histórico';

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; -webkit-font-smoothing: antialiased; }

        .controls {
          display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
          background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 12px 20px;
        }
        .btn-print { margin-left: auto; background: #0f172a; color: #fff; border: none; border-radius: 6px; padding: 8px 20px; font-size: 13px; font-weight: 600; cursor: pointer; }

        .report { padding: 28px 32px; max-width: 900px; margin: 0 auto; }
        .report-header { margin-bottom: 20px; border-bottom: 2px solid #0f172a; padding-bottom: 12px; }
        .report-header h1 { font-size: 18px; font-weight: 700; color: #0f172a; letter-spacing: -0.01em; }
        .report-meta { display: flex; gap: 18px; margin-top: 6px; font-size: 11px; color: #64748b; flex-wrap: wrap; }
        .report-meta strong { color: #334155; font-weight: 600; }

        .pivot-wrap { overflow-x: auto; }

        table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }

        thead th {
          background: #0f172a; color: #fff; padding: 10px 14px;
          text-align: right; font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
          white-space: nowrap; border-bottom: 2px solid #1e3a5f;
        }
        th.th-client { text-align: left; min-width: 160px; position: sticky; left: 0; z-index: 2; }
        th.th-grand  { background: #1e3a5f; border-left: 2px solid #3b82f6; }

        tbody td {
          padding: 9px 14px; text-align: right; white-space: nowrap;
          font-size: 11px; color: #1e293b; border-bottom: 1px solid #eef2f7;
        }
        tbody tr:nth-child(even) { background: #f8fafc; }

        td.td-client {
          text-align: left; font-weight: 700; color: #0f172a;
          position: sticky; left: 0; background: #fff; z-index: 1;
          border-right: 1px solid #e2e8f0;
        }
        tbody tr:nth-child(even) td.td-client { background: #f8fafc; }

        td.cell-empty { text-align: center; color: #cbd5e1; }
        .cell-amount { font-weight: 600; }
        .cell-trend  { font-size: 9px; font-weight: 700; letter-spacing: 0.01em; margin-top: 2px; }
        .trend-up   { color: #059669; }
        .trend-down { color: #dc2626; }

        td.td-grand {
          background: #eff6ff; font-weight: 700; color: #0f172a;
          border-left: 2px solid #bfdbfe;
        }

        tr.total-row td {
          background: #0f172a; color: #fff; font-weight: 700; font-size: 11px;
          padding: 11px 14px; border-bottom: none;
        }
        tr.total-row td.td-client { text-align: left; background: #0f172a; }
        tr.total-row td.td-grand {
          background: #1d4ed8; font-size: 12.5px;
          border-left: 2px solid #60a5fa;
        }
        tr.total-row .trend-up   { color: #4ade80; }
        tr.total-row .trend-down { color: #f87171; }

        .no-data { text-align: center; padding: 48px 0; color: #94a3b8; font-size: 14px; }
        .loading  { display: flex; align-items: center; justify-content: center; height: 300px; font-size: 14px; color: #64748b; }

        @media print {
          .controls { display: none !important; }
          .report { padding: 10px 14px; max-width: 100%; margin: 0; }
          .report-header h1 { font-size: 14px; }
          .report-meta { font-size: 9px; }
          thead th { font-size: 8px; padding: 7px 10px; }
          tbody td { font-size: 9.5px; padding: 6px 10px; }
          .cell-trend { font-size: 8px; }
          tr.total-row td { font-size: 9.5px; padding: 8px 10px; }
          tr.total-row td.td-grand { font-size: 11px; }
          td.td-client, th.th-client { position: static; min-width: 0; }
          @page { margin: 1.4cm; size: A4 portrait; }
        }
      `}</style>

      <div className="controls">
        <span style={{ fontSize: 12, color: '#64748b' }}>Relatório gerado a partir dos filtros da tela de Parcelas.</span>
        <button className="btn-print" onClick={() => window.print()}>🖨 Imprimir / Salvar PDF</button>
      </div>

      {loading ? (
        <div className="loading">Carregando dados…</div>
      ) : (
        <div className="report">
          <div className="report-header">
            <h1>Comparativo Trimestral de Recebimentos — Newmark</h1>
            <div className="report-meta">
              <span>Período: <strong>{labelPeriodo}</strong></span>
              {cliente && <span>Cliente: <strong>{cliente}</strong></span>}
              <span>Emitido em: <strong>{new Date().toLocaleString('pt-BR')}</strong></span>
              {usuario && <span>Usuário: <strong>{usuario}</strong></span>}
            </div>
          </div>

          <div className="pivot-wrap">
            {clientesOrdenados.length === 0 ? (
              <div className="no-data">Nenhum recebimento encontrado para o período.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th className="th-client">Cliente</th>
                    {trimestres.map(qk => <th key={qk}>{quarterLabel(qk)}</th>)}
                    <th className="th-grand">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesOrdenados.map(nome => {
                    const porTrimestre = clientesTrimestre[nome];
                    const totalCliente = Object.values(porTrimestre).reduce((s, v) => s + v, 0);
                    return (
                      <tr key={nome}>
                        <td className="td-client">{nome}</td>
                        {trimestres.map((qk, idx) => {
                          const valor = porTrimestre[qk];
                          const anteriorQk = idx > 0 ? trimestres[idx - 1] : null;
                          const v = anteriorQk ? getVariacao(valor, porTrimestre[anteriorQk]) : null;
                          if (valor == null) return <td key={qk} className="cell-empty">—</td>;
                          return (
                            <td key={qk}>
                              <div className="cell-amount">{fmtR$(valor)}</div>
                              {v && v.dir !== 'flat' && (
                                <div className={`cell-trend trend-${v.dir}`}>
                                  {v.dir === 'up' ? '▲' : '▼'} {Math.abs(v.pct).toFixed(0)}%
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="td-grand">{fmtR$(totalCliente)}</td>
                      </tr>
                    );
                  })}

                  <tr className="total-row">
                    <td className="td-client">TOTAL</td>
                    {trimestres.map((qk, idx) => {
                      const valor = totaisTrimestre[qk] || 0;
                      const anteriorQk = idx > 0 ? trimestres[idx - 1] : null;
                      const v = anteriorQk ? getVariacao(valor, totaisTrimestre[anteriorQk]) : null;
                      return (
                        <td key={qk}>
                          <div className="cell-amount" style={{ color: '#fff' }}>{fmtR$(valor)}</div>
                          {v && v.dir !== 'flat' && (
                            <div className={`cell-trend trend-${v.dir}`}>
                              {v.dir === 'up' ? '▲' : '▼'} {Math.abs(v.pct).toFixed(0)}%
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="td-grand">{fmtR$(grandTotal)}</td>
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
      <RelatorioTrimestral />
    </Suspense>
  );
}
