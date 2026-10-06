import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUsuarioAutenticado } from '@/lib/auth';

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const TAMANHO_MAX = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/execucoes/[id]/fotos
 * form-data: file (a imagem), aglomerado_id (string), legenda? (string)
 * Sobe a foto para o bucket "auditoria-fotos" e registra o vínculo com a
 * execução (baixa) auditada.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const aglomeradoId = form.get('aglomerado_id') as string | null;
  const legenda = form.get('legenda') as string | null;
  if (!file) return NextResponse.json({ error: 'nenhum arquivo enviado' }, { status: 400 });
  if (!TIPOS_ACEITOS.includes(file.type)) return NextResponse.json({ error: 'formato de imagem não suportado' }, { status: 400 });
  if (file.size > TAMANHO_MAX) return NextResponse.json({ error: 'imagem maior que 10 MB' }, { status: 400 });

  const db = supabaseAdmin();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const caminho = `${params.id}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: eUpload } = await db.storage.from('auditoria-fotos').upload(caminho, buffer, { contentType: file.type });
  if (eUpload) return NextResponse.json({ error: eUpload.message }, { status: 500 });

  const { data: pub } = db.storage.from('auditoria-fotos').getPublicUrl(caminho);
  const { data, error } = await db.from('execucao_fotos').insert({
    execucao_id: params.id, aglomerado_id: aglomeradoId || null, caminho, url: pub.publicUrl,
    legenda: legenda || null, enviado_por: usuario.id,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ foto: data });
}

/** DELETE /api/execucoes/[id]/fotos?foto_id=... remove uma foto específica. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAutenticado(req);
  if (!usuario) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const fotoId = req.nextUrl.searchParams.get('foto_id');
  if (!fotoId) return NextResponse.json({ error: 'foto_id obrigatório' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: foto, error: e1 } = await db.from('execucao_fotos').select('caminho').eq('id', fotoId).eq('execucao_id', params.id).single();
  if (e1 || !foto) return NextResponse.json({ error: e1?.message ?? 'foto não encontrada' }, { status: 404 });

  await db.storage.from('auditoria-fotos').remove([foto.caminho]);
  const { error: e2 } = await db.from('execucao_fotos').delete().eq('id', fotoId);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
