import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { data, error } = await supabaseAdmin().rpc('meses_disponiveis');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ meses: (data ?? []).map((r: any) => r.mes) });
}
