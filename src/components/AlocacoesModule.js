"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getPersonColor } from '@/lib/personColors';

export default function AlocacoesModule() {
  const currentYear = new Date().getFullYear();
  const [anoSelecionado, setAnoSelecionado] = useState(currentYear);
  const [alocacoesAgrupadas, setAlocacoesAgrupadas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usuarios, setUsuarios] = useState([]);

  const [allocModalState, setAllocModalState] = useState({ isOpen: false, contrato: null, atendentes: [] });
  const [splitForm, setSplitForm] = useState({
    data_inicio: '',
    users: [{ id: Date.now(), usuario_id: '', percentual: '100' }]
  });

  const fetchAlocacoes = async () => {
    setLoading(true);
    const startRange = `${anoSelecionado - 1}-12-01`;
    const endRange = `${anoSelecionado + 1}-01-31`;

    const { data, error } = await supabase
      .from('parcelas')
      .select('*, contratos(id, titulo, data_inicio, cobranca_mesmo_mes, clientes(nome, apelido), contrato_atendentes(*, profiles(nome)))')
      .or(`and(data_vencimento.gte.${startRange},data_vencimento.lte.${endRange}),and(data_original.gte.${startRange},data_original.lte.${endRange})`)
      .order('data_vencimento', { ascending: true });

    if (error) {
      console.error('Erro ao buscar alocações:', error);
    } else {
      const grouped = {};
      data.forEach(p => {
        const cId = p.contrato_id;

        const isMesmoMes = p.contratos?.cobranca_mesmo_mes;
        const dataBase = p.data_original || p.data_vencimento;
        const dateObj = new Date(dataBase);
        if (!isMesmoMes) {
          dateObj.setUTCMonth(dateObj.getUTCMonth() - 1);
        }
        const serviceDateStr = dateObj.toISOString().split('T')[0];
        const serviceYear = parseInt(serviceDateStr.split('-')[0], 10);
        const serviceMonth = parseInt(serviceDateStr.split('-')[1], 10);

        if (serviceYear !== anoSelecionado) return;

        if (!grouped[cId]) {
          grouped[cId] = {
            contrato: p.contratos,
            meses: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [], 10: [], 11: [], 12: [] }
          };
        }

        const activeAllocations = (p.contratos?.contrato_atendentes || []).filter(r => {
          const activeStart = !r.data_inicio || serviceDateStr >= r.data_inicio;
          const activeEnd = !r.data_fim || serviceDateStr <= r.data_fim;
          return activeStart && activeEnd;
        });

        grouped[cId].meses[serviceMonth].push({
          parcela: p,
          allocations: activeAllocations
        });
      });

      const sortedArray = Object.values(grouped).sort((a, b) => {
        const nameA = a.contrato?.clientes?.apelido || a.contrato?.clientes?.nome || '';
        const nameB = b.contrato?.clientes?.apelido || b.contrato?.clientes?.nome || '';
        return nameA.localeCompare(nameB);
      });

      setAlocacoesAgrupadas(sortedArray);
    }
    setLoading(false);
  };

  const fetchUsuarios = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome');
    if (data) setUsuarios(data);
  };

  useEffect(() => {
    fetchAlocacoes();
  }, [anoSelecionado]);

  useEffect(() => {
    fetchUsuarios();
  }, []);

  // ── Allocation modal functions ──────────────────────────────────────────────

  const openAllocModal = async (contrato) => {
    const { data } = await supabase
      .from('contrato_atendentes')
      .select('*, profiles(nome)')
      .eq('contrato_id', contrato.id)
      .order('data_inicio', { ascending: false });

    setAllocModalState({ isOpen: true, contrato, atendentes: data || [] });
    setSplitForm({
      data_inicio: contrato.data_inicio,
      users: [{ id: Date.now(), usuario_id: '', percentual: '100' }]
    });
  };

  const addSplitUserRow = () => {
    setSplitForm({
      ...splitForm,
      users: [...splitForm.users, { id: Date.now(), usuario_id: '', percentual: '' }]
    });
  };

  const removeSplitUserRow = (idToRemove) => {
    setSplitForm({
      ...splitForm,
      users: splitForm.users.filter(u => u.id !== idToRemove)
    });
  };

  const handleSplitUserChange = (id, field, value) => {
    setSplitForm({
      ...splitForm,
      users: splitForm.users.map(u => u.id === id ? { ...u, [field]: value } : u)
    });
  };

  const handleAddSplit = async (e) => {
    e.preventDefault();

    const totalPercent = splitForm.users.reduce((acc, u) => acc + parseFloat(u.percentual || 0), 0);
    if (totalPercent !== 100) {
      alert(`A soma das porcentagens deve ser EXATAMENTE 100%. O valor atual é: ${totalPercent}%`);
      return;
    }

    const dataInicioNova = new Date(splitForm.data_inicio);
    const dataFimAtualObj = new Date(dataInicioNova);
    dataFimAtualObj.setDate(dataFimAtualObj.getDate() - 1);
    const dataFimAtualStr = dataFimAtualObj.toISOString().split('T')[0];

    const currentActive = allocModalState.atendentes.filter(a => !a.data_fim);
    if (currentActive.length > 0) {
      const activeIds = currentActive.map(a => a.id);
      await supabase
        .from('contrato_atendentes')
        .update({ data_fim: dataFimAtualStr })
        .in('id', activeIds);
    }

    const inserts = splitForm.users.map(u => ({
      contrato_id: allocModalState.contrato.id,
      usuario_id: u.usuario_id,
      percentual: parseFloat(u.percentual),
      data_inicio: splitForm.data_inicio,
      data_fim: null
    }));

    const { error } = await supabase.from('contrato_atendentes').insert(inserts);
    if (error) alert("Erro ao salvar regra: " + error.message);
    else {
      await openAllocModal(allocModalState.contrato);
      fetchAlocacoes();
    }
  };

  const handleRemoveRule = async (data_inicio) => {
    if (confirm("Deseja remover esta regra inteira?")) {
      await supabase
        .from('contrato_atendentes')
        .delete()
        .eq('contrato_id', allocModalState.contrato.id)
        .eq('data_inicio', data_inicio);
      await openAllocModal(allocModalState.contrato);
      fetchAlocacoes();
    }
  };

  const groupedRules = {};
  allocModalState.atendentes.forEach(a => {
    if (!groupedRules[a.data_inicio]) {
      groupedRules[a.data_inicio] = { data_inicio: a.data_inicio, data_fim: a.data_fim, pessoas: [] };
    }
    groupedRules[a.data_inicio].pessoas.push(a);
  });
  const rulesArray = Object.values(groupedRules).sort((a, b) => new Date(b.data_inicio) - new Date(a.data_inicio));
  const sumCurrentInput = splitForm.users.reduce((acc, u) => acc + parseFloat(u.percentual || 0), 0);

  // ── helpers ─────────────────────────────────────────────────────────────────

  const formatInitials = (nome) => {
    if (!nome) return '';
    const parts = nome.trim().split(' ').filter(n => n.length > 0);
    if (parts.length === 0) return '';
    const first = parts[0][0].toUpperCase();
    const last = parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() : '';
    return `${first}${last}`;
  };

  const mesesHeaders = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  return (
    <section className="content-area active">
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center' }}>
        <h2 style={{marginRight: 'auto', color: 'var(--secondary)', fontSize: '18px'}}>Alocações da Equipe (Mês de Prestação)</h2>
        <label style={{fontWeight: 600, color: 'var(--secondary)'}}>Ano Base:</label>
        <select
          className="form-control"
          style={{ width: '120px' }}
          value={anoSelecionado}
          onChange={(e) => setAnoSelecionado(parseInt(e.target.value, 10))}
        >
          {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </div>

      <div className="table-container" style={{ overflowX: 'auto', overflowY: 'visible', paddingBottom: '20px' }}>
        <table style={{ minWidth: '1200px' }}>
          <thead>
            <tr>
              <th style={{width: '270px', position: 'sticky', left: 0, backgroundColor: '#f8fafc', zIndex: 11}}>Cliente / Contrato</th>
              {mesesHeaders.map((m, i) => (
                <th key={i} style={{textAlign: 'center', minWidth: '100px'}}>{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="13" style={{textAlign: 'center', padding: '40px'}}>Carregando alocações...</td></tr>
            ) : alocacoesAgrupadas.length === 0 ? (
              <tr><td colSpan="13" style={{textAlign: 'center', padding: '40px'}}>Nenhuma alocação encontrada para este ano.</td></tr>
            ) : (
              alocacoesAgrupadas.map((group, idx) => (
                <tr key={idx}>
                  <td style={{position: 'sticky', left: 0, backgroundColor: '#fff', borderRight: '1px solid var(--border)', zIndex: 11}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px'}}>
                      <div style={{minWidth: 0}}>
                        <strong style={{color: 'var(--secondary)', display: 'block'}}>{group.contrato?.clientes?.apelido || group.contrato?.clientes?.nome}</strong>
                        <span style={{fontSize: '12px', color: 'var(--text-muted)'}}>{group.contrato?.titulo}</span>
                      </div>
                      <button
                        className="btn btn-primary"
                        style={{padding: '4px 7px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}
                        onClick={() => openAllocModal(group.contrato)}
                        title="Gerenciar alocação"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                      </button>
                    </div>
                  </td>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(month => {
                    const monthItems = group.meses[month];

                    return (
                      <td key={month} style={{textAlign: 'center', padding: '12px 8px', verticalAlign: 'top'}}>
                        {monthItems.length === 0 ? (
                          <span style={{color: 'var(--border)'}}>-</span>
                        ) : (
                          <div style={{display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center'}}>
                            {monthItems.map((item, i) => {
                              if (item.allocations.length === 0) {
                                return (
                                  <div key={i} style={{fontSize: '10px', color: '#94a3b8', fontStyle: 'italic', padding: '4px', border: '1px dashed var(--border)', borderRadius: '4px', width: '100%'}}>
                                    Sem alocação<br/>({item.parcela.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                                  </div>
                                );
                              }

                              return item.allocations.map((a, j) => {
                                const val = (Number(item.parcela.valor) * Number(a.percentual)) / 100;
                                const color = getPersonColor(a.profiles?.nome || formatInitials(a.profiles?.nome));
                                return (
                                  <div
                                    key={`${i}-${j}`}
                                    style={{
                                      width: '100%',
                                      border: `1px solid ${color.border}`,
                                      borderLeft: `3px solid ${color.border}`,
                                      backgroundColor: color.bg,
                                      borderRadius: '4px',
                                      padding: '4px',
                                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <div style={{fontWeight: 700, color: color.text, fontSize: '11px', display: 'flex', justifyContent: 'center', gap: '4px', width: '100%'}}>
                                      <span>{formatInitials(a.profiles?.nome)}</span>
                                      <span style={{opacity: 0.8}}>{a.percentual}%</span>
                                    </div>
                                    <div style={{fontWeight: 600, color: color.text, fontSize: '11px', marginTop: '2px', opacity: 0.9}}>
                                      {val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </div>
                                  </div>
                                );
                              });
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
          {alocacoesAgrupadas.length > 0 && !loading && (
            <tfoot>
              <tr style={{backgroundColor: '#f8fafc', fontWeight: 'bold'}}>
                <td style={{position: 'sticky', left: 0, backgroundColor: '#f8fafc', borderRight: '1px solid var(--border)', zIndex: 11, textAlign: 'right', paddingRight: '16px'}}>
                  <span style={{color: 'var(--secondary)'}}>Produção (Soma):</span>
                </td>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => {
                  const personTotals = {};
                  let totalGeral = 0;

                  alocacoesAgrupadas.forEach(group => {
                    group.meses[month].forEach(item => {
                      totalGeral += Number(item.parcela.valor);
                      item.allocations.forEach(a => {
                        const val = (Number(item.parcela.valor) * Number(a.percentual)) / 100;
                        const nome = a.profiles?.nome || '?';
                        if (!personTotals[nome]) personTotals[nome] = { nome, val: 0 };
                        personTotals[nome].val += val;
                      });
                    });
                  });

                  return (
                    <td key={month} style={{textAlign: 'center', padding: '16px 8px', color: 'var(--secondary)', borderTop: '2px solid var(--border)', verticalAlign: 'top'}}>
                      {totalGeral > 0 ? (
                        <div style={{display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'stretch'}}>
                          {Object.values(personTotals).sort((a,b) => b.val - a.val).map(({ nome, val }) => {
                            const color = getPersonColor(nome);
                            return (
                              <div key={nome} style={{backgroundColor: color.bg, border: `1px solid ${color.border}`, borderRadius: '6px', padding: '4px 6px', textAlign: 'left'}}>
                                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '4px'}}>
                                  <span style={{fontWeight: 700, color: color.text, fontSize: '11px'}}>{formatInitials(nome)}</span>
                                  <span style={{fontWeight: 600, color: color.text, fontSize: '11px'}}>{val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{textAlign: 'center', fontStyle: 'italic', color: color.border, fontWeight: 700, fontSize: '11px'}}>({((val / totalGeral) * 100).toFixed(0)}%)</div>
                              </div>
                            );
                          })}
                          <div style={{marginTop: '4px', fontWeight: 700, fontSize: '12px', color: 'var(--primary)', borderTop: '1px solid var(--border)', paddingTop: '4px'}}>
                            {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      ) : '-'}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Modal Alocação */}
      <div className={`modal-overlay ${allocModalState.isOpen ? 'active' : ''}`}>
        <div className="modal" style={{maxWidth: '800px', height: '90vh', display: 'flex', flexDirection: 'column'}}>
          <div className="modal-header" style={{flexShrink: 0}}>
            <h2>Divisão de Faturamento: {allocModalState.contrato?.titulo}</h2>
            <button className="close-modal" onClick={() => setAllocModalState({...allocModalState, isOpen: false})}>&times;</button>
          </div>
          <div className="modal-body" style={{overflowY: 'auto'}}>

            <form onSubmit={handleAddSplit} style={{backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', marginBottom: '24px', border: '1px solid var(--border)'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                <h3 style={{fontSize: '16px', color: 'var(--secondary)', margin: 0}}>Nova Regra de Divisão</h3>
              </div>

              <div className="form-group" style={{maxWidth: '200px'}}>
                <label>Válido a partir de:</label>
                <input type="date" className="form-control" value={splitForm.data_inicio} onChange={e => setSplitForm({...splitForm, data_inicio: e.target.value})} required />
              </div>

              <label>Distribuição (A soma deve ser 100%)</label>
              {splitForm.users.map((u) => (
                <div key={u.id} style={{display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center'}}>
                  <div style={{flex: 2}}>
                    <select className="form-control" value={u.usuario_id} onChange={e => handleSplitUserChange(u.id, 'usuario_id', e.target.value)} required>
                      <option value="">Selecione um membro...</option>
                      {usuarios.map(user => <option key={user.id} value={user.id}>{user.nome}</option>)}
                    </select>
                  </div>
                  <div style={{flex: 1, position: 'relative'}}>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      placeholder="%"
                      value={u.percentual}
                      onChange={e => handleSplitUserChange(u.id, 'percentual', e.target.value)}
                      required
                    />
                  </div>
                  <div style={{width: '32px'}}>
                    {splitForm.users.length > 1 && (
                      <button type="button" onClick={() => removeSplitUserRow(u.id)} style={{background: 'none', border: 'none', color: 'var(--danger)', fontSize: '20px', cursor: 'pointer'}}>&times;</button>
                    )}
                  </div>
                </div>
              ))}

              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px'}}>
                <button type="button" className="action-link" style={{border: 'none', background: 'none', fontWeight: 600}} onClick={addSplitUserRow}>
                  + Adicionar Pessoa
                </button>
                <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
                  <span style={{fontWeight: 600, color: sumCurrentInput === 100 ? 'var(--success)' : 'var(--danger)'}}>
                    Soma: {sumCurrentInput}%
                  </span>
                  <button type="submit" className="btn btn-primary" disabled={sumCurrentInput !== 100}>Salvar Regra</button>
                </div>
              </div>
            </form>

            {rulesArray.length > 0 && (
              <div style={{marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px'}}>
                <h4 style={{fontSize: '13px', color: 'var(--secondary)', marginBottom: '12px'}}>Histórico de Regras de Alocação</h4>
                <div style={{display: 'flex', flexDirection: 'column'}}>
                  <div style={{marginLeft: '3px', borderLeft: '2px solid var(--border)', paddingLeft: '11px', marginTop: '4px', marginBottom: '4px'}}>
                    {rulesArray.map((rule) => (
                      <div key={rule.data_inicio} style={{fontSize: '12px', color: 'var(--text-main)', marginBottom: '12px', position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                        <div>
                          <span style={{position: 'absolute', left: '-16px', top: '4px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: rule.data_fim ? 'var(--border)' : 'var(--success)'}}></span>
                          <div style={{marginBottom: '4px'}}>
                            <strong>Vigência:</strong> a partir de {new Date(rule.data_inicio).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                            {rule.data_fim ? ` (até ${new Date(rule.data_fim).toLocaleDateString('pt-BR', { timeZone: 'UTC' })})` : ' (Ativo atualmente)'}
                          </div>
                          <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                            {rule.pessoas.map(p => (
                              <span key={p.id} style={{backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)'}}>
                                {p.profiles?.nome}: <strong style={{color: 'var(--success)'}}>{p.percentual}%</strong>
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveRule(rule.data_inicio)}
                          style={{background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', padding: '0 4px', lineHeight: 1}}
                          title="Remover regra"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </section>
  );
}
