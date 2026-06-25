-- 008_geo_match_distribuidora.sql
-- Geo-routing: distribuidora mais próxima que cobre o ponto do cliente.
-- Reutiliza a coluna existente raio_km (km). Aplicado em produção via MCP.

create extension if not exists cube with schema extensions;
create extension if not exists earthdistance with schema extensions;

create or replace function yapa.match_distribuidora(user_lat float8, user_lng float8)
returns uuid
language sql
stable
security definer
set search_path = extensions, public, yapa
as $$
  select d.id
  from yapa.distribuidoras d
  where d.ativo = true
    and d.deleted_at is null
    and d.latitude is not null
    and d.longitude is not null
    and earth_distance(
          ll_to_earth(user_lat, user_lng),
          ll_to_earth(d.latitude::float8, d.longitude::float8)
        ) <= (d.raio_km::float8 * 1000)
  order by earth_distance(
          ll_to_earth(user_lat, user_lng),
          ll_to_earth(d.latitude::float8, d.longitude::float8)
        ) asc
  limit 1
$$;

comment on function yapa.match_distribuidora is 'Retorna o id da distribuidora ativa mais próxima cujo raio_km cobre o ponto (lat,lng). NULL se nenhuma cobre.';
