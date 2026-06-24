-- 007_rename_produto_categorias.sql
-- Higieniza as categorias de produto antes do motor do WhatsApp.
--   voucher → conveniencia
--   outro   → combo
-- 'vape' permanece no enum (drop de valor é destrutivo no Postgres) mas fica
-- DESCONTINUADO na aplicação (removido do frontend e das validações Zod).
-- Aplicar no Supabase (SQL Editor).

alter type yapa.produto_categoria rename value 'voucher' to 'conveniencia';
alter type yapa.produto_categoria rename value 'outro'   to 'combo';

notify pgrst, 'reload schema';
