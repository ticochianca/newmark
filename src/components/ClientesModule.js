"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function ClientesModule() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClienteId, setEditingClienteId] = useState(null);

  // Full form state
  const [apelido, setApelido] = useState('');
  const [endereco, setEndereco] = useState('');
  const [numeroEndereco, setNumeroEndereco] = useState('');
  const [complementoEndereco, setComplementoEndereco] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [cep, setCep] = useState('');
  const [telefone, setTelefone] = useState('');
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [emailsCobranca, setEmailsCobranca] = useState(['']);
  const [status, setStatus] = useState('Prospect');
  const [observacoes, setObservacoes] = useState('');
  const [propostaFile, setPropostaFile] = useState(null);
  const [propostaUrlAtual, setPropostaUrlAtual] = useState('');
  const [uploadingProposta, setUploadingProposta] = useState(false);

  // Quick prospect modal state
  const [prospectModal, setProspectModal] = useState(false);
  const [prospectApelido, setProspectApelido] = useState('');
  const [prospectFile, setProspectFile] = useState(null);
  const [prospectSaving, setProspectSaving] = useState(false);

  const fetchClientes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nome', { ascending: true });
    if (error) console.error('Erro ao buscar clientes:', error);
    else setClientes(data);
    setLoading(false);
  };

  useEffect(() => { fetchClientes(); }, []);

  // ─── Prospect rápido ──────────────────────────────────────────────────────

  const openProspectModal = () => {
    setProspectApelido('');
    setProspectFile(null);
    setProspectModal(true);
  };

  const handleSaveProspect = async (e) => {
    e.preventDefault();
    if (!prospectApelido.trim()) return;
    setProspectSaving(true);

    const { data: inserted, error: insertError } = await supabase
      .from('clientes')
      .insert([{ apelido: prospectApelido.trim(), nome: prospectApelido.trim(), status: 'Prospect', cnpj: '' }])
      .select('id')
      .single();

    if (insertError) { alert('Erro ao salvar: ' + insertError.message); setProspectSaving(false); return; }

    if (prospectFile) {
      const fd = new FormData();
      fd.append('file', prospectFile);
      fd.append('clienteId', inserted.id);
      const res = await fetch('/api/clientes/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.error) { alert('Erro no upload: ' + json.error); setProspectSaving(false); return; }
      await supabase.from('clientes').update({ proposta_url: json.url }).eq('id', inserted.id);
    }

    setProspectSaving(false);
    setProspectModal(false);
    fetchClientes();
  };

  // ─── Cadastro completo ────────────────────────────────────────────────────

  const openNewModal = () => {
    setApelido(''); setNome(''); setCnpj(''); setEmailsCobranca(['']);
    setStatus('Prospect'); setObservacoes('');
    setEndereco(''); setNumeroEndereco(''); setComplementoEndereco('');
    setBairro(''); setCidade(''); setEstado(''); setCep(''); setTelefone('');
    setPropostaFile(null); setPropostaUrlAtual('');
    setEditingClienteId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (cliente) => {
    setApelido(cliente.apelido || '');
    setNome(cliente.nome);
    setCnpj(cliente.cnpj || '');
    setEmailsCobranca(cliente.email_cobranca ? cliente.email_cobranca.split(',').map(e => e.trim()) : ['']);
    setStatus(cliente.status || 'Prospect');
    setObservacoes(cliente.observacoes || '');
    setEndereco(cliente.endereco || '');
    setNumeroEndereco(cliente.numero_endereco || '');
    setComplementoEndereco(cliente.complemento_endereco || '');
    setBairro(cliente.bairro || '');
    setCidade(cliente.cidade || '');
    setEstado(cliente.estado || '');
    setCep(cliente.cep || '');
    setTelefone(cliente.telefone || '');
    setPropostaFile(null);
    setPropostaUrlAtual(cliente.proposta_url || '');
    setEditingClienteId(cliente.id);
    setIsModalOpen(true);
  };

  const handleDeleteCliente = async (id) => {
    if (!confirm('Excluir este prospect? Esta ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (error) alert('Erro ao excluir: ' + error.message);
    else fetchClientes();
  };

  const handleEmailChange = (index, value) => {
    const newEmails = [...emailsCobranca];
    newEmails[index] = value;
    setEmailsCobranca(newEmails);
  };

  const handleSaveCliente = async (e) => {
    e.preventDefault();

    let clienteId = editingClienteId;
    if (!clienteId) {
      const { data: inserted, error: insertError } = await supabase
        .from('clientes')
        .insert([{ apelido, nome, cnpj, email_cobranca: emailsCobranca.filter(e => e.trim() !== '').join(', '), status, observacoes }])
        .select('id')
        .single();
      if (insertError) { alert('Erro ao salvar cliente: ' + insertError.message); return; }
      clienteId = inserted.id;
    }

    let propostaUrl = propostaUrlAtual;
    if (propostaFile) {
      setUploadingProposta(true);
      const fd = new FormData();
      fd.append('file', propostaFile);
      fd.append('clienteId', clienteId);
      const res = await fetch('/api/clientes/upload', { method: 'POST', body: fd });
      const json = await res.json();
      setUploadingProposta(false);
      if (json.error) { alert('Erro no upload da proposta: ' + json.error); return; }
      propostaUrl = json.url;
    }

    const { error } = await supabase.from('clientes').update({
      apelido, nome, cnpj,
      email_cobranca: emailsCobranca.filter(e => e.trim() !== '').join(', '),
      status, observacoes,
      proposta_url: propostaUrl || null,
      endereco: endereco || null,
      numero_endereco: numeroEndereco || null,
      complemento_endereco: complementoEndereco || null,
      bairro: bairro || null,
      cidade: cidade || null,
      estado: estado || null,
      cep: cep || null,
      telefone: telefone || null,
    }).eq('id', clienteId);

    if (error) { alert('Erro ao salvar cliente: ' + error.message); return; }
    setIsModalOpen(false);
    fetchClientes();
  };

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <section className="content-area active">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <input type="text" className="form-control" placeholder="Buscar por nome ou CNPJ..." style={{ width: '300px' }} />
          <select className="form-control" style={{ width: '180px' }}>
            <option value="">Todos os Status</option>
            <option value="Ativo">Ativos</option>
            <option value="Inativo">Inativos</option>
            <option value="Prospect">Prospects</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={openProspectModal}>+ Novo Prospect</button>
          <button className="btn btn-primary" onClick={openNewModal}>Novo Cliente</button>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Apelido</th>
              <th>Razão Social</th>
              <th>CNPJ</th>
              <th>E-mail de Cobrança</th>
              <th style={{ textAlign: 'center' }}>Proposta</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={{ textAlign: 'center' }}>Carregando...</td></tr>
            ) : clientes.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center' }}>Nenhum cliente cadastrado.</td></tr>
            ) : clientes.map(cliente => (
              <tr key={cliente.id}>
                <td><strong>{cliente.apelido || '-'}</strong></td>
                <td>{cliente.nome}</td>
                <td>{cliente.cnpj || '-'}</td>
                <td>
                  {cliente.email_cobranca
                    ? cliente.email_cobranca.split(',').map((email, idx) => (
                        <div key={idx} style={{ fontSize: '13px' }}>{email.trim()}</div>
                      ))
                    : '-'}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {cliente.proposta_url
                    ? <a href={cliente.proposta_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--secondary)', textDecoration: 'underline' }}>Ver PDF</a>
                    : <span style={{ fontSize: '11px', color: '#ef4444' }}>Sem proposta</span>
                  }
                </td>
                <td>
                  <span className={`badge badge-${cliente.status === 'Ativo' ? 'success' : cliente.status === 'Prospect' ? 'info' : 'neutral'}`}>
                    {cliente.status}
                  </span>
                </td>
                <td>
                  <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => openEditModal(cliente)}>
                    ✏️ Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal Novo Prospect ───────────────────────────────────────────────── */}
      <div className={`modal-overlay ${prospectModal ? 'active' : ''}`}>
        <div className="modal" style={{ maxWidth: '420px' }}>
          <div className="modal-header">
            <h2>Novo Prospect</h2>
            <button className="close-modal" onClick={() => setProspectModal(false)}>&times;</button>
          </div>
          <div className="modal-body">
            <form id="form-prospect" onSubmit={handleSaveProspect}>
              <div className="form-group">
                <label>Apelido / Nome do cliente</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Ex: Empresa XYZ"
                  value={prospectApelido}
                  onChange={e => setProspectApelido(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Proposta enviada
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>PDF — opcional, pode adicionar depois</span>
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  className="form-control"
                  style={{ padding: '4px', fontSize: '12px', cursor: 'pointer' }}
                  onChange={e => setProspectFile(e.target.files[0] || null)}
                />
              </div>
              <div style={{ marginTop: '14px', padding: '10px 12px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', fontSize: '12px', color: '#0369a1' }}>
                O cliente será criado com status <strong>Prospect</strong>. Complete o cadastro (CNPJ, e-mail, etc.) depois em Editar.
              </div>
            </form>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setProspectModal(false)}>Cancelar</button>
            <button type="submit" form="form-prospect" className="btn btn-primary" disabled={prospectSaving}>
              {prospectSaving ? 'Salvando...' : 'Criar Prospect'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal Cadastro Completo ───────────────────────────────────────────── */}
      <div className={`modal-overlay ${isModalOpen ? 'active' : ''}`}>
        <div className="modal">
          <div className="modal-header">
            <h2>{editingClienteId ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}</h2>
            <button className="close-modal" onClick={() => setIsModalOpen(false)}>&times;</button>
          </div>
          <div className="modal-body">
            <form id="form-cliente" onSubmit={handleSaveCliente}>
              <div className="form-group">
                <label>Apelido</label>
                <input type="text" className="form-control" placeholder="Nome curto ou fantasia" value={apelido} onChange={e => setApelido(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Razão Social</label>
                <input type="text" className="form-control" placeholder="Razão social completa" value={nome} onChange={e => setNome(e.target.value)} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>CNPJ</label>
                  <input type="text" className="form-control" placeholder="00.000.000/0000-00" value={cnpj} onChange={e => setCnpj(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select className="form-control" value={status} onChange={e => setStatus(e.target.value)} required>
                    <option value="Prospect">Prospect</option>
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>E-mails de Cobrança</label>
                {emailsCobranca.map((email, index) => (
                  <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="email"
                      className="form-control"
                      placeholder="financeiro@empresa.com"
                      value={email}
                      onChange={e => handleEmailChange(index, e.target.value)}
                    />
                    {emailsCobranca.length > 1 && (
                      <button type="button" onClick={() => setEmailsCobranca(emailsCobranca.filter((_, i) => i !== index))}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '18px', padding: '0 8px' }}>
                        &times;
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setEmailsCobranca([...emailsCobranca, ''])}
                  className="action-link" style={{ background: 'none', border: 'none', padding: 0, fontSize: '12px' }}>
                  + Adicionar outro e-mail
                </button>
              </div>
              <div className="form-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '4px' }}>
                <label style={{ color: 'var(--secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Endereço
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>preenchido automaticamente ao fazer upload da NF</span>
                </label>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 3 }}>
                  <label style={{ fontSize: '12px' }}>Logradouro</label>
                  <input type="text" className="form-control" placeholder="Av. Paulista" value={endereco} onChange={e => setEndereco(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px' }}>Número</label>
                  <input type="text" className="form-control" placeholder="1000" value={numeroEndereco} onChange={e => setNumeroEndereco(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label style={{ fontSize: '12px' }}>Complemento</label>
                  <input type="text" className="form-control" placeholder="Sala 301" value={complementoEndereco} onChange={e => setComplementoEndereco(e.target.value)} />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '12px' }}>Bairro</label>
                  <input type="text" className="form-control" placeholder="Bela Vista" value={bairro} onChange={e => setBairro(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label style={{ fontSize: '12px' }}>Cidade</label>
                  <input type="text" className="form-control" placeholder="São Paulo" value={cidade} onChange={e => setCidade(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px' }}>Estado</label>
                  <input type="text" className="form-control" placeholder="SP" maxLength={2} value={estado} onChange={e => setEstado(e.target.value.toUpperCase())} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px' }}>CEP</label>
                  <input type="text" className="form-control" placeholder="00000000" value={cep} onChange={e => setCep(e.target.value.replace(/\D/g, ''))} />
                </div>
              </div>
              <div className="form-group">
                <label style={{ fontSize: '12px' }}>Telefone</label>
                <input type="text" className="form-control" placeholder="(11) 99999-9999" value={telefone} onChange={e => setTelefone(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Observações</label>
                <textarea className="form-control" rows="3" value={observacoes} onChange={e => setObservacoes(e.target.value)} />
              </div>
              <div className="form-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--secondary)', fontWeight: 700 }}>
                  Proposta / Contrato enviado
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>PDF</span>
                </label>
                {propostaUrlAtual && (
                  <div style={{ marginBottom: '8px' }}>
                    <a href={propostaUrlAtual} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '12px', color: 'var(--secondary)', textDecoration: 'underline' }}>
                      → Ver proposta atual
                    </a>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>(novo upload substituirá)</span>
                  </div>
                )}
                <input
                  type="file"
                  accept=".pdf"
                  className="form-control"
                  style={{ padding: '4px', fontSize: '12px', cursor: 'pointer' }}
                  onChange={e => setPropostaFile(e.target.files[0] || null)}
                />
                {uploadingProposta && <span style={{ fontSize: '12px', color: 'var(--secondary)', marginTop: '4px', display: 'block' }}>Enviando PDF...</span>}
              </div>
            </form>
          </div>
          <div className="modal-footer">
            {editingClienteId && status === 'Prospect' && (
              <button type="button" className="btn btn-secondary" style={{ color: '#ef4444', marginRight: 'auto' }}
                onClick={() => { if (confirm('Excluir este prospect? Esta ação não pode ser desfeita.')) { handleDeleteCliente(editingClienteId); setIsModalOpen(false); } }}>
                Excluir Prospect
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
            <button type="submit" form="form-cliente" className="btn btn-primary">Salvar Cliente</button>
          </div>
        </div>
      </div>
    </section>
  );
}
