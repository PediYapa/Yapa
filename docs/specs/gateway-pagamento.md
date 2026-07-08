# Spec: Porta de Gateway de Pagamento (agnóstica)

## Contexto
A conta **dLocal NÃO foi aprovada**. O gateway definitivo será contratado depois
(candidatos: **Dinelco**, **Asaas**, ou similar). O sistema foi desacoplado para que a
troca seja plug-and-play: o bot, os webhooks e os painéis falam só com a **porta**
(`src/lib/pagamentos/gateway.ts`) — nunca com um gateway direto.

## Estado atual
- **Nenhum gateway ativo em produção.** O bot detecta isso (`getGateway() === null`) e,
  se o cliente tocar "Pagar Online", responde com honestidade e direciona para
  *dinheiro na entrega* (não gera link fadado a falhar).
- O adapter dLocal (`adapters/dlocal.ts`) fica pronto na prateleira: se a conta for
  aprovada, basta `DLOCAL_API_KEY`/`DLOCAL_SECRET` + `PAYMENT_GATEWAY=dlocal` na Vercel — nada de código.
- Env `PAYMENT_GATEWAY`: **opt-in explícito** — `dlocal` (ou slug futuro) liga; `none`
  ou ausente = pagamento online desligado. Não há auto-detecção por credenciais: chaves
  de teste esquecidas na Vercel não podem religar um gateway sem contrato.

## Arquitetura da porta
```
src/lib/pagamentos/
  gateway.ts        ← contrato PaymentGateway + registro ADAPTERS + getGateway()
  confirmacao.ts    ← confirmarPagamentoPedido(): achar pedido → gravar status →
                      'pago' → duplo despacho (distribuidora + grupo motoboys). Idempotente.
  adapters/
    dlocal.ts       ← adapter pronto (aguardando aprovação da conta)
src/app/api/webhooks/
  dlocal/route.ts   ← rota fina: valida notificação → adapter.consultar() (GET-confirm)
                      → confirmarPagamentoPedido()
```

## Checklist: plugar um gateway novo (ex.: Dinelco ou Asaas)
1. **Adapter** — criar `src/lib/pagamentos/adapters/<slug>.ts` implementando `PaymentGateway`:
   `id`, `nome`, `formaPagamento`, `configurado()` (lê as env vars), `criarLink()` e
   `consultar()` (sempre com `AbortSignal.timeout` — regra §5.10 do CLAUDE.md).
2. **Registrar** — 1 linha no `ADAPTERS` de `gateway.ts`.
3. **Enum** — migration `ALTER TYPE yapa.forma_pagamento ADD VALUE IF NOT EXISTS '<slug>';`
   + adicionar o valor em `FormaPagamento` (`database.types.ts`) e label nos painéis
   que exibem forma de pagamento.
4. **Webhook** — criar `src/app/api/webhooks/<slug>/route.ts` espelhando a rota dLocal
   (~40 linhas): extrair o id da notificação → `adapter.consultar()` (NUNCA confiar no
   corpo do POST — padrão GET-confirm) → `confirmarPagamentoPedido()`.
5. **Env vars** — cadastrar credenciais na Vercel + `PAYMENT_GATEWAY=<slug>` (ou deixar
   o auto detectar). Nunca usar placeholder tipo "pendente" (bug histórico).
6. **Painel do gateway** — apontar a notificação para `https://www.pediyapa.com/api/webhooks/<slug>`.
7. **Testar** — skill `testar-bot`: funil completo com "Pagar Online" + simular a
   notificação do webhook; conferir pedido → `pago` → `em_separacao` + corrida no grupo.

## Regras invariantes (valem para qualquer gateway)
- `valor` cobrado online = **produtos + frete** (total que o cliente viu no resumo);
  `pedidos.valor_total_gs` continua só produtos; frete separado em `taxa_entrega_gs`.
- Confirmação SEMPRE via consulta autoritativa à API do gateway (GET-confirm).
- Confirmou pago → `confirmarPagamentoPedido()` cuida de status + duplo despacho; a rota
  de webhook não duplica essa lógica.
- Fluxo dinheiro na entrega independe de gateway e nunca pode quebrar por causa dele.

## Histórico
- 2026-07-07 — Porta criada; integração dLocal legada removida (`lib/integrations/dlocal.ts`,
  `/api/webhooks/pagamento`, `actions/pagamentos.ts` — cadeia morta da era do mock BRL/PIX).
