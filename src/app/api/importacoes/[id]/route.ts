import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const db = supabaseAdmin();
  const [{ data: importacao, error: e1 }, { data: erros, error: e2 }] = await Promise.all([
    db.from('importacoes').select('*').eq('id', params.id).single(),
    db.from('importacao_erros').select('*').eq('importacao_id', params.id).order('linha'),
  ]);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 404 });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  return NextResponse.json({ importacao, erros });
}
