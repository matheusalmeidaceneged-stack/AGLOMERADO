import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';

/**
 * POST /api/import/start
 * body: { nome_arquivo, chave_duplicidade: string[], total_registros }
 * Cria o registro em `importacoes` (status "processando") que os chunks
 * seguintes vão referenciar e incrementar.
 */
export async function POST(req: NextRequest) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { nome_arquivo, chave_duplicidade, total_registros } = await req.json();
  if (!nome_arquivo || !Array.isArray(chave_duplicidade) || chave_duplicidade.length === 0) {
    return NextResponse.json({ error: 'nome_arquivo e chave_duplicidade são obrigatórios' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('importacoes')
    .insert({
      nome_arquivo,
      usuario_id: usuario.id,
      chave_duplicidade,
      total_registros: total_registros ?? 0,
      status: 'processando',
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from('auditorias').insert({
    usuario_id: usuario.id, tipo: 'importacao_iniciada', referencia_id: data.id,
    detalhes: { nome_arquivo, chave_duplicidade, total_registros },
  });

  return NextResponse.json({ importacao_id: data.id });
}
