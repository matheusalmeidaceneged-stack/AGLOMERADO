import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';

/**
 * GET /api/duplicados
 * Agrupa execuções por instalação com mais de 1 ocorrência — "REPETIÇÃO DA
 * INSTALAÇÃO" (seção 12/14 da spec): pode ser execução legítima repetida,
 * não é excluído automaticamente, fica marcado como "Analisar".
 */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('execucoes')
    .select('instalacao, data_real, usuario, id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const grupos = new Map<string, { instalacao: string; datas: Set<string>; agentes: Set<string>; qtd: number }>();
  for (const row of data ?? []) {
    const g = grupos.get(row.instalacao) ?? { instalacao: row.instalacao, datas: new Set(), agentes: new Set(), qtd: 0 };
    g.qtd++;
    if (row.data_real) g.datas.add(row.data_real);
    if (row.usuario) g.agentes.add(row.usuario);
    grupos.set(row.instalacao, g);
  }

  const resultado = Array.from(grupos.values())
    .filter(g => g.qtd > 1)
    .map(g => ({
      instalacao: g.instalacao, quantidade: g.qtd,
      datas: Array.from(g.datas), agentes: Array.from(g.agentes).length, status: 'Analisar',
    }))
    .sort((a, b) => b.quantidade - a.quantidade);

  return NextResponse.json({ instalacoes: resultado });
}
