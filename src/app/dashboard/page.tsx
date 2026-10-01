'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/supabase/useAuth';

const ST: [string, string, string][] = [
  ['pendente', 'Pendente', '#ea580c'],
  ['em_analise', 'Em análise', '#2563eb'],
  ['procedente', 'Irregularidade confirmada', '#b91c1c'],
  ['improcedente', 'Sem irregularidade', '#16a34a'],
];
const cor = (s: string) => ST.find(x => x[0] === s)?.[2] ?? '#64748b';
const rot = (s: string) => ST.find(x => x[0] === s)?.[1] ?? s;
const n = (v: any) => Number(v ?? 0).toLocaleString('pt-BR');
function duracao(min: number | null) {
  if (min === null || min === undefined) return '—';
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h ${min % 60} min`;
  return `${Math.round(min / 1440)} dia(s)`;
}

export default function Dashboard() {
  const { token } = useAuth();
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); })
      .catch(e => setErro(e.message));
  }, [token]);

  if (erro) return <div className="card" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>{erro}</div>;
  if (!d) return <p className="hint">Carregando…</p>;

  const s = d.stats, a = d.auditoria;
  const totalAgl = a.pendente + a.em_analise + a.procedente + a.improcedente;
  const auditados = a.procedente + a.improcedente;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Dashboard</h2>
          <p className="hint">Última importação: {s?.ultima_importacao ? new Date(s.ultima_importacao).toLocaleString('pt-BR') : '—'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/import" className="link-btn">Importar planilha</Link>
          <Link href="/aglomerados" className="link-btn pri">Abrir aglomerados</Link>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi red"><b>{n(a.candidatos_pendentes)}</b><span>candidatos a auditoria pendentes</span></div>
        <div className="kpi green"><b>{n(auditados)}<small style={{ fontSize: '.9rem', color: 'var(--muted)' }}> / {n(totalAgl)}</small></b><span>aglomerados já auditados</span></div>
        <div className="kpi orange"><b>{n(s?.total_aglomerados)}</b><span>aglomerados detectados</span></div>
        <div className="kpi"><b>{n(s?.total_execucoes)}</b><span>execuções no banco</span></div>
        <div className="kpi gray"><b>{n(s?.total_instalacoes)}</b><span>instalações distintas</span></div>
        <div className={`kpi ${s?.erros_ultimos_7_dias > 0 ? 'red' : 'gray'}`}><b>{n(s?.erros_ultimos_7_dias)}</b><span>erros de importação (7 dias)</span></div>
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Situação da auditoria</h3>
          {totalAgl === 0 ? (
            <p className="hint">Nenhum aglomerado calculado ainda. Abra <Link href="/aglomerados">Aglomerados</Link> e clique em “Recalcular aglomerados”.</p>
          ) : (
            <>
              <div className="statusbar">
                {ST.map(([k, , c]) => <div key={k} style={{ width: `${(a[k] / totalAgl) * 100}%`, background: c }} title={`${rot(k)}: ${a[k]}`} />)}
              </div>
              <div className="legend">
                {ST.map(([k, l, c]) => <span key={k}><i style={{ background: c }} />{l}: <b>{n(a[k])}</b></span>)}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h3>Maiores aglomerados</h3>
          <div className="rk-list">
            {d.top_aglomerados.map((t: any) => (
              <Link key={t.id} href={`/aglomerados?abrir=${t.id}`} className="rk-item" style={{ borderLeftColor: t.suspeito && t.status_auditoria === 'pendente' ? '#dc2626' : cor(t.status_auditoria) }}>
                <div className="rk-qtd"><b>{t.qtd_execucoes}</b><span>baixas</span></div>
                <div className="rk-info">
                  <div className="rk-l1">
                    <span className="tag">{t.nota_dominante} · {Math.round(t.pct_nota_dominante * 100)}%</span>
                    <span className="badge" style={{ background: cor(t.status_auditoria) }}>{rot(t.status_auditoria)}</span>
                    {t.suspeito && <span className="badge b-err">CANDIDATO</span>}
                  </div>
                  <div className="rk-l2">{t.agentes.join(', ')} · {duracao(t.janela_minutos)} · {t.qtd_instalacoes} instalações</div>
                </div>
              </Link>
            ))}
            {d.top_aglomerados.length === 0 && <p className="hint">Sem aglomerados calculados.</p>}
          </div>
        </div>
      </div>

    </div>
  );
}
