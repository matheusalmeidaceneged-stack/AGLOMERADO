import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const db = supabaseAdmin();
  const { data: auditorias, error } = await db
    .from('auditorias')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // resolve e-mail dos usuários envolvidos (auth.users não é lido por join direto)
  const ids = Array.from(new Set((auditorias ?? []).map(a => a.usuario_id).filter(Boolean)));
  const emailPorId = new Map<string, string>();
  if (ids.length > 0) {
    const { data: usersPage } = await db.auth.admin.listUsers({ perPage: 200 });
    for (const u of usersPage?.users ?? []) {
      if (ids.includes(u.id)) emailPorId.set(u.id, u.email ?? u.id);
    }
  }

  const resultado = (auditorias ?? []).map(a => ({
    ...a,
    usuario_email: a.usuario_id ? (emailPorId.get(a.usuario_id) ?? a.usuario_id) : null,
  }));

  return NextResponse.json({ auditorias: resultado });
}
