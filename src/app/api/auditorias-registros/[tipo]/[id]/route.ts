import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';

const TRATATIVAS = ['advertencia', 'suspensao', 'desligamento'];

/**
 * PATCH /api/auditorias-registros/[tipo]/[id]   tipo: "aglomerado" | "subgrupo"
 * body: { observacao?: string|null, tratativa_tipo?: string|null, tratativa_dias_suspensao?: number|null }
 * Edita a observação e/ou a tratativa disciplinar (decidida depois da
 * auditoria, quando o desvio de conduta é confirmado) de um registro já
 * existente. Não mexe na situação da auditoria em si — isso continua sendo
 * feito na tela do aglomerado.
 */
export async function PATCH(req: NextRequest, { params }: { params: { tipo: string; id: string } }) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!['aglomerado', 'subgrupo'].includes(params.tipo))
    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 });

  const body = await req.json();
  const patch: Record<string, unknown> = {};

  if ('observacao' in body) {
    const obs = typeof body.observacao === 'string' ? body.observacao.trim().slice(0, 2000) || null : null;
    patch.observacao = obs;
  }
  if ('tratativa_tipo' in body) {
    const t = body.tratativa_tipo;
    if (t !== null && !TRATATIVAS.includes(t)) return NextResponse.json({ error: 'tratativa inválida' }, { status: 400 });
    patch.tratativa_tipo = t;
    // dias de suspensão só fazem sentido quando a tratativa é suspensão
    patch.tratativa_dias_suspensao = t === 'suspensao' ? (Number(body.tratativa_dias_suspensao) || null) : null;
  } else if ('tratativa_dias_suspensao' in body) {
    patch.tratativa_dias_suspensao = Number(body.tratativa_dias_suspensao) || null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });

  const tabela = params.tipo === 'aglomerado' ? 'aglomerados' : 'execucao_auditorias';
  const db = supabaseAdmin();
  const { data, error } = await db.from(tabela).update(patch).eq('id', params.id)
    .select('id, observacao, tratativa_tipo, tratativa_dias_suspensao').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from('auditorias').insert({
    usuario_id: usuario.id, tipo: 'tratativa_disciplinar', referencia_id: params.id,
    detalhes: { tipo_registro: params.tipo, ...patch },
  });

  return NextResponse.json({ registro: data });
}
