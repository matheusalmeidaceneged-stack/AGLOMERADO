'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/supabase/useAuth';

const ROTULOS: Record<string, string> = {
  importacao_iniciada: 'Importação iniciada',
  importacao_finalizada: 'Importação finalizada',
  analise_aglomerado: 'Análise de aglomerado',
};

export default function Auditorias() {
  const { token } = useAuth();
  const [dados, setDados] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/auditorias', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setDados(d.auditorias ?? []));
  }, [token]);

  return (
    <div>
      <h2>Auditoria</h2>
      <div className="hint" style={{ marginBottom: 10 }}>Registro de quem fez o quê e quando — início/fim de cada importação.</div>
      <div className="card tblwrap">
        <table>
          <thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead>
          <tbody>
            {dados.map(a => (
              <tr key={a.id}>
                <td>{new Date(a.created_at).toLocaleString('pt-BR')}</td>
                <td>{a.usuario_email ?? '—'}</td>
                <td>{ROTULOS[a.tipo] ?? a.tipo}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '.75rem' }}>{JSON.stringify(a.detalhes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
