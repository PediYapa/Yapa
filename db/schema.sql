-- ============================================================================
-- Yapa — schema inicial (gestão do delivery de bebidas — Ciudad del Este/PY)
-- Postgres / Supabase. Single-tenant agora (1 operação) via org_id, multi-ready.
-- RLS em db/rls.sql. Convenção: snake_case, soft-delete (deleted_at).
-- Schema dedicado: tudo vive em "yapa" (os clients Supabase usam db.schema="yapa").
-- ============================================================================

create extension if not exists "pgcrypto";

create schema if not exists yapa;
set search_path to yapa, public;

-- ---------------------------------------------------------------------------
-- Organização (a operação Yapa). Single-tenant agora; org_id propaga p/ tudo.
-- ---------------------------------------------------------------------------
create table if not exists yapa.orgs (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cidade text default 'Ciudad del Este',
  pais text default 'PY',
  -- Credenciais Z-API (WhatsApp). Podem ser sobrescritas por variáveis de ambiente.
  zapi_instance text,
  zapi_token text,
  zapi_client_token text,
  zapi_webhook_secret text,
  taxa_cambio_brl_gs  numeric(14,4) not null default 1350.0000,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Usuários (perfis ligados a auth.users) + RBAC
-- ---------------------------------------------------------------------------
create type yapa.user_role as enum ('owner', 'gerente', 'operador');

create table if not exists yapa.user_profiles (
  id uuid primary key references auth.users on delete cascade,
  org_id uuid not null references yapa.orgs on delete cascade,
  nome text not null,
  role yapa.user_role not null default 'operador',
  -- permissões por módulo: { "pedidos": ["read","write"], "financeiro": ["read"], ... }
  module_permissions jsonb not null default '{}'::jsonb,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Clientes (consumidores que pedem pelo WhatsApp)
-- ---------------------------------------------------------------------------
create table if not exists yapa.clientes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references yapa.orgs on delete cascade,
  nome text,
  telefone text not null,                 -- chave WhatsApp (E.164, +595...)
  zona text,                              -- bairro/zona de Ciudad del Este
  endereco text,
  referencia text,                        -- ponto de referência p/ entrega
  latitude numeric(10,7),
  longitude numeric(10,7),
  -- métricas cacheadas (recalculadas a partir de pedidos)
  total_pedidos int not null default 0,
  ticket_medio_gs numeric(14,2),
  ultima_compra date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists uq_clientes_org_tel on yapa.clientes(org_id, telefone) where deleted_at is null;
create index if not exists idx_clientes_org on yapa.clientes(org_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Distribuidoras (fornecedores B2B; roteamento por geolocalização + raio)
-- ---------------------------------------------------------------------------
create table if not exists yapa.distribuidoras (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references yapa.orgs on delete cascade,
  nome text not null,
  contato text,
  telefone text,                          -- grupo/numero p/ acionar o pedido
  endereco text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  raio_km numeric(6,2) not null default 5,  -- raio de atuação a partir do ponto
  link_maps text,
  recebe_dinheiro boolean not null default true,  -- aceita pedido pago em dinheiro
  saldo_d1_gs numeric(14,2) not null default 0,   -- dinheiro recebido a abater no D+1
  ativo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_distribuidoras_org on yapa.distribuidoras(org_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Produtos / catálogo (bebidas, pods, vape, vouchers)
-- ---------------------------------------------------------------------------
create type yapa.produto_categoria as enum ('cerveja', 'destilado', 'pod', 'vape', 'voucher', 'outro');

create table if not exists yapa.produtos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references yapa.orgs on delete cascade,
  nome text not null,
  categoria yapa.produto_categoria not null default 'cerveja',
  preco_gs numeric(14,2) not null default 0,
  distribuidora_id uuid references yapa.distribuidoras on delete set null, -- null = catálogo global
  disponivel boolean not null default true,
  descricao text,
  imagem_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_produtos_org on yapa.produtos(org_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Entregadores (Fase 1: grupos parceiros de motoboys; Fase 2: GPS próprio)
-- ---------------------------------------------------------------------------
create table if not exists yapa.entregadores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references yapa.orgs on delete cascade,
  nome text not null,
  telefone text,
  grupo_parceiro text,                    -- grupo de WhatsApp/central parceira
  distribuidora_base_id uuid references yapa.distribuidoras on delete set null,
  ativo boolean not null default true,
  entregas_completadas int not null default 0,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_entregadores_org on yapa.entregadores(org_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Pedidos (núcleo da operação)
-- ---------------------------------------------------------------------------
create type yapa.pedido_status as enum (
  'recebido', 'aguardando_pagamento', 'pago', 'roteado', 'em_separacao',
  'despachado', 'em_entrega', 'entregue', 'cancelado', 'estornado', 'quebra'
);
create type yapa.moeda as enum ('GS', 'PIX', 'BRL');
create type yapa.forma_pagamento as enum ('dlocal', 'pix', 'dinheiro');

-- sequência de número amigável por org (exibição: #1042)
create sequence if not exists yapa.pedido_numero_seq;

create table if not exists yapa.pedidos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references yapa.orgs on delete cascade,
  numero bigint not null default nextval('yapa.pedido_numero_seq'),
  cliente_id uuid references yapa.clientes on delete set null,
  distribuidora_id uuid references yapa.distribuidoras on delete set null,
  status yapa.pedido_status not null default 'recebido',
  canal text not null default 'whatsapp',
  moeda yapa.moeda not null default 'GS',
  forma_pagamento yapa.forma_pagamento,
  gateway_id varchar,                                -- id da transação no gateway (DLocal)
  gateway_status varchar not null default 'pending', -- status da cobrança no gateway
  valor_total_gs numeric(14,2) not null default 0,  -- sempre normalizado em Guarani
  valor_origem numeric(14,2),                        -- valor na moeda de pagamento (ex.: BRL no Pix)
  codigo_validacao text,                             -- código de entrega informado ao cliente
  endereco_entrega text,
  referencia text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_pedidos_org_status on yapa.pedidos(org_id, status) where deleted_at is null;
create index if not exists idx_pedidos_cliente on yapa.pedidos(cliente_id) where deleted_at is null;
create index if not exists idx_pedidos_gateway_id on yapa.pedidos(gateway_id) where gateway_id is not null;

create table if not exists yapa.pedido_itens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references yapa.orgs on delete cascade,
  pedido_id uuid not null references yapa.pedidos on delete cascade,
  produto_id uuid references yapa.produtos on delete set null,
  descricao text not null,                -- snapshot do nome (resiliente a edição de catálogo)
  quantidade numeric(10,2) not null default 1,
  preco_unit_gs numeric(14,2) not null default 0,
  subtotal_gs numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_pedido_itens_pedido on yapa.pedido_itens(pedido_id);

-- ---------------------------------------------------------------------------
-- Entregas (despacho ao entregador/grupo parceiro)
-- ---------------------------------------------------------------------------
create type yapa.entrega_status as enum ('aguardando', 'coletado', 'em_entrega', 'entregue', 'cancelada');

create table if not exists yapa.entregas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references yapa.orgs on delete cascade,
  pedido_id uuid not null references yapa.pedidos on delete cascade,
  entregador_id uuid references yapa.entregadores on delete set null,
  status yapa.entrega_status not null default 'aguardando',
  horario_despacho timestamptz,
  horario_coleta timestamptz,
  horario_entrega_prevista timestamptz,
  horario_entrega_realizado timestamptz,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_entregas_org_status on yapa.entregas(org_id, status);
create index if not exists idx_entregas_pedido on yapa.entregas(pedido_id);

-- ---------------------------------------------------------------------------
-- Pagamentos (DLocal multi-moeda + controle do dinheiro D+1 por distribuidora)
-- ---------------------------------------------------------------------------
create type yapa.pagamento_status as enum ('pendente', 'pago', 'estornado', 'falha');

create table if not exists yapa.pagamentos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references yapa.orgs on delete cascade,
  pedido_id uuid not null references yapa.pedidos on delete cascade,
  provedor yapa.forma_pagamento not null,
  moeda yapa.moeda not null default 'GS',
  valor numeric(14,2) not null default 0,         -- valor na moeda do pagamento
  valor_gs numeric(14,2) not null default 0,      -- convertido p/ Guarani (obrigatório)
  status yapa.pagamento_status not null default 'pendente',
  -- quando forma=dinheiro: qual distribuidora recebeu (p/ abatimento no D+1)
  recebido_por_distribuidora_id uuid references yapa.distribuidoras on delete set null,
  abatido_em date,
  referencia_externa text,                        -- id da transação DLocal
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pagamentos_org on yapa.pagamentos(org_id);
create index if not exists idx_pagamentos_pedido on yapa.pagamentos(pedido_id);

-- ---------------------------------------------------------------------------
-- Conversas (fluxo de atendimento WhatsApp + monitoramento do bot + handoff)
-- ---------------------------------------------------------------------------
create type yapa.conversa_status as enum ('aberta', 'pendente', 'resolvida', 'arquivada');

create table if not exists yapa.conversas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references yapa.orgs on delete cascade,
  cliente_id uuid references yapa.clientes on delete set null,
  telefone text not null,
  canal text not null default 'whatsapp',
  status yapa.conversa_status not null default 'aberta',
  handoff_humano boolean not null default false,  -- true = humano assumiu do bot
  -- log: [{ "de":"cliente|bot|humano", "texto":"...", "tipo":"texto", "em":"ISO" }]
  mensagens jsonb not null default '[]'::jsonb,
  ultima_mensagem_em timestamptz,
  pedido_id uuid references yapa.pedidos on delete set null,
  -- posição do cliente no fluxo do bot: { fluxo_id, no_atual, atualizado_em }
  fluxo_estado jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_conversas_org_status on yapa.conversas(org_id, status);
create index if not exists idx_conversas_telefone on yapa.conversas(org_id, telefone);

-- ---------------------------------------------------------------------------
-- Sessões do bot WhatsApp (posição no fluxo + carrinho do cliente)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Fluxos (construtor visual do bot — nós/arestas do React Flow em jsonb)
-- ---------------------------------------------------------------------------
create table if not exists yapa.fluxos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references yapa.orgs on delete cascade,
  nome text not null,
  ativo boolean not null default false,           -- só um ativo por org (índice abaixo)
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_fluxos_org on yapa.fluxos(org_id) where deleted_at is null;
create unique index if not exists uq_fluxos_um_ativo on yapa.fluxos(org_id) where ativo and deleted_at is null;

-- ---------------------------------------------------------------------------
-- API tokens (superfície pública /api/v1 — consumida por Make/Z-API)
-- ---------------------------------------------------------------------------
create table if not exists yapa.api_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references yapa.orgs on delete cascade,
  nome text not null,
  token_hash text not null unique,
  prefixo text not null,
  scopes text not null default '',                -- csv: pedidos:read,pedidos:write,...
  expires_at timestamptz,
  ultimo_uso timestamptz,
  revogado_em timestamptz,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_api_tokens_org on yapa.api_tokens(org_id);

-- ============================================================================
-- FASE 2/3 — esqueleto (central própria, GPS ponto-a-ponto, hubs). Sem UI ainda.
-- ============================================================================
create table if not exists yapa.hubs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references yapa.orgs on delete cascade,
  nome text not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists yapa.rotas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references yapa.orgs on delete cascade,
  entregador_id uuid references yapa.entregadores on delete set null,
  pedidos uuid[] not null default '{}',
  status text not null default 'planejada',
  created_at timestamptz not null default now()
);

create table if not exists yapa.gps_pings (
  id bigserial primary key,
  org_id uuid not null references yapa.orgs on delete cascade,
  entregador_id uuid references yapa.entregadores on delete cascade,
  latitude numeric(10,7),
  longitude numeric(10,7),
  registrado_em timestamptz not null default now()
);

-- Grants — sem isso os roles anon/authenticated não acessam o schema via PostgREST
grant usage on schema yapa to anon, authenticated, service_role;
grant all on all tables    in schema yapa to anon, authenticated, service_role;
-- ---------------------------------------------------------------------------
-- Contatos (formulário público da landing page)
-- ---------------------------------------------------------------------------
create table if not exists yapa.contatos (
  id       uuid primary key default gen_random_uuid(),
  nome     varchar(120) not null,
  email    varchar(200) not null,
  mensagem text not null,
  created_at timestamptz not null default now()
);
alter table yapa.contatos enable row level security;
create policy "contatos_insert_anon" on yapa.contatos for insert with check (true);

-- ---------------------------------------------------------------------------
grant all on all sequences in schema yapa to anon, authenticated, service_role;
grant execute on all functions in schema yapa to anon, authenticated, service_role;

-- updated_at automático
create or replace function yapa.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array[
    'user_profiles','clientes','distribuidoras','produtos','entregadores',
    'pedidos','entregas','pagamentos','conversas','fluxos','sessoes_whatsapp'
  ] loop
    execute format(
      'drop trigger if exists trg_touch_%1$s on yapa.%1$s;
       create trigger trg_touch_%1$s before update on yapa.%1$s
       for each row execute function yapa.touch_updated_at();', t);
  end loop;
end $$;
