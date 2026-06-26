"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// Textarea com botões de Negrito e Link, que inserem sintaxe **texto** e [texto](url).
// O texto é salvo como texto puro; a renderização no site público interpreta essa sintaxe.
function RichTextarea({ value, onChange, rows = 5, placeholder, required }) {
  const ref = useRef(null);

  const wrapSelection = (before, after) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || 'texto';
    const newValue = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(newValue);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const handleBold = () => wrapSelection('**', '**');
  const handleItalic = () => wrapSelection('*', '*');
  const handleLink = () => {
    const url = window.prompt('URL do link:', 'https://');
    if (!url) return;
    wrapSelection('[', `](${url})`);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
        <button type="button" onClick={handleBold} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px', fontWeight: 700 }}>B</button>
        <button type="button" onClick={handleItalic} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px', fontStyle: 'italic' }}>I</button>
        <button type="button" onClick={handleLink} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }}>🔗 Link</button>
      </div>
      <textarea
        ref={ref}
        className="form-control"
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
      />
      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Selecione um trecho e clique em B ou Link para formatar.</span>
    </div>
  );
}

export default function SiteModule({ permissao }) {
  const podeAlterar = permissao === 'alterar';
  const [tab, setTab] = useState('cases');
  const tabs = [['cases', 'Cases'], ['artigos', 'Artigos'], ['clientes', 'Clientes'], ['contatos', 'Contatos']];

  return (
    <section className="content-area active">
      <div style={{ display: 'flex', gap: '0', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', marginBottom: '24px', maxWidth: '480px' }}>
        {tabs.map(([val, label], idx) => (
          <button key={val} onClick={() => setTab(val)} style={{
            flex: 1, padding: '10px', fontSize: '13px', border: 'none', cursor: 'pointer',
            borderRight: idx < tabs.length - 1 ? '1px solid var(--border)' : 'none',
            backgroundColor: tab === val ? 'var(--secondary)' : 'transparent',
            color: tab === val ? '#fff' : 'var(--text-main)',
            fontWeight: tab === val ? 700 : 400,
          }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'cases' && <CasesTab podeAlterar={podeAlterar} />}
      {tab === 'artigos' && <ArtigosTab podeAlterar={podeAlterar} />}
      {tab === 'clientes' && <ClientesTab podeAlterar={podeAlterar} />}
      {tab === 'contatos' && <ContatosTab podeAlterar={podeAlterar} />}
    </section>
  );
}

// Setinhas para subir/descer um item na lista, trocando o valor de "ordem" com o vizinho.
function ReorderButtons({ index, total, onMove }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ padding: '1px 7px', fontSize: '11px', lineHeight: 1, opacity: index === 0 ? 0.3 : 1 }}
        disabled={index === 0}
        onClick={() => onMove(index, 'up')}
        title="Mover para cima"
      >▲</button>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ padding: '1px 7px', fontSize: '11px', lineHeight: 1, opacity: index === total - 1 ? 0.3 : 1 }}
        disabled={index === total - 1}
        onClick={() => onMove(index, 'down')}
        title="Mover para baixo"
      >▼</button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Cases
// ───────────────────────────────────────────────────────────────────────────

function CasesTab({ podeAlterar }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [categoria, setCategoria] = useState('');
  const [descricao, setDescricao] = useState('');
  const [imagemFile, setImagemFile] = useState(null);
  const [imagemUrlAtual, setImagemUrlAtual] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('site_cases').select('*').order('ordem', { ascending: true }).order('created_at', { ascending: true });
    if (error) console.error('Erro ao buscar cases:', error);
    else setItems(data);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const handleMove = async (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const a = items[index], b = items[targetIndex];
    await Promise.all([
      supabase.from('site_cases').update({ ordem: b.ordem }).eq('id', a.id),
      supabase.from('site_cases').update({ ordem: a.ordem }).eq('id', b.id),
    ]);
    fetchItems();
  };

  const openNew = () => {
    setEditingId(null); setCategoria(''); setDescricao('');
    setImagemFile(null); setImagemUrlAtual('');
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id); setCategoria(item.categoria); setDescricao(item.descricao);
    setImagemFile(null); setImagemUrlAtual(item.imagem_url || '');
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    let itemId = editingId;
    if (!itemId) {
      const { data: inserted, error: insertError } = await supabase
        .from('site_cases')
        .insert([{ categoria, descricao, ordem: items.length }])
        .select('id')
        .single();
      if (insertError) { alert('Erro ao salvar: ' + insertError.message); setSaving(false); return; }
      itemId = inserted.id;
    }

    let imagemUrl = imagemUrlAtual;
    if (imagemFile) {
      const fd = new FormData();
      fd.append('file', imagemFile);
      fd.append('tipo', 'cases');
      fd.append('itemId', itemId);
      const res = await fetch('/api/site/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.error) { alert('Erro no upload da imagem: ' + json.error); setSaving(false); return; }
      imagemUrl = json.url;
    }

    const { error } = await supabase.from('site_cases').update({ categoria, descricao, imagem_url: imagemUrl || null }).eq('id', itemId);
    if (error) { alert('Erro ao salvar: ' + error.message); setSaving(false); return; }

    setSaving(false);
    setModalOpen(false);
    fetchItems();
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir este case? Esta ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('site_cases').delete().eq('id', id);
    if (error) alert('Erro ao excluir: ' + error.message);
    else fetchItems();
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        {podeAlterar && <button className="btn btn-primary" onClick={openNew}>+ Novo Case</button>}
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: '36px' }}></th>
              <th style={{ width: '80px' }}>Imagem</th>
              <th>Categoria</th>
              <th>Descrição</th>
              {podeAlterar && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" style={{ textAlign: 'center' }}>Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan="5" style={{ textAlign: 'center' }}>Nenhum case cadastrado.</td></tr>
            ) : items.map((item, idx) => (
              <tr key={item.id}>
                <td>{podeAlterar && <ReorderButtons index={idx} total={items.length} onMove={handleMove} />}</td>
                <td>
                  {item.imagem_url
                    ? <img src={item.imagem_url} alt={item.categoria} style={{ width: '56px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                    : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sem imagem</span>}
                </td>
                <td><strong>{item.categoria}</strong></td>
                <td style={{ maxWidth: '480px' }}>{item.descricao}</td>
                {podeAlterar && (
                  <td style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => openEdit(item)}>✏️ Editar</button>
                    <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => handleDelete(item.id)}>🗑️ Excluir</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`modal-overlay ${modalOpen ? 'active' : ''}`}>
        <div className="modal">
          <div className="modal-header">
            <h2>{editingId ? 'Editar Case' : 'Novo Case'}</h2>
            <button className="close-modal" onClick={() => setModalOpen(false)}>&times;</button>
          </div>
          <div className="modal-body">
            <form id="form-case" onSubmit={handleSave}>
              <div className="form-group">
                <label>Categoria / Título</label>
                <input type="text" className="form-control" placeholder="Ex: Construção Civil" value={categoria} onChange={e => setCategoria(e.target.value)} required autoFocus />
              </div>
              <div className="form-group">
                <label>Imagem</label>
                {imagemUrlAtual && !imagemFile && (
                  <img src={imagemUrlAtual} alt="" style={{ width: '100%', maxHeight: '140px', objectFit: 'cover', borderRadius: '4px', marginBottom: '8px' }} />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="form-control"
                  style={{ padding: '4px', fontSize: '12px', cursor: 'pointer' }}
                  onChange={e => setImagemFile(e.target.files[0] || null)}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Texto</label>
                <RichTextarea rows={5} placeholder="Descrição do case" value={descricao} onChange={setDescricao} required />
              </div>
            </form>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button type="submit" form="form-case" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Artigos
// ───────────────────────────────────────────────────────────────────────────

function ArtigosTab({ podeAlterar }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [titulo, setTitulo] = useState('');
  const [resumo, setResumo] = useState('');
  const [texto, setTexto] = useState('');
  const [imagemFile, setImagemFile] = useState(null);
  const [imagemUrlAtual, setImagemUrlAtual] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('site_artigos').select('*').order('ordem', { ascending: true }).order('created_at', { ascending: true });
    if (error) console.error('Erro ao buscar artigos:', error);
    else setItems(data);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const handleMove = async (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const a = items[index], b = items[targetIndex];
    await Promise.all([
      supabase.from('site_artigos').update({ ordem: b.ordem }).eq('id', a.id),
      supabase.from('site_artigos').update({ ordem: a.ordem }).eq('id', b.id),
    ]);
    fetchItems();
  };

  const openNew = () => {
    setEditingId(null); setTitulo(''); setResumo(''); setTexto(''); setImagemFile(null); setImagemUrlAtual('');
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id); setTitulo(item.titulo); setResumo(item.resumo || ''); setTexto(item.texto);
    setImagemFile(null); setImagemUrlAtual(item.imagem_url || '');
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    let itemId = editingId;
    if (!itemId) {
      const { data: inserted, error: insertError } = await supabase
        .from('site_artigos')
        .insert([{ titulo, resumo, texto, ordem: items.length }])
        .select('id')
        .single();
      if (insertError) { alert('Erro ao salvar: ' + insertError.message); setSaving(false); return; }
      itemId = inserted.id;
    }

    let imagemUrl = imagemUrlAtual;
    if (imagemFile) {
      const fd = new FormData();
      fd.append('file', imagemFile);
      fd.append('tipo', 'artigos');
      fd.append('itemId', itemId);
      const res = await fetch('/api/site/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.error) { alert('Erro no upload da imagem: ' + json.error); setSaving(false); return; }
      imagemUrl = json.url;
    }

    const { error } = await supabase.from('site_artigos').update({ titulo, resumo, texto, imagem_url: imagemUrl || null }).eq('id', itemId);
    if (error) { alert('Erro ao salvar: ' + error.message); setSaving(false); return; }

    setSaving(false);
    setModalOpen(false);
    fetchItems();
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir este artigo? Esta ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('site_artigos').delete().eq('id', id);
    if (error) alert('Erro ao excluir: ' + error.message);
    else fetchItems();
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        {podeAlterar && <button className="btn btn-primary" onClick={openNew}>+ Novo Artigo</button>}
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: '36px' }}></th>
              <th style={{ width: '80px' }}>Imagem</th>
              <th>Título</th>
              {podeAlterar && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" style={{ textAlign: 'center' }}>Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center' }}>Nenhum artigo cadastrado.</td></tr>
            ) : items.map((item, idx) => (
              <tr key={item.id}>
                <td>{podeAlterar && <ReorderButtons index={idx} total={items.length} onMove={handleMove} />}</td>
                <td>
                  {item.imagem_url
                    ? <img src={item.imagem_url} alt={item.titulo} style={{ width: '56px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                    : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sem imagem</span>}
                </td>
                <td><strong>{item.titulo}</strong></td>
                {podeAlterar && (
                  <td style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => openEdit(item)}>✏️ Editar</button>
                    <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => handleDelete(item.id)}>🗑️ Excluir</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`modal-overlay ${modalOpen ? 'active' : ''}`}>
        <div className="modal">
          <div className="modal-header">
            <h2>{editingId ? 'Editar Artigo' : 'Novo Artigo'}</h2>
            <button className="close-modal" onClick={() => setModalOpen(false)}>&times;</button>
          </div>
          <div className="modal-body">
            <form id="form-artigo" onSubmit={handleSave}>
              <div className="form-group">
                <label>Título</label>
                <input type="text" className="form-control" placeholder="Título do artigo" value={titulo} onChange={e => setTitulo(e.target.value)} required autoFocus />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Resumo em tópicos
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>um tópico por linha</span>
                </label>
                <textarea
                  className="form-control"
                  rows={4}
                  placeholder={'Ex:\nEconomize tempo com processos automatizados\nReduza custos com gestão eficiente'}
                  value={resumo}
                  onChange={e => setResumo(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Imagem</label>
                {imagemUrlAtual && !imagemFile && (
                  <img src={imagemUrlAtual} alt="" style={{ width: '100%', maxHeight: '140px', objectFit: 'cover', borderRadius: '4px', marginBottom: '8px' }} />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="form-control"
                  style={{ padding: '4px', fontSize: '12px', cursor: 'pointer' }}
                  onChange={e => setImagemFile(e.target.files[0] || null)}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Texto</label>
                <RichTextarea rows={5} placeholder="Conteúdo do artigo" value={texto} onChange={setTexto} required />
              </div>
            </form>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button type="submit" form="form-artigo" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Clientes (logos exibidos na grade "Cases de Sucesso" do site)
// ───────────────────────────────────────────────────────────────────────────

function ClientesTab({ podeAlterar }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [nome, setNome] = useState('');
  const [imagemFile, setImagemFile] = useState(null);
  const [imagemUrlAtual, setImagemUrlAtual] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('site_clientes').select('*').order('ordem', { ascending: true }).order('created_at', { ascending: true });
    if (error) console.error('Erro ao buscar clientes:', error);
    else setItems(data);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const handleMove = async (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const a = items[index], b = items[targetIndex];
    await Promise.all([
      supabase.from('site_clientes').update({ ordem: b.ordem }).eq('id', a.id),
      supabase.from('site_clientes').update({ ordem: a.ordem }).eq('id', b.id),
    ]);
    fetchItems();
  };

  const openNew = () => {
    setEditingId(null); setNome(''); setImagemFile(null); setImagemUrlAtual('');
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id); setNome(item.nome);
    setImagemFile(null); setImagemUrlAtual(item.logo_url || '');
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    let itemId = editingId;
    if (!itemId) {
      const { data: inserted, error: insertError } = await supabase
        .from('site_clientes')
        .insert([{ nome, ordem: items.length }])
        .select('id')
        .single();
      if (insertError) { alert('Erro ao salvar: ' + insertError.message); setSaving(false); return; }
      itemId = inserted.id;
    }

    let logoUrl = imagemUrlAtual;
    if (imagemFile) {
      const fd = new FormData();
      fd.append('file', imagemFile);
      fd.append('tipo', 'clientes');
      fd.append('itemId', itemId);
      const res = await fetch('/api/site/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.error) { alert('Erro no upload da imagem: ' + json.error); setSaving(false); return; }
      logoUrl = json.url;
    }

    const { error } = await supabase.from('site_clientes').update({ nome, logo_url: logoUrl || null }).eq('id', itemId);
    if (error) { alert('Erro ao salvar: ' + error.message); setSaving(false); return; }

    setSaving(false);
    setModalOpen(false);
    fetchItems();
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir este cliente? Esta ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('site_clientes').delete().eq('id', id);
    if (error) alert('Erro ao excluir: ' + error.message);
    else fetchItems();
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        {podeAlterar && <button className="btn btn-primary" onClick={openNew}>+ Novo Cliente</button>}
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: '36px' }}></th>
              <th style={{ width: '80px' }}>Logo</th>
              <th>Nome</th>
              {podeAlterar && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" style={{ textAlign: 'center' }}>Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center' }}>Nenhum cliente cadastrado.</td></tr>
            ) : items.map((item, idx) => (
              <tr key={item.id}>
                <td>{podeAlterar && <ReorderButtons index={idx} total={items.length} onMove={handleMove} />}</td>
                <td>
                  {item.logo_url
                    ? <img src={item.logo_url} alt={item.nome} style={{ width: '56px', height: '40px', objectFit: 'contain', borderRadius: '4px', background: '#f4f4f4' }} />
                    : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sem logo</span>}
                </td>
                <td><strong>{item.nome}</strong></td>
                {podeAlterar && (
                  <td style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => openEdit(item)}>✏️ Editar</button>
                    <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => handleDelete(item.id)}>🗑️ Excluir</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`modal-overlay ${modalOpen ? 'active' : ''}`}>
        <div className="modal">
          <div className="modal-header">
            <h2>{editingId ? 'Editar Cliente' : 'Novo Cliente'}</h2>
            <button className="close-modal" onClick={() => setModalOpen(false)}>&times;</button>
          </div>
          <div className="modal-body">
            <form id="form-cliente" onSubmit={handleSave}>
              <div className="form-group">
                <label>Nome do cliente</label>
                <input type="text" className="form-control" placeholder="Ex: Sport Recife" value={nome} onChange={e => setNome(e.target.value)} required autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Logo</label>
                {imagemUrlAtual && !imagemFile && (
                  <img src={imagemUrlAtual} alt="" style={{ maxWidth: '100%', maxHeight: '120px', objectFit: 'contain', borderRadius: '4px', marginBottom: '8px', background: '#f4f4f4', display: 'block' }} />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="form-control"
                  style={{ padding: '4px', fontSize: '12px', cursor: 'pointer' }}
                  onChange={e => setImagemFile(e.target.files[0] || null)}
                />
              </div>
            </form>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button type="submit" form="form-cliente" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Contatos (mensagens enviadas pelo formulário "Vamos conversar" do site)
// ───────────────────────────────────────────────────────────────────────────

function ContatosTab({ podeAlterar }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('site_contatos').select('*').order('created_at', { ascending: false });
    if (error) console.error('Erro ao buscar contatos:', error);
    else setItems(data);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const openView = async (item) => {
    setViewing(item);
    if (!item.lida) {
      await supabase.from('site_contatos').update({ lida: true }).eq('id', item.id);
      fetchItems();
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir esta mensagem? Esta ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('site_contatos').delete().eq('id', id);
    if (error) alert('Erro ao excluir: ' + error.message);
    else fetchItems();
  };

  const formatDate = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: '36px' }}></th>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Telefone</th>
              <th>Data</th>
              {podeAlterar && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ textAlign: 'center' }}>Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center' }}>Nenhuma mensagem recebida ainda.</td></tr>
            ) : items.map(item => (
              <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => openView(item)}>
                <td>{!item.lida && <span title="Não lida" style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent, #e54a35)' }} />}</td>
                <td><strong>{item.nome}</strong></td>
                <td>{item.email}</td>
                <td>{item.telefone || '—'}</td>
                <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatDate(item.created_at)}</td>
                {podeAlterar && (
                  <td>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                      onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                    >🗑️ Excluir</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`modal-overlay ${viewing ? 'active' : ''}`}>
        {viewing && (
          <div className="modal">
            <div className="modal-header">
              <h2>Mensagem de {viewing.nome}</h2>
              <button className="close-modal" onClick={() => setViewing(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>E-mail</label>
                <p>{viewing.email}</p>
              </div>
              <div className="form-group">
                <label>Telefone</label>
                <p>{viewing.telefone || '—'}</p>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Mensagem</label>
                <p style={{ whiteSpace: 'pre-wrap' }}>{viewing.mensagem}</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewing(null)}>Fechar</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
