"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

function LineChart({ dados }) {
  if (!dados || dados.length === 0) return null;

  const W = 620, H = 210, PL = 72, PR = 20, PT = 28, PB = 38;
  const cW = W - PL - PR;
  const cH = H - PT - PB;

  const maxVal = Math.max(...dados.flatMap(d => [d.recebido, d.esperado]), 1);
  const niceMax = Math.ceil(maxVal / 5000) * 5000 || 10000;

  const xOf = (i) => PL + (i / Math.max(dados.length - 1, 1)) * cW;
  const yOf = (v) => PT + cH - (Math.min(v, niceMax) / niceMax) * cH;

  const linePath = (key) =>
    dados.map((d, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(d[key]).toFixed(1)}`).join(' ');

  const fmtY = (v) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`;
  const yTicks = [0, niceMax * 0.25, niceMax * 0.5, niceMax * 0.75, niceMax];
  const li = dados.length - 1;
  const colW = cW / dados.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* Grid + Y labels */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PL} y1={yOf(v)} x2={W - PR} y2={yOf(v)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={PL - 6} y={yOf(v) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{fmtY(v)}</text>
        </g>
      ))}

      {/* Highlight current month column */}
      <rect
        x={xOf(li) - colW / 2} y={PT}
        width={colW} height={cH}
        fill="rgba(16,185,129,0.05)" rx="3"
      />

      {/* Expectativa line (dashed, blue) */}
      <path d={linePath('esperado')} fill="none" stroke="#3b82f6" strokeWidth="1.8"
        strokeDasharray="5,4" strokeLinejoin="round" opacity="0.8" />

      {/* Recebido line (solid, green) */}
      <path d={linePath('recebido')} fill="none" stroke="#10b981" strokeWidth="2.5"
        strokeLinejoin="round" />

      {/* Dots + X labels */}
      {dados.map((d, i) => {
        const isCurrent = i === li;
        return (
          <g key={i}>
            {/* Expectativa dot */}
            <circle cx={xOf(i)} cy={yOf(d.esperado)} r="3.5"
              fill="white" stroke="#3b82f6" strokeWidth="1.5" opacity="0.85" />
            {/* Recebido dot */}
            <circle cx={xOf(i)} cy={yOf(d.recebido)} r={isCurrent ? 5 : 4}
              fill="#10b981" stroke={isCurrent ? 'white' : 'none'} strokeWidth={isCurrent ? 1.5 : 0} />
            {/* X label */}
            <text
              x={xOf(i)} y={H - 8}
              textAnchor="middle" fontSize="11"
              fill={isCurrent ? '#10b981' : '#94a3b8'}
              fontWeight={isCurrent ? 700 : 400}
            >
              {d.label}
            </text>
            {/* Current month tooltip values */}
            {isCurrent && (
              <>
                <text x={xOf(i) + 8} y={yOf(d.recebido) - 6} fontSize="9.5" fill="#10b981" fontWeight="700">
                  {`R$${(d.recebido / 1000).toFixed(1)}k`}
                </text>
                {d.esperado > d.recebido && (
                  <text x={xOf(i) + 8} y={yOf(d.esperado) - 6} fontSize="9.5" fill="#3b82f6" opacity="0.9">
                    {`R$${(d.esperado / 1000).toFixed(1)}k`}
                  </text>
                )}
              </>
            )}
          </g>
        );
      })}

      {/* Legend */}
      <g transform={`translate(${PL}, 10)`}>
        <line x1="0" y1="5" x2="18" y2="5" stroke="#10b981" strokeWidth="2.5" />
        <circle cx="9" cy="5" r="3" fill="#10b981" />
        <text x="22" y="9" fontSize="10" fill="#64748b">Recebido</text>

        <line x1="96" y1="5" x2="114" y2="5" stroke="#3b82f6" strokeWidth="1.8" strokeDasharray="4,3" />
        <circle cx="105" cy="5" r="3" fill="white" stroke="#3b82f6" strokeWidth="1.5" opacity="0.85" />
        <text x="118" y="9" fontSize="10" fill="#64748b">Expectativa</text>
      </g>
    </svg>
  );
}

