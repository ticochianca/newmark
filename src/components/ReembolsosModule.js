"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const STATUS_COLORS = {
  Pendente:  { bg: 'rgba(245,158,11,0.12)',  color: '#d97706' },
  Devolvido: { bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
  Pago:      { bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
  Cancelado: { bg: 'rgba(107,114,128,0.12)', color: '#6b7280' },
};

const fmt = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

function diasUteisDesde(dataStr) {
  if (!dataStr) return null;
  const start = new Date(dataStr + 'T12:00:00');
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (start >= today) return 0;
  let count = 0;
  const d = new Date(start);
  d.setDate(d.getDate() + 1);
  while (d <= today) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export default function ReembolsosModule({ permissao = 'ver_tudo', userId = null }) {
  const podeAlterar = permissao === 'alterar';
  const verProprio  = permissao === 'ver_proprio';

  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('Todos');
  const [currentUser, setCurrentUser] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ descricao: '', valor: '' });
  const [arquivo, setArquivo] = useState(null);
  const [saving, setSaving] = useState(false);

  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ descricao: '', valor: '' });
  const [editArquivo, setEditArquivo] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  const [avaliarModal, setAvaliarModal] = useState(null);
  const [devolverObs, setDevolverObs] = useState('');
  const [pagarData, setPagarData] = useState('');
  const [pagarObs, setPagarObs] = useState('');
  const [avaliarSaving, setAvaliarSaving] = useState(false);

  useEffect(() => {
    if (userId) {
      supabase.from('profiles').select('id, nome').eq('id', userId).single()
        .then(({ data }) => { if (data) setCurrentUser(data); });
    }
    fetchAll();
  }, [userId, permissao]);

  const fetchAll = async () => {
    setLoading(true);

    let rq = supabase.from('reembolsos').select('*').order('created_at', { ascending: false });
    if (verProprio && userId) rq = rq.eq('usuario_id', userId);
    const { data: rem } = await rq;

    let pq = supabase
      .from('contratos')
      .select('id, prospeccao_usuario_id, prospeccao_valor, prospeccao_data, prospeccao_obs, prospeccao_status, clientes(apelido, nome)')
      .eq('tem_prospeccao', true);
    if (verProprio && userId) pq = pq.eq('prospeccao_usuario_id', userId);
    const { data: pros, error: prosErr } = await pq;
    if (prosErr) console.error('Erro ao buscar prospecções:', prosErr.message);

    const { data: profs } = await supabase.from('profiles').select('id, nome');
    const nomeMap = Object.fromEntries((profs || []).map(p => [p.id, p.nome]));

    const prosMapped = (pros || []).map(c => ({
      _tipo: 'prospeccao',
      _contratoId: c.id,
      id: `prosp_${c.id}`,
      created_at: c.prospeccao_data,
      usuario_id: c.prospeccao_usuario_id,
      usuario_nome: nomeMap[c.prospeccao_usuario_id] || 'Desconhecido',
      descricao: c.clientes?.apelido || c.clientes?.nome || 'Contrato sem cliente',
      valor: c.prospeccao_valor,
      status: c.prospeccao_status || 'Pendente',
      data_pagamento: null,
      documento_url: null,
      observacao: c.prospeccao_obs,
    }));

    const remMapped = (rem || []).map(r => ({ ...r, _tipo: 'reembolso' }));

    const combined = [...prosMapped, ...remMapped].sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at) : new Date(0);
      const db = b.created_at ? new Date(b.created_at) : new Date(0);
      return db - da;
    });

    setItens(combined);
    setLoading(false);
  };

  const openModal = () => {
    setForm({ descricao: '', valor: '' });
    setArquivo(null);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.descricao.trim()) { alert('Preencha a descrição.'); return; }
    const valor = parseFloat(form.valor.replace(',', '.'));
    if (!valor || valor <= 0) { alert('Informe um valor válido.'); return; }
    setSaving(true);

    const { data: inserted, error } = await supabase
      .from('reembolsos')
      .insert([{
        descricao: form.descricao.trim(),
        valor,
        status: 'Pendente',
        usuario_id: currentUser?.id || userId,
        usuario_nome: currentUser?.nome || 'Desconhecido',
      }])
      .select()
      .single();

    if (error) { alert('Erro ao salvar: ' + error.message); setSaving(false); return; }

    if (arquivo) {
      const fd = new FormData();
      fd.append('file', arquivo);
      fd.append('reembolsoId', inserted.id);
      const res = await fetch('/api/reembolsos/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.url) {
        await supabase.from('reembolsos').update({ documento_url: json.url }).eq('id', inserted.id);
        inserted.documento_url = json.url;
      }
    }

    setItens(prev => [{ ...inserted, _tipo: 'reembolso' }, ...prev]);
    setModalOpen(false);
    setSaving(false);
  };

  const openEditModal = (r) => {
    setEditModal(r);
    setEditForm({ descricao: r.descricao, valor: String(r.valor).replace('.', ',') });
    setEditArquivo(null);
  };

  const handleReenviar = async () => {
    if (!editForm.descricao.trim()) { alert('Preencha a descrição.'); return; }
    const valor = parseFloat(editForm.valor.replace(',', '.'));
    if (!valor || valor <= 0) { alert('Informe um valor válido.'); return; }
    setEditSaving(true);

    const updates = { descricao: editForm.descricao.trim(), valor, status: 'Pendente', observacao: null };

    if (editArquivo) {
      const fd = new FormData();
      fd.append('file', editArquivo);
      fd.append('reembolsoId', editModal.id);
      const res = await fetch('/api/reembolsos/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.url) updates.documento_url = json.url;
    }

    const { error } = await supabase.from('reembolsos').update(updates).eq('id', editModal.id);
    if (error) { alert('Erro ao reenviar: ' + error.message); setEditSaving(false); return; }

    setItens(prev => prev.map(r => r.id === editModal.id ? { ...r, ...updates } : r));
    setEditModal(null);
    setEditSaving(false);
  };

  const handleCancelar = async (r) => {
    if (!confirm('Cancelar este reembolso definitivamente?')) return;
    const { error } = await supabase.from('reembolsos').update({ status: 'Cancelado' }).eq('id', r.id);
    if (error) { alert('Erro: ' + error.message); return; }
    setItens(prev => prev.map(x => x.id === r.id ? { ...x, status: 'Cancelado' } : x));
  };

  const openAvaliar = (r) => {
    setAvaliarModal(r);
    setDevolverObs('');
    setPagarData(new Date().toISOString().slice(0, 10));
    setPagarObs('');
  };

  const handleDevolver = async () => {
    if (!devolverObs.trim()) { alert('Descreva o motivo para o colaborador poder corrigir.'); return; }
    setAvaliarSaving(true);
    const { error } = await supabase
      .from('reembolsos')
      .update({ status: 'Devolvido', observacao: devolverObs.trim() })
      .eq('id', avaliarModal.id);
    if (error) { alert('Erro: ' + error.message); setAvaliarSaving(false); return; }
    setItens(prev => prev.map(r => r.id === avaliarModal.id
      ? { ...r, status: 'Devolvido', observacao: devolverObs.trim() }
      : r
    ));
    setAvaliarModal(null);
    setAvaliarSaving(false);
  };

  const handlePagar = async () => {
    if (!pagarData) { alert('Informe a data de pagamento.'); return; }
    setAvaliarSaving(true);

    const obs = pagarObs.trim() || null;
    if (avaliarModal._tipo === 'prospeccao') {
      const { error } = await supabase
        .from('contratos')
        .update({ prospeccao_status: 'Pago', ...(obs ? { prospeccao_obs: obs } : {}) })
        .eq('id', avaliarModal._contratoId);
      if (error) { alert('Erro: ' + error.message); setAvaliarSaving(false); return; }
    } else {
      const { error } = await supabase
        .from('reembolsos')
        .update({ status: 'Pago', data_pagamento: pagarData, observacao: obs })
        .eq('id', avaliarModal.id);
      if (error) { alert('Erro: ' + error.message); setAvaliarSaving(false); return; }
    }

    setItens(prev => prev.map(r => r.id === avaliarModal.id
      ? { ...r, status: 'Pago', data_pagamento: pagarData, observacao: obs }
      : r
    ));
    setAvaliarModal(null);
    setAvaliarSaving(false);
  };

  const lista = filtroStatus === 'Todos'
    ? itens
    : itens.filter(r => r.status === filtroStatus);

  return (
    <div className="content-area active">

      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {[
          { label: 'Pendentes',  key: 'Pendente'  },
          { label: 'Devolvidos', key: 'Devolvido' },
          { label: 'Pagos',      key: 'Pago'      },
        ].map(({ label, key }) => {
          const items = itens.filter(r => r.status === key);
          const total = items.reduce((acc, r) => acc + Number(r.valor || 0), 0);
          return (
            <div key={key} className="metric-card">
              <h3>{label}</h3>
              <div className="value">{items.length}</div>
              <span className="trend neutral">{fmt(total)}</span>
            </div>
          );
        })}
      </div>

      <div className="table-container">
        <div className="table-header">
          <span className="table-title">Reembolsos e Prospecções</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              className="form-control"
              style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }}
              value={filtroStatus}
              onChange={e => setFiltroStatus(e.target.value)}
            >
              {['Todos', 'Pendente', 'Devolvido', 'Pago', 'Cancelado'].map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={openModal}>+ Meu Reembolso</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div>
        ) : lista.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum item encontrado.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Ref.</th>
                <th>Colaborador</th>
                <th>Descrição</th>
                <th>Valor</th>
                <th>Doc.</th>
                <th>Status</th>
                <th>Observação</th>
                <th>Pagamento</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(r => {
                const sc = STATUS_COLORS[r.status] || STATUS_COLORS.Pendente;
                const du = r.status === 'Pago' ? diasUteisDesde(r.data_pagamento) : null;
                const ehDono = r.usuario_id === userId;
                const isProsp = r._tipo === 'prospeccao';
                return (
                  <tr key={r.id} style={isProsp ? { background: 'rgba(59,130,246,0.03)' } : {}}>
                    <td>
                      <span style={{
                        fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '8px',
                        background: isProsp ? 'rgba(59,130,246,0.12)' : 'rgba(107,114,128,0.1)',
                        color: isProsp ? '#2563eb' : '#6b7280',
                      }}>
                        {isProsp ? 'PROSP.' : 'REEMB.'}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {fmtDate(r.created_at)}
                    </td>
                    <td>{r.usuario_nome || '—'}</td>
                    <td style={{ maxWidth: '200px' }}>{r.descricao}</td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{fmt(r.valor)}</td>
                    <td>
                      {r.documento_url
                        ? <a href={r.documento_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: '12px' }}>Ver</a>
                        : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                      }
                    </td>
                    <td>
                      <span className="badge" style={{ background: sc.bg, color: sc.color }}>{r.status}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {r.observacao
                        ? <span title={r.observacao} style={{ cursor: 'default', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(59,130,246,0.12)', color: '#2563eb', fontSize: '11px', fontWeight: 700, fontStyle: 'italic' }}>i</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                      }
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                      {r.data_pagamento ? (
                        <>
                          {fmtDate(r.data_pagamento)}
                          {du !== null && (
                            <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>
                              {du === 0 ? '(hoje)' : `(${du} d.u.)`}
                            </span>
                          )}
                        </>
                      ) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {r.status === 'Pendente' && podeAlterar && (
                          <button className="btn btn-secondary" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={() => openAvaliar(r)}>
                            Avaliar
                          </button>
                        )}
                        {r.status === 'Devolvido' && !isProsp && ehDono && (
                          <>
                            <button className="btn btn-primary" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={() => openEditModal(r)}>
                              Editar e Reenviar
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ fontSize: '11px', padding: '3px 8px', color: '#dc2626', borderColor: 'rgba(239,68,68,0.3)' }}
                              onClick={() => handleCancelar(r)}
                            >
                              Cancelar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal — Novo Reembolso */}
      {modalOpen && (
        <div className="modal-overlay active" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Novo Reembolso</h2>
              <button className="close-modal" onClick={() => setModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Descrição *</label>
                <textarea className="form-control" rows={3} placeholder="Descreva a despesa reembolsável..." value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Valor total (R$) *</label>
                <input type="text" className="form-control" placeholder="0,00" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value.replace(/[^\d,\.]/g, '') }))} />
              </div>
              <div className="form-group">
                <label>Comprovante / Documento</label>
                <input type="file" className="form-control" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setArquivo(e.target.files[0] || null)} />
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>PDF, JPG ou PNG</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Salvando...' : 'Enviar solicitação'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Editar e Reenviar */}
      {editModal && (
        <div className="modal-overlay active" onClick={() => setEditModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Editar e Reenviar</h2>
              <button className="close-modal" onClick={() => setEditModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {editModal.observacao && (
                <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: '#dc2626' }}>
                  <strong>Motivo da devolução:</strong> {editModal.observacao}
                </div>
              )}
              <div className="form-group">
                <label>Descrição *</label>
                <textarea className="form-control" rows={3} value={editForm.descricao} onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Valor total (R$) *</label>
                <input type="text" className="form-control" value={editForm.valor} onChange={e => setEditForm(f => ({ ...f, valor: e.target.value.replace(/[^\d,\.]/g, '') }))} />
              </div>
              <div className="form-group">
                <label>Substituir comprovante</label>
                <input type="file" className="form-control" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setEditArquivo(e.target.files[0] || null)} />
                {editModal.documento_url && !editArquivo && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    <a href={editModal.documento_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>Ver comprovante atual</a>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleReenviar} disabled={editSaving}>{editSaving ? 'Enviando...' : 'Reenviar solicitação'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Avaliar */}
      {avaliarModal && (
        <div className="modal-overlay active" onClick={() => setAvaliarModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Avaliar {avaliarModal._tipo === 'prospeccao' ? 'Prospecção' : 'Reembolso'}</h2>
              <button className="close-modal" onClick={() => setAvaliarModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '20px', padding: '12px', background: 'var(--bg-dark)', borderRadius: '6px', fontSize: '13px' }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>{avaliarModal.usuario_nome}</div>
                <div style={{ marginBottom: '4px' }}>{avaliarModal.descricao}</div>
                <div style={{ fontWeight: 700, color: 'var(--secondary)' }}>{fmt(avaliarModal.valor)}</div>
                {avaliarModal.observacao && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>Obs: {avaliarModal.observacao}</div>
                )}
                {avaliarModal.documento_url && (
                  <a href={avaliarModal.documento_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: '12px', display: 'inline-block', marginTop: '6px' }}>
                    Ver comprovante →
                  </a>
                )}
              </div>

              {avaliarModal._tipo !== 'prospeccao' && (
                <>
                  <div style={{ border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '10px', color: '#dc2626' }}>Devolver para revisão</div>
                    <div className="form-group" style={{ marginBottom: '10px' }}>
                      <textarea
                        className="form-control"
                        rows={2}
                        placeholder="Descreva o que o colaborador precisa corrigir..."
                        value={devolverObs}
                        onChange={e => setDevolverObs(e.target.value)}
                      />
                    </div>
                    <button
                      className="btn"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.3)', width: '100%' }}
                      onClick={handleDevolver}
                      disabled={avaliarSaving}
                    >
                      Devolver
                    </button>
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 12px' }}>ou</div>
                </>
              )}

              <div style={{ border: '1px solid rgba(16,185,129,0.25)', borderRadius: '8px', padding: '16px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '10px', color: '#059669' }}>Marcar como Pago</div>
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '12px' }}>Data de pagamento</label>
                  <input type="date" className="form-control" value={pagarData} onChange={e => setPagarData(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '12px' }}>Observação (opcional)</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="Ex: Pago via TED, número do comprovante..."
                    value={pagarObs}
                    onChange={e => setPagarObs(e.target.value)}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  style={{ background: '#059669', width: '100%' }}
                  onClick={handlePagar}
                  disabled={avaliarSaving}
                >
                  {avaliarSaving ? 'Salvando...' : 'Marcar como Pago'}
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setAvaliarModal(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
