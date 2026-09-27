import { createClient } from '@supabase/supabase-js';

// USADO SOMENTE EM ROTAS /api (server-side). A service_role key ignora RLS,
// então toda regra de "quem pode gravar o quê" fica garantida aqui no
// backend — nunca no cliente (ver seção 18 da spec).
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
