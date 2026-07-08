---
name: testar-bot
description: >
  Testar o funil do bot de ponta a ponta SEM celular: simula payloads Z-API
  (texto, botão, enquete, PIN, grupo P/E) direto no webhook, reseta a sessão de
  teste e confere o estado no banco a cada passo. Carregar antes de entregar
  qualquer mudança no bot/checkout/dispatch, ou para reproduzir bug reportado.
allowed-tools: [Read, Bash, Grep, Glob]
---

# Testar Bot — simulador de webhook Z-API

Substitui o ciclo "deploy → Thales testa no celular → cola screenshot" (a maior fricção
do histórico do projeto — 13 rodadas). Roda o funil inteiro por dentro, passo a passo.

## Setup (uma vez por teste)
- **Telefone de teste**: `595990000001` (fake — as respostas do bot via Z-API falham
  em silêncio, o que é desejado). **NUNCA usar telefone de cliente real**: o bot envia
  mensagens de verdade.
- **URL**: produção `https://www.pediyapa.com/api/webhooks/whatsapp` (ou `http://localhost:3000/...` com `npm run dev`).
- **Secret**: query `?secret=<valor>` — ler de `yapa.orgs.zapi_webhook_secret` via MCP
  (`execute_sql`) ou env `ZAPI_WEBHOOK_SECRET`. Sem secret configurado, omitir.

## 1) Resetar a sessão de teste (sempre antes de começar)
```sql
UPDATE yapa.conversas SET fluxo_estado = NULL, handoff_humano = false WHERE telefone = '595990000001';
DELETE FROM yapa.sessoes_whatsapp WHERE telefone = '595990000001';
```

## 2) Payloads sintéticos (formatos REAIS validados em produção)
POST JSON com `Content-Type: application/json` (curl via Bash). Trocar só o conteúdo:

| Passo | Payload |
|---|---|
| Texto livre | `{"phone":"595990000001","fromMe":false,"type":"ReceivedCallback","text":{"message":"oi"}}` |
| Botão | `{"phone":"595990000001","fromMe":false,"type":"ReceivedCallback","buttonsResponseMessage":{"buttonId":"btn-sim18","message":"Sim"}}` |
| Enquete (menu) | `{"phone":"595990000001","fromMe":false,"type":"ReceivedCallback","pollVote":{"options":[{"name":"Combo"}]}}` |
| PIN localização | `{"phone":"595990000001","fromMe":false,"type":"ReceivedCallback","location":{"latitude":-25.5100,"longitude":-54.6100,"address":"Teste Centro"}}` |
| Grupo: aceitar corrida | `{"phone":"<grupo_motoboys_id>","participantPhone":"<tel_motoboy>","isGroup":true,"fromMe":false,"type":"ReceivedCallback","text":{"message":"P <numero_corrida>"}}` |
| Grupo: confirmar entrega | idem com `"E <numero_corrida>"` |

IDs de botão reais do fluxo V3: `btn-sim18` (idade), `btn-mais`/`btn-fim` (carrinho),
`btn-fat-sim`/`btn-fat-nao` (fatura), `btn-pg-dinheiro`/`btn-pg-online` (pagamento).

## 3) Roteiro do funil completo (happy path dinheiro)
`oi` → botão `btn-sim18` → poll categoria → botão `ent_0` (produto) → texto `1` (qtd)
→ botão `btn-fim` → PIN (coords dentro do raio de um hub: -25.5100,-54.6100 Centro)
→ texto endereço → texto nome → botão `btn-fat-nao` → botão `btn-pg-dinheiro`.

**Entre cada passo**, conferir estado via MCP:
```sql
SELECT fluxo_estado->>'no_atual' AS no, fluxo_estado->'contexto' AS ctx
FROM yapa.conversas WHERE telefone = '595990000001';
```
Ao final: pedido criado com `taxa_entrega_gs`/`distancia_km`/`status_entrega='aguardando_motoboy'`,
status `em_separacao`, e (se o hub tem grupo) corrida anunciada.

## 4) Casos de borda obrigatórios em mudança de bot
- PIN fora de cobertura (ex.: -25.3789,-49.2090 = Curitiba) → deve resetar sessão.
- "Pagar Online" **sem gateway ativo** → mensagem de indisponível + permanece no nó.
- Dois `P <n>` seguidos de motoboys diferentes → exatamente 1 vence.
- Mensagem qualquer num grupo cadastrado → ignorada (`grupo: "ignorada"` na resposta).

## 5) Limpeza (sempre ao terminar)
```sql
DELETE FROM yapa.pedido_itens WHERE pedido_id IN (SELECT id FROM yapa.pedidos WHERE cliente_id IN (SELECT id FROM yapa.clientes WHERE telefone = '595990000001'));
DELETE FROM yapa.pedidos WHERE cliente_id IN (SELECT id FROM yapa.clientes WHERE telefone = '595990000001');
DELETE FROM yapa.sessoes_whatsapp WHERE telefone = '595990000001';
DELETE FROM yapa.conversas WHERE telefone = '595990000001';
DELETE FROM yapa.clientes WHERE telefone = '595990000001';
```

## Diagnóstico
A resposta HTTP do webhook traz `{ok, intencao}` (`"fluxo"` = engine respondeu) ou
`{ok, grupo: <acao>}`. Detalhe fino: runtime logs da Vercel via MCP, filtrar `yapa:`.
