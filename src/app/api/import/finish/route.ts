import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';
import { recalcularAglomerados } from '@/lib/aglomerados';

export const maxDuration = 60;

/**
 * POST /api/import/finish  { importacao_id, status: 'concluida'|'cancelada'|'erro' }
 * Marca a importação como concluída e recalcula os aglomerados (aguardando o
 * resultado — em serverless, trabalho em segundo plano pode ser cortado).
 */
export async function POST(req: NextRequest) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { importacao_id, status } = await req.json();
  if (!importacao_id) return NextResponse.json({ error: 'importacao_id obrigatório' }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from('importacoes').update({ status: status ?? 'concluida' }).eq('id', importacao_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from('auditorias').insert({
    usuario_id: usuario.id, tipo: 'importacao_finalizada', referencia_id: importacao_id,
    detalhes: { status: status ?? 'concluida' },
  });

  let aglomerados: unknown = null, aglomerados_erro: string | null = null;
  if (status !== 'cancelada') {
    try { aglomerados = await recalcularAglomerados(db); }
    catch (e: any) { aglomerados_erro = e.message ?? 'erro ao recalcular aglomerados'; }
  }
  return NextResponse.json({ ok: true, aglomerados, aglomerados_erro });
}
