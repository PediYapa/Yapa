# Spec: Integração dLocal Go — Pagamento via Link

## Objetivo
Gerar links de pagamento dLocal no checkout do bot e confirmar pagamentos via webhook seguro.

## Usuário alvo
Bot (geração do link) + dLocal (webhook de confirmação).

## Fluxo principal
1. Bot finaliza carrinho → `criarPedidoDoCarrinho()` → `createPaymentLink()` no dLocal
2. Link retornado → bot envia para cliente via WhatsApp
3. Cliente paga → dLocal chama `POST /api/webhooks/dlocal`
4. Webhook valida chamando `getPayment()` na API dLocal (GET-confirm pattern)
5. Status PAID → pedido muda para `em_separacao` + notificação WhatsApp ao cliente

## Banco de dados
- `pedidos.gateway_id` (string do link dLocal)
- `pedidos.gateway_status` (string do status)
- Migration 010 restaura essas colunas

## Integrações
- dLocal Go API: `POST /v1/payments` (criar), `GET /v1/payments/{id}` (confirmar)
- Z-API `send-text`: notificação de pagamento confirmado
- `lib/despacho.ts`: orquestra mudança de status + notificação

## Critérios de aceite
- [x] Payload sem `country` → "link abierto" (PIX disponível para BR)
- [x] `AbortSignal.timeout(12000)` no criar, `8000` no consultar
- [x] Env var `DLOCAL_API_BASE` validada por regex (fallback para `https://api.dlocalgo.com`)
- [x] Webhook usa GET-confirm (não confia no payload POST)
- [x] Cliente notificado por WhatsApp ao confirmar pagamento

## Fora do escopo
- Reembolsos via dLocal
- Pagamento em cash (fluxo separado)

## Bugs históricos resolvidos
- **Status 0 no Z-API**: fetch sem timeout → Z-API dropava conexão. Fix: `AbortSignal.timeout`.
- **URL inválida**: `DLOCAL_API_BASE=pendente` (placeholder nunca trocado). Fix: validação regex + fallback.
- **PIX não aparecia**: payload com `country: "PY"` travava no mercado PY. Fix: remover `country`.
