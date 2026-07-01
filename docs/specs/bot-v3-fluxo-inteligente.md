# Spec: Bot V3.0 — Fluxo Inteligente e Checkout Autônomo

## Objetivo
Reordenar o fluxo do bot para geofencing antecipado, capturar dados fiscais (Factura Legal + RUC) e operar 100% autônomo sem handoff humano no checkout.

## Usuário alvo
Cliente final via WhatsApp.

## Fluxo principal
1. Cliente manda "oi" → bot solicita PIN de localização (geofencing primeiro)
2. Fora do raio → aborta e **reseta sessão completamente** (carrinho + contexto = vazio)
3. Dentro do raio → captura endereço escrito → captura nome
4. Menu de categorias → produto → formato/sabor → quantidade → mais itens?
5. Pergunta **Factura Legal** (botão Sim/Não) → salva em `contexto.precisa_fatura`
6. Se Sim → captura **RUC/CI** (nó `f-ruc`, tipo `captura`) → salva em `contexto.ruc`
7. Nó `f-checkout` (tipo `texto`, não `humano`) → bot gera link dLocal e envia
8. Bot 100% autônomo — zero handoff

## Banco de dados
- `pedidos.precisa_fatura` (boolean)
- `pedidos.documento_ruc` (text, nullable)
- `clientes.documento_ruc` (text, nullable)
- Migration 010

## Integrações
- dLocal: `createPaymentLink` sem `country` → link aberto (PIX para brasileiros)
- Z-API: `send-text` para link de pagamento

## Critérios de aceite
- [x] Geofencing ocorre antes do menu
- [x] Fora do raio: sessão resetada, não apenas pausada
- [x] Campo `precisa_fatura` salvo no pedido
- [x] Campo `documento_ruc` salvo no pedido e no cliente
- [x] Nó f-checkout é `texto` (bot autônomo)
- [x] Link dLocal gerado e enviado pelo bot

## Fora do escopo
- Validação de formato de RUC (aceita qualquer texto)
- Emissão de nota fiscal (só coleta o dado)
