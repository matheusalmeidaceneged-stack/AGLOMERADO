import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';
import { idsExecucoesNoMes, aglomeradosComExecucaoNoMes, parseMes } from '@/lib/mesServidor';

export async function GET(req: NextRequest) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const db = supabaseAdmin();
  const mes = parseMes(req.nextUrl.searchParams);

  const [{ data: statsGerais, error: e1 }, { data: top, error: eTop }, pendente, em_analise, procedente, improcedente] =
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
  let topFiltrado = top ?? [];
  let candidatos_pendentes = 0;

  if (mes) {
    // recorta pelos ids de execução cuja Data Prevista cai no mês escolhido
    const idsNoMes = await idsExecucoesNoMes(db, mes.de, mes.ate);
    const [{ count: totalExecMes }, { data: execsMes }] = await Promise.all([
      db.from('execucoes').select('id', { count: 'exact', head: true }).gte('data_prevista', mes.de).lte('data_prevista', mes.ate),
      db.from('execucoes').select('instalacao').gte('data_prevista', mes.de).lte('data_prevista', mes.ate),
    ]);
    const instalacoesMes = new Set((execsMes ?? []).map((e: any) => e.instalacao));
    topFiltrado = aglomeradosComExecucaoNoMes(topFiltrado as any, idsNoMes);
    candidatos_pendentes = topFiltrado.filter((a: any) => a.suspeito && a.status_auditoria === 'pendente').length;
    stats = {
      ...stats,
      total_execucoes: totalExecMes ?? 0,
      total_instalacoes: instalacoesMes.size,
      total_aglomerados: topFiltrado.length,
    };
    topFiltrado = topFiltrado.slice(0, 5);
  } else {
    candidatos_pendentes = (top ?? []).filter((a: any) => a.suspeito && a.status_auditoria === 'pendente').length;
    // sem filtro de mês, "candidatos pendentes" precisa olhar TODOS os aglomerados, não só o top 5
    const { count } = await db.from('aglomerados').select('id', { count: 'exact', head: true }).eq('status_auditoria', 'pendente').eq('suspeito', true);
    candidatos_pendentes = count ?? 0;
  }

  const limparExecucaoIds = (arr: any[]) => arr.map(({ execucao_ids, ...resto }) => resto);

  return NextResponse.json({
    stats, mes_aplicado: !!mes,
    top_aglomerados: limparExecucaoIds(topFiltrado),
    auditoria: { pendente: pendente.count ?? 0, em_analise: em_analise.count ?? 0, procedente: procedente.count ?? 0, improcedente: improcedente.count ?? 0, candidatos_pendentes },
  });
}
