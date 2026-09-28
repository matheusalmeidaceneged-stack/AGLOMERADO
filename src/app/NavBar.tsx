'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/supabase/useAuth';

export function NavBar() {
  const { token, email, loading, signIn, signOut } = useAuth();
  const [em, setEm] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState<string | null>(null);

  if (loading) return <div className="nav"><span className="brand">CNL</span></div>;

  if (!token) {
    return (
      <div className="nav">
        <span className="brand">CNL — Importação e Duplicidade</span>
        <input type="email" placeholder="e-mail" value={em} onChange={e => setEm(e.target.value)} style={{ width: 180 }} />
        <input type="password" placeholder="senha" value={pw} onChange={e => setPw(e.target.value)} style={{ width: 140 }} />
        <button className="secondary" onClick={async () => setErr(await signIn(em, pw))}>Entrar</button>
        {err && <span style={{ color: 'var(--red)', fontSize: '.8rem' }}>{err}</span>}
      </div>
    );
  }

  return (
    <div className="nav">
      <span className="brand">CNL — Importação e Duplicidade</span>
      <a href="/dashboard">Dashboard</a>
      <a href="/import">Importar</a>
      <a href="/historico">Histórico</a>
      <a href="/duplicados">Instalações duplicadas</a>
      <a href="/aglomerados">Mapa</a>
      <a href="/auditorias">Auditoria</a>
      <span className="hint">{email}</span>
      <button className="secondary" onClick={signOut}>Sair</button>
    </div>
  );
}
