import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const db = supabaseAdmin();
  const { error } = await db.rpc('recalc_aglomerados');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = await db.from('aglomerados').select('*').order('qtd_execucoes', { ascending: false });
  return NextResponse.json({ aglomerados: data });
}
