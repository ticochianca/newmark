"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const MODULOS_PERM = [
  { key: 'dashboard',  label: 'Dashboard',  niveis: ['sem_acesso', 'ver_tudo', 'alterar'] },
  { key: 'clientes',   label: 'Clientes',   niveis: ['sem_acesso', 'ver_proprio', 'ver_tudo', 'alterar'] },
  { key: 'contratos',  label: 'Contratos',  niveis: ['sem_acesso', 'ver_proprio', 'ver_tudo', 'alterar'] },
  { key: 'parcelas',   label: 'Parcelas',   niveis: ['sem_acesso', 'ver_proprio', 'ver_tudo', 'alterar'] },
  { key: 'alocacoes',  label: 'Alocações',  niveis: ['sem_acesso', 'ver_proprio', 'ver_tudo', 'alterar'] },
  { key: 'emissoes',   label: 'Emissões',   niveis: ['sem_acesso', 'ver_proprio', 'ver_tudo', 'alterar'] },
  { key: 'agenda',     label: 'Agenda',     niveis: ['sem_acesso', 'ver_proprio', 'ver_tudo', 'alterar'] },
  { key: 'reembolsos', label: 'Reembolsos', niveis: ['sem_acesso', 'ver_proprio', 'ver_tudo', 'alterar'] },
  { key: 'usuarios',   label: 'Usuários',   niveis: ['sem_acesso', 'alterar'] },
];

const NIVEL_LABELS = {
  sem_acesso:  'Sem acesso',
  ver_proprio: 'Ver próprio',
  ver_tudo:    'Ver tudo',
  alterar:     'Alterar',
};

const NIVEL_COLORS = {
  sem_acesso:  { bg: 'rgba(239,68,68,0.08)',   color: '#dc2626' },
  ver_proprio: { bg: 'rgba(245,158,11,0.1)',   color: '#d97706' },
  ver_tudo:    { bg: 'rgba(59,130,246,0.1)',   color: '#2563eb' },
  alterar:     { bg: 'rgba(16,185,129,0.1)',   color: '#059669' },
};

