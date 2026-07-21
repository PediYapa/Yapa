-- 019 — adiciona yapa.orgs.taxa_cambio_brl_gs (efeito da migration 002, que
-- nunca foi aplicada no projeto novo ahhrhyuduhwkuegocjbb — drift descoberto na
-- reauditoria da integração Entregas Expressas).
--
-- Sem essa coluna: (1) o select principal de lib/despacho.ts quebrava e derrubava
-- todo o despacho; (2) a UI de câmbio em /configuracoes (actions/configuracoes.ts
-- salvarCambio) falhava mudo no update. schema.sql e database.types.ts já a
-- declaravam — aqui alinhamos o banco vivo à fonte de verdade.
--
-- DEFAULT 1150.0000 = taxa inicial real do Yapa (GS por 1 BRL). O NOT NULL DEFAULT
-- faz o Postgres backfillar as orgs existentes com esse valor retroativamente.
ALTER TABLE yapa.orgs
  ADD COLUMN IF NOT EXISTS taxa_cambio_brl_gs numeric(14,4) NOT NULL DEFAULT 1150.0000;

NOTIFY pgrst, 'reload schema';
