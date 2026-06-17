-- ============================================================================
-- Yapa — seed de demonstração (Ciudad del Este). Aplicar APÓS schema.sql + rls.sql.
-- Cria 1 org, distribuidoras com geolocalização/raio, catálogo, clientes,
-- entregadores, pedidos em vários status (com itens), pagamentos e conversas.
-- Datas relativas a now() para o dashboard mostrar movimento "de hoje".
--
-- IMPORTANTE: o usuário owner é criado via Supabase Auth (painel/CLI). Depois,
-- vincule o perfil:  insert into yapa.user_profiles (id, org_id, nome, role)
--   values ('<auth_user_uuid>', '00000000-0000-0000-0000-0000000000a1', 'Thales', 'owner');
-- ============================================================================
set search_path to yapa, public;

-- Org fixa para referência no seed
insert into yapa.orgs (id, nome, cidade, pais)
values ('00000000-0000-0000-0000-0000000000a1', 'Yapa', 'Ciudad del Este', 'PY')
on conflict (id) do nothing;

-- Distribuidoras (coordenadas aproximadas em Ciudad del Este)
insert into yapa.distribuidoras (id, org_id, nome, contato, telefone, endereco, latitude, longitude, raio_km, link_maps, recebe_dinheiro, ativo) values
 ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1','Distribuidora Centro','Marcos','595994111222','Av. Monseñor Rodríguez, Centro', -25.5097, -54.6111, 4, 'https://maps.google.com/?q=-25.5097,-54.6111', true, true),
 ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000a1','Distribuidora Km 4','Lucía','595994333444','Ruta 7, Km 4', -25.4790, -54.6450, 5, 'https://maps.google.com/?q=-25.4790,-54.6450', true, true),
 ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000a1','Distribuidora Área 1','Pedro','595994555666','Área 1, Microcentro', -25.5160, -54.6020, 3, 'https://maps.google.com/?q=-25.5160,-54.6020', false, true)
on conflict (id) do nothing;

-- Catálogo
insert into yapa.produtos (id, org_id, nome, categoria, preco_gs, disponivel) values
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','Heineken 600ml','cerveja', 18000, true),
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a1','Brahma lata 473ml','cerveja', 9000, true),
 ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000a1','Corona 355ml','cerveja', 15000, true),
 ('00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000a1','Pod descartável 5000puffs','pod', 90000, true),
 ('00000000-0000-0000-0000-0000000000c5','00000000-0000-0000-0000-0000000000a1','Voucher Apostas LA ₲50.000','voucher', 50000, true),
 ('00000000-0000-0000-0000-0000000000c6','00000000-0000-0000-0000-0000000000a1','Fernet 750ml','destilado', 75000, true)
on conflict (id) do nothing;

-- Entregadores
insert into yapa.entregadores (id, org_id, nome, telefone, grupo_parceiro, distribuidora_base_id, ativo, entregas_completadas) values
 ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1','Grupo Motoboys Centro','595994777888','Grupo WhatsApp Centro','00000000-0000-0000-0000-0000000000d1', true, 42),
 ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000a1','Diego (Km 4)','595994999000','Grupo WhatsApp Km4','00000000-0000-0000-0000-0000000000d2', true, 17)
on conflict (id) do nothing;

-- Clientes (coordenadas dentro do raio de alguma distribuidora)
insert into yapa.clientes (id, org_id, nome, telefone, zona, endereco, latitude, longitude, total_pedidos, ticket_medio_gs, ultima_compra) values
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','João Silva','595991000001','Centro','Edif. Torre, apto 1101', -25.5100, -54.6100, 6, 54000, now()::date),
 ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a1','Maria López','595991000002','Km 4','Barrio San Blas', -25.4800, -54.6440, 3, 36000, (now() - interval '1 day')::date),
 ('00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000a1','Carlos Benítez','595991000003','Microcentro','Área 1, casa 5', -25.5150, -54.6030, 1, 90000, (now() - interval '3 day')::date)
