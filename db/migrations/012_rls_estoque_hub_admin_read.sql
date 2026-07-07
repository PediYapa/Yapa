-- 012 — RLS estoque_hub: owners/gerentes acessam qualquer hub da org (modo supervisão).
-- Aplicada em produção via MCP em 2026-07; arquivo materializado a posteriori
-- (conteúdo confere com pg_policies). Convive com a política estoque_hub_rw da 011
-- (políticas permissivas somam por OR).
DROP POLICY IF EXISTS "estoque_hub_all_same_org" ON yapa.estoque_hub;
CREATE POLICY estoque_hub_all_same_org ON yapa.estoque_hub
  FOR ALL
  USING (
    org_id = yapa.current_org_id()
    AND (
      yapa.current_distribuidora_id() IS NOT NULL
        AND distribuidora_id = yapa.current_distribuidora_id()
      OR
      EXISTS (
        SELECT 1 FROM yapa.user_profiles
        WHERE id = auth.uid()
          AND role IN ('owner', 'gerente')
          AND deactivated_at IS NULL
      )
    )
  );

NOTIFY pgrst, 'reload schema';
