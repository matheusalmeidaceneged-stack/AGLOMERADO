import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const db = supabaseAdmin();
  const [{ data: stats, error: e1 }, { data: recentes, error: e2 }] = await Promise.all([
    db.rpc('dashboard_stats').single(),
    db.from('importacoes')
      .select('id, nome_arquivo, data_importacao, total_registros, novos, duplicados_arquivo, ja_existentes, erros, status')
      .order('data_importacao', { ascending: false })
      .limit(5),
  ]);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  return NextResponse.json({ stats, importacoes_recentes: recentes });
}
