import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';

const STATUS = ['pendente', 'em_analise', 'procedente', 'improcedente'];

// Registra a análise do auditor. Quem analisou e quando vem SEMPRE do backend.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { status, observacao } = await req.json();
  if (!STATUS.includes(status)) return NextResponse.json({ error: 'status inválido' }, { status: 400 });
  const obs = typeof observacao === 'string' ? observacao.trim().slice(0, 2000) || null : null;

  const db = supabaseAdmin();
  const { data, error } = await db.from('aglomerados')
    .update({ status_auditoria: status, observacao: obs, auditado_por: usuario.id, auditado_em: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, status_auditoria, observacao, auditado_em, qtd_execucoes, centro_lat, centro_lng, nota_dominante, agentes')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from('auditorias').insert({
    usuario_id: usuario.id, tipo: 'analise_aglomerado', referencia_id: params.id,
    detalhes: {
      status, observacao: obs, qtd_execucoes: data.qtd_execucoes, nota_dominante: data.nota_dominante,
      agentes: data.agentes, local: [data.centro_lat, data.centro_lng],
    },
  });

  return NextResponse.json({ aglomerado: data });
}
