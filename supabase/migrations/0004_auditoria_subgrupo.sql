-- Tratativas por subgrupo dentro de um aglomerado grande (ex.: só o dia 04,
-- só a nota C07). Não substitui a auditoria geral do aglomerado — se soma a
-- ela, permitindo registrar decisões diferentes para fatias diferentes de um
-- mesmo ponto (parte autorizada, parte com desvio de conduta).
create table if not exists execucao_auditorias (
  id uuid primary key default gen_random_uuid(),
  aglomerado_id uuid not null references aglomerados(id) on delete cascade,
  execucao_ids uuid[] not null,
  qtd_execucoes int not null,
  filtro_data_de date,
  filtro_data_ate date,
  filtro_nota text,
  status text not null check (status in ('pendente','em_analise','procedente','improcedente')),
  observacao text,
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_execaud_aglomerado on execucao_auditorias (aglomerado_id);

alter table execucao_auditorias enable row level security;
create policy "select_authenticated_execucao_auditorias" on execucao_auditorias
  for select using (auth.role() = 'authenticated');
-- escrita só via service_role (rotas /api), igual ao resto do sistema.
