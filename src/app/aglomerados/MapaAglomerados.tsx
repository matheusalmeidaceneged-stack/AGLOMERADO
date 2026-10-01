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
const FILTRO_PADRAO = { min: '10', nota: '', agente: '', status: 'pendente,em_analise', suspeito: false };

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
function ritmo(qtd: number, min: number | null) {
  if (min === null || min === undefined) return '—';
  if (min === 0) return 'mesmo minuto';
  if (min <= 90) return `${(qtd / min).toFixed(1).replace('.', ',')} por min`;
  return `${(qtd / (min / 60)).toFixed(1).replace('.', ',')} por hora`;
}
const fmtData = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const fmtDia = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('pt-BR');
const classeDist = (d: number | null) => (d === null ? '' : d < 50 ? 'ok' : d <= 300 ? 'med' : 'far');
const corItem = (a: any) => (a.suspeito && a.status_auditoria === 'pendente' ? '#dc2626' : STATUS[a.status_auditoria].cor);

async function baixarXlsx(nomeArquivo: string, abas: { nome: string; linhas: any[] }[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const aba of abas) {
    const ws = XLSX.utils.json_to_sheet(aba.linhas, { skipHeader: false });
    XLSX.utils.book_append_sheet(wb, ws, aba.nome.slice(0, 31));
  }
  XLSX.writeFile(wb, nomeArquivo);
}

function exportarListaFiltrada(lista: any[]) {
  const linhas = lista.map(a => ({
    'Baixas': a.qtd_execucoes,
    'Instalações': a.qtd_instalacoes,
    'Nota dominante': a.nota_dominante,
    '% nota dominante': Math.round(a.pct_nota_dominante * 100) + '%',
    'Agentes': a.agentes.join(', '),
    'Duração': duracao(a.janela_minutos),
    'Dist. média até endereço (m)': a.dist_media_envio_m ?? '',
    'Candidato a auditoria': a.suspeito ? 'Sim' : 'Não',
    'Situação da auditoria': STATUS[a.status_auditoria]?.label ?? a.status_auditoria,
    'Tratativa': a.observacao ?? '',
    'Latitude': a.centro_lat,
    'Longitude': a.centro_lng,
  }));
  baixarXlsx(`aglomerados_${new Date().toISOString().slice(0, 10)}.xlsx`, [{ nome: 'Aglomerados', linhas }]);
}

