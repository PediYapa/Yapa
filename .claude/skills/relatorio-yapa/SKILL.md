---
name: relatorio-yapa
description: >
  Gerar relatórios operacionais e financeiros do Yapa (faturamento, ticket médio,
  pedidos por status/distribuidora, controle D+1). Carregar quando o Thales pedir
  um resumo do dia/semana ou quiser fechar o caixa.
allowed-tools: [Read, Bash, Grep]
---

# Relatórios Yapa

Ajuda a ler e gerar números da operação. Tudo é normalizado em **Guarani (GS)**.

## Onde estão os números
- **Dashboard**: pedidos hoje, faturamento, ticket médio, em andamento, entregues, quebras.
- **Relatórios**: pedidos por status, faturamento total, ticket médio, top distribuidoras,
  pedidos por dia (7 dias).
- **Financeiro**: pagamentos + **controle D+1** (dinheiro recebido por cada distribuidora,
  a abater no dia seguinte). Use "Abater saldo" ao fechar o acerto.

## Métricas (núcleo puro)
`src/lib/intel/metrics.ts` calcula os KPIs a partir das linhas de pedidos — sem banco,
fácil de testar e estender. Adicione novas métricas aqui.

## Fechamento de caixa (D+1)
1. Abra **Financeiro → Controle D+1**.
2. Para cada distribuidora com saldo, confira o valor em dinheiro recebido.
3. Clique **Abater saldo** após o acerto — zera o saldo e marca os pagamentos como abatidos.

## Gerar um resumo sob demanda
Quando o Thales pedir "como foi o dia": leia os pedidos do dia (status, valores), some o
faturamento dos pagos/entregues, conte entregues e quebras, e apresente em texto curto +
destaques. Se quiser PDF, monte HTML simples e converta (Chrome headless).
