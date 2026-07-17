-- 017 — Integração Entregas Expressas (Open Delivery / ABRASEL)
-- Substitui o despacho por WhatsApp (grupo de motoboys): a partir de agora o
-- pedido pago é registrado via POST /v1/logistics/delivery e o ciclo de vida
-- da entrega passa a ser dirigido pelos webhooks da operadora, não mais pelo
-- claim manual "P <numero_corrida>" no grupo.
--
-- yapa.entregas já existia como abstração genérica de despacho
-- (entregador_id → grupo parceiro). Aqui ela ganha os campos pra representar
-- uma entrega operada por um provedor externo, sem quebrar o uso legado.

-- 1) Credenciais por org — mesmo padrão das colunas zapi_* em yapa.orgs.
--    Em sandbox, client_id/client_secret são fixos (estabelecimento de teste
--    provisionado automaticamente ao criar o app no painel deles). Em
--    produção, cada org gera o próprio par em Integrações > Open Delivery.
ALTER TABLE yapa.orgs
  ADD COLUMN IF NOT EXISTS entregas_expressas_client_id text,
  ADD COLUMN IF NOT EXISTS entregas_expressas_client_secret text,
  ADD COLUMN IF NOT EXISTS entregas_expressas_merchant_id text, -- UUID que ENVIAMOS a eles (não o deles)
  ADD COLUMN IF NOT EXISTS entregas_expressas_webhook_secret text, -- = client_secret, mas guardado explícito p/ validar HMAC mesmo se o secret rotacionar
  ADD COLUMN IF NOT EXISTS entregas_expressas_sandbox boolean NOT NULL DEFAULT true;

-- 2) Endereço estruturado da distribuidora — pickupAddress exige campos que
--    yapa.distribuidoras não tinha de forma discreta (bairro, CEP, cidade,
--    estado). endereco/latitude/longitude free-text continuam existindo para
--    exibição; os campos abaixo são o que vai no payload da API.
ALTER TABLE yapa.distribuidoras
  ADD COLUMN IF NOT EXISTS endereco_bairro text,
  ADD COLUMN IF NOT EXISTS endereco_rua text,
  ADD COLUMN IF NOT EXISTS endereco_numero text,
  ADD COLUMN IF NOT EXISTS endereco_cidade text,
  ADD COLUMN IF NOT EXISTS endereco_estado text,      -- ISO 3166-2, ex.: BR-SP
  ADD COLUMN IF NOT EXISTS endereco_cep text,
  ADD COLUMN IF NOT EXISTS endereco_pais text NOT NULL DEFAULT 'BR'; -- ISO 3166-1 alpha-2

-- 3) Enum bruto do evento da operadora — granularidade fina, sem forçar
--    yapa.pedido_status (que continua sendo o fluxo macro do board). Os
--    valores espelham 1:1 o `event.type` do webhook newLogisticEvent.
CREATE TYPE yapa.entrega_evento_externo AS ENUM (
  'PENDING', 'ACCEPTED', 'REJECTED',
  'PICKUP_ONGOING', 'ARRIVED_AT_MERCHANT', 'ORDER_PICKED',
  'DELIVERY_ONGOING', 'ARRIVED_AT_CUSTOMER', 'ORDER_DELIVERED',
  'RETURNING_TO_MERCHANT', 'RETURNED_TO_MERCHANT',
  'DELIVERY_FINISHED', 'CANCELLED'
);

-- 4) Campos de integração em yapa.entregas.
--    provedor NULL = despacho legado (grupo de motoboys via WhatsApp);
--    provedor 'entregas_expressas' = despachado pela operadora externa.
--    Mantemos os dois convivendo: pedidos antigos / eventual fallback manual
--    continuam usando entregador_id sem provedor_delivery_id.
ALTER TABLE yapa.entregas
  ADD COLUMN IF NOT EXISTS provedor text, -- null | 'entregas_expressas'
  ADD COLUMN IF NOT EXISTS provedor_delivery_id text,   -- deliveryId (UUID deles)
  ADD COLUMN IF NOT EXISTS provedor_order_id uuid,       -- orderId que NÓS geramos e enviamos
  ADD COLUMN IF NOT EXISTS evento_externo yapa.entrega_evento_externo,
  ADD COLUMN IF NOT EXISTS evento_externo_em timestamptz,
  ADD COLUMN IF NOT EXISTS rejeicao_motivo text,        -- rejectionInfo.reason quando REJECTED/CANCELLED
  ADD COLUMN IF NOT EXISTS entregador_nome text,         -- deliveryPerson.name (fora do nosso cadastro)
  ADD COLUMN IF NOT EXISTS entregador_telefone text,
  ADD COLUMN IF NOT EXISTS tracking_url text,            -- externalTrackingURL
  ADD COLUMN IF NOT EXISTS preco_gs numeric(14,2);        -- deliveryPrice.price.value cobrado pela operadora

CREATE UNIQUE INDEX IF NOT EXISTS idx_entregas_provedor_order_id
  ON yapa.entregas (provedor_order_id) WHERE provedor_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entregas_provedor_delivery_id
  ON yapa.entregas (provedor_delivery_id) WHERE provedor_delivery_id IS NOT NULL;

-- 5) Idempotência de webhook — a operadora faz retry com backoff se não
--    recebermos 204 em 10s; sem isso um evento reprocessado duplicaria efeito
--    colateral (ex.: reenviar mensagem "pedido entregue" pro cliente 2x).
CREATE TABLE IF NOT EXISTS yapa.entregas_expressas_webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES yapa.orgs(id) ON DELETE CASCADE,
  delivery_id text NOT NULL,
  event_type text NOT NULL,
  event_datetime timestamptz NOT NULL,
  payload jsonb NOT NULL,
  processado_em timestamptz NOT NULL DEFAULT now()
);
-- chave de dedupe: mesmo delivery_id + event_type + event_datetime = reentrega
CREATE UNIQUE INDEX IF NOT EXISTS idx_ee_webhook_dedupe
  ON yapa.entregas_expressas_webhook_log (delivery_id, event_type, event_datetime);

ALTER TABLE yapa.entregas_expressas_webhook_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ee_webhook_log_same_org" ON yapa.entregas_expressas_webhook_log;
CREATE POLICY "ee_webhook_log_same_org" ON yapa.entregas_expressas_webhook_log
  FOR ALL USING (org_id = yapa.current_org_id())
  WITH CHECK (org_id = yapa.current_org_id());

NOTIFY pgrst, 'reload schema';
