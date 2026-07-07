-- 015 — Fix: pedidos.numero_corrida (serial, criada na migration 013) gerou uma
-- sequência nova que NÃO herdou os grants padrão do schema (grant all on all
-- sequences in schema yapa roda só no provisionamento inicial, em db/schema.sql
-- — não retroage para sequências criadas depois por migration). Sintoma em
-- produção: "permission denied for sequence pedidos_numero_corrida_seq" ao
-- inserir pedido (bloqueava inclusive o fluxo de "Dinheiro na Entrega").
GRANT USAGE, SELECT ON SEQUENCE yapa.pedidos_numero_corrida_seq TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
