-- ============================================================
-- Aglomerados v2: agrupamento por proximidade (calculado pela aplicação),
-- com indicadores de auditoria e resultado da análise do auditor.
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- ============================================================

-- a função antiga (grade de 5 m, com DELETE sem WHERE) é substituída pelo cálculo na API
drop function if exists recalc_aglomerados();

-- recomeça a tabela de aglomerados do zero (ela é 100% recalculável a partir de `execucoes`)
delete from aglomerados where true;

alter table aglomerados drop column if exists grid_key;
alter table aglomerados
  add column if not exists qtd_instalacoes int not null default 0,
  add column if not exists notas jsonb not null default '{}'::jsonb,
  add column if not exists notas_lista text[] not null default '{}',
  add column if not exists nota_dominante text,
  add column if not exists pct_nota_dominante numeric,
  add column if not exists agentes text[] not null default '{}',
  add column if not exists unidades text[] not null default '{}',
  add column if not exists primeira_execucao timestamp,
  add column if not exists ultima_execucao timestamp,
  add column if not exists janela_minutos int,
  add column if not exists dist_media_envio_m int,
  add column if not exists suspeito boolean not null default false,
  add column if not exists status_auditoria text not null default 'pendente'
    check (status_auditoria in ('pendente','em_analise','procedente','improcedente')),
  add column if not exists observacao text,
  add column if not exists auditado_por uuid references auth.users(id),
  add column if not exists auditado_em timestamptz;

create index if not exists idx_aglomerados_qtd on aglomerados (qtd_execucoes desc);

-- Busca execuções por lista de ids via POST (evita URL gigante em cluster grande)
create or replace function execucoes_por_ids(p_ids uuid[])
returns table(
  id uuid, instalacao text, usuario text, nota_leitura text, descricao_nota text,
  unidade_leitura text, data_real date, hora text,
  lat_envio double precision, lng_envio double precision,
  lat_retorno double precision, lng_retorno double precision
) as $$
  select e.id, e.instalacao, e.usuario, e.nota_leitura, e.descricao_nota,
         e.unidade_leitura, e.data_real, e.hora,
         e.lat_envio, e.lng_envio, e.lat_retorno, e.lng_retorno
  from execucoes e
  where e.id = any(p_ids)
  order by e.data_real, e.hora, e.instalacao;
$$ language sql security definer;
