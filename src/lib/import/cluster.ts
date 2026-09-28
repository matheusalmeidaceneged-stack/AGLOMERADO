// Agrupamento geográfico de execuções (análise de "aglomerados").
// Duas execuções ficam no mesmo aglomerado quando o ponto de RETORNO (onde o
// agente estava ao dar a baixa) está a até `raioM` metros uma da outra, direta
// ou encadeada (conectividade). NUNCA remove nem marca execução como duplicada.

export interface PontoExec {
  id: string;
  instalacao: string;
  usuario: string | null;
  nota_leitura: string | null;
  data_real: string | null; // 'YYYY-MM-DD'
  hora: string | null;      // 'HH:MM'
  unidade_leitura: string | null;
  lat_envio: number | null;
  lng_envio: number | null;
  lat_retorno: number;
  lng_retorno: number;
}

export interface ClusterGeo {
  ids: string[];
  centro_lat: number;
  centro_lng: number;
  qtd_execucoes: number;
  qtd_instalacoes: number;
  notas: Record<string, number>;
  nota_dominante: string | null;
  pct_nota_dominante: number;
  agentes: string[];
  unidades: string[];
  primeira_execucao: string | null; // 'YYYY-MM-DDTHH:MM:00' (horário local, sem fuso)
  ultima_execucao: string | null;
  janela_minutos: number | null;
  dist_media_envio_m: number | null; // distância média do endereço (Envio) até o ponto da baixa (Retorno)
  suspeito: boolean;
}

// GPS válido: não pode ser 0,0 (aparelho sem sinal) nem cair fora do Brasil.
export function gpsValido(lat: number | null, lng: number | null): boolean {
  if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -34 && lat <= 6 && lng >= -74 && lng <= -34;
}

export function distanciaM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function timestamp(data: string | null, hora: string | null): number | null {
  if (!data) return null;
  const m = (hora ?? '').match(/^(\d{1,2}):(\d{2})/);
  const hh = m ? Number(m[1]) : 0, mm = m ? Number(m[2]) : 0;
  const [y, mo, d] = data.slice(0, 10).split('-').map(Number);
  if (!y || !mo || !d) return null;
  return Date.UTC(y, mo - 1, d, hh, mm);
}

function isoLocal(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19); // já está em "hora local" (tratada como UTC)
}

