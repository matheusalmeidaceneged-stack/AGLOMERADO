import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';

const STATUS = ['pendente', 'em_analise', 'procedente', 'improcedente'];

/**
 * Registra uma tratativa para um SUBGRUPO de execuções dentro de um
 * aglomerado (ex.: só a nota C07 do dia 04/09). Fica guardado à parte da
 * auditoria geral do aglomerado — um mesmo ponto grande pode ter várias
 * tratativas, cada uma cobrindo uma fatia diferente.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { execucao_ids, filtro_data_de, filtro_data_ate, filtro_nota, status, observacao } = await req.json();
  if (!Array.isArray(execucao_ids) || execucao_ids.length === 0)
    return NextResponse.json({ error: 'selecione ao menos uma execução' }, { status: 400 });
  if (!STATUS.includes(status)) return NextResponse.json({ error: 'status inválido' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: agl, error: e1 } = await db.from('aglomerados').select('execucao_ids').eq('id', params.id).single();
  if (e1 || !agl) return NextResponse.json({ error: e1?.message ?? 'aglomerado não encontrado' }, { status: 404 });

  // só aceita ids que realmente pertencem a este aglomerado
  const pertencem = new Set(agl.execucao_ids as string[]);
  const idsValidos = (execucao_ids as string[]).filter(id => pertencem.has(id));
  if (idsValidos.length === 0) return NextResponse.json({ error: 'nenhuma execução válida selecionada' }, { status: 400 });

  const obs = typeof observacao === 'string' ? observacao.trim().slice(0, 2000) || null : null;
  const { data, error } = await db.from('execucao_auditorias').insert({
    aglomerado_id: params.id, execucao_ids: idsValidos, qtd_execucoes: idsValidos.length,
    filtro_data_de: filtro_data_de || null, filtro_data_ate: filtro_data_ate || null,
    filtro_nota: filtro_nota || null, status, observacao: obs, criado_por: usuario.id,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from('auditorias').insert({
    usuario_id: usuario.id, tipo: 'analise_subgrupo_aglomerado', referencia_id: params.id,
    detalhes: {
      status, observacao: obs, qtd_execucoes: idsValidos.length,
      filtro_nota: filtro_nota || null, filtro_data_de: filtro_data_de || null, filtro_data_ate: filtro_data_ate || null,
    },
  });

  return NextResponse.json({ subgrupo: data });
}
