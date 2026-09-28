'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/supabase/useAuth';

const LINKS: [string, string][] = [
  ['/dashboard', 'Dashboard'],
  ['/import', 'Importar'],
  ['/aglomerados', 'Aglomerados'],
  ['/duplicados', 'Instalações duplicadas'],
  ['/historico', 'Histórico'],
  ['/auditorias', 'Registro de auditoria'],
];

export function NavBar() {
  const { token, email, loading, signIn, signOut } = useAuth();
  const pathname = usePathname();
  const [em, setEm] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState<string | null>(null);

  if (loading) return <div className="nav"><span className="brand">CNL</span></div>;

  if (!token) {
    return (
      <div className="nav">
        <span className="brand">CNL · Auditoria de aglomerados</span>
        <span className="sp" />
        <input type="email" placeholder="e-mail" value={em} onChange={e => setEm(e.target.value)} style={{ width: 190 }} />
        <input type="password" placeholder="senha" value={pw} onChange={e => setPw(e.target.value)} style={{ width: 140 }} />
        <button className="secondary" onClick={async () => setErr(await signIn(em, pw))}>Entrar</button>
        {err && <span className="err">{err}</span>}
      </div>
    );
  }

  return (
    <div className="nav">
      <span className="brand">CNL · Auditoria de aglomerados</span>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={`link ${pathname?.startsWith(href) ? 'ativo' : ''}`}>{label}</Link>
      ))}
      <span className="sp" />
      <span className="user">{email}</span>
      <button className="secondary" onClick={signOut}>Sair</button>
    </div>
  );
}
