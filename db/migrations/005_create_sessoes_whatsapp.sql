-- ============================================================================
-- Migração 005 — sessões do bot WhatsApp (estado do fluxo + carrinho)
-- Aplicar em: Supabase Dashboard → SQL Editor
-- ============================================================================
set search_path to yapa, public;

create table if not exists yapa.sessoes_whatsapp (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references yapa.orgs on delete cascade,
  telefone    text not null,
  no_atual_id text,                                   -- nó do fluxo onde o cliente parou
  carrinho    jsonb not null default '[]'::jsonb,     -- [{ produto_id, quantidade, preco }]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, telefone)
);
create index if not exists idx_sessoes_wpp_telefone on yapa.sessoes_whatsapp(org_id, telefone);

-- RLS: isolamento por org (gravação real é via service-role no webhook, que bypassa).
alter table yapa.sessoes_whatsapp enable row level security;
drop policy if exists "sessoes_whatsapp_all_same_org" on yapa.sessoes_whatsapp;
create policy "sessoes_whatsapp_all_same_org" on yapa.sessoes_whatsapp
  for all using (org_id = yapa.current_org_id())
  with check (org_id = yapa.current_org_id());

grant all on yapa.sessoes_whatsapp to anon, authenticated, service_role;

-- updated_at automático
drop trigger if exists trg_touch_sessoes_whatsapp on yapa.sessoes_whatsapp;
create trigger trg_touch_sessoes_whatsapp before update on yapa.sessoes_whatsapp
  for each row execute function yapa.touch_updated_at();
