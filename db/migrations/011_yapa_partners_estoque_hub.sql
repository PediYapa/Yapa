-- 011 — Yapa Partners: portal de hubs (estoque N:M) + papel 'hub'
-- Reusa produtos (catálogo mestre) e distribuidoras (hubs); adiciona só o pivô.

-- 1) Papel de parceiro (hub) e vínculo do perfil à distribuidora
ALTER TYPE yapa.user_role ADD VALUE IF NOT EXISTS 'hub';

ALTER TABLE yapa.user_profiles
  ADD COLUMN IF NOT EXISTS distribuidora_id uuid REFERENCES yapa.distribuidoras(id);

-- 2) Tipo do hub (gelado/quente/posto24h...) — texto flexível
ALTER TABLE yapa.distribuidoras
  ADD COLUMN IF NOT EXISTS tipo text;

-- 3) Tabela pivô N:M: estoque físico por hub (SEM preço — só volume)
CREATE TABLE IF NOT EXISTS yapa.estoque_hub (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES yapa.orgs(id),
  distribuidora_id uuid NOT NULL REFERENCES yapa.distribuidoras(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES yapa.produtos(id) ON DELETE CASCADE,
  quantidade integer NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  disponivel boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (distribuidora_id, produto_id)
);
CREATE INDEX IF NOT EXISTS idx_estoque_hub_dist ON yapa.estoque_hub (distribuidora_id);

-- 4) Helper RLS: distribuidora do usuário logado
CREATE OR REPLACE FUNCTION yapa.current_distribuidora_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = yapa, public AS $$
  SELECT distribuidora_id FROM yapa.user_profiles WHERE id = auth.uid()
$$;

-- 5) RLS: admin (owner/gerente) vê tudo da org; hub só a própria distribuidora
ALTER TABLE yapa.estoque_hub ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "estoque_hub_rw" ON yapa.estoque_hub;
CREATE POLICY "estoque_hub_rw" ON yapa.estoque_hub
  FOR ALL
  USING (org_id = yapa.current_org_id()
         AND (yapa.is_manager() OR distribuidora_id = yapa.current_distribuidora_id()))
  WITH CHECK (org_id = yapa.current_org_id()
         AND (yapa.is_manager() OR distribuidora_id = yapa.current_distribuidora_id()));

NOTIFY pgrst, 'reload schema';
