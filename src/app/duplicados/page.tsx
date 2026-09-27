'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/supabase/useAuth';

export default function Duplicados() {
  const { token } = useAuth();
  const [dados, setDados] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/duplicados', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setDados(d.instalacoes ?? []));
  }, [token]);

  return (
    <div>
      <h2>Instalações duplicadas</h2>
      <div className="hint" style={{ marginBottom: 10 }}>
        Instalação aparece mais de uma vez no banco — pode ser execução legítima repetida. Nada aqui é excluído automaticamente.
      </div>
      <div className="card tblwrap">
        <table>
          <thead><tr><th>Instalação</th><th>Quantidade</th><th>Datas</th><th>Agentes distintos</th><th>Status</th></tr></thead>
          <tbody>
            {dados.map(d => (
              <tr key={d.instalacao}>
                <td>{d.instalacao}</td><td>{d.quantidade}</td>
                <td>{d.datas.slice(0, 5).join(', ')}{d.datas.length > 5 ? '…' : ''}</td>
                <td>{d.agentes}</td><td>{d.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
