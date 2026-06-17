"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const STATUS_COLORS = {
  Pendente:  { bg: 'rgba(245,158,11,0.12)',  color: '#d97706' },
  Aprovado:  { bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
  Rejeitado: { bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
};

const fmt = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

export default function ReembolsosModule() {
  const [reembolsos, setReembolsos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('Todos');
  const [currentUser, setCurrentUser] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ descricao: '', valor: '' });
  const [arquivo, setArquivo] = useState(null);
  const [saving, setSaving] = useState(false);

  const [avaliarModal, setAvaliarModal] = useState(null);
  const [avaliarObs, setAvaliarObs] = useState('');
  const [avaliarSaving, setAvaliarSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        supabase.from('profiles').select('id, nome').eq('id', session.user.id).single()
          .then(({ data }) => setCurrentUser(data));
      }
    });
    fetchReembolsos();
  }, []);

  const fetchReembolsos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reembolsos')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setReembolsos(data || []);
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
        usuario_id: currentUser?.id,
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

    setReembolsos(prev => [{ ...inserted }, ...prev]);
    setModalOpen(false);
    setSaving(false);
  };

  const openAvaliar = (r) => {
    setAvaliarModal(r);
    setAvaliarObs('');
  };

  const handleAvaliar = async (novoStatus) => {
    setAvaliarSaving(true);
    const { error } = await supabase
      .from('reembolsos')
      .update({ status: novoStatus, observacao: avaliarObs.trim() || null })
      .eq('id', avaliarModal.id);
    if (error) { alert('Erro: ' + error.message); setAvaliarSaving(false); return; }
    setReembolsos(prev => prev.map(r => r.id === avaliarModal.id
      ? { ...r, status: novoStatus, observacao: avaliarObs.trim() || null }
      : r
    ));
    setAvaliarModal(null);
    setAvaliarSaving(false);
  };

  const lista = filtroStatus === 'Todos'
    ? reembolsos
    : reembolsos.filter(r => r.status === filtroStatus);

  const totalPendente = reembolsos.filter(r => r.status === 'Pendente').reduce((s, r) => s + Number(r.valor), 0);

  return (
    <div className="content-area active">

      {/* Métricas */}
      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {['Pendente', 'Aprovado', 'Rejeitado'].map(s => {
          const items = reembolsos.filter(r => r.status === s);
          const total = items.reduce((acc, r) => acc + Number(r.valor), 0);
          return (
            <div key={s} className="metric-card">
              <h3>{s}s</h3>
              <div className="value">{items.length}</div>
              <span className="trend neutral">{fmt(total)}</span>
            </div>
          );
        })}
      </div>

      {/* Tabela */}
      <div className="table-container">
        <div className="table-header">
          <span className="table-title">Reembolsos</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              className="form-control"
              style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }}
              value={filtroStatus}
              onChange={e => setFiltroStatus(e.target.value)}
            >
              {['Todos', 'Pendente', 'Aprovado', 'Rejeitado'].map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={openModal}>+ Novo Reembolso</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div>
        ) : lista.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum reembolso encontrado.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Colaborador</th>
                <th>Descrição</th>
                <th>Valor</th>
                <th>Comprovante</th>
                <th>Status</th>
                <th>Observação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(r => {
                const sc = STATUS_COLORS[r.status] || STATUS_COLORS.Pendente;
                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                    <td>{r.usuario_nome || '—'}</td>
                    <td style={{ maxWidth: '260px' }}>{r.descricao}</td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{fmt(r.valor)}</td>
                    <td>
                      {r.documento_url
                        ? <a href={r.documento_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: '12px' }}>Ver doc</a>
                        : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                      }
                    </td>
                    <td>
                      <span className="badge" style={{ background: sc.bg, color: sc.color }}>{r.status}</span>
                    </td>
                    <td style={{ maxWidth: '180px', fontSize: '12px', color: 'var(--text-muted)' }}>{r.observacao || '—'}</td>
                    <td>
                      {r.status === 'Pendente' && (
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '11px', padding: '3px 8px' }}
                          onClick={() => openAvaliar(r)}
                        >
                          Avaliar
                        </button>
                      )}
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
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Descreva a despesa reembolsável..."
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Valor total (R$) *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="0,00"
                  value={form.valor}
                  onChange={e => setForm(f => ({ ...f, valor: e.target.value.replace(/[^\d,\.]/g, '') }))}
                />
              </div>
              <div className="form-group">
                <label>Comprovante / Documento</label>
                <input
                  type="file"
                  className="form-control"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e => setArquivo(e.target.files[0] || null)}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  PDF, JPG ou PNG
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Salvando...' : 'Enviar solicitação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Avaliar */}
      {avaliarModal && (
        <div className="modal-overlay active" onClick={() => setAvaliarModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <h2>Avaliar Reembolso</h2>
              <button className="close-modal" onClick={() => setAvaliarModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-dark)', borderRadius: '6px', fontSize: '13px' }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>{avaliarModal.usuario_nome}</div>
                <div style={{ marginBottom: '4px' }}>{avaliarModal.descricao}</div>
                <div style={{ fontWeight: 700, color: 'var(--secondary)' }}>{fmt(avaliarModal.valor)}</div>
                {avaliarModal.documento_url && (
                  <a href={avaliarModal.documento_url} target="_blank" rel="noreferrer"
                    style={{ color: 'var(--primary)', fontSize: '12px', display: 'inline-block', marginTop: '6px' }}>
                    Ver comprovante →
                  </a>
                )}
              </div>
              <div className="form-group">
                <label>Observação (opcional)</label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Motivo de aprovação ou rejeição..."
                  value={avaliarObs}
                  onChange={e => setAvaliarObs(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setAvaliarModal(null)}>Cancelar</button>
              <button
                className="btn"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.3)' }}
                onClick={() => handleAvaliar('Rejeitado')}
                disabled={avaliarSaving}
              >
                Rejeitar
              </button>
              <button
                className="btn btn-primary"
                style={{ background: '#059669' }}
                onClick={() => handleAvaliar('Aprovado')}
                disabled={avaliarSaving}
              >
                Aprovar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
