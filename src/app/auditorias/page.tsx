'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/supabase/useAuth';

const STATUS: Record<string, { label: string; cor: string }> = {
  pendente: { label: 'Pendente', cor: '#ea580c' },
  em_analise: { label: 'Em análise', cor: '#2563eb' },
  procedente: { label: 'Irregularidade confirmada', cor: '#b91c1c' },
  improcedente: { label: 'Sem irregularidade', cor: '#16a34a' },
};
const ACOES: Record<string, string> = {
  analise_aglomerado: 'Análise de aglomerado',
  analise_subgrupo_aglomerado: 'Tratativa de subgrupo',
};
const fmt = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function Auditorias() {
  const { token } = useAuth();
  const [dados, setDados] = useState<any[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [acao, setAcao] = useState('');
  const [status, setStatus] = useState('');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch('/api/auditorias', { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setDados((j.auditorias ?? []).filter((a: any) => !a.tipo.startsWith('importacao'))); })
      .catch(e => setErro(e.message));
  }, [token]);

  const EH_ANALISE = ['analise_aglomerado', 'analise_subgrupo_aglomerado'];
  const filtrados = useMemo(() => dados.filter(a => {
    if (acao && a.tipo !== acao) return false;
    if (EH_ANALISE.includes(a.tipo) && status && a.detalhes?.status !== status) return false;
    if (busca) {
      const alvo = `${a.usuario_email ?? ''} ${a.detalhes?.observacao ?? ''} ${a.detalhes?.nota_dominante ?? ''} ${a.detalhes?.agentes?.join(' ') ?? ''}`.toLowerCase();
      if (!alvo.includes(busca.toLowerCase())) return false;
    }
    return true;
  }), [dados, acao, status, busca]);

  const totalAnalises = dados.filter(a => EH_ANALISE.includes(a.tipo)).length;
  const comTratativa = dados.filter(a => EH_ANALISE.includes(a.tipo) && a.detalhes?.observacao).length;

  if (erro) return <div className="card" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>{erro}</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Registro de auditoria</h2>
          <p className="hint">Quem analisou cada aglomerado, qual situação registrou e a tratativa aplicada — além do histórico de importações.</p>
        </div>
      </div>

      <div className="kpis small" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
        <div className="kpi blue"><b>{totalAnalises}</b><span>análises registradas</span></div>
        <div className="kpi green"><b>{comTratativa}</b><span>com tratativa escrita</span></div>
        <div className="kpi gray"><b>{dados.length}</b><span>eventos no total</span></div>
      </div>

      <div className="card">
        <div className="filtros" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <label>Ação
            <select value={acao} onChange={e => setAcao(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(ACOES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label>Situação registrada
            <select value={status} onChange={e => setStatus(e.target.value)} disabled={!!acao && !EH_ANALISE.includes(acao)}>
              <option value="">Todas</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label>Buscar (usuário, agente, nota, tratativa)
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="ex.: T25794" />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="tblwrap" style={{ maxHeight: 'none' }}>
          <table>
            <thead>
              <tr><th>Quando</th><th>Usuário</th><th>Ação</th><th>Aglomerado</th><th>Auditoria</th><th>Tratativa</th></tr>
            </thead>
            <tbody>
              {filtrados.map(a => {
                const d = a.detalhes ?? {};
                const ehSubgrupo = a.tipo === 'analise_subgrupo_aglomerado';
                return (
                  <tr key={a.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmt(a.created_at)}</td>
                    <td>{a.usuario_email ?? '—'}</td>
                    <td><span className="tag">{ACOES[a.tipo] ?? a.tipo}</span></td>
                    <td>
                      <Link href={`/aglomerados?abrir=${a.referencia_id}`}>
                        {d.qtd_execucoes ?? '—'} baixas{ehSubgrupo ? ' (subgrupo)' : ''} · {d.nota_dominante ?? d.filtro_nota ?? 'todas as notas'}
                        {ehSubgrupo && (d.filtro_data_de || d.filtro_data_ate) ? ` · ${d.filtro_data_de ?? '…'} a ${d.filtro_data_ate ?? '…'}` : ''}
                        {!ehSubgrupo && d.agentes?.length ? ` · ${d.agentes.slice(0, 2).join(', ')}${d.agentes.length > 2 ? '…' : ''}` : ''}
                      </Link>
                    </td>
                    <td>
                      <span className="badge" style={{ background: STATUS[d.status]?.cor ?? '#64748b' }}>{STATUS[d.status]?.label ?? d.status}</span>
                    </td>
                    <td style={{ whiteSpace: 'normal', minWidth: 220, maxWidth: 380 }}>
                      {d.observacao || <span className="hint">sem observação</span>}
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && <tr><td colSpan={6} className="hint">Nenhum evento com esses filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
