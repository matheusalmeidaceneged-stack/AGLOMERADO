-- Tabela só pra manter o projeto ativo no plano gratuito do Supabase (que
-- pausa após 7 dias sem requisição). O cron da Vercel grava e apaga um
-- registro aqui todo dia; a tabela fica sempre vazia.
create table if not exists keepalive (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now()
);
alter table keepalive enable row level security;
-- sem policy de select/insert/delete para authenticated/anon: só o
-- service_role (usado pela rota /api/cron/keepalive) grava e lê aqui.
