import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';
import { normalizarLinha, coordenadasValidas } from '@/lib/import/normalize';
import { gerarUniqueHash, algumCampoChaveVazio } from '@/lib/import/hash';
import { ExecucaoNormalizada, LinhaProcessada, StatusLinha } from '@/lib/types';

/**
 * POST /api/import/chunk
 * body: {
 *   importacao_id, chave_duplicidade: string[], dry_run: boolean,
 *   linhas: { linha: number, raw: Record<string, unknown> }[]
 * }
 *
 * Reclassifica CADA linha no servidor (nunca confia no status calculado
 * pelo cliente): ERRO (chave incompleta/coordenada inválida) > DUPLICADO
 * NO ARQUIVO (mesmo hash já gravado nesta mesma importação) > JÁ EXISTE
 * (mesmo hash gravado em importação anterior) > NOVO.
 * Em dry_run=false, os NOVOS são gravados via RPC idempotente.
 */
export async function POST(req: NextRequest) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { importacao_id, chave_duplicidade, dry_run, linhas } = await req.json();
  if (!importacao_id || !Array.isArray(chave_duplicidade) || !Array.isArray(linhas)) {
    return NextResponse.json({ error: 'payload inválido' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const campos = chave_duplicidade as (keyof ExecucaoNormalizada)[];
  const resultado: LinhaProcessada[] = [];
  const candidatosNovos: { linha: number; dados: ExecucaoNormalizada; hash: string }[] = [];
  const hashesVistosNoLote = new Map<string, number>(); // hash -> linha da 1ª ocorrência

  // 1) normalizar, validar chave/coordenadas, dedup dentro do próprio lote
  for (const { linha, raw } of linhas as { linha: number; raw: Record<string, unknown> }[]) {
    const dados = normalizarLinha(raw);
    let status: StatusLinha;
    let motivo_erro: string | undefined;

    if (algumCampoChaveVazio(dados, campos)) {
      status = 'ERRO'; motivo_erro = 'Campo(s) da chave de duplicidade vazio(s)';
    } else if (!coordenadasValidas(dados)) {
      status = 'ERRO'; motivo_erro = 'Coordenada fora do intervalo válido';
    } else {
      const hash = gerarUniqueHash(dados, campos);
      if (hashesVistosNoLote.has(hash)) {
        status = 'DUPLICADO_ARQUIVO';
      } else {
        hashesVistosNoLote.set(hash, linha);
        status = 'NOVO'; // classificação provisória — confirmada no passo 2
        candidatosNovos.push({ linha, dados, hash });
      }
      resultado.push({ linha, dados, unique_hash: hash, status, motivo_erro });
      continue;
    }
    resultado.push({ linha, dados, unique_hash: '', status, motivo_erro });
  }

  // 2) checar contra o banco: hash já existe (nesta importação = duplicado
  //    no arquivo entre lotes diferentes; em outra importação = já existe)
  const hashes = candidatosNovos.map(c => c.hash);
  let existentes: { unique_hash: string; importacao_id: string | null }[] = [];
  if (hashes.length > 0) {
    // RPC (POST) em vez de .in() (GET) — evita estourar limite de tamanho de URL
    // quando o lote tem centenas/milhares de hashes.
    const { data } = await db.rpc('hashes_existentes', { p_hashes: hashes });
    existentes = data ?? [];
  }
  const mapaExistentes = new Map(existentes.map(e => [e.unique_hash, e.importacao_id]));
  const indicePorLinha = new Map(resultado.map((r, idx) => [r.linha, idx]));

  const paraInserir: { dados: ExecucaoNormalizada; hash: string }[] = [];
  for (const c of candidatosNovos) {
    const idxResultado = indicePorLinha.get(c.linha)!;
    const existeImportacaoId = mapaExistentes.get(c.hash);
    if (existeImportacaoId !== undefined) {
      resultado[idxResultado].status =
        existeImportacaoId === importacao_id ? 'DUPLICADO_ARQUIVO' : 'JA_EXISTE';
    } else {
      paraInserir.push(c);
    }
  }

  const resumo = {
    total: resultado.length,
    novos: 0,
    duplicados_arquivo: resultado.filter(r => r.status === 'DUPLICADO_ARQUIVO').length,
    ja_existentes: resultado.filter(r => r.status === 'JA_EXISTE').length,
    erros: resultado.filter(r => r.status === 'ERRO').length,
  };

  if (dry_run) {
    resumo.novos = paraInserir.length;
    return NextResponse.json({ resumo, linhas: resultado });
  }

  // 3) gravar apenas os genuinamente novos, via RPC idempotente (ON CONFLICT)
  if (paraInserir.length > 0) {
    const payload = paraInserir.map(p => ({ ...p.dados, unique_hash: p.hash }));
    const { data: rpcData, error: rpcError } = await db.rpc('insert_execucoes_batch', {
      p_importacao_id: importacao_id,
      p_rows: payload,
      p_usuario_id: usuario.id,
    });
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });
    resumo.novos = rpcData?.[0]?.inserted_count ?? 0;
  }

  // 4) registrar erros e atualizar contadores de duplicado/existente/erro
  const erros = resultado.filter(r => r.status === 'ERRO');
  if (erros.length > 0) {
    await db.from('importacao_erros').insert(
      erros.map(e => ({
        importacao_id, linha: e.linha, motivo: e.motivo_erro, dados_originais: e.dados.raw_data,
      }))
    );
  }
  await db.rpc('increment_importacao_counters', {
    p_importacao_id: importacao_id,
    p_duplicados_arquivo: resumo.duplicados_arquivo,
    p_erros: resumo.erros,
  });

  return NextResponse.json({ resumo, linhas: resultado });
}
