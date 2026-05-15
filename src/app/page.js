"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import ClientesModule from '@/components/ClientesModule';
import ContratosModule from '@/components/ContratosModule';
import ParcelasModule from '@/components/ParcelasModule';
import AlocacoesModule from '@/components/AlocacoesModule';
import DashboardModule from '@/components/DashboardModule';
import UsuariosModule from '@/components/UsuariosModule';
import EmissoesModule from '@/components/EmissoesModule';
import AgendaModule from '@/components/AgendaModule';

export default function Home() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const router = useRouter();

  // Minha Conta modal
  const [contaModal, setContaModal] = useState(false);
  const [contaTab, setContaTab] = useState('senha'); // 'senha' | 'email'
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [contaLoading, setContaLoading] = useState(false);
  const [contaMsg, setContaMsg] = useState(null);

  const openContaModal = () => {
    setContaModal(true);
    setContaTab('senha');
    setNovaSenha('');
    setConfirmarSenha('');
    setNovoEmail(session?.user?.email || '');
    setContaMsg(null);
  };

  const handleAlterarSenha = async (e) => {
    e.preventDefault();
    if (novaSenha !== confirmarSenha) { setContaMsg({ type: 'error', text: 'As senhas não coincidem.' }); return; }
    if (novaSenha.length < 6) { setContaMsg({ type: 'error', text: 'Mínimo de 6 caracteres.' }); return; }
    setContaLoading(true); setContaMsg(null);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) setContaMsg({ type: 'error', text: error.message });
    else { setContaMsg({ type: 'success', text: 'Senha alterada com sucesso!' }); setNovaSenha(''); setConfirmarSenha(''); }
    setContaLoading(false);
  };

  const handleAlterarEmail = async (e) => {
    e.preventDefault();
    setContaLoading(true); setContaMsg(null);
    const { error } = await supabase.auth.updateUser({ email: novoEmail.trim() });
    if (error) setContaMsg({ type: 'error', text: error.message });
    else setContaMsg({ type: 'success', text: 'Verifique o novo e-mail para confirmar a alteração.' });
    setContaLoading(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login');
      } else {
        setSession(session);
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        router.push('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return <div style={{display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center'}}>Carregando plataforma...</div>;
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <img src="/logo.png" alt="Newmark" className="brand-logo" />
        
        <div className="nav-links">
          <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            Dashboard
          </div>
          <div className={`nav-item ${activeTab === 'clientes' ? 'active' : ''}`} onClick={() => setActiveTab('clientes')}>
            Clientes
          </div>
          <div className={`nav-item ${activeTab === 'contratos' ? 'active' : ''}`} onClick={() => setActiveTab('contratos')}>
            Contratos
          </div>
          <div className={`nav-item ${activeTab === 'parcelas' ? 'active' : ''}`} onClick={() => setActiveTab('parcelas')}>
            Parcelas
          </div>
          <div className={`nav-item ${activeTab === 'alocacoes' ? 'active' : ''}`} onClick={() => setActiveTab('alocacoes')}>
            Alocações
          </div>
          <div className={`nav-item ${activeTab === 'emissoes' ? 'active' : ''}`} onClick={() => setActiveTab('emissoes')}>
            Emissões
          </div>
          <div className={`nav-item ${activeTab === 'agenda' ? 'active' : ''}`} onClick={() => setActiveTab('agenda')}>
            Agenda
          </div>
          <div className={`nav-item ${activeTab === 'usuarios' ? 'active' : ''}`} onClick={() => setActiveTab('usuarios')}>
            Usuários
          </div>
        </div>

        <div className="user-profile" style={{ cursor: 'pointer' }} onClick={openContaModal} title="Minha Conta">
          <div className="avatar">A</div>
          <div className="user-info" style={{flex: 1}}>
            <span className="user-name">Administrador</span>
            <span className="user-role" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{session?.user?.email}</span>
          </div>
          <button className="btn btn-secondary" style={{padding: '4px 8px'}} onClick={e => { e.stopPropagation(); handleLogout(); }}>Sair</button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header">
          <h1 id="header-title" style={{textTransform: 'capitalize'}}>{activeTab}</h1>
          <div className="header-actions" style={{display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center'}}>
            <button 
              className="btn btn-primary" 
              style={{ padding: '6px 12px', fontSize: '13px' }}
              onClick={() => {
                setActiveTab('contratos');
                setTimeout(() => window.dispatchEvent(new CustomEvent('global:novoContrato')), 100);
              }}
            >
              + Novo Contrato
            </button>
            <button 
              className="btn btn-primary" 
              style={{ padding: '6px 12px', fontSize: '13px' }}
              onClick={() => {
                setActiveTab('emissoes');
                setTimeout(() => window.dispatchEvent(new CustomEvent('global:novaEmissao')), 100);
              }}
            >
              + Emitir Nota/Boleto
            </button>
            <button className="btn btn-secondary">Notificações <span className="badge badge-danger" style={{marginLeft: '8px'}}>0</span></button>
          </div>
        </header>

        {activeTab === 'dashboard' && <DashboardModule />}
        
        {activeTab === 'clientes' && <ClientesModule />}
        {activeTab === 'contratos' && <ContratosModule />}
        {activeTab === 'parcelas' && <ParcelasModule />}
        {activeTab === 'alocacoes' && <AlocacoesModule />}
        {activeTab === 'emissoes' && <EmissoesModule />}
        {activeTab === 'agenda' && <AgendaModule />}
        {activeTab === 'usuarios' && <UsuariosModule />}
      </main>

      {/* ── Modal Minha Conta ──────────────────────────────────────────────── */}
      <div className={`modal-overlay ${contaModal ? 'active' : ''}`}>
        <div className="modal" style={{ maxWidth: '420px' }}>
          <div className="modal-header">
            <h2>Minha Conta</h2>
            <button className="close-modal" onClick={() => setContaModal(false)}>&times;</button>
          </div>
          <div className="modal-body">
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', marginBottom: '20px' }}>
              {[['senha', 'Alterar Senha'], ['email', 'Alterar E-mail']].map(([val, label]) => (
                <button key={val} onClick={() => { setContaTab(val); setContaMsg(null); }} style={{
                  flex: 1, padding: '8px', fontSize: '13px', border: 'none', cursor: 'pointer',
                  borderRight: val === 'senha' ? '1px solid var(--border)' : 'none',
                  backgroundColor: contaTab === val ? 'var(--secondary)' : 'transparent',
                  color: contaTab === val ? '#fff' : 'var(--text-main)',
                  fontWeight: contaTab === val ? 700 : 400,
                }}>
                  {label}
                </button>
              ))}
            </div>

            {contaMsg && (
              <div style={{ color: contaMsg.type === 'error' ? 'var(--danger)' : '#059669', marginBottom: '16px', fontSize: '13px', lineHeight: 1.5 }}>
                {contaMsg.text}
              </div>
            )}

            {contaTab === 'senha' && (
              <form onSubmit={handleAlterarSenha}>
                <div className="form-group">
                  <label>Nova Senha</label>
                  <input type="password" className="form-control" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} required minLength={6} />
                </div>
                <div className="form-group">
                  <label>Confirmar Nova Senha</label>
                  <input type="password" className="form-control" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} required minLength={6} />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={contaLoading}>
                  {contaLoading ? 'Salvando...' : 'Salvar Nova Senha'}
                </button>
              </form>
            )}

            {contaTab === 'email' && (
              <form onSubmit={handleAlterarEmail}>
                <div className="form-group">
                  <label>E-mail Atual</label>
                  <input type="email" className="form-control" value={session?.user?.email || ''} disabled style={{ opacity: 0.6 }} />
                </div>
                <div className="form-group">
                  <label>Novo E-mail</label>
                  <input type="email" className="form-control" value={novoEmail} onChange={e => setNovoEmail(e.target.value)} required />
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
                  Um link de confirmação será enviado para o novo e-mail. A alteração só é efetivada após confirmar.
                </p>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={contaLoading}>
                  {contaLoading ? 'Enviando...' : 'Solicitar Alteração de E-mail'}
                </button>
              </form>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setContaModal(false)}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
