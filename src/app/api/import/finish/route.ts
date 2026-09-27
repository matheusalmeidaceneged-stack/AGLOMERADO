import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';

/**
 * POST /api/import/finish  { importacao_id, status: 'concluida'|'cancelada'|'erro' }
 * Marca a importação como concluída e dispara o recálculo de aglomerados
 * (análise de proximidade geográfica — nunca afeta duplicidade de registro).
 */
export async function POST(req: NextRequest) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { importacao_id, status } = await req.json();
  if (!importacao_id) return NextResponse.json({ error: 'importacao_id obrigatório' }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from('importacoes')
    .update({ status: status ?? 'concluida' })
    .eq('id', importacao_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from('auditorias').insert({
    usuario_id: usuario.id, tipo: 'importacao_finalizada', referencia_id: importacao_id,
    detalhes: { status: status ?? 'concluida' },
  });

  if (status !== 'cancelada') {
    db.rpc('recalc_aglomerados').then(() => {}); // assíncrono, não bloqueia a resposta
  }

  return NextResponse.json({ ok: true });
}
