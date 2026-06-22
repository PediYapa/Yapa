-- ============================================================================
-- Migração 004 — tabela pública de contatos (formulário da landing page)
-- Aplicar em: Supabase Dashboard → SQL Editor
-- ============================================================================
set search_path to yapa, public;

create table if not exists yapa.contatos (
  id       uuid primary key default gen_random_uuid(),
  nome     varchar(120) not null,
  email    varchar(200) not null,
  mensagem text not null,
  created_at timestamptz not null default now()
);

alter table yapa.contatos enable row level security;

-- Visitantes anônimos podem inserir (formulário público); leitura bloqueada pela UI.
create policy "contatos_insert_anon" on yapa.contatos
  for insert with check (true);
