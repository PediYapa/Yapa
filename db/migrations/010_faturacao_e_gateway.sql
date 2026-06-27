-- 010 — V3.0: faturação legal (RUC) + restauração do rastreamento de gateway dLocal
-- gateway_id/gateway_status haviam sido perdidos numa limpeza de SQL; o webhook
-- dLocal grava nesses campos, então restauramos junto.

ALTER TABLE yapa.pedidos
  ADD COLUMN IF NOT EXISTS gateway_id      text,
  ADD COLUMN IF NOT EXISTS gateway_status  text,
  ADD COLUMN IF NOT EXISTS precisa_fatura  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS documento_ruc   text;

ALTER TABLE yapa.clientes
  ADD COLUMN IF NOT EXISTS documento_ruc   text;

-- Acelera a tela de Fechamento de Faturas (filtro precisa_fatura = true)
CREATE INDEX IF NOT EXISTS idx_pedidos_precisa_fatura
  ON yapa.pedidos (org_id, created_at DESC) WHERE precisa_fatura = true;

NOTIFY pgrst, 'reload schema';
