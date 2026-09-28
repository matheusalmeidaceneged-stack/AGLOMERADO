'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/supabase/useAuth';

export default function Dashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [recentes, setRecentes] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setStats(d.stats); setRecentes(d.importacoes_recentes ?? []); });
  }, [token]);

  return (
    <div>
      <h2>Dashboard</h2>
      {stats && (
        <div className="summary" style={{ marginBottom: 16 }}>
          <div className="card stat"><b>{stats.total_execucoes}</b>Execuções no banco</div>
          <div className="card stat"><b>{stats.total_instalacoes}</b>Instalações distintas</div>
          <div className="card stat"><b>{stats.total_aglomerados}</b>Aglomerados detectados</div>
          <div className="card stat"><b>{stats.total_importacoes}</b>Importações realizadas</div>
          <div className="card stat" style={{ color: stats.erros_ultimos_7_dias > 0 ? 'var(--red)' : undefined }}>
            <b>{stats.erros_ultimos_7_dias}</b>Erros (últimos 7 dias)
          </div>
        </div>
      )}
      <div className="hint" style={{ marginBottom: 8 }}>
        Última importação: {stats?.ultima_importacao ? new Date(stats.ultima_importacao).toLocaleString('pt-BR') : '—'}
        {' · '}<a href="/aglomerados">ver mapa de aglomerados</a>{' · '}<a href="/auditorias">ver auditoria</a>
      </div>

      <div className="card">
        <strong>Importações recentes</strong>
        <div className="tblwrap" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>Arquivo</th><th>Data</th><th>Total</th><th>Novos</th><th>Existentes</th><th>Duplicados</th><th>Erros</th><th>Status</th></tr></thead>
            <tbody>
              {recentes.map(d => (
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
        <div className="hint" style={{ marginTop: 8 }}><a href="/historico">ver histórico completo →</a></div>
      </div>
    </div>
  );
}
