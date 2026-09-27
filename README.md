# CNL — Sistema de Importação com Controle de Duplicidade

Implementação da especificação enviada: upload → validação → normalização →
duplicidade no arquivo → duplicidade no banco → coordenadas → prévia →
confirmação → inserção em lote → histórico → instalações duplicadas →
aglomerados geográficos (análise, nunca exclusão automática).

## Stack
- **Next.js 14** (App Router) + TypeScript
- **Supabase** (Postgres + Auth) — todas as gravações passam pelas rotas
  `/api/*` usando a `service_role key`; o cliente nunca escreve direto no
  banco (RLS bloqueia INSERT/UPDATE/DELETE de `authenticated`/`anon`).

## Como rodar

1. Crie um projeto em https://supabase.com
2. No SQL Editor do projeto, rode o conteúdo de `supabase/migrations/0001_init.sql`
   (cria tabelas, índices, `UNIQUE (unique_hash)`, RLS e as funções
   `insert_execucoes_batch`, `increment_importacao_counters`, `recalc_aglomerados`)
3. Em **Authentication → Users**, crie pelo menos um usuário (e-mail/senha)
   para logar no sistema — a rota `/api/import/start` exige um usuário
   autenticado (`usuario_id` nunca vem do frontend, sempre do token).
4. Copie `.env.example` para `.env.local` e preencha:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API)
   - `SUPABASE_SERVICE_ROLE_KEY` (idem — **nunca** exponha no cliente)
5. `npm install`
6. `npm run dev` e acesse `http://localhost:3000`

## Como a duplicidade é garantida (seção 20 da spec)

Duas camadas independentes:

1. **Aplicação**: cada linha recebe um `unique_hash = SHA-256(campos da
   chave configurada)`. Antes de inserir, o backend consulta quais hashes já
   existem (`GET .../chunk`) e classifica cada linha como `NOVO`,
   `DUPLICADO_ARQUIVO` (mesmo hash já gravado nesta mesma importação) ou
   `JA_EXISTE` (hash gravado em importação anterior).
2. **Banco**: `execucoes.unique_hash` tem `UNIQUE CONSTRAINT`. A inserção
   real acontece via a função `insert_execucoes_batch`, que usa
   `INSERT ... ON CONFLICT (unique_hash) DO NOTHING`. Mesmo que a camada 1
   falhe, dois cliques duplos, corrida entre abas ou reimportação do mesmo
   arquivo nunca duplicam uma linha no banco — a importação é idempotente.

## Chave de duplicidade configurável

Por padrão: `instalacao + data_real + nota_leitura` (ver `CAMPOS_DISPONIVEIS`
em `src/app/import/ImportWizard.tsx`). É possível trocar quais campos
compõem a chave na tela de importação, por arquivo importado — fica
registrado em `importacoes.chave_duplicidade`.

## O que é simplificado nesta primeira versão (para você evoluir)

- **Aglomerados geográficos**: usa uma grade (~5 m) simples via
  `earthdistance`/`cube`, em vez de um clustering DBSCAN real com PostGIS.
  Funciona bem para a análise pedida na seção 11, mas se quiser algo mais
  preciso (raio configurável, formas irregulares), migre para PostGIS
  (`ST_ClusterDBSCAN`).
- **Autenticação**: login simples e-mail/senha. Não há telas de cadastro,
  recuperação de senha ou papéis (roles) diferenciados — hoje qualquer
  usuário autenticado importa e lê tudo.
- **Tela de auditorias**: a tabela `auditorias` já registra início/fim de
  importação; falta uma tela dedicada para visualizá-la (é uma query
  simples em cima da tabela, segue o mesmo padrão de `/historico`).
- **Progress bar da leitura do arquivo**: o parse do Excel roda no
  navegador (rápido para dezenas de milhares de linhas); a barra de
  progresso cobre a etapa de gravação em lote (a mais lenta), conforme a
  seção 17.
- Sem testes automatizados.

## Estrutura

```
supabase/migrations/0001_init.sql   schema, RLS, funções (fonte da verdade do banco)
src/lib/types.ts                    tipos + mapeamento de colunas da planilha
src/lib/import/normalize.ts         validação de colunas, normalização, validação de coordenadas
src/lib/import/hash.ts              geração do unique_hash
src/lib/supabase/admin.ts           cliente service_role (server-only)
src/lib/supabase/client.ts          cliente anon (browser)
src/app/api/import/start            cria o registro de importação
src/app/api/import/chunk            classifica e (opcionalmente) grava um lote de linhas
src/app/api/import/finish           finaliza a importação e recalcula aglomerados
src/app/api/importacoes             histórico
src/app/api/duplicados              instalações repetidas
src/app/api/aglomerados/recalc      recálculo de proximidade geográfica
src/app/import/ImportWizard.tsx     tela: upload → chave → prévia → confirmação → progresso
src/app/historico/page.tsx          tela de histórico
src/app/duplicados/page.tsx         tela de instalações duplicadas
```
