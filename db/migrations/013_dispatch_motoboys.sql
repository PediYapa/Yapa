-- 013 — Dispatch de motoboys via grupos de WhatsApp
-- Cada distribuidora tem um grupo de motoboys na Z-API. Na confirmação do pedido,
-- o sistema notifica distribuidora + grupo; o 1º motoboy que responder "P <n>"
-- reivindica a corrida (claim atômico por UPDATE condicional).

-- 1) Vínculo do grupo de motoboys com a distribuidora
ALTER TABLE yapa.distribuidoras
  ADD COLUMN IF NOT EXISTS grupo_motoboys_id text; -- phone/ID do grupo na Z-API

-- 2) Cadastro de motoboys (sem login — interagem só via WhatsApp; gerido no painel)
CREATE TABLE IF NOT EXISTS yapa.motoboys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES yapa.orgs(id) ON DELETE CASCADE,
  distribuidora_id uuid NOT NULL REFERENCES yapa.distribuidoras(id),
  nome text NOT NULL,
  telefone text NOT NULL UNIQUE, -- formato Z-API (ex.: 5959XXXXXXXX)
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_motoboys_dist ON yapa.motoboys (distribuidora_id);

-- 3) Campos de entrega no pedido (frete separado do valor dos produtos)
ALTER TABLE yapa.pedidos
  ADD COLUMN IF NOT EXISTS taxa_entrega_gs numeric(14,2),
  ADD COLUMN IF NOT EXISTS distancia_km numeric(6,2),
  ADD COLUMN IF NOT EXISTS motoboy_id uuid REFERENCES yapa.motoboys(id),
  ADD COLUMN IF NOT EXISTS status_entrega text DEFAULT 'aguardando_motoboy',
  -- valores: aguardando_motoboy | atribuido | em_rota | entregue
  ADD COLUMN IF NOT EXISTS numero_corrida serial;
  -- número curto e sequencial para o motoboy digitar "P 482" (nunca expor o UUID)

CREATE INDEX IF NOT EXISTS idx_pedidos_numero_corrida ON yapa.pedidos (numero_corrida);

-- Pedidos criados ANTES do dispatch não participam do claim: o DEFAULT acima
-- backfilla 'aguardando_motoboy' em todo o histórico, o que deixaria pedidos
-- antigos reivindicáveis por "P <n>" chutado. NULL = fora do dispatch.
-- (guard motoboy_id: re-execução nunca anula corrida já reivindicada)
UPDATE yapa.pedidos SET status_entrega = NULL WHERE motoboy_id IS NULL;

-- 4) RLS: mesma política macro por org_id das demais tabelas do schema
ALTER TABLE yapa.motoboys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "motoboys_all_same_org" ON yapa.motoboys;
CREATE POLICY "motoboys_all_same_org" ON yapa.motoboys
  FOR ALL USING (org_id = yapa.current_org_id())
  WITH CHECK (org_id = yapa.current_org_id());

NOTIFY pgrst, 'reload schema';