function exportarAglomerado(agl: any, execs: any[]) {
  const notasOrd = Object.entries(agl.notas as Record<string, number>).sort((a: any, b: any) => b[1] - a[1]);
  const resumo = [
    { Campo: 'Quantidade de baixas', Valor: agl.qtd_execucoes },
    { Campo: 'Instalações distintas', Valor: agl.qtd_instalacoes },
    { Campo: 'Agente(s)', Valor: agl.agentes.join(', ') },
    { Campo: 'Primeira execução', Valor: fmtData(agl.primeira_execucao) },
    { Campo: 'Última execução', Valor: fmtData(agl.ultima_execucao) },
    { Campo: 'Janela de tempo', Valor: duracao(agl.janela_minutos) },
    { Campo: 'Ritmo de baixas', Valor: ritmo(agl.qtd_execucoes, agl.janela_minutos) },
    { Campo: 'Distância média até o endereço', Valor: agl.dist_media_envio_m !== null ? agl.dist_media_envio_m + ' m' : '—' },
    { Campo: 'Candidato a auditoria', Valor: agl.suspeito ? 'Sim' : 'Não' },
    { Campo: 'Situação da auditoria', Valor: STATUS[agl.status_auditoria]?.label ?? agl.status_auditoria },
    { Campo: 'Tratativa', Valor: agl.observacao ?? '' },
    { Campo: 'Última análise', Valor: agl.auditado_em ? fmtData(agl.auditado_em) : '—' },
    { Campo: 'Latitude', Valor: agl.centro_lat },
    { Campo: 'Longitude', Valor: agl.centro_lng },
    { Campo: '', Valor: '' },
    { Campo: 'Estratificação por nota', Valor: '' },
    ...notasOrd.map(([nota, q]: any) => ({ Campo: nota, Valor: `${q} (${Math.round((q / agl.qtd_execucoes) * 100)}%)` })),
  ];
  const baixas = execs.map((e: any) => ({
    'Instalação': e.instalacao, 'Nota': e.nota_leitura, 'Descrição': e.descricao_nota, 'Agente': e.usuario,
    'Data': e.data_real ? fmtDia(e.data_real) : '', 'Hora': e.hora,
    'Distância do endereço (m)': e.dist ?? '',
  }));
  baixarXlsx(`aglomerado_${agl.qtd_execucoes}baixas_${new Date().toISOString().slice(0, 10)}.xlsx`, [
    { nome: 'Resumo', linhas: resumo }, { nome: 'Baixas (instalações)', linhas: baixas },
  ]);
}

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
  const [f, setF] = useState(FILTRO_PADRAO);
  const [raio, setRaio] = useState('10');
  const [calculando, setCalculando] = useState(false);
  const [sel, setSel] = useState<any | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [statusForm, setStatusForm] = useState('pendente');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [ordem, setOrdem] = useState<{ chave: string; dir: 1 | -1 }>({ chave: 'hora', dir: 1 });

  async function carregar(fx = f) {
    if (!token) return;
    setErro(null);
    const p = new URLSearchParams({ min: fx.min || '3' });
    if (fx.nota) p.set('nota', fx.nota);
    if (fx.agente) p.set('agente', fx.agente);
    if (fx.status) p.set('status', fx.status);
    if (fx.suspeito) p.set('suspeito', '1');
    const res = await fetch('/api/aglomerados?' + p, { headers: H() });
    const d = await res.json();
    if (!res.ok) { setErro(d.error ?? 'erro ao carregar'); return; }
    setLista(d.aglomerados ?? []);
  }
  useEffect(() => { carregar(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // permite abrir um aglomerado direto por link (?abrir=ID), usado pelo dashboard
  useEffect(() => {
    if (!token) return;
    const id = new URLSearchParams(window.location.search).get('abrir');
    if (id) abrir(id);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!res.ok) { setErro(d.error ?? 'erro ao abrir aglomerado'); setSelId(null); return; }
    setSel(d); setStatusForm(d.aglomerado.status_auditoria); setObs(d.aglomerado.observacao ?? '');
  }
  function fechar() { setSelId(null); setSel(null); }

  async function salvarAuditoria() {
    if (!selId) return;
    setSalvando(true); setErro(null);
    const res = await fetch(`/api/aglomerados/${selId}/auditar`, { method: 'POST', headers: H(), body: JSON.stringify({ status: statusForm, observacao: obs }) });
    const d = await res.json();
    setSalvando(false);
    if (!res.ok) { setErro(d.error ?? 'erro ao salvar'); return; }
    const novo = d.aglomerado;
    const patch = { status_auditoria: novo.status_auditoria, observacao: novo.observacao, auditado_em: novo.auditado_em };
    setLista(l => l.map(a => (a.id === selId ? { ...a, ...patch } : a)));
    setSel((s: any) => s && { ...s, aglomerado: { ...s.aglomerado, ...patch } });
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
  const pontosLista: [number, number][] = useMemo(() => lista.map(a => [a.centro_lat, a.centro_lng] as [number, number]), [lista]);

  const execsOrd = useMemo(() => {
    const arr = execs.map((e: any) => ({
      ...e,
      dist: e.lat_envio && e.lng_envio ? Math.round(distM(e.lat_envio, e.lng_envio, e.lat_retorno, e.lng_retorno)) : null,
    }));
    arr.sort((a: any, b: any) => {
      let va: any, vb: any;
      if (ordem.chave === 'dist') { va = a.dist ?? -1; vb = b.dist ?? -1; }
      else if (ordem.chave === 'inst') { va = a.instalacao; vb = b.instalacao; }
      else { va = (a.data_real ?? '') + (a.hora ?? ''); vb = (b.data_real ?? '') + (b.hora ?? ''); }
      return va < vb ? -ordem.dir : va > vb ? ordem.dir : 0;
    });
    return arr;
  }, [sel, ordem]); // eslint-disable-line react-hooks/exhaustive-deps
  const ordenar = (chave: string) => setOrdem(o => (o.chave === chave ? { chave, dir: (o.dir * -1) as 1 | -1 } : { chave, dir: 1 }));
  const seta = (k: string) => (ordem.chave === k ? (ordem.dir === 1 ? ' ▲' : ' ▼') : '');

  const resumo = { susp: lista.filter(a => a.suspeito).length, pend: lista.filter(a => a.status_auditoria === 'pendente').length };
  const notasOrd: [string, number][] = agl ? Object.entries(agl.notas as Record<string, number>).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Aglomerados geográficos</h2>
          <p className="hint">Baixas cujo ponto de <i>retorno</i> (onde o agente estava) fica a poucos metros uma da outra. É só análise: nenhuma execução é excluída.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
          <label className="hint" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>Raio (m)
            <input type="text" value={raio} onChange={e => setRaio(e.target.value)} style={{ width: 80 }} /></label>
          <button className="secondary" style={{ marginLeft: 0 }} onClick={recalcular} disabled={calculando}>{calculando ? 'Recalculando…' : 'Recalcular aglomerados'}</button>
        </div>
      </div>

      {erro && <div className="card" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>{erro}</div>}
      {msg && <div className="card" style={{ borderColor: 'var(--green)' }}>{msg}</div>}

      <div className="ag-layout">
        {/* ---------- coluna esquerda: ranking OU detalhe ---------- */}
        <aside className="ag-side">
          {!selId ? (
            <>
              <div className="card">
                <div className="filtros">
                  <label>Mín. baixas<input type="text" value={f.min} onChange={e => setF({ ...f, min: e.target.value })} /></label>
                  <label>Nota (ex.: E02)<input type="text" value={f.nota} onChange={e => setF({ ...f, nota: e.target.value })} /></label>
                  <label>Agente<input type="text" value={f.agente} onChange={e => setF({ ...f, agente: e.target.value })} /></label>
                  <label>Auditoria
                    <select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>
                      <option value="pendente,em_analise">Em aberto (pendente + em análise)</option>
                      <option value="">Todas</option>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></label>
                  <label className="chk full"><input type="checkbox" checked={f.suspeito} onChange={e => setF({ ...f, suspeito: e.target.checked })} /> só candidatos a auditoria</label>
                  <div className="full">
                    <button className="primary" style={{ marginTop: 0 }} onClick={() => carregar()}>Filtrar</button>
                    <button className="secondary" onClick={() => { setF(FILTRO_PADRAO); carregar(FILTRO_PADRAO); }}>Limpar</button>
                  </div>
                </div>
              </div>

              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <h3 style={{ margin: 0 }}>Ranking <span className="hint" style={{ fontWeight: 400 }}>· {lista.length} aglomerado(s) nesse filtro · {resumo.susp} candidato(s)</span></h3>
                  <button className="secondary" style={{ marginLeft: 0 }} onClick={() => exportarListaFiltrada(lista)} disabled={lista.length === 0}>Exportar lista (.xlsx)</button>
                </div>
                <div className="rk-list">
                  {lista.map(a => (
                    <div key={a.id} className="rk-item" style={{ borderLeftColor: corItem(a) }} onClick={() => abrir(a.id)}>
                      <div className="rk-qtd"><b>{a.qtd_execucoes}</b><span>baixas</span></div>
                      <div className="rk-info">
                        <div className="rk-l1">
                          <span className="tag">{a.nota_dominante} · {Math.round(a.pct_nota_dominante * 100)}%</span>
                          <span className="badge" style={{ background: STATUS[a.status_auditoria].cor }}>{STATUS[a.status_auditoria].label}</span>
                          {a.suspeito && <span className="badge b-err">CANDIDATO</span>}
                        </div>
                        <div className="rk-l2">{a.agentes.slice(0, 2).join(', ')}{a.agentes.length > 2 ? '…' : ''} · {duracao(a.janela_minutos)}{a.dist_media_envio_m !== null ? ` · ${Number(a.dist_media_envio_m).toLocaleString('pt-BR')} m do endereço` : ''}</div>
                      </div>
                    </div>
                  ))}
                  {lista.length === 0 && <p className="hint">Nenhum aglomerado com esses filtros. Se ainda não calculou, clique em “Recalcular aglomerados”.</p>}
                </div>
              </div>
            </>
          ) : (
            <div className="card">
              <button className="secondary" style={{ marginLeft: 0 }} onClick={fechar}>← Voltar ao ranking</button>
              {!agl ? <p className="hint">Carregando…</p> : (
                <>
                  <div className="det-head">
                    <h3>{agl.qtd_execucoes} baixas no mesmo ponto</h3>
                    {agl.suspeito && <span className="badge b-err">CANDIDATO</span>}
                    <span className="badge" style={{ background: STATUS[agl.status_auditoria].cor }}>{STATUS[agl.status_auditoria].label}</span>
                    <button className="secondary" style={{ marginLeft: 'auto' }} onClick={() => exportarAglomerado(agl, execsOrd)}>Exportar relatório (.xlsx)</button>
                  </div>
                  <p className="hint" style={{ margin: '4px 0 0' }}>
                    {agl.centro_lat.toFixed(6)}, {agl.centro_lng.toFixed(6)} ·{' '}
                    <a href={`https://www.google.com/maps?q=${agl.centro_lat},${agl.centro_lng}`} target="_blank" rel="noreferrer">abrir no Google Maps</a>
                  </p>

                  <div className="kpis small">
                    <div className="kpi gray"><b>{agl.qtd_instalacoes}</b><span>instalações</span></div>
                    <div className="kpi gray"><b>{agl.agentes.length === 1 ? agl.agentes[0] : `${agl.agentes.length} agentes`}</b><span>{agl.agentes.length === 1 ? 'agente' : agl.agentes.join(', ')}</span></div>
                    <div className="kpi orange"><b>{duracao(agl.janela_minutos)}</b><span>{fmtData(agl.primeira_execucao)} → {fmtData(agl.ultima_execucao)}</span></div>
                    <div className="kpi orange"><b>{ritmo(agl.qtd_execucoes, agl.janela_minutos)}</b><span>ritmo de baixas</span></div>
                    <div className={`kpi ${agl.dist_media_envio_m > 300 ? 'red' : 'gray'}`} style={{ gridColumn: '1 / -1' }}>
                      <b>{agl.dist_media_envio_m === null ? '—' : Number(agl.dist_media_envio_m).toLocaleString('pt-BR') + ' m'}</b>
                      <span>distância média até o endereço das instalações</span>
                    </div>
                  </div>

                  <h4>Notas no ponto</h4>
                  {notasOrd.map(([nota, q]) => (
                    <div key={nota} className="notebar">
                      <span className="lbl">{nota}</span>
                      <div className="trk"><div style={{ width: `${(q / agl.qtd_execucoes) * 100}%` }} /></div>
                      <span className="n">{q} ({Math.round((q / agl.qtd_execucoes) * 100)}%)</span>
                    </div>
                  ))}

                  <h4>Análise do auditor</h4>
                  <div className="seg">
                    {Object.entries(STATUS).map(([k, v]) => (
                      <button key={k} className={statusForm === k ? 'on' : ''} style={statusForm === k ? { background: v.cor } : undefined} onClick={() => setStatusForm(k)}>{v.label}</button>
                    ))}
                  </div>
                  <textarea placeholder="Observação (ex.: agente informou que…)" value={obs} onChange={e => setObs(e.target.value)} />
                  <button className="primary" style={{ marginTop: 8 }} onClick={salvarAuditoria} disabled={salvando}>{salvando ? 'Salvando…' : 'Registrar análise'}</button>
                  {agl.auditado_em && <p className="hint" style={{ marginBottom: 0 }}>Última análise em {fmtData(agl.auditado_em)}.</p>}
                </>
              )}
            </div>
          )}
        </aside>

        {/* ---------- coluna direita: mapa + baixas ---------- */}
        <section>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 8 }}>
            <MapContainer center={[-4.2, -44.8]} zoom={8} style={{ height: 480, width: '100%' }}>
              <LayersControl position="topright">
                <LayersControl.BaseLayer checked name="Mapa">
                  <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                </LayersControl.BaseLayer>
                <LayersControl.BaseLayer name="Satélite">
                  <TileLayer attribution="Esri, Maxar" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                </LayersControl.BaseLayer>
              </LayersControl>
              {sel ? <Ajusta key={selId} alvo={centro} pontos={pontosSel} /> : <Ajusta key="todos" alvo={null} pontos={pontosLista} />}

              {execs.map((e, i) => e.lat_envio && e.lng_envio && agl ? (
                <Polyline key={'l' + i} positions={[[e.lat_envio, e.lng_envio], [agl.centro_lat, agl.centro_lng]]} pathOptions={{ color: '#64748b', weight: 1, opacity: 0.5 }} />
              ) : null)}
              {execs.map((e, i) => e.lat_envio && e.lng_envio ? (
                <CircleMarker key={'e' + i} center={[e.lat_envio, e.lng_envio]} radius={4} pathOptions={{ color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.9, weight: 1 }}>
                  <Popup>Endereço da instalação <b>{e.instalacao}</b><br />nota {e.nota_leitura} · {e.usuario}</Popup>
                </CircleMarker>
              ) : null)}

              {lista.map(a => {
                const cor = corItem(a);
                return (
                  <CircleMarker key={a.id} center={[a.centro_lat, a.centro_lng]} radius={Math.min(7 + Math.sqrt(a.qtd_execucoes) * 1.6, 26)}
                    pathOptions={{ color: selId === a.id ? '#000' : cor, weight: selId === a.id ? 3 : 1, fillColor: cor, fillOpacity: 0.55 }}
                    eventHandlers={{ click: () => abrir(a.id) }}>
                    <Popup>
                      <b>{a.qtd_execucoes} baixas</b> · nota {a.nota_dominante} ({Math.round(a.pct_nota_dominante * 100)}%)<br />
                      {a.agentes.join(', ')}<br />
                      <button className="primary" style={{ marginTop: 6, padding: '5px 10px', fontSize: '.78rem' }} onClick={() => abrir(a.id)}>Auditar este aglomerado</button>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
          <p className="hint" style={{ margin: '0 0 14px' }}>
            🔴 candidato pendente · 🟠 pendente · 🔵 em análise · 🟢 sem irregularidade · 🟤 irregularidade confirmada. Ao abrir um aglomerado, os pontos azuis são os <b>endereços</b> e as linhas ligam cada endereço ao ponto onde a baixa foi dada.
          </p>

          {selId && agl && (
            <div className="card">
              <h3>Baixas deste aglomerado <span className="hint" style={{ fontWeight: 400 }}>· clique no título da coluna para ordenar</span></h3>
              <div className="tblwrap" style={{ maxHeight: 420 }}>
                <table>
                  <thead>
                    <tr>
                      <th className="sort" onClick={() => ordenar('inst')}>Instalação{seta('inst')}</th>
                      <th>Nota</th><th>Descrição</th><th>Agente</th>
                      <th className="sort" onClick={() => ordenar('hora')}>Data / hora{seta('hora')}</th>
                      <th className="sort" onClick={() => ordenar('dist')}>Distância do endereço{seta('dist')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {execsOrd.map((e: any, i: number) => (
                      <tr key={i}>
                        <td>{e.instalacao}</td><td>{e.nota_leitura}</td><td>{e.descricao_nota}</td><td>{e.usuario}</td>
                        <td>{e.data_real ? fmtDia(e.data_real) : '—'} {e.hora}</td>
                        <td>{e.dist === null ? '—' : <span className={`dist ${classeDist(e.dist)}`}>{e.dist.toLocaleString('pt-BR')} m</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
