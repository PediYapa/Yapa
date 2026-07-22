# SDD Master — Yapa Engine

> Documento vivo. Atualizar após cada ciclo de desenvolvimento.
> Última atualização: 2026-07-22 · **V3.0 + Yapa Partners em produção; Entregas Expressas (Open Delivery) validada end-to-end em sandbox — motoboys espelho (`/motoboys`) e status em tempo real (`/pedidos`) já em produção; app "Pedi Yapa open" enviado para homologação, aguardando credenciais de produção. Dispatch de Motoboys via WhatsApp/grupo PARCIALMENTE descontinuado (ver "Telas defasadas" abaixo).**
> Este arquivo é o ÍNDICE do estado do sistema; o detalhe de cada domínio vive nas specs abaixo.

---

## Specs por domínio (fonte de detalhe)

| Spec | Domínio |
|------|---------|
| `bot-v3-fluxo-inteligente.md` | Funil V3.0: geofence antecipado, Factura Legal/RUC, checkout autônomo |
| `gateway-pagamento.md` | **Porta agnóstica de pagamento** (dLocal não aprovada; Dinelco/Asaas a contratar) |
| `dlocal-integracao.md` | Conhecimento da API dLocal Go (adapter na prateleira) + bugs históricos |
| `yapa-partners-hub.md` | Portal B2B `/hub` de estoque dos distribuidores (motor WIP + CSV) |
| `dispatch-motoboys.md` | **Parcialmente substituída** — o mecanismo de dispatch (leilão via grupo WhatsApp) foi descontinuado (na prática, código morto: nada mais anuncia corrida nem popula `status_entrega`); o conceito de "prova de posse via código de confirmação" (`codigo_validacao`) continua em uso pelo despacho atual |
| `entregas-expressas-open-delivery.md` | **Validado em sandbox** (22/jul/2026) — logística terceirizada (Open Delivery/ABRASEL) substitui o leilão WhatsApp. App em homologação, aguardando credenciais de produção |
| `identidade-visual.md` | Marca PediYapa (#FFCC00 + preto) |

## Estado atual em produção (resumo)

### Jornada do cliente (V3.0 — autônoma, sem handoff)
```
"oi" → gate de idade → PIN de localização (geofence PRIMEIRO; fora do raio = reset)
→ frete calculado por faixa de km → endereço escrito → nome → menu 5 categorias
→ produto (caixa/unidade, sabores) → quantidade → mais itens? → Factura Legal (RUC)
→ pagamento: Dinheiro na Entrega (ativo) | Online (via porta de gateway — HOJE indisponível)
→ pedido criado (valor produtos + taxa_entrega_gs separados) → despacho duplo (`lib/despacho.ts`):
  comanda de separação → distribuidora (SEMPRE, via WhatsApp)  E  registro na Entregas
  Expressas (quando a org tem credenciais — hoje só em sandbox/Preview)
→ ciclo de entrega dirigido pelos webhooks da operadora (ACCEPTED → PICKUP_ONGOING →
  ORDER_PICKED → ... → ORDER_DELIVERED), refletido em tempo real na coluna ENTREGA de
  `/pedidos` e no espelho histórico `/motoboys`
```

### Superfícies
- **Bot WhatsApp** (Z-API): engine puro em `lib/intel/fluxo-engine.ts`; webhook detecta grupo × cliente.
- **CRM interno** `/dashboard`: pedidos (com entrega em tempo real via Entregas Expressas), atendimento, distribuidoras, motoboys (espelho histórico EE), catálogo, faturas (RUC/CSV), financeiro D+1, fluxos (builder React Flow), usuários, tokens.
- **Yapa Partners** `/hub`: estoque físico por distribuidora, WIP com IA, importação CSV, modo supervisão admin.
- **Fallback manual** `/despacho`: atribuição manual de motoboy + avanço de status de `entregas` — modelo herdado do leilão WhatsApp (hoje inerte). Opera sem distinguir pedidos geridos pela Entregas Expressas — ver "Telas defasadas" abaixo.

### Banco (schema `yapa`) — migrations 001–020 aplicadas
Tabelas ativas: orgs (+ credenciais Entregas Expressas), user_profiles, clientes,
distribuidoras (+`grupo_motoboys_id` legado, +endereço estruturado), produtos,
**motoboys** (frota do leilão legado — `entregadores` FOI REMOVIDA na 014, sem novos
cadastros via UI desde jul/2026), pedidos (+frete/corrida/status_entrega, dormente),
pedido_itens, entregas (+provedor/evento_externo/entregador_provedor_id — Entregas
Expressas), entregas_expressas_webhook_log, pagamentos, conversas, sessoes_whatsapp,
fluxos, api_tokens, estoque_hub, contatos, hubs/rotas/gps_pings (Fase 2/3, dormentes).
RPC: `match_distribuidora(lat,lng)`. **Fonte da verdade do schema: `db/migrations/` em ordem**
(schema.sql é a base histórica, não reflete 010+). `yapa.entregas` também está na
publicação `supabase_realtime` (migration 020) para o status em tempo real de `/pedidos`.

## Telas defasadas / candidatas a revisão (decisão pendente do Thales)

Auditoria de 22/jul/2026, ao consolidar a incorporação da Entregas Expressas ao painel.
Nenhuma mudança de código foi feita a partir destes achados — só documentado.

### `/despacho` (`src/app/(app)/despacho/`) — conflitante com o modelo EE
- Opera sobre TODA a tabela `yapa.entregas` sem distinguir a coluna `provedor`,
  permitindo atribuir manualmente um motoboy (dropdown de `yapa.motoboys`, tabela já
  órfã) e avançar `entregas.status` livremente (`aguardando → coletado → em_entrega →
  entregue`) via `atribuirMotoboy`/`mudarStatusEntrega` (`app/actions/despacho.ts`).
- **Risco real:** para uma entrega com `provedor = 'entregas_expressas'`, o status
  verdadeiro é ditado pelos webhooks da operadora. Um humano usando `/despacho` pode
  sobrescrever esse status manualmente (sem qualquer guarda por `provedor`) — e o
  próximo webhook pode sobrescrever de volta, sem aviso, gerando inconsistência entre
  o painel e o que de fato aconteceu na rua.
- `mudarStatusEntrega` também não valida `PEDIDO_TRANSICOES` (diferente do handler de
  webhook, que sempre checa a transição antes de aplicar) — outra divergência de
  comportamento entre os dois caminhos que hoje escrevem no mesmo dado.
- Opções em aberto (nenhuma decidida):
  1. `/despacho` vira fallback só para pedidos **sem** `provedor` — bloquear/ocultar
     ações manuais quando `provedor = 'entregas_expressas'`.
  2. Unificar `/despacho` com o espelho de `/motoboys` numa única tela de
     acompanhamento (somente leitura para EE; ação manual só pro que sobrar).
  3. Aposentar `/despacho` por completo, se toda a operação migrar para EE.

### `distribuidoras` — campo "Grupo de motoboys (ID Z-API)"
- O formulário de distribuidora (`distribuidoras-client.tsx`) ainda captura
  `grupo_motoboys_id`, mas **nada no despacho atual usa esse valor para anunciar
  corridas**: `lib/despacho.ts` hoje só envia a "comanda de separação" (texto
  informativo) pro telefone da distribuidora — não mais o anúncio de corrida pro
  grupo. `msgCorridaGrupo` (`lib/mensagens-motoboys.ts`) está **definida mas não é
  chamada em nenhum lugar do código atual**: o leilão via grupo é código morto na
  prática, não apenas "descontinuado por decisão".
- `grupo-motoboys.ts` (webhook) continua reagindo a `P <n>`/`E <n>` em grupos
  vinculados, mas como nada mais grava `pedidos.status_entrega = 'aguardando_motoboy'`,
  não existe mais corrida pra reivindicar — o branch está vivo, porém inerte.
- `/pedidos/[id]` ainda tem um bloco condicional (`pedido.status_entrega &&`) que
  mostraria "Corrida #N"/badge de status — não quebra nada (nunca mais é populado
  pra pedidos novos), mas é código morto silencioso.
- Decisão de limpar o campo/UI fica pendente, junto com o destino de `/despacho`.

## Backlog (ordenado por valor)

### P0 — Homologação de produção da Entregas Expressas
Integração validada end-to-end em sandbox (22/jul/2026): pedido criado pelo Yapa →
aceito → coletado → entregue, confirmado no app do motoboy E no banco (6 webhooks,
HMAC ok, `pedidos.status=entregue`). App "Pedi Yapa open" enviado pra review da
operadora — falta aprovação + credenciais de **produção** (checklist em
`entregas-expressas-open-delivery.md`). Endereço estruturado deixou de ser bloqueador:
`country="PY"`/`state="PY-11"` foram aceitos na prática pela API.

### P0.5 — Decisão sobre `/despacho` e o campo "grupo de motoboys"
Ver seção "Telas defasadas" acima — decisão de arquitetura pendente do Thales, não
urgente (não quebra nada hoje), mas o risco de conflito com a EE cresce conforme mais
pedidos passarem a ser geridos pela operadora.

### P1 — Gateway de pagamento definitivo
Contratar Dinelco/Asaas/similar → plugar pela porta (`docs/specs/gateway-pagamento.md`, ~1h).
Até lá o bot opera 100% dinheiro na entrega.

### P2 — Onboarding da frota real
Capturar `grupo_motoboys_id` dos 5 hubs + cadastrar 30–40 pilotos (skill `onboarding-frota`).
Validar formato real do payload de grupo da Z-API no primeiro teste (`[yapa:grupo-payload]`).

### P3 — Timeout/republicação de corrida sem resposta (dispatch v2)
Corrida não aceita em N min → reanunciar no grupo ou alertar admin (hoje: fallback manual /despacho).
**Nota (22/jul/2026):** este item descreve o mecanismo de leilão WhatsApp, hoje inerte
(ver "Telas defasadas") — reavaliar se ainda faz sentido ou se vira monitoramento do
lado Entregas Expressas (ex.: alertar se uma entrega EE ficar muito tempo em `PENDING`).

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
