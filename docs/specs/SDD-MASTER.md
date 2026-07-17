# SDD Master — Yapa Engine

> Documento vivo. Atualizar após cada ciclo de desenvolvimento.
> Última atualização: 2026-07-17 · **V3.0 + Yapa Partners + Dispatch de Motoboys em produção; Entregas Expressas (Open Delivery) em WIP.**
> Este arquivo é o ÍNDICE do estado do sistema; o detalhe de cada domínio vive nas specs abaixo.

---

## Specs por domínio (fonte de detalhe)

| Spec | Domínio |
|------|---------|
| `bot-v3-fluxo-inteligente.md` | Funil V3.0: geofence antecipado, Factura Legal/RUC, checkout autônomo |
| `gateway-pagamento.md` | **Porta agnóstica de pagamento** (dLocal não aprovada; Dinelco/Asaas a contratar) |
| `dlocal-integracao.md` | Conhecimento da API dLocal Go (adapter na prateleira) + bugs históricos |
| `yapa-partners-hub.md` | Portal B2B `/hub` de estoque dos distribuidores (motor WIP + CSV) |
| `dispatch-motoboys.md` | Leilão de corridas via grupos de WhatsApp (P/E, claim atômico, frete) |
| `entregas-expressas-open-delivery.md` | **WIP** — substitui dispatch-motoboys por logística terceirizada (Open Delivery/ABRASEL). Bloqueada em endereço estruturado/CEP no Paraguai |
| `identidade-visual.md` | Marca PediYapa (#FFCC00 + preto) |

## Estado atual em produção (resumo)

### Jornada do cliente (V3.0 — autônoma, sem handoff)
```
"oi" → gate de idade → PIN de localização (geofence PRIMEIRO; fora do raio = reset)
→ frete calculado por faixa de km → endereço escrito → nome → menu 5 categorias
→ produto (caixa/unidade, sabores) → quantidade → mais itens? → Factura Legal (RUC)
→ pagamento: Dinheiro na Entrega (ativo) | Online (via porta de gateway — HOJE indisponível)
→ pedido criado (valor produtos + taxa_entrega_gs separados) → duplo despacho:
  comanda → distribuidora  E  corrida → grupo de motoboys ("P <n>" reivindica)
→ "E <n>" do motoboy = entregue + cliente notificado
```

### Superfícies
- **Bot WhatsApp** (Z-API): engine puro em `lib/intel/fluxo-engine.ts`; webhook detecta grupo × cliente.
- **CRM interno** `/dashboard`: pedidos (com entrega/frete), atendimento, distribuidoras (com grupo de motoboys), motoboys, catálogo, faturas (RUC/CSV), financeiro D+1, fluxos (builder React Flow), usuários, tokens.
- **Yapa Partners** `/hub`: estoque físico por distribuidora, WIP com IA, importação CSV, modo supervisão admin.
- **Fallback manual** `/despacho`: atribuir motoboy quando ninguém aceita no grupo.

### Banco (schema `yapa`) — migrations 001–015 aplicadas
Tabelas ativas: orgs, user_profiles, clientes, distribuidoras (+`grupo_motoboys_id`), produtos,
**motoboys** (frota consolidada — `entregadores` FOI REMOVIDA na 014), pedidos (+frete/corrida/
status_entrega), pedido_itens, entregas, pagamentos, conversas, sessoes_whatsapp, fluxos,
api_tokens, estoque_hub, contatos, hubs/rotas/gps_pings (Fase 2/3, dormentes).
RPC: `match_distribuidora(lat,lng)`. **Fonte da verdade do schema: `db/migrations/` em ordem**
(schema.sql é a base histórica, não reflete 010+).

## Backlog (ordenado por valor)

### P0 — Integração Entregas Expressas (Open Delivery)
Substitui dispatch de motoboys por WhatsApp por logística terceirizada.
Código de integração escrito (`docs/specs/entregas-expressas-open-delivery.md`),
migration 017 pronta mas **não aplicada**. Bloqueada em endereço estruturado/CEP
no Paraguai — sem isso não dá pra testar em sandbox de verdade.

### P1 — Gateway de pagamento definitivo
Contratar Dinelco/Asaas/similar → plugar pela porta (`docs/specs/gateway-pagamento.md`, ~1h).
Até lá o bot opera 100% dinheiro na entrega.

### P2 — Onboarding da frota real
Capturar `grupo_motoboys_id` dos 5 hubs + cadastrar 30–40 pilotos (skill `onboarding-frota`).
Validar formato real do payload de grupo da Z-API no primeiro teste (`[yapa:grupo-payload]`).

### P3 — Timeout/republicação de corrida sem resposta (dispatch v2)
Corrida não aceita em N min → reanunciar no grupo ou alertar admin (hoje: fallback manual /despacho).

### P4 — Quebra de pedido
Item em falta → contatar cliente, sugerir substituição, reprecificar (status `quebra` já existe).

### P5 — Rastreamento GPS (Fase 2/3)
`rotas`/`gps_pings` já referenciam motoboys; despacho por proximidade estilo Bolt.

---

## Template SDD para novos incrementos

```markdown
# Spec: <nome>

## Objetivo
Uma frase: o que o usuário consegue fazer que não conseguia antes.

## Usuário alvo
cliente WhatsApp / operador / motoboy / parceiro hub / owner

## Fluxo principal
1. ...

## Banco de dados
- Novas tabelas ou colunas? Migration necessária? (lembrar: GRANT em sequences novas!)

## Integrações
- Z-API (envio/recebimento novo)? Gateway de pagamento (via porta)? Geo? OpenAI?

## Critérios de aceite
- [ ] ...

## Fora do escopo
- ...
```
