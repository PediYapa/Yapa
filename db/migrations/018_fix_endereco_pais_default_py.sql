-- 018 — corrige o DEFAULT de distribuidoras.endereco_pais de 'BR' para 'PY'.
-- A migration 017 introduziu a coluna com DEFAULT 'BR' (os exemplos da doc da
-- Entregas Expressas eram BR), mas TODA a operação do Yapa é em Ciudad del Este,
-- Paraguai — sem essa correção, toda distribuidora nova nasce marcada como Brasil.
-- Aqui só trocamos o DEFAULT; o backfill das 10 linhas existentes (todas com 'BR'
-- vindo só do default, endereço estruturado vazio) é decisão à parte.
ALTER TABLE yapa.distribuidoras ALTER COLUMN endereco_pais SET DEFAULT 'PY';

NOTIFY pgrst, 'reload schema';
