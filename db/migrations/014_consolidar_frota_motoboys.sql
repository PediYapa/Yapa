-- 014 — Consolidação da frota em motoboys: aposenta `entregadores` (legado Fase 1).
-- `motoboys` (telefone UNIQUE, amarração do webhook Z-API) é a fonte da verdade.
-- `entregas` passa a referenciar motoboys; o painel /despacho foi repointado.

-- 1) Contador de entregas concluídas migra para motoboys (paridade com o legado)
ALTER TABLE yapa.motoboys
  ADD COLUMN IF NOT EXISTS entregas_completadas int NOT NULL DEFAULT 0;

-- 2) entregas.entregador_id → motoboy_id (idempotente; dados de teste: zera o vínculo)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'yapa' AND table_name = 'entregas' AND column_name = 'entregador_id'
  ) THEN
    UPDATE yapa.entregas SET entregador_id = NULL;
    ALTER TABLE yapa.entregas DROP CONSTRAINT IF EXISTS entregas_entregador_id_fkey;
    ALTER TABLE yapa.entregas RENAME COLUMN entregador_id TO motoboy_id;
  END IF;
END $$;

ALTER TABLE yapa.entregas DROP CONSTRAINT IF EXISTS entregas_motoboy_id_fkey;
ALTER TABLE yapa.entregas
  ADD CONSTRAINT entregas_motoboy_id_fkey
  FOREIGN KEY (motoboy_id) REFERENCES yapa.motoboys(id) ON DELETE SET NULL;

-- 3) Scaffolding de Fase 2/3 (GPS) também referenciava entregadores → repointa
--    para motoboys (tabelas vazias; mantém a visão de central própria intacta).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='yapa' AND table_name='rotas' AND column_name='entregador_id') THEN
    ALTER TABLE yapa.rotas DROP CONSTRAINT IF EXISTS rotas_entregador_id_fkey;
    ALTER TABLE yapa.rotas RENAME COLUMN entregador_id TO motoboy_id;
    ALTER TABLE yapa.rotas ADD CONSTRAINT rotas_motoboy_id_fkey
      FOREIGN KEY (motoboy_id) REFERENCES yapa.motoboys(id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='yapa' AND table_name='gps_pings' AND column_name='entregador_id') THEN
    ALTER TABLE yapa.gps_pings DROP CONSTRAINT IF EXISTS gps_pings_entregador_id_fkey;
    ALTER TABLE yapa.gps_pings RENAME COLUMN entregador_id TO motoboy_id;
    ALTER TABLE yapa.gps_pings ADD CONSTRAINT gps_pings_motoboy_id_fkey
      FOREIGN KEY (motoboy_id) REFERENCES yapa.motoboys(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4) Aposenta a tabela legada (drop das políticas RLS vem junto com a tabela)
DROP TABLE IF EXISTS yapa.entregadores;

NOTIFY pgrst, 'reload schema';
