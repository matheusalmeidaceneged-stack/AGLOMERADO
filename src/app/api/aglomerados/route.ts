import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';

const COLUNAS = 'id, centro_lat, centro_lng, raio_metros, qtd_execucoes, qtd_instalacoes, notas, nota_dominante, pct_nota_dominante, agentes, unidades, primeira_execucao, ultima_execucao, janela_minutos, dist_media_envio_m, suspeito, status_auditoria, observacao, auditado_em, updated_at';

export async function GET(req: NextRequest) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const min = Math.max(Number(sp.get('min')) || 3, 2);
  const limit = Math.min(Number(sp.get('limit')) || 1000, 2000);
  const nota = sp.get('nota')?.trim().toUpperCase();
  const agente = sp.get('agente')?.trim().toUpperCase();
  const status = sp.get('status');
  const suspeito = sp.get('suspeito') === '1';

  let q = supabaseAdmin().from('aglomerados').select(COLUNAS)
    .gte('qtd_execucoes', min).order('qtd_execucoes', { ascending: false }).limit(limit);
  if (nota) q = q.contains('notas_lista', [nota]);
  if (agente) q = q.contains('agentes', [agente]);
  if (status) q = q.eq('status_auditoria', status);
  if (suspeito) q = q.eq('suspeito', true);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ aglomerados: data });
}
