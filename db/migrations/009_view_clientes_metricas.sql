-- 009_view_clientes_metricas.sql
-- CRM: métricas vivas por cliente. security_invoker respeita o RLS das tabelas base.
-- Aplicado em produção via MCP.

create or replace view yapa.clientes_metricas
with (security_invoker = true) as
select
  c.id        as cliente_id,
  c.org_id    as org_id,
  c.nome      as nome,
  c.telefone  as telefone,
  count(p.id)::int as total_pedidos,
  coalesce(round(avg(p.valor_total_gs)), 0)::numeric as ticket_medio,
  max(p.created_at)::date as ultima_compra
from yapa.clientes c
left join yapa.pedidos p
  on p.cliente_id = c.id and p.deleted_at is null
where c.deleted_at is null
group by c.id, c.org_id, c.nome, c.telefone;

comment on view yapa.clientes_metricas is 'CRM: contagem de pedidos, ticket medio e ultima compra por cliente. RLS via security_invoker.';
