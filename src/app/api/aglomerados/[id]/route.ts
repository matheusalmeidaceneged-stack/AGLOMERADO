import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const db = supabaseAdmin();
  const { data: agl, error } = await db.from('aglomerados').select('*').eq('id', params.id).single();
  if (error || !agl) return NextResponse.json({ error: error?.message ?? 'não encontrado' }, { status: 404 });

  const { data: execucoes, error: e2 } = await db.rpc('execucoes_por_ids', { p_ids: agl.execucao_ids });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  const { execucao_ids, ...aglomerado } = agl;
  return NextResponse.json({ aglomerado, execucoes });
}