export default function UsuariosModule() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ nome: '', email: '', senha: '', perfil: 'Colaborador' });
  const [isCreating, setIsCreating] = useState(false);

  const [editNome, setEditNome] = useState('');
  const [editPerfil, setEditPerfil] = useState('');
  const [editAtivo, setEditAtivo] = useState(true);

  const [permModal, setPermModal] = useState(null);
  const [permForm, setPermForm] = useState({});
  const [permSaving, setPermSaving] = useState(false);

  const fetchUsuarios = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error) setUsuarios(data);
    setLoading(false);
  };

  useEffect(() => { fetchUsuarios(); }, []);

  const handleEditClick = (user) => {
    setEditingId(user.id);
    setEditNome(user.nome);
    setEditPerfil(user.perfil);
    setEditAtivo(user.ativo);
  };

  const handleSaveEdit = async (id) => {
    const { error } = await supabase.from('profiles').update({ nome: editNome, perfil: editPerfil, ativo: editAtivo }).eq('id', id);
    if (error) { alert('Erro ao atualizar usuário: ' + error.message); return; }
    setEditingId(null);
    fetchUsuarios();
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const res = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(createForm) });
      const data = await res.json();
      if (!res.ok) { alert('Erro ao criar usuário: ' + data.error); }
      else {
        setIsCreateModalOpen(false);
        setCreateForm({ nome: '', email: '', senha: '', perfil: 'Colaborador' });
        fetchUsuarios();
      }
    } catch (err) { alert('Erro inesperado: ' + err.message); }
    finally { setIsCreating(false); }
  };

  const openPermModal = (user) => {
    setPermModal(user);
    setPermForm(user.permissoes || {});
  };

  const handleSavePermissoes = async () => {
    setPermSaving(true);
    const { error } = await supabase.from('profiles').update({ permissoes: permForm }).eq('id', permModal.id);
    if (error) { alert('Erro ao salvar permissões: ' + error.message); setPermSaving(false); return; }
    setUsuarios(prev => prev.map(u => u.id === permModal.id ? { ...u, permissoes: permForm } : u));
    setPermModal(null);
    setPermSaving(false);
  };

  const setPerm = (key, value) => setPermForm(f => ({ ...f, [key]: value }));
  const getPerm = (key) => permForm[key] ?? 'ver_tudo';

  return (
    <section className="content-area active">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
        <div>
          <h2 style={{ color: 'var(--secondary)', fontSize: '18px', marginBottom: '4px' }}>Gestão de Equipe</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Gerencie o acesso e as permissões dos membros da sua equipe.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)}>Novo Usuário</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Perfil</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" style={{ textAlign: 'center' }}>Carregando...</td></tr>
            ) : usuarios.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '32px' }}>Nenhum perfil encontrado.</td></tr>
            ) : usuarios.map(u => (
              <tr key={u.id}>
                {editingId === u.id ? (
                  <>
                    <td><input type="text" className="form-control" value={editNome} onChange={e => setEditNome(e.target.value)} /></td>
                    <td>
                      <select className="form-control" value={editPerfil} onChange={e => setEditPerfil(e.target.value)}>
                        <option value="Administrador">Administrador</option>
                        <option value="Colaborador">Colaborador</option>
                      </select>
                    </td>
                    <td>
                      <select className="form-control" value={editAtivo ? 'sim' : 'nao'} onChange={e => setEditAtivo(e.target.value === 'sim')}>
                        <option value="sim">Ativo</option>
                        <option value="nao">Bloqueado</option>
                      </select>
                    </td>
                    <td style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleSaveEdit(u.id)}>Salvar</button>
                      <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setEditingId(null)}>Cancelar</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="avatar" style={{ width: '32px', height: '32px', fontSize: '14px' }}>{u.nome?.charAt(0).toUpperCase()}</div>
                        <strong>{u.nome}</strong>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${u.perfil === 'Administrador' ? 'badge-info' : 'badge-neutral'}`}>{u.perfil}</span>
                    </td>
                    <td>
                      <span className={`badge ${u.ativo ? 'badge-success' : 'badge-danger'}`}>
                        {u.ativo ? 'Ativo' : 'Bloqueado'}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => handleEditClick(u)}>Editar</button>
                      {u.perfil !== 'Administrador' && (
                        <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => openPermModal(u)}>Permissões</button>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Permissões */}
      {permModal && (
        <div className="modal-overlay active" onClick={() => setPermModal(null)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Permissões — {permModal.nome}</h2>
              <button className="close-modal" onClick={() => setPermModal(null)}>&times;</button>
            </div>
            <div className="modal-body" style={{ padding: '0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>Módulo</th>
                    <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>Acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {MODULOS_PERM.map((mod, i) => {
                    const val = getPerm(mod.key);
                    const sc = NIVEL_COLORS[val] || NIVEL_COLORS.ver_tudo;
                    return (
                      <tr key={mod.key} style={{ borderBottom: i < MODULOS_PERM.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '10px 20px', fontWeight: 500, fontSize: '13px' }}>{mod.label}</td>
                        <td style={{ padding: '8px 20px' }}>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {mod.niveis.map(nivel => {
                              const active = val === nivel;
                              const nc = NIVEL_COLORS[nivel];
                              return (
                                <button
                                  key={nivel}
                                  onClick={() => setPerm(mod.key, nivel)}
                                  style={{
                                    padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: 'none',
                                    background: active ? nc.bg : 'var(--bg-dark)',
                                    color: active ? nc.color : 'var(--text-muted)',
                                    outline: active ? `1.5px solid ${nc.color}` : '1px solid transparent',
                                  }}
                                >
                                  {NIVEL_LABELS[nivel]}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPermModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSavePermissoes} disabled={permSaving}>
                {permSaving ? 'Salvando...' : 'Salvar Permissões'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Criar Usuário */}
      <div className={`modal-overlay ${isCreateModalOpen ? 'active' : ''}`}>
        <div className="modal" style={{ maxWidth: '450px' }}>
          <div className="modal-header">
            <h2>Novo Usuário</h2>
            <button className="close-modal" onClick={() => setIsCreateModalOpen(false)}>&times;</button>
          </div>
          <div className="modal-body">
            <form id="form-create-user" onSubmit={handleCreateSubmit}>
              <div className="form-group">
                <label>Nome Completo</label>
                <input type="text" className="form-control" value={createForm.nome} onChange={e => setCreateForm({ ...createForm, nome: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>E-mail</label>
                <input type="email" className="form-control" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Senha Inicial</label>
                <input type="password" className="form-control" value={createForm.senha} onChange={e => setCreateForm({ ...createForm, senha: e.target.value })} required minLength={6} />
              </div>
              <div className="form-group">
                <label>Perfil</label>
                <select className="form-control" value={createForm.perfil} onChange={e => setCreateForm({ ...createForm, perfil: e.target.value })}>
                  <option value="Administrador">Administrador</option>
                  <option value="Colaborador">Colaborador</option>
                </select>
              </div>
            </form>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" type="button" onClick={() => setIsCreateModalOpen(false)} disabled={isCreating}>Cancelar</button>
            <button type="submit" form="form-create-user" className="btn btn-primary" disabled={isCreating}>
              {isCreating ? 'Criando...' : 'Criar Usuário'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
