import { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase/admin';

/**
 * Extrai o usuário autenticado a partir do header Authorization: Bearer <token>
 * (o token de sessão do Supabase Auth, enviado pelo cliente). Nunca confie em
 * um "usuario_id" vindo do corpo da requisição — é sempre resolvido aqui.
 */
export async function getUsuarioAutenticado(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
