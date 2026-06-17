-- ============================================================================
-- Yapa — RLS (Row Level Security). Isolamento por org_id.
-- A API pública (/api/v1) usa service-role (bypassa RLS) e restringe org_id em
-- código, via o token. A UI usa a sessão do usuário e é gateada por estas
-- políticas + checagem de module_permissions na camada de Server Actions.
-- ============================================================================
set search_path to yapa, public;

-- Helper: org_id do usuário autenticado
create or replace function yapa.current_org_id() returns uuid
language sql security definer set search_path = yapa, public stable as $$
  select org_id from yapa.user_profiles where id = auth.uid()
$$;

-- Helper: usuário é owner ou gerente?
create or replace function yapa.is_manager() returns boolean
language sql security definer set search_path = yapa, public stable as $$
  select coalesce(
    (select role in ('owner','gerente') from yapa.user_profiles where id = auth.uid()),
    false
  )
$$;

-- Habilita RLS -----------------------------------------------------------------
alter table yapa.orgs            enable row level security;
alter table yapa.user_profiles   enable row level security;
alter table yapa.clientes        enable row level security;
alter table yapa.distribuidoras  enable row level security;
alter table yapa.produtos        enable row level security;
alter table yapa.entregadores    enable row level security;
alter table yapa.pedidos         enable row level security;
alter table yapa.pedido_itens    enable row level security;
alter table yapa.entregas        enable row level security;
alter table yapa.pagamentos      enable row level security;
alter table yapa.conversas       enable row level security;
alter table yapa.api_tokens      enable row level security;
alter table yapa.hubs            enable row level security;
alter table yapa.rotas           enable row level security;
alter table yapa.gps_pings       enable row level security;

-- orgs: vê só a própria
drop policy if exists "orgs_select_own" on yapa.orgs;
create policy "orgs_select_own" on yapa.orgs
  for select using (id = yapa.current_org_id());

-- user_profiles
drop policy if exists "profiles_select_same_org" on yapa.user_profiles;
create policy "profiles_select_same_org" on yapa.user_profiles
  for select using (org_id = yapa.current_org_id());
drop policy if exists "profiles_update_self" on yapa.user_profiles;
create policy "profiles_update_self" on yapa.user_profiles
  for update using (id = auth.uid());
drop policy if exists "profiles_manage_org" on yapa.user_profiles;
create policy "profiles_manage_org" on yapa.user_profiles
  for all using (org_id = yapa.current_org_id() and yapa.is_manager())
  with check (org_id = yapa.current_org_id() and yapa.is_manager());

-- Macro "tudo na mesma org" para tabelas de domínio
-- (o controle fino por módulo é feito nos Server Actions)
do $$
declare t text;
begin
  foreach t in array array[
    'clientes','distribuidoras','produtos','entregadores','pedidos',
    'pedido_itens','entregas','pagamentos','conversas','hubs','rotas','gps_pings'
  ] loop
    execute format('drop policy if exists "%1$s_all_same_org" on yapa.%1$s;', t);
    execute format(
      'create policy "%1$s_all_same_org" on yapa.%1$s
         for all using (org_id = yapa.current_org_id())
         with check (org_id = yapa.current_org_id());', t);
  end loop;
end $$;

-- api_tokens: leitura na org; escrita só owner/gerente
drop policy if exists "api_tokens_select_same_org" on yapa.api_tokens;
create policy "api_tokens_select_same_org" on yapa.api_tokens
  for select using (org_id = yapa.current_org_id());
drop policy if exists "api_tokens_manage_manager" on yapa.api_tokens;
create policy "api_tokens_manage_manager" on yapa.api_tokens
  for all using (org_id = yapa.current_org_id() and yapa.is_manager())
  with check (org_id = yapa.current_org_id() and yapa.is_manager());
