-- 006_produtos_caixa_variacao.sql
-- Catálogo "à prova de futuro": cervejas por caixa + pods/vapes com sabores.
-- Idempotente e seguro: só adiciona colunas, não altera dados existentes.
-- Aplicar no Supabase (SQL Editor).

alter table yapa.produtos add column if not exists preco_caixa        numeric(14,2);
alter table yapa.produtos add column if not exists unidades_por_caixa integer;
alter table yapa.produtos add column if not exists opcoes_variacao    text[];

comment on column yapa.produtos.preco_caixa        is 'Preço da caixa fechada (cervejas). NULL = vende só por unidade.';
comment on column yapa.produtos.unidades_por_caixa is 'Quantidade de unidades por caixa.';
comment on column yapa.produtos.opcoes_variacao    is 'Sabores/variações (pods/vapes), ex.: {Menta,Morango,Uva}. NULL = sem variação.';
