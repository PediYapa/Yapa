-- ============================================================================
-- Migração 003 — campos de gateway de pagamento (DLocal) na tabela pedidos
-- Aplicar em: Supabase Dashboard → SQL Editor
-- ============================================================================
set search_path to yapa, public;

alter table yapa.pedidos add column if not exists gateway_id     varchar;
alter table yapa.pedidos add column if not exists gateway_status varchar not null default 'pending';

-- Busca rápida pelo id da transação no webhook da DLocal.
create index if not exists idx_pedidos_gateway_id on yapa.pedidos(gateway_id) where gateway_id is not null;
