"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false); // true when Supabase confirmed the recovery token
  const [message, setMessage] = useState(null);
  const router = useRouter();

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when the user arrives via the reset link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setMessage({ type: 'error', text: 'As senhas não coincidem.' });
      return;
    }
    if (password.length < 6) {
      setMessage({ type: 'error', text: 'A senha precisa ter pelo menos 6 caracteres.' });
      return;
    }
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Senha alterada com sucesso! Redirecionando...' });
      setTimeout(() => router.push('/'), 2000);
    }
    setLoading(false);
  };

  return (
    <div id="login-screen">
      <div className="login-box">
        <img src="/logo.png" alt="Newmark" className="brand-logo" />
        <p>Redefinir Senha</p>

        {message && (
          <div style={{ color: message.type === 'error' ? 'var(--danger)' : '#059669', marginBottom: '16px', fontSize: '14px', lineHeight: 1.5 }}>
            {message.text}
          </div>
        )}

        {!ready ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Validando link... Se esta página não carregar, o link pode ter expirado.{' '}
            <button onClick={() => router.push('/login')} style={{ background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', textDecoration: 'underline', fontSize: '13px' }}>
              Voltar ao login
            </button>
          </p>
        ) : (
          <form onSubmit={handleReset}>
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label>Nova Senha</label>
              <input type="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label>Confirmar Senha</label>
              <input type="password" className="form-control" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={6} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar Nova Senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
