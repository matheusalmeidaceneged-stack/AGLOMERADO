import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';
import { idsExecucoesNoMes, aglomeradosComExecucaoNoMes, estatisticasAglomeradosNoMes, parseMes } from '@/lib/mesServidor';

export async function GET(req: NextRequest) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const db = supabaseAdmin();
  const mes = parseMes(req.nextUrl.searchParams);

  const [{ data: statsGerais, error: e1 }, { data: todos, error: eTop }, pendente, em_analise, procedente, improcedente] =
    await Promise.all([
      db.rpc('dashboard_stats').single(),
      db.from('aglomerados')
        .select('id, qtd_execucoes, qtd_instalacoes, nota_dominante, pct_nota_dominante, agentes, janela_minutos, status_auditoria, suspeito, execucao_ids')
        .order('qtd_execucoes', { ascending: false }).limit(mes ? 10000 : 5),
      db.from('aglomerados').select('id', { count: 'exact', head: true }).eq('status_auditoria', 'pendente'),
      db.from('aglomerados').select('id', { count: 'exact', head: true }).eq('status_auditoria', 'em_analise'),
      db.from('aglomerados').select('id', { count: 'exact', head: true }).eq('status_auditoria', 'procedente'),
      db.from('aglomerados').select('id', { count: 'exact', head: true }).eq('status_auditoria', 'improcedente'),
    ]);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (eTop) return NextResponse.json({ error: eTop.message }, { status: 500 });

  let stats = statsGerais as any;
  let topFiltrado: any[] = todos ?? [];
  let candidatos_pendentes: number;

  if (mes) {
    const idsNoMes = await idsExecucoesNoMes(db, mes.de, mes.ate);
    const candidatos = aglomeradosComExecucaoNoMes(topFiltrado, idsNoMes);
    const statsPorAgl = await estatisticasAglomeradosNoMes(db, candidatos, mes.de, mes.ate);

    const [{ count: totalExecMes }, { data: execsMes }] = await Promise.all([
      db.from('execucoes').select('id', { count: 'exact', head: true }).gte('data_prevista', mes.de).lte('data_prevista', mes.ate),
      db.from('execucoes').select('instalacao').gte('data_prevista', mes.de).lte('data_prevista', mes.ate),
    ]);
    const instalacoesMes = new Set((execsMes ?? []).map((e: any) => e.instalacao));

    const recalculados = candidatos.map((a: any) => {
      const e = statsPorAgl.get(a.id)!;
      return { ...a, qtd_execucoes: e.qtd_execucoes, qtd_instalacoes: e.qtd_instalacoes, nota_dominante: e.nota_dominante, pct_nota_dominante: e.pct_nota_dominante, agentes: e.agentes, janela_minutos: e.janela_minutos };
    }).sort((a: any, b: any) => b.qtd_execucoes - a.qtd_execucoes);

    candidatos_pendentes = recalculados.filter((a: any) => a.suspeito && a.status_auditoria === 'pendente').length;
    topFiltrado = recalculados.slice(0, 5);
    stats = { ...stats, total_execucoes: totalExecMes ?? 0, total_instalacoes: instalacoesMes.size, total_aglomerados: recalculados.length };
  } else {
    const { count } = await db.from('aglomerados').select('id', { count: 'exact', head: true }).eq('status_auditoria', 'pendente').eq('suspeito', true);
    candidatos_pendentes = count ?? 0;
    topFiltrado = topFiltrado.slice(0, 5);
  }

  const limparExecucaoIds = (arr: any[]) => arr.map(({ execucao_ids, ...resto }) => resto);

  return NextResponse.json({
    stats, mes_aplicado: !!mes,
    top_aglomerados: limparExecucaoIds(topFiltrado),
    auditoria: { pendente: pendente.count ?? 0, em_analise: em_analise.count ?? 0, procedente: procedente.count ?? 0, improcedente: improcedente.count ?? 0, candidatos_pendentes },
  });
}
