---
name: onboarding-distribuidor
description: >
  Cadastrar uma distribuidora no Yapa com geolocalização e raio de atuação, para
  que o roteamento automático de pedidos funcione. Carregar ao adicionar fornecedores
  ou ao montar a malha de cobertura de Ciudad del Este.
allowed-tools: [Read, Write, Edit, Bash, WebFetch]
---

# Onboarding de Distribuidora

Cadastra uma distribuidora de forma que o **roteamento por geolocalização** funcione:
todo pedido é direcionado à distribuidora ativa mais próxima cujo `raio_km` cobre o cliente
(`src/lib/intel/roteamento.ts`).

## Dados necessários (peça ao Thales)
- **Nome** e **contato/telefone** (número/grupo que recebe o pedido).
- **Endereço** + **link do Google Maps** do ponto.
- **Latitude/Longitude** — extraia do link do Maps (a URL `...@-25.50,-54.61,...` ou
  `?q=-25.50,-54.61`). Se vier só o link, busque/derive as coordenadas.
- **Raio de atuação (km)** — até onde ela entrega a partir do ponto.
- **Recebe dinheiro?** (sim/não) — define se entra no controle D+1.
- **Grupo de motoboys (ID Z-API)** — grupo de WhatsApp que recebe as corridas do hub
  (campo `grupo_motoboys_id`). Como obter o ID e cadastrar a frota: skills
  `despacho-motoboys` e `onboarding-frota`. Sem ele, o leilão não anuncia as corridas.

## Como cadastrar
1. Pela UI: módulo **Distribuidoras → Nova distribuidora**. Preencha os campos acima.
2. Ou em massa: gere um `insert into yapa.distribuidoras (...)` e rode no Supabase.

## Validação do roteamento
Depois de cadastrar, confira no detalhe de um pedido (botão **Rotear automaticamente**)
se a distribuidora correta é escolhida. Se "nenhuma distribuidora cobre a zona":
revise lat/lng e o `raio_km`.

## Dica de cobertura
Mapeie as zonas de Ciudad del Este e garanta que os raios se sobreponham nas áreas de
maior demanda (Centro, Microcentro, Km 4) — assim nenhum pedido cai em fila manual.
