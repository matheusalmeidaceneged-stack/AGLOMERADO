-- Suporte ao filtro de mês (por Data Prevista, coluna B da planilha).
create index if not exists idx_execucoes_data_prevista on execucoes (data_prevista);

-- execucoes_por_ids passa a trazer também a data_prevista de cada baixa,
-- usada pelo filtro de mês dentro do detalhe do aglomerado.
drop function if exists execucoes_por_ids(uuid[]);
create or replace function execucoes_por_ids(p_ids uuid[])
returns table(
  id uuid, instalacao text, usuario text, nota_leitura text, descricao_nota text,
  unidade_leitura text, data_prevista date, data_real date, hora text,
  lat_envio double precision, lng_envio double precision,
  lat_retorno double precision, lng_retorno double precision
) as $$
  select e.id, e.instalacao, e.usuario, e.nota_leitura, e.descricao_nota,
         e.unidade_leitura, e.data_prevista, e.data_real, e.hora,
         e.lat_envio, e.lng_envio, e.lat_retorno, e.lng_retorno
  from execucoes e
  where e.id = any(p_ids)
  order by e.data_real, e.hora, e.instalacao;
$$ language sql security definer;