on conflict (id) do nothing;

-- Pedidos em vários status
insert into yapa.pedidos (id, org_id, cliente_id, distribuidora_id, status, moeda, forma_pagamento, valor_total_gs, endereco_entrega, latitude, longitude, codigo_validacao, created_at) values
 ('00000000-0000-0000-0000-0000000f0001','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d1','entregue','GS','dlocal', 54000,'Edif. Torre, apto 1101', -25.5100, -54.6100, '4821', now() - interval '2 hour'),
 ('00000000-0000-0000-0000-0000000f0002','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000d2','em_entrega','GS','dinheiro', 27000,'Barrio San Blas', -25.4800, -54.6440, '1190', now() - interval '40 minute'),
 ('00000000-0000-0000-0000-0000000f0003','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d1','pago','PIX','dlocal', 36000,'Edif. Torre, apto 1101', -25.5100, -54.6100, null, now() - interval '20 minute'),
 ('00000000-0000-0000-0000-0000000f0004','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b3',null,'recebido','GS',null, 90000,'Área 1, casa 5', -25.5150, -54.6030, null, now() - interval '8 minute'),
 ('00000000-0000-0000-0000-0000000f0005','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2',null,'aguardando_pagamento','GS',null, 18000,'Barrio San Blas', -25.4800, -54.6440, null, now() - interval '3 minute')
on conflict (id) do nothing;

insert into yapa.pedido_itens (org_id, pedido_id, produto_id, descricao, quantidade, preco_unit_gs, subtotal_gs) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000f0001','00000000-0000-0000-0000-0000000000c1','Heineken 600ml', 3, 18000, 54000),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000f0002','00000000-0000-0000-0000-0000000000c2','Brahma lata 473ml', 3, 9000, 27000),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000f0003','00000000-0000-0000-0000-0000000000c3','Corona 355ml', 2, 15000, 30000),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000f0003','00000000-0000-0000-0000-0000000000c2','Brahma lata 473ml', 1, 6000, 6000),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000f0004','00000000-0000-0000-0000-0000000000c4','Pod descartável 5000puffs', 1, 90000, 90000),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000f0005','00000000-0000-0000-0000-0000000000c1','Heineken 600ml', 1, 18000, 18000);

-- Entregas
insert into yapa.entregas (org_id, pedido_id, entregador_id, status, horario_despacho, horario_entrega_realizado) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000f0001','00000000-0000-0000-0000-0000000000e1','entregue', now() - interval '110 minute', now() - interval '75 minute'),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000f0002','00000000-0000-0000-0000-0000000000e2','em_entrega', now() - interval '30 minute', null);

-- Pagamentos
insert into yapa.pagamentos (org_id, pedido_id, provedor, moeda, valor, valor_gs, status, recebido_por_distribuidora_id) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000f0001','dlocal','GS', 54000, 54000, 'pago', null),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000f0002','dinheiro','GS', 27000, 27000, 'pago', '00000000-0000-0000-0000-0000000000d2'),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000f0003','dlocal','PIX', 25, 36000, 'pago', null);

-- Reflete o dinheiro recebido no saldo D+1 da distribuidora Km 4
update yapa.distribuidoras set saldo_d1_gs = 27000 where id = '00000000-0000-0000-0000-0000000000d2';

-- Conversa de atendimento (com handoff)
insert into yapa.conversas (org_id, cliente_id, telefone, status, handoff_humano, mensagens, ultima_mensagem_em) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','595991000001','aberta', false,
  '[{"de":"cliente","texto":"Boa noite! Tem Heineken?","tipo":"texto","em":"2026-06-15T23:10:00Z"},
    {"de":"bot","texto":"Boa noite! Temos sim 🍻 Quantas você quer?","tipo":"texto","em":"2026-06-15T23:10:05Z"},
    {"de":"cliente","texto":"3 Heineken","tipo":"texto","em":"2026-06-15T23:11:00Z"}]'::jsonb,
  now() - interval '15 minute');
