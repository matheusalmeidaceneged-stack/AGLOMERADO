'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/supabase/useAuth';

export default function Historico() {
  const { token } = useAuth();
  const [dados, setDados] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/importacoes', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setDados(d.importacoes ?? []));
  }, [token]);

  return (
    <div>
      <h2>Histórico de importações</h2>
      <div className="card tblwrap">
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
