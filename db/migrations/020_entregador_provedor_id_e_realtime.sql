-- 020 — colunas de identidade do entregador da operadora + Realtime em entregas.
--
-- entregador_provedor_id: id ESTÁVEL do deliveryPerson na Entregas Expressas —
-- é a chave de agrupamento da tela /motoboys (nome/telefone podem repetir/faltar).
-- entregador_foto_url: pictureURL do deliveryPerson (avatar na tela /motoboys).

ALTER TABLE yapa.entregas
  ADD COLUMN IF NOT EXISTS entregador_provedor_id text,
  ADD COLUMN IF NOT EXISTS entregador_foto_url text;

CREATE INDEX IF NOT EXISTS idx_entregas_entregador_provedor_id
  ON yapa.entregas (entregador_provedor_id)
  WHERE entregador_provedor_id IS NOT NULL;

-- Habilita Supabase Realtime (postgres_changes) na tabela entregas —
-- necessário pro status em tempo real na tela de Pedidos.
-- Idempotente: só adiciona se ainda não estiver na publicação.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'yapa'
      AND tablename = 'entregas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE yapa.entregas;
  END IF;
END $$;
