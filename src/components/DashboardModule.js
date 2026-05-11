"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

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
      // Alertas IPCA - Contratos Partido Fixo com valor fixo há 10+ meses
      const { data: contratoPartido } = await supabase.from('contratos')
        .select('id, titulo, tipo_cobranca, valor_total, data_inicio, historico_valores, clientes(nome, apelido)')
        .eq('tipo_cobranca', 'partido_fixo')
        .eq('status', 'Em andamento');

      if (contratoPartido && contratoPartido.length > 0) {
        const ipcaAlertas = [];
        for (const c of contratoPartido) {
          // Use last reajuste date if exists, otherwise contract start date
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
