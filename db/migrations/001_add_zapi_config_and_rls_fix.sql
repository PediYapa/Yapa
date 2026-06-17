-- ============================================================================
-- Migração 001 — adiciona campos Z-API à tabela orgs + corrige RLS
-- Aplicar em: Supabase Dashboard → SQL Editor
-- ============================================================================
set search_path to yapa, public;

-- Campos Z-API na org
alter table yapa.orgs add column if not exists zapi_instance       text;
alter table yapa.orgs add column if not exists zapi_token          text;
alter table yapa.orgs add column if not exists zapi_client_token   text;
alter table yapa.orgs add column if not exists zapi_webhook_secret text;

-- RLS: política de UPDATE que estava faltando para orgs
drop policy if exists "orgs_update_manager" on yapa.orgs;
create policy "orgs_update_manager" on yapa.orgs
  for update using (id = yapa.current_org_id() and yapa.is_manager())
  with check  (id = yapa.current_org_id() and yapa.is_manager());
