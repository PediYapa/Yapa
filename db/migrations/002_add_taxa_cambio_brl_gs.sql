-- ============================================================================
-- Migração 002 — taxa de câmbio BRL→GS configurável por org
-- Aplicar em: Supabase Dashboard → SQL Editor
-- ============================================================================
set search_path to yapa, public;

alter table yapa.orgs
  add column if not exists taxa_cambio_brl_gs numeric(14,4) not null default 1350.0000;
