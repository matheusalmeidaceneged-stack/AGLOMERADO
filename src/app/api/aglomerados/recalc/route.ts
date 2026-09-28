import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';
import { recalcularAglomerados } from '@/lib/aglomerados';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  try {
    const resumo = await recalcularAglomerados(supabaseAdmin(), {
      raioM: Number(body.raio_metros) || undefined,
      minQtd: Number(body.min_execucoes) || undefined,
    });
    return NextResponse.json({ resumo });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'erro ao recalcular' }, { status: 500 });
  }
}
