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
const TRATATIVAS: Record<string, string> = {
  advertencia: 'Advertência', suspensao: 'Suspensão', desligamento: 'Desligamento',
};
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function Auditorias() {
  const { token } = useAuth();
  const [dados, setDados] = useState<any[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [acao, setAcao] = useState('');
  const [status, setStatus] = useState('');
  const [busca, setBusca] = useState('');
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  function H() { return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }; }

  useEffect(() => {
    if (!token) return;
    fetch('/api/auditorias-registros', { headers: H() })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setDados(j.registros ?? []); })
      .catch(e => setErro(e.message));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = useMemo(() => dados.filter(a => {
    if (acao && a.tipo !== acao) return false;
    if (status && a.status !== status) return false;
    if (busca) {
      const alvo = `${a.usuario_email ?? ''} ${a.observacao ?? ''} ${a.nota ?? ''} ${(a.agentes ?? []).join(' ')}`.toLowerCase();
      if (!alvo.includes(busca.toLowerCase())) return false;
    }
    return true;
  }), [dados, acao, status, busca]);

  const comTratativa = dados.filter(a => a.tratativa_tipo).length;

  async function salvar(reg: any, patch: any) {
    setSalvandoId(reg.id); setErro(null);
    const res = await fetch(`/api/auditorias-registros/${reg.tipo}/${reg.id}`, { method: 'PATCH', headers: H(), body: JSON.stringify(patch) });
    const d = await res.json();
    setSalvandoId(null);
    if (!res.ok) { setErro(d.error ?? 'erro ao salvar'); return; }
    setDados(l => l.map(x => (x.tipo === reg.tipo && x.id === reg.id ? { ...x, ...d.registro } : x)));
  }

  if (erro) return <div className="card" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>{erro}</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Registro de auditoria</h2>
          <p className="hint">Situação de cada auditoria, observação e a tratativa disciplinar aplicada quando um desvio de conduta é confirmado.</p>
        </div>
      </div>

      <div className="kpis small" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
        <div className="kpi blue"><b>{dados.length}</b><span>registros de auditoria</span></div>
        <div className="kpi orange"><b>{comTratativa}</b><span>com tratativa disciplinar aplicada</span></div>
        <div className="kpi gray"><b>{dados.filter(a => a.status === 'pendente').length}</b><span>ainda pendentes</span></div>
      </div>

      <div className="card">
        <div className="filtros" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <label>Tipo
            <select value={acao} onChange={e => setAcao(e.target.value)}>
              <option value="">Todos</option>
              <option value="aglomerado">Auditoria geral do aglomerado</option>
              <option value="subgrupo">Tratativa por subgrupo</option>
            </select>
          </label>
          <label>Situação da auditoria
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label>Buscar (usuário, agente, nota, observação)
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="ex.: T25794" />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="tblwrap" style={{ maxHeight: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Quando</th><th>Usuário</th><th>Aglomerado</th><th>Auditoria</th>
                <th style={{ minWidth: 220 }}>Observação</th><th style={{ minWidth: 220 }}>Tratativa</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(reg => (
                <LinhaRegistro key={`${reg.tipo}-${reg.id}`} reg={reg} salvando={salvandoId === reg.id} onSalvar={patch => salvar(reg, patch)} />
              ))}
              {filtrados.length === 0 && <tr><td colSpan={6} className="hint">Nenhum registro com esses filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LinhaRegistro({ reg, salvando, onSalvar }: { reg: any; salvando: boolean; onSalvar: (patch: any) => void }) {
  const [obs, setObs] = useState(reg.observacao ?? '');
  const [tTipo, setTTipo] = useState(reg.tratativa_tipo ?? '');
  const [tDias, setTDias] = useState(reg.tratativa_dias_suspensao ?? '');
  useEffect(() => { setObs(reg.observacao ?? ''); setTTipo(reg.tratativa_tipo ?? ''); setTDias(reg.tratativa_dias_suspensao ?? ''); }, [reg.observacao, reg.tratativa_tipo, reg.tratativa_dias_suspensao]);

  const resumo = reg.tipo === 'aglomerado'
    ? `${reg.qtd_execucoes} baixas · ${reg.nota ?? '—'}${reg.agentes?.length ? ` · ${reg.agentes.slice(0, 2).join(', ')}${reg.agentes.length > 2 ? '…' : ''}` : ''}`
    : `${reg.qtd_execucoes} baixas (subgrupo) · ${reg.nota ?? 'todas as notas'}${(reg.filtro_data_de || reg.filtro_data_ate) ? ` · ${reg.filtro_data_de ?? '…'} a ${reg.filtro_data_ate ?? '…'}` : ''}`;

  return (
    <tr>
      <td style={{ whiteSpace: 'nowrap' }}>{fmt(reg.quando)}</td>
      <td>{reg.usuario_email ?? '—'}</td>
      <td><Link href={`/aglomerados?abrir=${reg.aglomerado_id}`}>{resumo}</Link></td>
      <td><span className="badge" style={{ background: STATUS[reg.status]?.cor ?? '#64748b' }}>{STATUS[reg.status]?.label ?? reg.status}</span></td>
      <td>
        <textarea value={obs} onChange={e => setObs(e.target.value)} onBlur={() => obs !== (reg.observacao ?? '') && onSalvar({ observacao: obs })}
          style={{ minHeight: 44, fontSize: '.8rem' }} placeholder="Observação…" />
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={tTipo} onChange={e => { const v = e.target.value; setTTipo(v); onSalvar({ tratativa_tipo: v || null, tratativa_dias_suspensao: v === 'suspensao' ? tDias : null }); }} style={{ width: 150 }}>
            <option value="">Sem tratativa</option>
            {Object.entries(TRATATIVAS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {tTipo === 'suspensao' && (
            <input type="number" min={1} placeholder="dias" value={tDias} onChange={e => setTDias(e.target.value)}
              onBlur={() => onSalvar({ tratativa_tipo: 'suspensao', tratativa_dias_suspensao: tDias })}
              style={{ width: 68 }} />
          )}
          {salvando && <span className="hint">salvando…</span>}
        </div>
      </td>
    </tr>
  );
}
