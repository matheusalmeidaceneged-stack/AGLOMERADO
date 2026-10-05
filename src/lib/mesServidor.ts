import { SupabaseClient } from '@supabase/supabase-js';

async function paginar(fn: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>) {
  const out: any[] = [];
  const passo = 1000;
  for (let from = 0; ; from += passo) {
    const { data, error } = await fn(from, from + passo - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < passo) break;
  }
  return out;
}

/** ids de execuções cuja Data Prevista cai no intervalo [de, ate] (inclusive). */
export async function idsExecucoesNoMes(db: SupabaseClient, de: string, ate: string): Promise<Set<string>> {
  const linhas = await paginar((from, to) =>
    db.from('execucoes').select('id').gte('data_prevista', de).lte('data_prevista', ate).order('id').range(from, to)
  );
  return new Set(linhas.map((r: any) => r.id as string));
}

/** entre os aglomerados dados (com seu execucao_ids), quais têm ao menos 1 execução no mês. */
export function aglomeradosComExecucaoNoMes<T extends { execucao_ids: string[] }>(aglomerados: T[], idsNoMes: Set<string>): T[] {
  return aglomerados.filter(a => a.execucao_ids.some(id => idsNoMes.has(id)));
}

function distanciaM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function tsLocal(data: string | null, hora: string | null): number | null {
  if (!data) return null;
  const m = (hora ?? '').match(/^(\d{1,2}):(\d{2})/);
  const hh = m ? Number(m[1]) : 0, mm = m ? Number(m[2]) : 0;
  const [y, mo, d] = data.slice(0, 10).split('-').map(Number);
  if (!y || !mo || !d) return null;
  return Date.UTC(y, mo - 1, d, hh, mm);
}

export interface EstatMes {
  qtd_execucoes: number; qtd_instalacoes: number; nota_dominante: string | null; pct_nota_dominante: number;
  agentes: string[]; janela_minutos: number | null; dist_media_envio_m: number | null;
  primeira_execucao: string | null; ultima_execucao: string | null;
}

/**
 * Recalcula, só com as execuções do mês escolhido (Data Prevista), as
 * mesmas estatísticas que a página de aglomerados mostra — para a lista e
 * o dashboard não misturarem "quantidade no mês" com "duração/ritmo do
 * aglomerado inteiro desde sempre".
 */
export async function estatisticasAglomeradosNoMes(
  db: SupabaseClient,
  aglomerados: { id: string; execucao_ids: string[] }[],
  de: string, ate: string
): Promise<Map<string, EstatMes>> {
  const linhas = await paginar((from, to) =>
    db.from('execucoes')
      .select('id, instalacao, nota_leitura, usuario, data_real, hora, lat_envio, lng_envio, lat_retorno, lng_retorno')
      .gte('data_prevista', de).lte('data_prevista', ate).order('id').range(from, to)
  );
  const porId = new Map(linhas.map((r: any) => [r.id, r]));

  const vazio: EstatMes = { qtd_execucoes: 0, qtd_instalacoes: 0, nota_dominante: null, pct_nota_dominante: 0, agentes: [], janela_minutos: null, dist_media_envio_m: null, primeira_execucao: null, ultima_execucao: null };
  const resultado = new Map<string, EstatMes>();
  for (const agl of aglomerados) {
    const execs = agl.execucao_ids.map(id => porId.get(id)).filter(Boolean) as any[];
    if (execs.length === 0) { resultado.set(agl.id, vazio); continue; }
    const instalacoes = new Set<string>(); const agentes = new Set<string>(); const notas: Record<string, number> = {};
    let tMin = Infinity, tMax = -Infinity, somaDist = 0, nDist = 0;
    for (const e of execs) {
      instalacoes.add(e.instalacao);
      if (e.usuario) agentes.add(e.usuario);
      const n = e.nota_leitura ?? '—'; notas[n] = (notas[n] ?? 0) + 1;
      const t = tsLocal(e.data_real, e.hora);
      if (t !== null) { tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); }
      if (e.lat_envio && e.lng_envio && e.lat_retorno && e.lng_retorno) { somaDist += distanciaM(e.lat_envio, e.lng_envio, e.lat_retorno, e.lng_retorno); nDist++; }
    }
    const [notaDom, qtdDom] = Object.entries(notas).sort((a, b) => b[1] - a[1])[0];
    resultado.set(agl.id, {
      qtd_execucoes: execs.length, qtd_instalacoes: instalacoes.size,
      nota_dominante: notaDom, pct_nota_dominante: Math.round((qtdDom / execs.length) * 100) / 100,
      agentes: [...agentes].sort(),
      janela_minutos: tMin === Infinity ? null : Math.round((tMax - tMin) / 60000),
      dist_media_envio_m: nDist ? Math.round(somaDist / nDist) : null,
      primeira_execucao: tMin === Infinity ? null : new Date(tMin).toISOString().slice(0, 19),
      ultima_execucao: tMax === -Infinity ? null : new Date(tMax).toISOString().slice(0, 19),
    });
  }
  return resultado;
}

export function parseMes(sp: URLSearchParams): { de: string; ate: string } | null {
  const de = sp.get('mes_de'), ate = sp.get('mes_ate');
  return de && ate ? { de, ate } : null;
}
