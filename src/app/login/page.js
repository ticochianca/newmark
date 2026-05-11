"use client";

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'error'|'success', text }
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (error) {
      setMessage({ type: 'error', text: 'E-mail ou senha incorretos.' });
    } else {
      router.push('/');
    }
    setLoading(false);
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'E-mail enviado! Verifique sua caixa de entrada (ou spam) e clique no link para redefinir a senha.' });
    }
    setLoading(false);
  };

  return (
    <div id="login-screen">
      <div className="login-box">
        <img src="/logo.png" alt="Newmark" className="brand-logo" />
        <p>Gestão de Clientes e Contratos</p>

        {message && (
          <div style={{ color: message.type === 'error' ? 'var(--danger)' : '#059669', marginBottom: '16px', fontSize: '14px', lineHeight: 1.5 }}>
            {message.text}
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin}>
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label>E-mail</label>
              <input type="email" className="form-control" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label>Senha</label>
              <input type="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={loading}>
              {loading ? 'Processando...' : 'Entrar na Plataforma'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleForgot}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', textAlign: 'left' }}>
              Digite seu e-mail e enviaremos um link para redefinir a senha.
            </p>
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label>E-mail</label>
              <input type="email" className="form-control" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar link de redefinição'}
            </button>
          </form>
        )}

        <div style={{ marginTop: '20px' }}>
          {mode === 'login' ? (
            <button onClick={() => { setMode('forgot'); setMessage(null); }} style={{ background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', fontSize: '14px', textDecoration: 'underline' }}>
              Esqueci minha senha
            </button>
          ) : (
            <button onClick={() => { setMode('login'); setMessage(null); }} style={{ background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', fontSize: '14px', textDecoration: 'underline' }}>
              ← Voltar para o login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
