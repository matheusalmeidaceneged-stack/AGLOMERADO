-- Bucket de armazenamento para as fotos anexadas durante a auditoria.
-- Público para leitura (as fotos aparecem no site e no PDF do dossiê sem
-- precisar de outra chamada autenticada); a gravação só acontece via
-- service_role (rota /api), igual ao resto do sistema.
insert into storage.buckets (id, name, public)
values ('auditoria-fotos', 'auditoria-fotos', true)
on conflict (id) do nothing;

create table if not exists execucao_fotos (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references execucoes(id) on delete cascade,
  aglomerado_id uuid references aglomerados(id) on delete set null,
  caminho text not null,
  url text not null,
  legenda text,
  enviado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_execucao_fotos_execucao on execucao_fotos (execucao_id);
create index if not exists idx_execucao_fotos_aglomerado on execucao_fotos (aglomerado_id);

alter table execucao_fotos enable row level security;
create policy "select_authenticated_execucao_fotos" on execucao_fotos
  for select using (auth.role() = 'authenticated');
