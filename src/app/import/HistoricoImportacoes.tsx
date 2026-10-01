'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/supabase/useAuth';

export function HistoricoImportacoes() {
  const { token } = useAuth();
  const [dados, setDados] = useState<any[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch('/api/importacoes', { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setDados(j.importacoes ?? []); })
      .catch(e => setErro(e.message));
  }, [token]);

  if (erro) return <div className="card" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>{erro}</div>;

  return (
    <div className="card">
      <h3>Histórico de importações</h3>
      <div className="tblwrap">
        <table>
          <thead><tr><th>Arquivo</th><th>Data</th><th>Total</th><th>Novos</th><th>Existentes</th><th>Duplicados</th><th>Erros</th><th>Status</th></tr></thead>
          <tbody>
            {dados.map(d => (
              <tr key={d.id}>
                <td>{d.nome_arquivo}</td>
                <td>{new Date(d.data_importacao).toLocaleString('pt-BR')}</td>
                <td>{d.total_registros}</td><td>{d.novos}</td><td>{d.ja_existentes}</td>
                <td>{d.duplicados_arquivo}</td><td>{d.erros}</td><td>{d.status}</td>
              </tr>
            ))}
            {dados.length === 0 && <tr><td colSpan={8} className="hint">Nenhuma importação registrada ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
