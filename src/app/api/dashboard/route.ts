import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const db = supabaseAdmin();
  const contar = async (filtro?: (q: any) => any) => {
    let q: any = db.from('aglomerados').select('id', { count: 'exact', head: true });
    if (filtro) q = filtro(q);
    const { count } = await q;
    return (count ?? 0) as number;
  };

  const [{ data: stats, error: e1 }, { data: recentes, error: e2 }, { data: top }, pendente, em_analise, procedente, improcedente, candidatos_pendentes] =
    await Promise.all([
      db.rpc('dashboard_stats').single(),
      db.from('importacoes')
        .select('id, nome_arquivo, data_importacao, total_registros, novos, duplicados_arquivo, ja_existentes, erros, status')
        .order('data_importacao', { ascending: false }).limit(5),
      db.from('aglomerados')
        .select('id, qtd_execucoes, qtd_instalacoes, nota_dominante, pct_nota_dominante, agentes, janela_minutos, status_auditoria, suspeito')
        .order('qtd_execucoes', { ascending: false }).limit(5),
      contar(q => q.eq('status_auditoria', 'pendente')),
      contar(q => q.eq('status_auditoria', 'em_analise')),
      contar(q => q.eq('status_auditoria', 'procedente')),
      contar(q => q.eq('status_auditoria', 'improcedente')),
      contar(q => q.eq('status_auditoria', 'pendente').eq('suspeito', true)),
    ]);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  return NextResponse.json({
    stats,
    importacoes_recentes: recentes,
    top_aglomerados: top ?? [],
    auditoria: { pendente, em_analise, procedente, improcedente, candidatos_pendentes },
  });
}
