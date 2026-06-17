---
name: gestao-pedidos
description: >
  Operar e evoluir o fluxo de pedidos do Yapa — do recebimento via WhatsApp até a
  entrega validada. Carregar ao acompanhar pedidos, ajustar o fluxo de status, ou
  desenvolver melhorias no módulo de pedidos/atendimento.
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

# Gestão de Pedidos

Cobre o ciclo de vida do pedido (Fase 1) e como evoluí-lo no código.

## Fluxo do pedido (status)
`recebido → aguardando_pagamento → pago → roteado → em_separacao → despachado → em_entrega → entregue`
Exceções: `cancelado`, `estornado`, `quebra` (item em falta).
Fonte: `src/lib/intel/status.ts` (`PEDIDO_FLUXO`, `PEDIDO_TRANSICOES`).

## Operação (UI)
- **Pedidos**: lista filtrável por status + criação manual.
- **Detalhe do pedido**: avançar/saltar status, **rotear** (geolocalização), atribuir
  distribuidora, **registrar pagamento**, **gerar código de validação**.
- **Despacho**: atribuir entregador e acompanhar a entrega.
- **Atendimento**: ver a conversa do WhatsApp, assumir do bot (handoff) e responder.

## Entrada automática (bot)
Mensagens chegam em `/api/webhooks/whatsapp` → o agente (`lib/integrations/openai.ts`)
interpreta → registra em **Atendimento**. Pedidos também podem ser criados pela API
`POST /api/v1/pedidos` (Make/Z-API), com token de escopo `pedidos:write`.

## Evoluir o módulo
- Lógica de status: `src/lib/intel/status.ts` (adicione transições aqui, não espalhe).
- Ações: `src/app/actions/pedidos.ts` (sempre `guard("pedidos","write")` + zod + `revalidatePath`).
- Telas: `src/app/(app)/pedidos/**`. Mantenha o padrão dos outros módulos.

## A desenhar (imersão)
**Quebra de pedido**: quando falta um item, contatar o cliente, sugerir substituição e
reprecificar. Use o status `quebra` como gancho e desenhe a regra de negócio aqui.
