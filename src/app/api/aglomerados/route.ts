import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';
import { idsExecucoesNoMes, aglomeradosComExecucaoNoMes, parseMes } from '@/lib/mesServidor';

const COLUNAS = 'id, centro_lat, centro_lng, raio_metros, qtd_execucoes, qtd_instalacoes, notas, nota_dominante, pct_nota_dominante, agentes, unidades, primeira_execucao, ultima_execucao, janela_minutos, dist_media_envio_m, suspeito, status_auditoria, observacao, tratativa_tipo, tratativa_dias_suspensao, auditado_em, updated_at';

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
  const mes = parseMes(sp);

  const db = supabaseAdmin();
  let q = db.from('aglomerados').select(mes ? COLUNAS + ', execucao_ids' : COLUNAS)
    .gte('qtd_execucoes', min).order('qtd_execucoes', { ascending: false }).limit(mes ? 10000 : limit);
  if (nota) q = q.contains('notas_lista', [nota]);
  if (agente) q = q.contains('agentes', [agente]);
  if (status) {
    const lista = status.split(',').map(s => s.trim()).filter(Boolean);
    q = lista.length > 1 ? q.in('status_auditoria', lista) : q.eq('status_auditoria', lista[0]);
  }
  if (suspeito) q = q.eq('suspeito', true);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!mes) return NextResponse.json({ aglomerados: data });

  const idsNoMes = await idsExecucoesNoMes(db, mes.de, mes.ate);
  const filtrados = aglomeradosComExecucaoNoMes(data as any, idsNoMes)
    .slice(0, limit)
    .map(({ execucao_ids, ...resto }: any) => resto);
  return NextResponse.json({ aglomerados: filtrados });
}
