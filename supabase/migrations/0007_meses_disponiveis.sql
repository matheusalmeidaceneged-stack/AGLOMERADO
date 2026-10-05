-- Lista só os meses que realmente têm execuções com Data Prevista, para o
-- seletor de mês não mostrar um ano inteiro de meses vazios.
create or replace function meses_disponiveis()
returns table(mes text) as $$
  select distinct to_char(data_prevista, 'YYYY-MM') as mes
  from execucoes
  where data_prevista is not null
  order by 1 desc;
$$ language sql security definer;
