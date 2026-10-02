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

export function parseMes(sp: URLSearchParams): { de: string; ate: string } | null {
  const de = sp.get('mes_de'), ate = sp.get('mes_ate');
  return de && ate ? { de, ate } : null;
}
