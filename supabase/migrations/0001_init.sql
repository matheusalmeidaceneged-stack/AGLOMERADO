-- ============================================================
-- CNL Import System — schema inicial
-- Regra principal: NUNCA inserir duplicação acidental.
-- Proteção em duas camadas: unique_hash (UNIQUE) + upsert ON CONFLICT.
-- Toda escrita passa pelo backend (service_role); RLS bloqueia
-- INSERT/UPDATE/DELETE direto do cliente (authenticated/anon).
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists cube;
create extension if not exists earthdistance;

-- ---------- importacoes ----------
create table if not exists importacoes (
  id uuid primary key default gen_random_uuid(),
  nome_arquivo text not null,
  usuario_id uuid not null references auth.users(id),
  chave_duplicidade text[] not null,
  total_registros int not null default 0,
  novos int not null default 0,
  duplicados_arquivo int not null default 0,
  ja_existentes int not null default 0,
  erros int not null default 0,
  status text not null default 'processando'
    check (status in ('processando','concluida','erro','cancelada')),
  data_importacao timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ---------- execucoes ----------
create table if not exists execucoes (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid references importacoes(id) on delete set null,
  instalacao text not null,
  usuario text,
  unidade_leitura text,
  tipo text,
  nota_leitura text,
  descricao_nota text,
  data_prevista date,
  data_real date,
  hora text,
  envio text,
  retorno text,
  lat_envio double precision,
  lng_envio double precision,
  lat_retorno double precision,
  lng_retorno double precision,
  raw_data jsonb not null default '{}'::jsonb,
  unique_hash text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint execucoes_unique_hash_key unique (unique_hash)
);
create index if not exists idx_execucoes_instalacao on execucoes (instalacao);
create index if not exists idx_execucoes_importacao on execucoes (importacao_id);
create index if not exists idx_execucoes_geo
  on execucoes using gist (ll_to_earth(lat_retorno, lng_retorno));

-- ---------- importacao_erros ----------
create table if not exists importacao_erros (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references importacoes(id) on delete cascade,
  linha int,
  motivo text not null,
  dados_originais jsonb,
  created_at timestamptz not null default now()
);

-- ---------- aglomerados (proximidade geográfica; NÃO é duplicidade de registro) ----------
create table if not exists aglomerados (
  id uuid primary key default gen_random_uuid(),
  grid_key text not null unique,
  centro_lat double precision not null,
  centro_lng double precision not null,
  raio_metros numeric not null default 5,
  qtd_execucoes int not null default 0,
  execucao_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------- auditorias ----------
create table if not exists auditorias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id),
  tipo text not null,
  referencia_id uuid,
  detalhes jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- RLS: leitura para usuários autenticados; escrita SOMENTE via
-- service_role (backend). Isso implementa a seção 18 da spec:
-- o frontend nunca decide usuário/created_at/id/hash/status.
-- ============================================================
alter table importacoes enable row level security;
alter table execucoes enable row level security;
alter table importacao_erros enable row level security;
alter table aglomerados enable row level security;
alter table auditorias enable row level security;

create policy "select_authenticated_importacoes" on importacoes
  for select using (auth.role() = 'authenticated');
create policy "select_authenticated_execucoes" on execucoes
  for select using (auth.role() = 'authenticated');
create policy "select_authenticated_erros" on importacao_erros
  for select using (auth.role() = 'authenticated');
create policy "select_authenticated_aglomerados" on aglomerados
  for select using (auth.role() = 'authenticated');
create policy "select_authenticated_auditorias" on auditorias
  for select using (auth.role() = 'authenticated');
-- Nenhuma policy de insert/update/delete é criada para authenticated/anon:
-- por padrão, RLS nega. Apenas a service_role (usada nas rotas /api) grava.

-- ============================================================
-- RPC: inserção em lote idempotente.
-- Usa ON CONFLICT (unique_hash) DO NOTHING e retorna quantos
-- registros de fato foram inseridos, garantindo que reimportar
-- o mesmo arquivo nunca duplique dados (idempotência, seção 8).
-- ============================================================
create or replace function insert_execucoes_batch(
  p_importacao_id uuid,
  p_rows jsonb,          -- array de objetos já normalizados
  p_usuario_id uuid
) returns table(inserted_count int, skipped_count int) as $$
declare
  v_inserted int;
  v_total int;
begin
  with input_rows as (
    select * from jsonb_to_recordset(p_rows) as x(
      instalacao text, usuario text, unidade_leitura text, tipo text,
      nota_leitura text, descricao_nota text, data_prevista date,
      data_real date, hora text, envio text, retorno text,
      lat_envio double precision, lng_envio double precision,
      lat_retorno double precision, lng_retorno double precision,
      raw_data jsonb, unique_hash text
    )
  ),
  ins as (
    insert into execucoes (
      importacao_id, instalacao, usuario, unidade_leitura, tipo,
      nota_leitura, descricao_nota, data_prevista, data_real, hora,
      envio, retorno, lat_envio, lng_envio, lat_retorno, lng_retorno,
      raw_data, unique_hash, created_by
    )
    select
      p_importacao_id, instalacao, usuario, unidade_leitura, tipo,
      nota_leitura, descricao_nota, data_prevista, data_real, hora,
      envio, retorno, lat_envio, lng_envio, lat_retorno, lng_retorno,
      raw_data, unique_hash, p_usuario_id
    from input_rows
    on conflict (unique_hash) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  select jsonb_array_length(p_rows) into v_total;

  update importacoes
    set novos = novos + v_inserted,
        ja_existentes = ja_existentes + (v_total - v_inserted)
    where id = p_importacao_id;

  return query select v_inserted, (v_total - v_inserted);
end;
$$ language plpgsql security definer;

-- Consulta em lote via POST (evita limite de tamanho de URL do .in() em GET
-- quando o lote tem centenas/milhares de hashes).
create or replace function hashes_existentes(p_hashes text[])
returns table(unique_hash text, importacao_id uuid) as $$
  select unique_hash, importacao_id from execucoes where unique_hash = any(p_hashes);
$$ language sql security definer;

-- Incrementa contadores de forma atômica (evita corrida entre lotes).
create or replace function increment_importacao_counters(
  p_importacao_id uuid,
  p_duplicados_arquivo int default 0,
  p_erros int default 0
) returns void as $$
begin
  update importacoes
    set duplicados_arquivo = duplicados_arquivo + p_duplicados_arquivo,
        erros = erros + p_erros
    where id = p_importacao_id;
end;
$$ language plpgsql security definer;

-- ============================================================
-- Recalcula aglomerados por proximidade geográfica (grid ~5m).
-- Isso é APENAS análise: nunca remove ou marca execuções como
-- duplicadas por estarem próximas (seção 11 da spec).
-- ============================================================
create or replace function recalc_aglomerados() returns void as $$
begin
  delete from aglomerados;

  insert into aglomerados (grid_key, centro_lat, centro_lng, qtd_execucoes, execucao_ids)
  select
    grid_key,
    avg(lat_retorno) as centro_lat,
    avg(lng_retorno) as centro_lng,
    count(*) as qtd_execucoes,
    array_agg(id) as execucao_ids
  from (
    select
      id, lat_retorno, lng_retorno,
      -- ~0.000045° ≈ 5m de lado de grade
      round(lat_retorno / 0.000045) || '_' || round(lng_retorno / 0.000045) as grid_key
    from execucoes
    where lat_retorno is not null and lng_retorno is not null
  ) g
  group by grid_key
  having count(*) > 1;
end;
$$ language plpgsql security definer;
