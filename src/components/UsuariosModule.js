"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function UsuariosModule() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  
  // Create Form State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ nome: '', email: '', senha: '', perfil: 'Colaborador' });
  const [isCreating, setIsCreating] = useState(false);

  // Edit Form State
  const [editNome, setEditNome] = useState('');
  const [editPerfil, setEditPerfil] = useState('');
  const [editAtivo, setEditAtivo] = useState(true);

  const fetchUsuarios = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error('Erro ao buscar usuários:', error);
    } else {
      setUsuarios(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsuarios();
  }, []);

  const handleEditClick = (user) => {
    setEditingId(user.id);
    setEditNome(user.nome);
    setEditPerfil(user.perfil);
    setEditAtivo(user.ativo);
  };

  const handleSaveEdit = async (id) => {
    const { error } = await supabase
      .from('profiles')
      .update({
        nome: editNome,
        perfil: editPerfil,
        ativo: editAtivo
      })
      .eq('id', id);

    if (error) {
      alert('Erro ao atualizar usuário: ' + error.message);
    } else {
      setEditingId(null);
      fetchUsuarios();
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm)
      });
      const data = await res.json();
      if (!res.ok) {
        alert('Erro ao criar usuário: ' + data.error);
      } else {
        alert('Usuário criado com sucesso!');
        setIsCreateModalOpen(false);
        setCreateForm({ nome: '', email: '', senha: '', perfil: 'Colaborador' });
        fetchUsuarios();
      }
    } catch (err) {
      alert('Erro inesperado: ' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="content-area active">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
        <div>
          <h2 style={{color: 'var(--secondary)', fontSize: '18px', marginBottom: '4px'}}>Gestão de Equipe (Perfis)</h2>
          <p style={{fontSize: '14px', color: 'var(--text-muted)'}}>Gerencie o acesso e as permissões dos membros da sua equipe.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)}>Novo Usuário</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Nome / Identificação</th>
              <th>Nível de Acesso</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" style={{textAlign: 'center'}}>Carregando equipe...</td></tr>
            ) : usuarios.length === 0 ? (
              <tr><td colSpan="4" style={{textAlign: 'center', padding: '32px'}}>
                Nenhum perfil encontrado.<br/>
                <span style={{fontSize: '12px', color: 'var(--text-muted)'}}>Se você já criou o usuário no Supabase, certifique-se de ter rodado o script de sincronização.</span>
              </td></tr>
            ) : (
              usuarios.map(u => (
                <tr key={u.id}>
                  {editingId === u.id ? (
                    <>
                      <td><input type="text" className="form-control" value={editNome} onChange={(e) => setEditNome(e.target.value)} /></td>
                      <td>
                        <select className="form-control" value={editPerfil} onChange={(e) => setEditPerfil(e.target.value)}>
                          <option value="Administrador">Administrador</option>
                          <option value="Colaborador">Colaborador</option>
                        </select>
                      </td>
                      <td>
                        <select className="form-control" value={editAtivo ? 'sim' : 'nao'} onChange={(e) => setEditAtivo(e.target.value === 'sim')}>
                          <option value="sim">Ativo</option>
                          <option value="nao">Bloqueado</option>
                        </select>
                      </td>
                      <td>
                        <button className="btn btn-primary" style={{padding: '6px 12px', fontSize: '12px', marginRight: '8px'}} onClick={() => handleSaveEdit(u.id)}>Salvar</button>
                        <button className="btn btn-secondary" style={{padding: '6px 12px', fontSize: '12px'}} onClick={() => setEditingId(null)}>Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                          <div className="avatar" style={{width: '32px', height: '32px', fontSize: '14px'}}>{u.nome.charAt(0).toUpperCase()}</div>
                          <strong>{u.nome}</strong>
                        </div>
                      </td>
                      <td>{u.perfil}</td>
                      <td>
                        <span className={`badge ${u.ativo ? 'badge-success' : 'badge-danger'}`}>
                          {u.ativo ? 'Acesso Liberado' : 'Acesso Bloqueado'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-secondary" style={{padding: '6px 12px', fontSize: '12px'}} onClick={() => handleEditClick(u)}>Editar Perfil</button>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Criar Usuário */}
      <div className={`modal-overlay ${isCreateModalOpen ? 'active' : ''}`}>
        <div className="modal" style={{maxWidth: '450px'}}>
          <div className="modal-header">
            <h2>Cadastrar Novo Usuário</h2>
            <button className="close-modal" onClick={() => setIsCreateModalOpen(false)}>&times;</button>
          </div>
          <div className="modal-body">
            <form id="form-create-user" onSubmit={handleCreateSubmit}>
              <div className="form-group">
                <label>Nome Completo</label>
                <input type="text" className="form-control" value={createForm.nome} onChange={e => setCreateForm({...createForm, nome: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>E-mail (Login)</label>
                <input type="email" className="form-control" value={createForm.email} onChange={e => setCreateForm({...createForm, email: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Senha Inicial</label>
                <input type="password" className="form-control" value={createForm.senha} onChange={e => setCreateForm({...createForm, senha: e.target.value})} required minLength={6} />
              </div>
              <div className="form-group">
                <label>Perfil de Acesso</label>
                <select className="form-control" value={createForm.perfil} onChange={e => setCreateForm({...createForm, perfil: e.target.value})}>
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
