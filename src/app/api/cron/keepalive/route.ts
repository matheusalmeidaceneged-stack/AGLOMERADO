import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Chamada 1x por dia pelo Cron Job da Vercel (ver vercel.json). Só serve
 * para gerar atividade real no Supabase (grava e apaga um registro) e
 * evitar a pausa automática do plano gratuito por 7 dias de inatividade.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data, error: e1 } = await db.from('keepalive').insert({}).select('id').single();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const { error: e2 } = await db.from('keepalive').delete().eq('id', data.id);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  return NextResponse.json({ ok: true, quando: new Date().toISOString() });
}
