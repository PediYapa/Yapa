# Spec/To-do: Integração Entregas Expressas (Open Delivery / ABRASEL)

> Documento vivo — checklist de implementação, não spec pós-fato como as demais.
> Status: **✅ Validado end-to-end em sandbox (22/jul/2026).** Substitui o dispatch de
> motoboys via WhatsApp (`docs/specs/dispatch-motoboys.md`, hoje parcialmente
> descontinuado) por logística terceirizada. App "Pedi Yapa open" enviado para
> review/homologação da operadora — aguardando aprovação + credenciais de
> **produção** (sandbox segue ativo, env vars só em Preview/Development na Vercel).

## Objetivo
Ao confirmar um pedido (pago online ou dinheiro na entrega), registrar a entrega
na Entregas Expressas via API Open Delivery em vez de anunciar a corrida no grupo
de motoboys. O ciclo de vida da entrega passa a ser dirigido pelos webhooks da
operadora (ACCEPTED → PICKUP_ONGOING → ORDER_PICKED → ... → ORDER_DELIVERED).

## Usuário alvo
Admin Yapa (configuração de credenciais + acompanhamento no painel). O
entregador não interage com o Yapa — é gerido inteiramente pela operadora.

## ✅ Bloqueador prioritário (RESOLVIDO) — endereço estruturado sem CEP real no Paraguai
~~A API exige endereço estruturado; Paraguai não tem CEP confiável~~ — **confirmado
por teste real em sandbox (pedidos #46 e #47, 21/jul/2026):** `country: "PY"`,
`state: "PY-11"` (placeholder Alto Paraná), `postalCode` fallback e endereço em texto
único (`street`) foram **aceitos pela API sem erro de validação** em ambos os
pedidos. A operadora nunca rejeitou por formato de endereço — o cancelamento do
pedido #46 foi por `REGION_NOT_SERVED` (cobertura/raio da conta sandbox), não por
endereço malformado. O pedido #47, com as mesmas convenções de endereço mas
coordenadas reais dentro da cobertura, foi aceito, coletado e entregue de ponta a
ponta.

- [x] Entregas Expressas atende Paraguai — confirmado empiricamente
- [x] `country="PY"`/`state="PY-11"` são aceitos pela API (sem validação rígida
      contra uma lista fechada de estados, ao que tudo indica)
- [ ] Refinamento de qualidade de dado (não bloqueia funcionamento): mapear bairros
      reais de Ciudad del Este pra `district` de forma mais fiel — hoje cai no
      fallback de zona/endereço livre (`montarEnderecoFallback` em `lib/despacho.ts`)

## Decisões fechadas (21/jul/2026)
- **Open Delivery, não Full.** O app "Full" só existiu no painel deles pra
  comparação — nunca foi implementado no código. App ativo: "Pedi Yapa open"
  (`app_id app_pn4tur03yzk8crke`).
- **Moeda confirmada como Guarani a nível de conta** — falta só travar o código
  exato do campo `currency` a usar em produção. Hoje o sandbox envia sempre
  `currency: "BRL"` (conversão via `orgs.taxa_cambio_brl_gs`, ver `gsParaBrl` em
  `lib/despacho.ts`); precisa confirmar com a operadora se a conta de produção
  aceita `"GS"`/`"PYG"` diretamente ou se mantém a conversão para BRL.

## Fluxo principal (validado end-to-end em sandbox, 21-22/jul/2026)
1. Pedido confirmado (pago/dinheiro) → `dispararOrdemDistribuidora` (`lib/despacho.ts`)
2. Monta `pickupAddress` (a partir de `distribuidoras.endereco_*`, novos campos
   estruturados da migration 017) e `deliveryAddress` (fallback do cliente —
   ver bloqueador acima)
3. Converte `valor_total_gs` + `taxa_entrega_gs` pra BRL via `orgs.taxa_cambio_brl_gs`
   (API só aceita `currency: "BRL"`)
4. `POST /v1/logistics/delivery` (`criarEntrega` em `lib/integrations/entregas-expressas.ts`)
   → grava `entregas.provedor_order_id`/`provedor_delivery_id`, status `aguardando`
5. Pedido vai pra `em_separacao` (igual ao fluxo antigo)
6. Webhooks (`/api/webhooks/entregas-expressas`) atualizam `entregas.evento_externo`
   (granularidade fina) e avançam `pedidos.status` quando a transição é válida
   (`PEDIDO_TRANSICOES` em `lib/intel/status.ts`)
7. Cliente é notificado por WhatsApp em marcos-chave (ACCEPTED, ORDER_PICKED,
   ARRIVED_AT_CUSTOMER, ORDER_DELIVERED) — texto ainda em `entregas-expressas-eventos.ts`,
   não centralizado em `mensagens-motoboys.ts` como o resto (ver pendências)

## Banco de dados (migration 017 — aplicada)
- `orgs`: `entregas_expressas_client_id/secret/merchant_id/webhook_secret/sandbox`
- `distribuidoras`: `endereco_bairro/rua/numero/cidade/estado/cep/pais` (estruturado)
- `entregas`: `provedor`, `provedor_delivery_id`, `provedor_order_id` (unique),
  `evento_externo` (novo enum `entrega_evento_externo`, 13 valores 1:1 com a
  operadora), `evento_externo_em`, `rejeicao_motivo`, `entregador_nome/telefone`,
  `tracking_url`, `preco_gs`
- `entregas_expressas_webhook_log`: dedupe por `(delivery_id, event_type, event_datetime)` UNIQUE + RLS por org
- [x] Aplicar migration 017 via MCP Supabase
- [x] `npm run typecheck` — limpo

### Migrations de acompanhamento (018-020)
- **018**: fix de drift — DEFAULT de `distribuidoras.endereco_pais` de `'BR'` para `'PY'`
- **019**: fix de drift — `orgs.taxa_cambio_brl_gs` (efeito da migration 002, nunca
  aplicada neste projeto Supabase — descoberto na reauditoria pré-teste end-to-end)
- **020**: `entregas.entregador_provedor_id`/`entregador_foto_url` (persistidos a
  partir de `deliveryPerson.id`/`pictureURL` do webhook) + `yapa.entregas` na
  publicação `supabase_realtime` — suportam o espelho `/motoboys` e o status em
  tempo real de `/pedidos`

## Integrações
- `lib/integrations/entregas-expressas.ts`: OAuth2 client_credentials (cache
  de token 24h em memória, por client_id), `criarEntrega`, `simularEntrega`,
  `cancelarEntrega`, `marcarProntoParaColeta`, `consultarEntrega`
- `lib/integrations/entregas-expressas-eventos.ts`: tradução evento → status,
  idempotência via log de dedupe
- `app/api/webhooks/entregas-expressas/route.ts`: valida HMAC-SHA256
  (`X-App-Signature`, chave = `client_secret`) contra a org resolvida por
  `X-App-MerchantId`; responde 204 sempre (mesmo em erro de processamento,
  pra não entrar em loop de retry por bug nosso)

## Painel admin
- [ ] Tela de configuração das credenciais (`entregas_expressas_client_id/secret`)
      — hoje só existe coluna no banco, sem UI em `/configuracoes`
- [ ] Campo de endereço estruturado no cadastro de distribuidora (hoje só
      `endereco` texto livre na UI, mesmo com colunas novas no banco)
- [ ] Exibir `evento_externo` (granularidade fina) no detalhe do pedido —
      hoje só `entregas.status` (macro) aparece em `/pedidos/[id]`
- [ ] Decidir sobre fallback manual: se REJECTED/CANCELLED, hoje só marca
      `quebra` — sem ação automática de reroteamento pro WhatsApp (decisão
      consciente: ver "Fora do escopo")

## Credenciais (bloqueador paralelo, não-técnico)
- [ ] Confirmar se já existe client_id/secret de sandbox (usuário ia verificar
      no painel deles: https://developer.entregasexpressas.com.br/painel)
- [ ] Testar o par sandbox com `POST /oauth/token` assim que disponível

## Critérios de aceite
- [x] Migration 017 escrita (idempotente, `ADD COLUMN IF NOT EXISTS`) e **aplicada**
- [x] Cliente HTTP com OAuth2 + cache de token — validado contra sandbox real (200,
      bearer 64 chars, `expires_in: 86400`)
- [x] Webhook valida HMAC (timing-safe compare) — validado com eventos reais
- [x] Webhook idempotente (dedupe por delivery_id+event_type+event_datetime)
- [x] `despacho.ts` migrado pra chamar a operadora em vez do grupo WhatsApp
- [x] Conversão GS→BRL usando taxa já configurável (`orgs.taxa_cambio_brl_gs`)
- [x] `npm run typecheck` e lint limpos
- [x] **Endereço estruturado real (bloqueador acima) resolvido** — `country`/`state`
      aceitos empiricamente, sem necessidade de CEP real
- [x] Migration aplicada no Supabase de fato (017, seguida de 018/019 — fixes de
      drift — e 020, ver abaixo)
- [x] Teste end-to-end em sandbox: pedido criado PELO Yapa via
      `dispararOrdemDistribuidora` → aceito no app do motoboy → coletado → entregue,
      confirmado no app E no banco (6 webhooks processados, HMAC ok,
      `pedidos.status=entregue`)
- [x] Confirmar `country`/`state` aceitos pela operadora pra Paraguai
- [x] Motoboys espelho histórico (`/motoboys`, migration 020: `entregador_provedor_id`/
      `entregador_foto_url`) e status em tempo real (`/pedidos`, Supabase Realtime em
      `yapa.entregas`) — entregues em produção (22/jul/2026)
- [ ] Homologação da operadora + credenciais de **produção** (bloqueador atual, não-técnico)
- [ ] UI de configuração de credenciais e endereço estruturado (hoje via SQL/env,
      sem tela em `/configuracoes`)
- [ ] Textos de notificação ao cliente centralizados (hoje hardcoded em
      `entregas-expressas-eventos.ts`, inconsistente com `mensagens-motoboys.ts`)

## Checklist pós-credenciais de produção (próxima sessão)
Quando a operadora aprovar o app e as credenciais de produção chegarem, reconfirmar
cada item abaixo ANTES de religar em produção (env vars saem de Preview/Development
pra Production):
- [ ] **Moeda** — código exato do campo `currency` que a conta de produção espera
      (`"BRL"` com conversão, ou `"GS"`/`"PYG"` nativo)
- [ ] **Endereço/país** — reconfirmar `country`/`state` aceitos fora do sandbox (não
      assumir que o comportamento de teste se repete 1:1 em produção)
- [ ] **Credenciais por org** — `entregas_expressas_client_id/secret/merchant_id`
      preenchidos na tabela `orgs` (não só env var de fallback)
- [ ] **Cadastro de motoboy** — confirmar que a frota real está aprovada/ativa na
      conta de produção da operadora (distinto da conta sandbox usada no teste)
- [ ] **Forma de cobrança** — como a operadora fatura o Yapa em produção (por
      entrega, mensalidade, etc.) — não coberto pela integração técnica
- [ ] **Cobertura por região** — validar o raio real de atendimento em Ciudad del
      Este antes de anunciar a feature como "sempre disponível" (o sandbox mostrou
      que fora do raio a entrega é cancelada com `REGION_NOT_SERVED`)

## Fora do escopo (por ora)
- Fallback automático pro WhatsApp/grupo de motoboys quando a operadora
  rejeita/cancela — decisão explícita de não reroutear automaticamente;
  pedido cai em `quebra` pra tratamento manual
- Timeout/republicação — não se aplica (a operadora já faz retry do webhook)
- Simular entrega (`simularEntrega`/`/availability`) no checkout do bot antes
  da confirmação — cliente já escrito, não integrado ao funil do bot ainda
- Multi-provedor simultâneo (Entregas Expressas + WhatsApp rodando em paralelo)

## Pendências de validação em produção
- Peso dos produtos: catálogo não tem peso por item; `despacho.ts` usa
  estimativa fixa (`Math.max(1000, itens.length * 3000)` gramas) até existir
  peso real por produto
- `vehicle.type`/`container`: fixo em `MOTORBIKE_BAG`/`THERMIC`/`MEDIUM` —
  não parametrizado por tipo de pedido/distribuidora ainda
