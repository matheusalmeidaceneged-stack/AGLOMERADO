-- Estatísticas agregadas para o dashboard, calculadas em uma única
-- ida ao banco (mais barato que várias queries separadas do frontend).
create or replace function dashboard_stats()
returns table(
  total_execucoes bigint,
  total_instalacoes bigint,
  total_aglomerados bigint,
  total_importacoes bigint,
  erros_ultimos_7_dias bigint,
  ultima_importacao timestamptz
) as $$
  select
    (select count(*) from execucoes),
    (select count(distinct instalacao) from execucoes),
    (select count(*) from aglomerados),
    (select count(*) from importacoes),
    (select count(*) from importacao_erros where created_at > now() - interval '7 days'),
    (select max(data_importacao) from importacoes);
$$ language sql security definer;
