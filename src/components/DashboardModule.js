"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

function KPI({ label, value, color }) {
  return (
    <div style={{
      flex: 1, background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: '10px', padding: '14px 18px',
    }}>
      <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500, marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: color || 'var(--secondary)', lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function LineChart({ dados }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  if (!dados || dados.length === 0) return null;

  // Chart renders full-width (~1100px). viewBox is 600, so scale ≈ 1.83.
  // SVG font sizes must be ~6px to render at ~11px actual.
  const W = 600, H = 100, PL = 36, PR = 8, PT = 14, PB = 18;
  const cW = W - PL - PR;
  const cH = H - PT - PB;
  const li = dados.length - 1;

  const maxVal = Math.max(...dados.flatMap(d => [d.recebido, d.esperado]), 1);
  const niceMax = Math.ceil(maxVal / 5000) * 5000 || 10000;

  const xOf = (i) => PL + (i / Math.max(dados.length - 1, 1)) * cW;
  const yOf = (v) => PT + cH - (Math.min(v, niceMax) / niceMax) * cH;

  const smooth = (key) => {
    const pts = dados.map((d, i) => [xOf(i), yOf(d[key])]);
    if (pts.length < 2) return `M${pts[0]?.[0]||0},${pts[0]?.[1]||0}`;
    let p = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const cx = ((pts[i-1][0] + pts[i][0]) / 2).toFixed(1);
      p += ` C${cx},${pts[i-1][1].toFixed(1)} ${cx},${pts[i][1].toFixed(1)} ${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`;
    }
    return p;
  };

  const recPath = smooth('recebido');
  const espPath = smooth('esperado');
  const area = recPath + ` L${xOf(li).toFixed(1)},${(PT+cH).toFixed(1)} L${xOf(0).toFixed(1)},${(PT+cH).toFixed(1)} Z`;
  const fmtK = (v) => (v/1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'K';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {[0, niceMax * 0.5, niceMax].map((v, i) => (
        <g key={i}>
          <line x1={PL} y1={yOf(v)} x2={W-PR} y2={yOf(v)} stroke="#f1f5f9" strokeWidth="0.7" />
          <text x={PL-3} y={yOf(v)+3.5} textAnchor="end" fontSize="5.5" fill="#d1d5db">
            {v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
          </text>
        </g>
      ))}

      <path d={area} fill="url(#areaGrad)" />
      <path d={espPath} fill="none" stroke="#bfdbfe" strokeWidth="0.8" strokeDasharray="2.5,2.5" strokeLinecap="round" />
      <path d={recPath} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

      {dados.map((d, i) => {
        const cur = i === li;
        const lx = xOf(i);
        const ly = yOf(d.recebido);
        const ey = yOf(d.esperado);
        const anchor = i === li ? 'end' : i === 0 ? 'start' : 'middle';
        const lxOff = i === li ? lx - 2 : i === 0 ? lx + 2 : lx;
        return (
          <g key={i}>
            <circle cx={lx} cy={ey} r="1.1" fill="white" stroke="#93c5fd" strokeWidth="0.6" />
            {/* invisible hit area for projetado tooltip */}
            <circle cx={lx} cy={ey} r="7" fill="transparent"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: 'default' }} />
            <circle cx={lx} cy={ly}
              r={cur ? 2.8 : 1.6}
              fill={cur ? '#10b981' : '#fff'}
              stroke="#10b981" strokeWidth={cur ? 0 : 1.1} />
            {d.recebido > 0 && (
              <text x={lxOff} y={ly - 4} textAnchor={anchor} fontSize="5.5"
                fill={cur ? '#059669' : '#9ca3af'} fontWeight="400">
                {fmtK(d.recebido)}
              </text>
            )}
            <text x={lx} y={H-2} textAnchor="middle" fontSize="6"
              fill={cur ? '#059669' : '#9ca3af'} fontWeight={cur ? 700 : 400}>
              {d.label}
            </text>
          </g>
        );
      })}

      {/* Projetado tooltip */}
      {hoveredIdx !== null && (() => {
        const d = dados[hoveredIdx];
        const tx = xOf(hoveredIdx);
        const ty = yOf(d.esperado);
        const label = `R$ ${d.esperado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        const tw = label.length * 3.3 + 10;
        const tx2 = hoveredIdx === li ? tx - tw : hoveredIdx === 0 ? tx : tx - tw / 2;
        return (
          <g style={{ pointerEvents: 'none' }}>
            <rect x={tx2} y={ty - 13} width={tw} height="11" rx="2"
              fill="white" stroke="#e2e8f0" strokeWidth="0.6"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))' }} />
            <text x={tx2 + tw / 2} y={ty - 5} textAnchor="middle"
              fontSize="5.5" fill="#374151" fontWeight="500">
              {label}
            </text>
          </g>
        );
      })()}

      <g transform={`translate(${W-PR-78},6)`}>
        <line x1="0" y1="3" x2="8" y2="3" stroke="#10b981" strokeWidth="1.5" />
        <text x="11" y="6" fontSize="5" fill="#9ca3af">Recebido</text>
        <line x1="42" y1="3" x2="50" y2="3" stroke="#bfdbfe" strokeWidth="0.8" strokeDasharray="2,2" />
        <text x="53" y="6" fontSize="5" fill="#9ca3af">Projetado</text>
      </g>
    </svg>
  );
}

export default function DashboardModule() {
  const [metrics, setMetrics] = useState({ clientesAtivos: 0, contratosAtivos: 0, recebidoMes: 0, aReceberMes: 0, atrasadasCount: 0 });
  const [alertas, setAlertas] = useState([]);
  const [prospeccoes, setProspeccoes] = useState([]);
  const [alertasIPCA, setAlertasIPCA] = useState([]);
  const [historicoMeses, setHistoricoMeses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      const hoje = new Date();
      const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
      const ultimoDiaMes   = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
      const hojeStr        = hoje.toISOString().split('T')[0];

      const histStart = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1).toISOString().split('T')[0];

      const [
        { count: cliCount },
        { count: contCount },
        { data: parcelasHist },
        { data: parcelasHistPagas },
        { data: atrasadas },
        { data: profilesData },
        { data: prospec },
        { data: contratoPartido },
      ] = await Promise.all([
        supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('status', 'Ativo'),
        supabase.from('contratos').select('*', { count: 'exact', head: true }).eq('status', 'Em andamento'),
        // projetado: agrupa por data_vencimento
        supabase.from('parcelas').select('valor, status, data_vencimento')
          .gte('data_vencimento', histStart).lte('data_vencimento', ultimoDiaMes),
        // recebido: agrupa por data_pagamento (igual ao módulo de Parcelas)
        supabase.from('parcelas').select('valor, data_pagamento')
          .eq('status', 'Paga').gte('data_pagamento', histStart).lte('data_pagamento', ultimoDiaMes),
        supabase.from('parcelas').select('id, valor, data_vencimento, contratos(titulo, clientes(nome, apelido))')
          .lt('data_vencimento', hojeStr).neq('status', 'Paga').neq('status', 'Congelada').order('data_vencimento', { ascending: true }).limit(5),
        supabase.from('profiles').select('id, nome'),
        supabase.from('contratos').select('id, titulo, prospeccao_valor, prospeccao_data, prospeccao_usuario_id, prospeccao_obs, clientes(nome, apelido)')
          .eq('tem_prospeccao', true).eq('prospeccao_status', 'Pendente').order('prospeccao_data', { ascending: true }).limit(5),
        supabase.from('contratos').select('id, titulo, tipo_cobranca, valor_total, data_inicio, historico_valores, clientes(nome, apelido)')
          .eq('tipo_cobranca', 'partido_fixo').eq('status', 'Em andamento'),
      ]);

      // KPI mês atual: recebido por data_pagamento, a receber por data_vencimento
      const mesPrefixAtual = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
      const recebido  = (parcelasHistPagas || []).filter(p => p.data_pagamento?.startsWith(mesPrefixAtual)).reduce((s, p) => s + Number(p.valor), 0);
      const aReceber  = (parcelasHist || []).filter(p => p.data_vencimento?.startsWith(mesPrefixAtual) && p.status !== 'Paga' && p.status !== 'Congelada').reduce((s, p) => s + Number(p.valor), 0);

      // Build 6-month history
      const mesesData = Array.from({ length: 6 }, (_, idx) => {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - idx), 1);
        const prefix = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        const raw = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
        const label = raw.charAt(0).toUpperCase() + raw.slice(1);
        // projetado = pagas no mês (por data_pagamento) + pendentes no mês (por data_vencimento)
        // igual ao Parcelas module que usa data_pagamento para pagas e data_vencimento para não-pagas
        const recMes = (parcelasHistPagas || []).filter(p => p.data_pagamento?.startsWith(prefix)).reduce((s, p) => s + Number(p.valor), 0);
        const pendMes = (parcelasHist || []).filter(p => p.data_vencimento?.startsWith(prefix) && p.status !== 'Paga' && p.status !== 'Congelada').reduce((s, p) => s + Number(p.valor), 0);
        return {
          label,
          recebido: recMes,
          esperado: recMes + pendMes,
        };
      });

      const profilesMap = Object.fromEntries((profilesData || []).map(p => [p.id, p.nome]));

      const ipcaAlertas = [];
      for (const c of (contratoPartido || [])) {
        const sinceDate = c.historico_valores?.length
          ? new Date(c.historico_valores[c.historico_valores.length-1].data_aplicacao + 'T12:00:00')
          : new Date(c.data_inicio + 'T12:00:00');
        const monthsElapsed = (hoje.getFullYear() - sinceDate.getFullYear()) * 12 + (hoje.getMonth() - sinceDate.getMonth());
        if (monthsElapsed >= 10) {
          ipcaAlertas.push({ id: c.id, cliente: c.clientes?.apelido || c.clientes?.nome, titulo: c.titulo, firstDate: sinceDate, monthsElapsed, overdue: monthsElapsed >= 12 });
        }
      }
      ipcaAlertas.sort((a, b) => (b.overdue - a.overdue) || (b.monthsElapsed - a.monthsElapsed));

      setMetrics({ clientesAtivos: cliCount||0, contratosAtivos: contCount||0, recebidoMes: recebido, aReceberMes: aReceber, atrasadasCount: atrasadas?.length||0 });
      setHistoricoMeses(mesesData);
      setAlertas(atrasadas || []);
      setProspeccoes((prospec || []).map(p => ({ ...p, favorecido_nome: profilesMap[p.prospeccao_usuario_id] || 'Desconhecido' })));
      setAlertasIPCA(ipcaAlertas);
      setLoading(false);
    };
    fetchDashboardData();
  }, []);

  if (loading) return (
    <section className="content-area active">
      <p style={{ padding: '40px', color: 'var(--text-muted)' }}>Carregando...</p>
    </section>
  );

  const fmtK = (v) => `R$ ${(v/1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;
  const mesLabel = new Date().toLocaleString('pt-BR', { month: 'short' }).replace('.', '');

  return (
    <section className="content-area active">

      {/* KPI chips */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <KPI label="Clientes Ativos"    value={metrics.clientesAtivos} />
        <KPI label="Contratos Ativos"   value={metrics.contratosAtivos} />
        <KPI label={`Recebido · ${mesLabel}`}  value={fmtK(metrics.recebidoMes)}  color="#10b981" />
        <KPI label={`A Receber · ${mesLabel}`} value={fmtK(metrics.aReceberMes)}  color="#f59e0b" />
        <KPI label="Em Atraso"           value={metrics.atrasadasCount}           color={metrics.atrasadasCount > 0 ? '#ef4444' : 'var(--secondary)'} />
      </div>

      {/* Chart */}
      <div className="table-container" style={{ marginBottom: '16px', padding: '14px 18px 10px' }}>
        <div style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
          Recebimentos · últimos 6 meses
        </div>
        <LineChart dados={historicoMeses} />
      </div>

      {/* Tables */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '20px', minWidth: '560px' }}>

          <div className="table-container">
            <div className="table-header">
              <span className="table-title" style={{ color: 'var(--danger)' }}>🚨 Alertas de Atraso</span>
            </div>
            <table>
              <thead><tr><th>Cliente / Contrato</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead>
              <tbody>
                {alertas.length === 0
                  ? <tr><td colSpan="4" style={{ textAlign: 'center', padding: '28px', color: 'var(--text-muted)' }}>Tudo em dia.</td></tr>
                  : alertas.map(a => (
                    <tr key={a.id}>
                      <td>
                        <strong style={{ color: 'var(--secondary)', display: 'block' }}>{a.contratos?.clientes?.apelido || a.contratos?.clientes?.nome}</strong>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{a.contratos?.titulo}</span>
                      </td>
                      <td>{new Date(a.data_vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                      <td>R$ {a.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td><span className="badge badge-danger">Em atraso</span></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

          <div className="table-container">
            <div className="table-header">
              <span className="table-title" style={{ color: '#d97706' }}>💸 Prospecções a Pagar</span>
            </div>
            <table>
              <thead><tr><th>Cliente / Contrato</th><th>Favorecido</th><th>Vencimento</th><th>Valor</th></tr></thead>
              <tbody>
                {prospeccoes.length === 0
                  ? <tr><td colSpan="4" style={{ textAlign: 'center', padding: '28px', color: 'var(--text-muted)' }}>Nenhuma comissão pendente.</td></tr>
                  : prospeccoes.map(p => (
                    <tr key={p.id}>
                      <td>
                        <strong style={{ color: 'var(--secondary)', display: 'block' }}>{p.clientes?.apelido || p.clientes?.nome}</strong>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.titulo}</span>
                      </td>
                      <td>{p.favorecido_nome}</td>
                      <td>{p.prospeccao_data ? new Date(p.prospeccao_data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'}</td>
                      <td><strong style={{ color: '#b45309' }}>R$ {p.prospeccao_valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

        </div>

        <div style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="table-container">
            <div className="table-header">
              <span className="table-title" style={{ color: '#7c3aed' }}>📅 Reajuste IPCA (Partido Fixo)</span>
            </div>
            <table>
              <thead><tr><th>Cliente / Contrato</th><th style={{ textAlign: 'center' }}>Meses</th><th>Situação</th></tr></thead>
              <tbody>
                {alertasIPCA.length === 0
                  ? <tr><td colSpan="3" style={{ textAlign: 'center', padding: '28px', color: 'var(--text-muted)' }}>Nenhum reajuste pendente.</td></tr>
                  : alertasIPCA.map(a => (
                    <tr key={a.id}>
                      <td>
                        <strong style={{ color: 'var(--secondary)', display: 'block' }}>{a.cliente}</strong>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{a.titulo}</span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>desde {a.firstDate.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '20px', color: a.overdue ? '#ef4444' : '#f59e0b', lineHeight: 1, display: 'block' }}>{a.monthsElapsed}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>de 12</span>
                      </td>
                      <td>
                        {a.overdue
                          ? <span style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 700 }}>🔴 Atrasado</span>
                          : <span style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 700 }}>⚠️ Negociar</span>
                        }
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
