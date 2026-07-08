-- 016 — Fix sistêmico de GRANTs em objetos criados por migrations.
-- `estoque_hub` (011) e `motoboys` (013) foram criadas SEM grant nenhum —
-- "grant all on all tables in schema yapa" (db/schema.sql) só vale para o que
-- existia no provisionamento inicial. Sintoma real em produção: "permission
-- denied for table motoboys" bloqueando o comando P/E do leilão de motoboys
-- (o mesmo bug de classe da migration 015, mas em TABELA em vez de sequence).
--
-- Corrige tudo que já existe E configura DEFAULT PRIVILEGES para que toda
-- tabela/sequence/function NOVA herde automaticamente — não depende mais de
-- lembrar um GRANT manual em cada migration futura.
GRANT ALL ON ALL TABLES IN SCHEMA yapa TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA yapa TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA yapa TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA yapa GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA yapa GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA yapa GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
