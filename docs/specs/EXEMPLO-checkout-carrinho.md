# Spec: Checkout do carrinho via bot WhatsApp

> **Status:** exemplo / modelo de referência

---

## Objetivo
Após o cliente selecionar produtos no bot, o Yapa gera um pedido real no banco e envia o link de pagamento (DLocal).

---

## Usuário alvo
Cliente que está numa conversa ativa no WhatsApp com o bot Yapa.

---

## Fluxo principal
1. Cliente escolhe produto(s) durante a conversa (carrinho acumulado em `sessoes_whatsapp.carrinho`).
2. Bot pergunta "gostaria de mais alguma coisa?" → cliente clica "Não".
3. Bot calcula o total e envia resumo: "Seu pedido: Brahma x1 — Ƨ 9.000. Total: Ƨ 9.000."
4. Bot pergunta forma de pagamento: "Pix" ou "Dinheiro".
5. Se Pix → bot chama DLocal, cria link de pagamento, envia URL.
6. Se Dinheiro → bot confirma: "Pedido confirmado! Pague ao entregador."
7. Pedido inserido em `yapa.pedidos` com status `recebido`.
8. Bot encerra o fluxo (estado limpo).

---

## Fluxo alternativo / erros
- Carrinho vazio ao chegar no checkout → bot fala "Seu carrinho está vazio. O que você gostaria de pedir?" e volta ao nó de produtos.
- DLocal retorna erro → bot fala "Não consegui gerar o link agora. Pode pagar em dinheiro ao entregador?"
- Cliente abandona (sem responder em 30 min) → sessão expira, estado limpo no próximo "oi".

---

## Telas / UI
- Nenhuma tela nova no app — o pedido criado aparece automaticamente em **Pedidos** e **Despacho**.
- Badge de status `recebido` já existe.

---

## Banco de dados
- Ler `sessoes_whatsapp.carrinho` (já existe).
- Inserir em `yapa.pedidos` (tabela já existe, colunas: `org_id`, `cliente_id`, `telefone`, `itens`, `total_gs`, `forma_pagamento`, `status`).
- Inserir em `yapa.pedido_itens` (já existe).
- Limpar `sessoes_whatsapp.carrinho = []` após criação do pedido.
- Nenhuma migração de schema necessária.

---

## Integrações
- **DLocal:** `POST /payments` para criar link Pix. Já existe `lib/integrations/dlocal.ts` (verificar se endpoint de criação está implementado).
- **Z-API:** enviar texto com URL do pagamento via `enviarTexto` (já existe).

---

## Critérios de aceite
- [ ] Após clicar "Não" no "mais alguma coisa?", bot envia resumo com total correto em GS.
- [ ] Pedido aparece em `/pedidos` com status `recebido` e itens corretos.
- [ ] Opção Pix gera link DLocal e envia via WhatsApp.
- [ ] Opção Dinheiro confirma e cria pedido sem chamar DLocal.
- [ ] Carrinho é zerado após confirmação.
- [ ] Se cliente manda "oi" depois, começa fluxo do zero (sem carrinho antigo).

---

## Fora do escopo
- Cancelamento de pedido via bot (futuro).
- Rastreio do entregador via bot (Fase 2).
- Múltiplos endereços de entrega (futuro).