export default function DashboardModule() {
  const [metrics, setMetrics] = useState({
    clientesAtivos: 0,
    contratosAtivos: 0,
    recebidoMes: 0,
    aReceberMes: 0,
    atrasadasCount: 0
  });
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
      const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
      const hojeStr = hoje.toISOString().split('T')[0];

      // Clientes Ativos
      const { count: cliCount } = await supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('status', 'Ativo');

      // Contratos Ativos
      const { count: contCount } = await supabase.from('contratos').select('*', { count: 'exact', head: true }).eq('status', 'Em andamento');

      // Parcelas do Mês
      const { data: parcelasMes } = await supabase.from('parcelas')
        .select('valor, status')
        .gte('data_vencimento', primeiroDiaMes)
        .lte('data_vencimento', ultimoDiaMes);

      let recebido = 0;
      let aReceber = 0;
      if (parcelasMes) {
        parcelasMes.forEach(p => {
          if (p.status === 'Paga') recebido += p.valor;
          else aReceber += p.valor;
        });
      }

      // Histórico 6 meses para o gráfico
      const seisAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
      const { data: parcelasHistorico } = await supabase.from('parcelas')
        .select('valor, status, data_vencimento')
        .gte('data_vencimento', seisAtras.toISOString().split('T')[0])
        .lte('data_vencimento', ultimoDiaMes);

      const mesesData = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const mes0 = String(d.getMonth() + 1).padStart(2, '0');
        const prefix = `${d.getFullYear()}-${mes0}`;
        const labelRaw = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
        const label = labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1);

        const parcMes = (parcelasHistorico || []).filter(p => p.data_vencimento?.startsWith(prefix));
        const rec = parcMes.filter(p => p.status === 'Paga').reduce((s, p) => s + Number(p.valor), 0);
        const esp = parcMes.reduce((s, p) => s + Number(p.valor), 0);

        mesesData.push({ label, recebido: rec, esperado: esp });
      }
      setHistoricoMeses(mesesData);

      // Alertas (Atrasadas)
      const { data: atrasadas } = await supabase.from('parcelas')
        .select('id, valor, data_vencimento, contratos(titulo, clientes(nome, apelido))')
        .lt('data_vencimento', hojeStr)
        .neq('status', 'Paga')
        .order('data_vencimento', { ascending: true })
        .limit(5);

      const { data: profilesData } = await supabase.from('profiles').select('id, nome');
      const profilesMap = {};
      if (profilesData) {
        profilesData.forEach(p => profilesMap[p.id] = p.nome);
      }

      // Prospecções Pendentes
      const { data: prospec } = await supabase.from('contratos')
        .select('id, titulo, prospeccao_valor, prospeccao_data, prospeccao_usuario_id, prospeccao_obs, clientes(nome, apelido)')
        .eq('tem_prospeccao', true)
        .eq('prospeccao_status', 'Pendente')
        .order('prospeccao_data', { ascending: true })
        .limit(5);

      setMetrics({
        clientesAtivos: cliCount || 0,
        contratosAtivos: contCount || 0,
        recebidoMes: recebido,
        aReceberMes: aReceber,
        atrasadasCount: atrasadas ? atrasadas.length : 0
      });

      if (atrasadas) setAlertas(atrasadas);
      if (prospec) {
        const pMapped = prospec.map(p => ({
           ...p,
           favorecido_nome: profilesMap[p.prospeccao_usuario_id] || 'Desconhecido'
        }));
        setProspeccoes(pMapped);
      }

      // Alertas IPCA
      const { data: contratoPartido } = await supabase.from('contratos')
        .select('id, titulo, tipo_cobranca, valor_total, data_inicio, historico_valores, clientes(nome, apelido)')
        .eq('tipo_cobranca', 'partido_fixo')
        .eq('status', 'Em andamento');

      if (contratoPartido && contratoPartido.length > 0) {
        const ipcaAlertas = [];
        for (const c of contratoPartido) {
          let sinceDate;
          if (c.historico_valores && c.historico_valores.length > 0) {
            const lastReajuste = c.historico_valores[c.historico_valores.length - 1];
            sinceDate = new Date(lastReajuste.data_aplicacao + 'T12:00:00');
          } else {
            sinceDate = new Date(c.data_inicio + 'T12:00:00');
          }

          const monthsElapsed = (
            (hoje.getFullYear() - sinceDate.getFullYear()) * 12 +
            (hoje.getMonth() - sinceDate.getMonth())
          );

          if (monthsElapsed >= 10) {
            ipcaAlertas.push({
              id: c.id,
              cliente: c.clientes?.apelido || c.clientes?.nome,
              titulo: c.titulo,
              valor: c.valor_total,
              firstDate: sinceDate,
              monthsElapsed,
              overdue: monthsElapsed >= 12
            });
          }
        }
        ipcaAlertas.sort((a, b) => (b.overdue - a.overdue) || (b.monthsElapsed - a.monthsElapsed));
        setAlertasIPCA(ipcaAlertas);
      }

      setLoading(false);
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return <section className="content-area active"><p style={{padding: '40px', color: 'var(--text-muted)'}}>Carregando métricas financeiras...</p></section>;
  }

  return (
    <section className="content-area active">

      {/* Gráfico de Recebimentos */}
      <div className="table-container" style={{ marginBottom: '24px', padding: '20px 24px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--secondary)' }}>Recebimentos — últimos 6 meses</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Mês atual destacado</span>
        </div>
        <LineChart dados={historicoMeses} />
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Clientes Ativos</h3>
          <div className="value">{metrics.clientesAtivos}</div>
          <span className="trend neutral">Base total</span>
        </div>
        <div className="metric-card">
          <h3>Contratos Ativos</h3>
          <div className="value">{metrics.contratosAtivos}</div>
          <span className="trend neutral">Em andamento</span>
        </div>
        <div className="metric-card">
          <h3>Recebido (Mês Atual)</h3>
          <div className="value" style={{color: 'var(--success)'}}>R$ {metrics.recebidoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          <span className="trend positive">Faturado</span>
        </div>
        <div className="metric-card">
          <h3>A Receber (Mês Atual)</h3>
          <div className="value" style={{color: 'var(--warning)'}}>R$ {metrics.aReceberMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          <span className="trend warning">Pendente</span>
        </div>
      </div>

      <div style={{display: 'flex', gap: '24px', flexWrap: 'wrap'}}>
        <div style={{flex: 2, display: 'flex', flexDirection: 'column', gap: '24px', minWidth: '600px'}}>
          <div className="table-container">
            <div className="table-header">
              <span className="table-title" style={{color: 'var(--danger)'}}>🚨 Alertas de Atraso (Recebimentos)</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Cliente / Contrato</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {alertas.length === 0 ? (
                  <tr><td colSpan="4" style={{textAlign: 'center', padding: '32px'}}>Nenhuma pendência ou atraso detectado! Tudo em dia.</td></tr>
                ) : (
                  alertas.map(a => (
                    <tr key={a.id}>
                      <td>
                        <strong style={{color: 'var(--secondary)', display: 'block'}}>{a.contratos?.clientes?.apelido || a.contratos?.clientes?.nome}</strong>
                        <span style={{fontSize: '12px', color: 'var(--text-muted)'}}>{a.contratos?.titulo}</span>
                      </td>
                      <td>{new Date(a.data_vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                      <td>R$ {a.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td><span className="badge badge-danger">Em atraso</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="table-container">
            <div className="table-header">
              <span className="table-title" style={{color: '#d97706'}}>💸 Prospecções a Pagar (Saídas)</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Cliente / Contrato</th>
                  <th>Favorecido</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {prospeccoes.length === 0 ? (
                  <tr><td colSpan="4" style={{textAlign: 'center', padding: '32px'}}>Nenhuma comissão de prospecção pendente!</td></tr>
                ) : (
                  prospeccoes.map(p => (
                    <tr key={p.id}>
                      <td>
                        <strong style={{color: 'var(--secondary)', display: 'block'}}>{p.clientes?.apelido || p.clientes?.nome}</strong>
                        <span style={{fontSize: '12px', color: 'var(--text-muted)'}}>{p.titulo}</span>
                      </td>
                      <td>{p.favorecido_nome}</td>
                      <td>{p.prospeccao_data ? new Date(p.prospeccao_data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'S/ Data'}</td>
                      <td><strong style={{color: '#b45309'}}>R$ {p.prospeccao_valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '24px'}}>
          {/* IPCA Alert Panel */}
          <div className="table-container">
            <div className="table-header">
              <span className="table-title" style={{color: '#7c3aed'}}>📅 Reajuste IPCA (Partido Fixo)</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Cliente / Contrato</th>
                  <th style={{textAlign: 'center'}}>Meses</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {alertasIPCA.length === 0 ? (
                  <tr><td colSpan="3" style={{textAlign: 'center', padding: '32px', color: 'var(--text-muted)'}}>Nenhum reajuste pendente nos próximos 2 meses.</td></tr>
                ) : (
                  alertasIPCA.map(a => (
                    <tr key={a.id}>
                      <td>
                        <strong style={{color: 'var(--secondary)', display: 'block'}}>{a.cliente}</strong>
                        <span style={{fontSize: '12px', color: 'var(--text-muted)'}}>{a.titulo}</span>
                        <span style={{fontSize: '11px', color: '#64748b'}}>desde {a.firstDate.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</span>
                      </td>
                      <td style={{textAlign: 'center'}}>
                        <span style={{
                          display: 'inline-block',
                          fontWeight: 700,
                          fontSize: '20px',
                          color: a.overdue ? '#ef4444' : '#f59e0b',
                          lineHeight: 1
                        }}>{a.monthsElapsed}</span>
                        <div style={{fontSize: '10px', color: 'var(--text-muted)'}}>de 12</div>
                      </td>
                      <td>
                        {a.overdue ? (
                          <span style={{display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 700}}>
                            🔴 Atrasado
                          </span>
                        ) : (
                          <span style={{display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 700}}>
                            ⚠️ Negociar em breve
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="table-container" style={{padding: '24px', backgroundColor: '#f8fafc', border: '1px solid var(--border)', borderRadius: '12px', height: 'fit-content'}}>
            <h3 style={{color: 'var(--secondary)', marginBottom: '16px', fontSize: '16px'}}>Ações Rápidas</h3>
            <ul style={{listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', padding: 0}}>
              <li><button className="btn btn-secondary" style={{width: '100%', textAlign: 'left', backgroundColor: '#fff'}}>+ Novo Cliente</button></li>
              <li><button className="btn btn-secondary" style={{width: '100%', textAlign: 'left', backgroundColor: '#fff'}}>+ Novo Contrato</button></li>
              <li><button className="btn btn-secondary" style={{width: '100%', textAlign: 'left', backgroundColor: '#fff'}}>📄 Emitir Relatório</button></li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
