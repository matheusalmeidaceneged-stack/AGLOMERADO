import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';
import { idsExecucoesNoMes, parseMes } from '@/lib/mesServidor';

/**
 * GET /api/auditorias-registros
 * Lista "viva" (não um log congelado) de tudo que já foi auditado: tanto a
 * auditoria geral de cada aglomerado quanto as tratativas por subgrupo.
 * Editar observação/tratativa aqui reflete direto nessas tabelas-fonte.
 */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const db = supabaseAdmin();
  const mes = parseMes(req.nextUrl.searchParams);

  const [{ data: aglomerados, error: e1 }, { data: subgrupos, error: e2 }] = await Promise.all([
    db.from('aglomerados')
      .select('id, qtd_execucoes, nota_dominante, agentes, status_auditoria, observacao, tratativa_tipo, tratativa_dias_suspensao, auditado_por, auditado_em, execucao_ids')
      .not('auditado_em', 'is', null),
    db.from('execucao_auditorias')
      .select('id, aglomerado_id, qtd_execucoes, filtro_nota, filtro_data_de, filtro_data_ate, status, observacao, tratativa_tipo, tratativa_dias_suspensao, criado_por, created_at, execucao_ids'),
  ]);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  let aglList = aglomerados ?? [];
  let subList = subgrupos ?? [];
  if (mes) {
    const idsNoMes = await idsExecucoesNoMes(db, mes.de, mes.ate);
    aglList = aglList.filter(a => (a.execucao_ids as string[]).some(id => idsNoMes.has(id)));
    subList = subList.filter(s => (s.execucao_ids as string[]).some(id => idsNoMes.has(id)));
  }

  const idsUsuarios = new Set<string>();
  aglList.forEach(a => a.auditado_por && idsUsuarios.add(a.auditado_por));
  subList.forEach(s => s.criado_por && idsUsuarios.add(s.criado_por));
  const emailPorId = new Map<string, string>();
  if (idsUsuarios.size > 0) {
    const { data: usersPage } = await db.auth.admin.listUsers({ perPage: 200 });
    for (const u of usersPage?.users ?? []) if (idsUsuarios.has(u.id)) emailPorId.set(u.id, u.email ?? u.id);
  }

  const registros = [
    ...aglList.map(a => ({
      tipo: 'aglomerado' as const, id: a.id, aglomerado_id: a.id,
      quando: a.auditado_em, usuario_email: a.auditado_por ? (emailPorId.get(a.auditado_por) ?? null) : null,
      qtd_execucoes: a.qtd_execucoes, nota: a.nota_dominante, agentes: a.agentes,
      filtro_data_de: null, filtro_data_ate: null,
      status: a.status_auditoria, observacao: a.observacao,
      tratativa_tipo: a.tratativa_tipo, tratativa_dias_suspensao: a.tratativa_dias_suspensao,
    })),
    ...subList.map(s => ({
      tipo: 'subgrupo' as const, id: s.id, aglomerado_id: s.aglomerado_id,
      quando: s.created_at, usuario_email: s.criado_por ? (emailPorId.get(s.criado_por) ?? null) : null,
      qtd_execucoes: s.qtd_execucoes, nota: s.filtro_nota, agentes: null,
      filtro_data_de: s.filtro_data_de, filtro_data_ate: s.filtro_data_ate,
      status: s.status, observacao: s.observacao,
      tratativa_tipo: s.tratativa_tipo, tratativa_dias_suspensao: s.tratativa_dias_suspensao,
    })),
  ].sort((a, b) => (b.quando ?? '').localeCompare(a.quando ?? ''));

  return NextResponse.json({ registros });
}