export function agrupar(pontos: PontoExec[], raioM: number, minQtd: number) {
  const validos = pontos.filter(p => gpsValido(p.lat_retorno, p.lng_retorno));
  const ignorados = pontos.length - validos.length;
  if (validos.length === 0) return { clusters: [] as ClusterGeo[], ignorados, total_validos: 0 };

  // grade espacial: célula >= raio em ambas as direções, então basta olhar as 9 vizinhas
  const latMax = Math.max(...validos.map(p => Math.abs(p.lat_retorno)));
  const cellLat = raioM / 111320;
  const cellLng = raioM / (111320 * Math.cos((latMax * Math.PI) / 180));
  const chave = (cx: number, cy: number) => `${cx}|${cy}`;
  const grade = new Map<string, number[]>();
  validos.forEach((p, i) => {
    const k = chave(Math.floor(p.lat_retorno / cellLat), Math.floor(p.lng_retorno / cellLng));
    (grade.get(k) ?? grade.set(k, []).get(k)!).push(i);
  });

  // union-find
  const pai = validos.map((_, i) => i);
  const achar = (x: number): number => { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x]; } return x; };
  const unir = (a: number, b: number) => { const ra = achar(a), rb = achar(b); if (ra !== rb) pai[ra] = rb; };

  validos.forEach((p, i) => {
    const cx = Math.floor(p.lat_retorno / cellLat), cy = Math.floor(p.lng_retorno / cellLng);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const viz = grade.get(chave(cx + dx, cy + dy));
      if (!viz) continue;
      for (const j of viz) {
        if (j <= i) continue;
        const q = validos[j];
        if (distanciaM(p.lat_retorno, p.lng_retorno, q.lat_retorno, q.lng_retorno) <= raioM) unir(i, j);
      }
    }
  });

  const grupos = new Map<number, number[]>();
  validos.forEach((_, i) => { const r = achar(i); (grupos.get(r) ?? grupos.set(r, []).get(r)!).push(i); });

  const clusters: ClusterGeo[] = [];
  for (const idxs of grupos.values()) {
    if (idxs.length < minQtd) continue;
    const membros = idxs.map(i => validos[i]);
    const notas: Record<string, number> = {};
    const agentes = new Set<string>(), unidades = new Set<string>(), insts = new Set<string>();
    let somaLat = 0, somaLng = 0, somaDist = 0, nDist = 0, tMin = Infinity, tMax = -Infinity;
    for (const m of membros) {
      somaLat += m.lat_retorno; somaLng += m.lng_retorno;
      const n = m.nota_leitura ?? '—'; notas[n] = (notas[n] ?? 0) + 1;
      if (m.usuario) agentes.add(m.usuario);
      if (m.unidade_leitura) unidades.add(m.unidade_leitura);
      insts.add(m.instalacao);
      const t = timestamp(m.data_real, m.hora);
      if (t !== null) { tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); }
      if (gpsValido(m.lat_envio, m.lng_envio)) { somaDist += distanciaM(m.lat_envio!, m.lng_envio!, m.lat_retorno, m.lng_retorno); nDist++; }
    }
    const [notaDom, qtdDom] = Object.entries(notas).sort((a, b) => b[1] - a[1])[0];
    const pctDom = qtdDom / membros.length;
    clusters.push({
      ids: membros.map(m => m.id),
      centro_lat: somaLat / membros.length,
      centro_lng: somaLng / membros.length,
      qtd_execucoes: membros.length,
      qtd_instalacoes: insts.size,
      notas, nota_dominante: notaDom, pct_nota_dominante: Math.round(pctDom * 100) / 100,
      agentes: [...agentes].sort(), unidades: [...unidades].sort(),
      primeira_execucao: tMin === Infinity ? null : isoLocal(tMin),
      ultima_execucao: tMax === -Infinity ? null : isoLocal(tMax),
      janela_minutos: tMin === Infinity ? null : Math.round((tMax - tMin) / 60000),
      dist_media_envio_m: nDist ? Math.round(somaDist / nDist) : null,
      // candidato a auditoria ("rajada"): muitas baixas no mesmo ponto, quase todas com a
      // mesma nota, concentradas em até 1 dia. Pontos recorrentes (semanas) não entram aqui.
      suspeito: membros.length >= 10 && pctDom >= 0.6 && tMin !== Infinity && (tMax - tMin) / 60000 <= 1440,
    });
  }
  clusters.sort((a, b) => b.qtd_execucoes - a.qtd_execucoes);
  return { clusters, ignorados, total_validos: validos.length };
}

// Mantém a identidade (e a auditoria já feita) de um aglomerado entre recálculos:
// cada aglomerado novo herda o id do antigo com o qual mais compartilha execuções
// (>= 50% dos seus membros), sem reutilizar o mesmo id duas vezes.
export function casarIds(
  novos: { ids: string[] }[],
  antigos: { id: string; execucao_ids: string[] }[]
): (string | null)[] {
  const donoDaExec = new Map<string, string>();
  for (const a of antigos) for (const e of a.execucao_ids ?? []) donoDaExec.set(e, a.id);
  const usados = new Set<string>();
  return novos.map(n => {
    const votos = new Map<string, number>();
    for (const e of n.ids) { const d = donoDaExec.get(e); if (d) votos.set(d, (votos.get(d) ?? 0) + 1); }
    let melhor: string | null = null, max = 0;
    for (const [id, v] of votos) if (v > max && !usados.has(id)) { melhor = id; max = v; }
    if (melhor && max / n.ids.length >= 0.5) { usados.add(melhor); return melhor; }
    return null;
  });
}
