---
name: despacho-entregador
description: >
  Acionar entregadores/grupos parceiros e acompanhar as entregas do Yapa (Fase 1, via
  grupos de WhatsApp). Carregar ao gerenciar despacho, cadastrar entregadores ou
  preparar a transição para a central própria com GPS (Fase 2/3).
allowed-tools: [Read, Write, Edit, Bash, Grep]
---

# Despacho de Entregadores

## Fase 1 — grupos parceiros
No Paraguai não há centrais como no Brasil; as entregas saem por **grupos de motoboys**
(campo `grupo_parceiro` em Entregadores). O fluxo:
1. Pedido vira `despachado` → cria uma **entrega** (status `aguardando`).
2. No módulo **Despacho**: atribua um entregador/grupo e avance
   `aguardando → coletado → em_entrega → entregue`.
3. Ao marcar **entregue**: registra horário, incrementa `entregas_completadas` e fecha o pedido.
4. O cliente confirma com o **código de validação** gerado no pedido.

## Cadastro de entregadores
Módulo **Entregadores → Novo**. Informe nome, telefone, grupo parceiro e a
distribuidora-base (de onde ele costuma sair).

## Notificação automática
Ao rotear/despachar, o sistema pode acionar a distribuidora/grupo via Z-API
(`lib/integrations/zapi.ts → notificarDistribuidora`). Plugue isso em
`src/app/actions/pedidos.ts` ou `despacho.ts` quando o número estiver conectado.

## Fase 2/3 — central própria (estruturado, sem UI)
O schema já tem `hubs`, `rotas` e `gps_pings`. A visão é despacho automático estilo
Bolt: "bateu pedido, quem está mais perto recebe". Use `lib/intel/roteamento.ts`
(haversine) como base para a roteirização ponto-a-ponto.
