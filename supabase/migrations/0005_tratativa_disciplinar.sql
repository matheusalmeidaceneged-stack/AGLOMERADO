-- Tratativa disciplinar: decisão tomada DEPOIS da auditoria, quando um
-- desvio de conduta é confirmado. É separada da situação da auditoria
-- (pendente/em análise/procedente/improcedente) — pode ser preenchida
-- depois, quando o responsável decidir a penalidade.
alter table aglomerados
  add column if not exists tratativa_tipo text
    check (tratativa_tipo in ('advertencia','suspensao','desligamento')),
  add column if not exists tratativa_dias_suspensao int;

alter table execucao_auditorias
  add column if not exists tratativa_tipo text
    check (tratativa_tipo in ('advertencia','suspensao','desligamento')),
  add column if not exists tratativa_dias_suspensao int;
