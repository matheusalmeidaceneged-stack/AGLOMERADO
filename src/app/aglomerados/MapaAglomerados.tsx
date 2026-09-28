'use client';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, LayersControl, CircleMarker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '@/lib/supabase/useAuth';

const STATUS: Record<string, { label: string; cor: string }> = {
  pendente: { label: 'Pendente', cor: '#ea580c' },
  em_analise: { label: 'Em análise', cor: '#2563eb' },
  procedente: { label: 'Irregularidade confirmada', cor: '#b91c1c' },
  improcedente: { label: 'Sem irregularidade', cor: '#16a34a' },
};

function distM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function duracao(min: number | null) {
  if (min === null || min === undefined) return '—';
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h ${min % 60} min`;
  return `${Math.round(min / 1440)} dia(s)`;
}
const fmtData = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const fmtLocal = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('pt-BR');

function Ajusta({ alvo, pontos }: { alvo: [number, number] | null; pontos: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (pontos.length > 1) map.fitBounds(pontos as any, { padding: [40, 40], maxZoom: 17 });
    else if (alvo) map.setView(alvo, 17);
  }, [alvo?.[0], alvo?.[1], pontos.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function MapaAglomerados() {
  const { token } = useAuth();
  const H = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });

  const [lista, setLista] = useState<any[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({ min: '10', nota: '', agente: '', status: '', suspeito: false });
  const [raio, setRaio] = useState('10');
  const [calculando, setCalculando] = useState(false);
  const [sel, setSel] = useState<any | null>(null);       // detalhe: { aglomerado, execucoes }
  const [selId, setSelId] = useState<string | null>(null);
  const [statusForm, setStatusForm] = useState('pendente');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    if (!token) return;
    setErro(null);
    const p = new URLSearchParams({ min: f.min || '3' });
    if (f.nota) p.set('nota', f.nota); if (f.agente) p.set('agente', f.agente);
    if (f.status) p.set('status', f.status); if (f.suspeito) p.set('suspeito', '1');
    const res = await fetch('/api/aglomerados?' + p, { headers: H() });
    const d = await res.json();
    if (!res.ok) { setErro(d.error ?? 'erro ao carregar'); return; }
    setLista(d.aglomerados ?? []);
  }
  useEffect(() => { carregar(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function recalcular() {
    setCalculando(true); setErro(null); setMsg(null);
    const res = await fetch('/api/aglomerados/recalc', { method: 'POST', headers: H(), body: JSON.stringify({ raio_metros: Number(raio) || 10 }) });
    const d = await res.json();
    setCalculando(false);
    if (!res.ok) { setErro('Falha ao recalcular: ' + (d.error ?? res.status)); return; }
    const r = d.resumo;
    setMsg(`${r.aglomerados} aglomerados (raio ${r.raio_metros} m) em ${r.execucoes_analisadas} execuções com GPS válido; ${r.sem_gps_valido} sem GPS válido ignoradas; ${r.suspeitos} candidatos a auditoria.`);
    await carregar();
  }

  async function abrir(id: string) {
    setSelId(id); setSel(null);
    const res = await fetch('/api/aglomerados/' + id, { headers: H() });
    const d = await res.json();
    if (!res.ok) { setErro(d.error ?? 'erro ao abrir aglomerado'); return; }
    setSel(d); setStatusForm(d.aglomerado.status_auditoria); setObs(d.aglomerado.observacao ?? '');
  }

  async function salvarAuditoria() {
    if (!selId) return;
    setSalvando(true);
    const res = await fetch(`/api/aglomerados/${selId}/auditar`, { method: 'POST', headers: H(), body: JSON.stringify({ status: statusForm, observacao: obs }) });
    const d = await res.json();
    setSalvando(false);
    if (!res.ok) { setErro(d.error ?? 'erro ao salvar'); return; }
    const novo = d.aglomerado;
    setLista(l => l.map(a => (a.id === selId ? { ...a, status_auditoria: novo.status_auditoria, observacao: novo.observacao, auditado_em: novo.auditado_em } : a)));
    setSel((s: any) => s && { ...s, aglomerado: { ...s.aglomerado, status_auditoria: novo.status_auditoria, observacao: novo.observacao, auditado_em: novo.auditado_em } });
    setMsg('Análise registrada.');
  }

  const execs: any[] = sel?.execucoes ?? [];
  const agl = sel?.aglomerado;
  const centro: [number, number] | null = agl ? [agl.centro_lat, agl.centro_lng] : null;
  const pontosSel: [number, number][] = useMemo(() => {
    if (!agl) return [];
    const p: [number, number][] = [[agl.centro_lat, agl.centro_lng]];
    for (const e of execs) if (e.lat_envio && e.lng_envio && !(e.lat_envio === 0 && e.lng_envio === 0)) p.push([e.lat_envio, e.lng_envio]);
    return p;
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const pontosLista: [number, number][] = useMemo(() => (lista.length ? lista.map(a => [a.centro_lat, a.centro_lng] as [number, number]) : []), [lista]);
  const resumo = { total: lista.length, susp: lista.filter(a => a.suspeito).length, pend: lista.filter(a => a.status_auditoria === 'pendente').length };

  return (
    <div>
      {erro && <div className="card" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>{erro}</div>}
      {msg && <div className="card" style={{ borderColor: 'var(--green)' }}>{msg}</div>}

      <div className="card">
        <div className="cols" style={{ alignItems: 'end', marginTop: 0 }}>
          <label className="hint">Mín. execuções<input type="text" value={f.min} onChange={e => setF({ ...f, min: e.target.value })} style={{ width: 90 }} /></label>
          <label className="hint">Nota (ex.: E02)<input type="text" value={f.nota} onChange={e => setF({ ...f, nota: e.target.value })} style={{ width: 100 }} /></label>
          <label className="hint">Agente<input type="text" value={f.agente} onChange={e => setF({ ...f, agente: e.target.value })} style={{ width: 120 }} /></label>
          <label className="hint">Auditoria
            <select value={f.status} onChange={e => setF({ ...f, status: e.target.value })} style={{ padding: 9, borderRadius: 8, border: '1px solid var(--border)' }}>
              <option value="">Todas</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></label>
          <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 10 }}>
            <input type="checkbox" checked={f.suspeito} onChange={e => setF({ ...f, suspeito: e.target.checked })} style={{ width: 'auto' }} /> só candidatos a auditoria
          </label>
          <button className="primary" style={{ marginTop: 0 }} onClick={carregar}>Filtrar</button>
          <span style={{ flex: 1 }} />
          <label className="hint">Raio (m)<input type="text" value={raio} onChange={e => setRaio(e.target.value)} style={{ width: 70 }} /></label>
          <button className="secondary" onClick={recalcular} disabled={calculando}>{calculando ? 'Recalculando…' : 'Recalcular aglomerados'}</button>
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          <b>{resumo.total}</b> aglomerado(s) · <b>{resumo.susp}</b> candidato(s) a auditoria (10+ baixas, mesma nota, no mesmo dia) · <b>{resumo.pend}</b> pendente(s).
          Aglomerado = baixas cujo ponto de <i>retorno</i> (onde o agente estava) fica a poucos metros uma da outra. É análise: nenhuma execução é excluída.
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <MapContainer center={[-4.2, -44.8]} zoom={8} style={{ height: 480, width: '100%' }}>
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Mapa">
              <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Satélite">
              <TileLayer attribution="Esri, Maxar" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
            </LayersControl.BaseLayer>
          </LayersControl>
          {sel ? <Ajusta alvo={centro} pontos={pontosSel} /> : <Ajusta alvo={null} pontos={pontosLista} />}

          {execs.map((e, i) => e.lat_envio && e.lng_envio && agl ? (
            <Polyline key={'l' + i} positions={[[e.lat_envio, e.lng_envio], [agl.centro_lat, agl.centro_lng]]} pathOptions={{ color: '#64748b', weight: 1, opacity: 0.5 }} />
          ) : null)}
          {execs.map((e, i) => e.lat_envio && e.lng_envio ? (
            <CircleMarker key={'e' + i} center={[e.lat_envio, e.lng_envio]} radius={4} pathOptions={{ color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.9, weight: 1 }}>
              <Popup>Endereço da instalação <b>{e.instalacao}</b><br />nota {e.nota_leitura} · {e.usuario}</Popup>
            </CircleMarker>
          ) : null)}

          {lista.map(a => {
            const cor = a.suspeito && a.status_auditoria === 'pendente' ? '#dc2626' : STATUS[a.status_auditoria].cor;
            return (
              <CircleMarker key={a.id} center={[a.centro_lat, a.centro_lng]} radius={Math.min(7 + Math.sqrt(a.qtd_execucoes) * 1.6, 26)}
                pathOptions={{ color: selId === a.id ? '#000' : cor, weight: selId === a.id ? 3 : 1, fillColor: cor, fillOpacity: 0.55 }}
                eventHandlers={{ click: () => abrir(a.id) }}>
                <Popup><b>{a.qtd_execucoes} baixas</b> · nota {a.nota_dominante} ({Math.round(a.pct_nota_dominante * 100)}%)<br />{a.agentes.join(', ')}<br />clique para auditar</Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      <div className="hint" style={{ margin: '-6px 0 12px' }}>
        Círculos: 🔴 candidato pendente · 🟠 pendente · 🔵 em análise · 🟢 sem irregularidade · 🟤 irregularidade confirmada. Ao abrir um aglomerado, os pontos azuis são os <b>endereços</b> das instalações e as linhas ligam cada endereço ao ponto onde a baixa foi dada.
      </div>

      {selId && (
        <div className="card">
          {!agl ? 'Carregando…' : (
            <>
              <strong>{agl.qtd_execucoes} baixas em um mesmo ponto</strong>{' '}
              <span className="hint">({agl.centro_lat.toFixed(6)}, {agl.centro_lng.toFixed(6)})</span>
              <div className="summary" style={{ margin: '10px 0' }}>
                <div className="stat"><b>{agl.qtd_instalacoes}</b>instalações</div>
                <div className="stat"><b>{agl.nota_dominante}</b>{Math.round(agl.pct_nota_dominante * 100)}% das baixas</div>
                <div className="stat"><b>{agl.agentes.length}</b>agente(s): {agl.agentes.join(', ')}</div>
                <div className="stat"><b>{duracao(agl.janela_minutos)}</b>{fmtData(agl.primeira_execucao)} → {fmtData(agl.ultima_execucao)}</div>
                <div className="stat"><b>{agl.dist_media_envio_m === null ? '—' : agl.dist_media_envio_m + ' m'}</b>distância média até o endereço</div>
              </div>
              <div className="hint">Notas no ponto: {Object.entries(agl.notas as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([n, q]) => `${n}: ${q}`).join(' · ')}</div>

              <div style={{ margin: '12px 0', padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                <strong>Análise do auditor</strong>
                <div className="cols" style={{ alignItems: 'start' }}>
                  <select value={statusForm} onChange={e => setStatusForm(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid var(--border)' }}>
                    {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <input type="text" placeholder="Observação (ex.: agente informou que…)" value={obs} onChange={e => setObs(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
                  <button className="primary" style={{ marginTop: 0 }} onClick={salvarAuditoria} disabled={salvando}>{salvando ? 'Salvando…' : 'Registrar análise'}</button>
                </div>
                {agl.auditado_em && <div className="hint">Última análise em {fmtData(agl.auditado_em)}.</div>}
              </div>

              <div className="tblwrap">
                <table>
                  <thead><tr><th>Instalação</th><th>Nota</th><th>Descrição</th><th>Agente</th><th>Data</th><th>Hora</th><th>Distância do endereço</th></tr></thead>
                  <tbody>
                    {execs.map((e, i) => (
                      <tr key={i}>
                        <td>{e.instalacao}</td><td>{e.nota_leitura}</td><td>{e.descricao_nota}</td><td>{e.usuario}</td>
                        <td>{e.data_real ? fmtLocal(e.data_real) : '—'}</td><td>{e.hora}</td>
                        <td>{e.lat_envio && e.lng_envio ? Math.round(distM(e.lat_envio, e.lng_envio, e.lat_retorno, e.lng_retorno)) + ' m' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <div className="card">
        <strong>Ranking de aglomerados</strong>
        <div className="tblwrap" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>Baixas</th><th>Inst.</th><th>Nota dominante</th><th>Agentes</th><th>Janela</th><th>Dist. endereço</th><th>Auditoria</th><th></th></tr></thead>
            <tbody>
              {lista.map(a => (
                <tr key={a.id} onClick={() => abrir(a.id)} style={{ cursor: 'pointer', background: selId === a.id ? 'var(--bg)' : undefined }}>
                  <td><b>{a.qtd_execucoes}</b></td><td>{a.qtd_instalacoes}</td>
                  <td>{a.nota_dominante} ({Math.round(a.pct_nota_dominante * 100)}%)</td>
                  <td>{a.agentes.slice(0, 2).join(', ')}{a.agentes.length > 2 ? '…' : ''}</td>
                  <td>{duracao(a.janela_minutos)}</td>
                  <td>{a.dist_media_envio_m === null ? '—' : a.dist_media_envio_m + ' m'}</td>
                  <td><span className="badge" style={{ background: STATUS[a.status_auditoria].cor }}>{STATUS[a.status_auditoria].label}</span></td>
                  <td>{a.suspeito && <span className="badge b-err">CANDIDATO</span>}</td>
                </tr>
              ))}
              {lista.length === 0 && <tr><td colSpan={8} className="hint">Nenhum aglomerado com esses filtros. Se ainda não calculou, clique em “Recalcular aglomerados”.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
