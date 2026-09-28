import { randomUUID } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { agrupar, casarIds, PontoExec } from './import/cluster';

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

/**
 * Recalcula os aglomerados a partir de TODAS as execuções com GPS de retorno.
 * É só análise: não altera nem remove nenhuma execução. A auditoria já feita
 * (status/observação) é preservada quando o aglomerado continua o mesmo.
 * Lança erro se algo falhar (nada de falha silenciosa).
 */
export async function recalcularAglomerados(
  db: SupabaseClient,
  opts: { raioM?: number; minQtd?: number } = {}
) {
  const raioM = Math.min(Math.max(opts.raioM ?? 10, 3), 200);
  const minQtd = Math.min(Math.max(opts.minQtd ?? 3, 2), 50);

  const execucoes = await paginar((from, to) =>
    db.from('execucoes')
      .select('id, instalacao, usuario, nota_leitura, data_real, hora, unidade_leitura, lat_envio, lng_envio, lat_retorno, lng_retorno')
      .not('lat_retorno', 'is', null).not('lng_retorno', 'is', null)
      .order('id').range(from, to)
  );
  const { clusters, ignorados, total_validos } = agrupar(execucoes as PontoExec[], raioM, minQtd);

  const antigos = await paginar((from, to) =>
    db.from('aglomerados').select('id, execucao_ids').order('id').range(from, to)
  );
  const ids = casarIds(clusters, antigos);
  const agora = new Date().toISOString();

  const linhas = clusters.map((c, i) => ({
    id: ids[i] ?? randomUUID(),
    centro_lat: c.centro_lat, centro_lng: c.centro_lng, raio_metros: raioM,
    qtd_execucoes: c.qtd_execucoes, qtd_instalacoes: c.qtd_instalacoes,
    notas: c.notas, notas_lista: Object.keys(c.notas),
    nota_dominante: c.nota_dominante, pct_nota_dominante: c.pct_nota_dominante,
    agentes: c.agentes, unidades: c.unidades,
    primeira_execucao: c.primeira_execucao, ultima_execucao: c.ultima_execucao,
    janela_minutos: c.janela_minutos, dist_media_envio_m: c.dist_media_envio_m,
    suspeito: c.suspeito, execucao_ids: c.ids, updated_at: agora,
  }));

  // upsert só com as colunas acima: status_auditoria/observacao dos aglomerados
  // que já existiam ficam intactos.
  for (let i = 0; i < linhas.length; i += 100) {
    const { error } = await db.from('aglomerados').upsert(linhas.slice(i, i + 100), { onConflict: 'id' });
    if (error) throw new Error('gravar aglomerados: ' + error.message);
  }

  const manter = new Set(linhas.map(l => l.id));
  const remover = antigos.map(a => a.id).filter(id => !manter.has(id));
  for (let i = 0; i < remover.length; i += 100) {
    const { error } = await db.from('aglomerados').delete().in('id', remover.slice(i, i + 100));
    if (error) throw new Error('limpar aglomerados antigos: ' + error.message);
  }

  return {
    raio_metros: raioM, min_execucoes: minQtd,
    execucoes_analisadas: total_validos, sem_gps_valido: ignorados,
    aglomerados: linhas.length, suspeitos: clusters.filter(c => c.suspeito).length,
  };
}
