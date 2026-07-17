# Spec/To-do: Integração Entregas Expressas (Open Delivery / ABRASEL)

> Documento vivo — checklist de implementação, não spec pós-fato como as demais.
> Status: **WIP, sandbox não testado ainda.** Substitui o dispatch de motoboys via
> WhatsApp (`docs/specs/dispatch-motoboys.md`) por logística terceirizada.

## Objetivo
Ao confirmar um pedido (pago online ou dinheiro na entrega), registrar a entrega
na Entregas Expressas via API Open Delivery em vez de anunciar a corrida no grupo
de motoboys. O ciclo de vida da entrega passa a ser dirigido pelos webhooks da
operadora (ACCEPTED → PICKUP_ONGOING → ORDER_PICKED → ... → ORDER_DELIVERED).

## Usuário alvo
Admin Yapa (configuração de credenciais + acompanhamento no painel). O
entregador não interage com o Yapa — é gerido inteiramente pela operadora.

## 🚧 Bloqueador prioritário — endereço estruturado sem CEP real no Paraguai
A API exige `pickupAddress`/`deliveryAddress` com `postalCode`, `street`,
`number`, `district`, `city`, `state` (ISO 3166-2) estruturados. Hoje:
- `yapa.clientes` só tem endereço em **texto livre** (`endereco`, `zona`,
  `referencia`) — sem rua/número/CEP separados.
- O Paraguai **não tem CEP amplamente adotado** como o Brasil — existe um
  código postal formal, mas cobertura/uso são fracos fora de Assunção. Ciudad
  del Este não tem uma malha de CEP confiável pra mapear bairro → código.
- `country`/`state` (`PY`/`PY-11`) usados no código são **placeholders não
  validados** — a doc da Entregas Expressas só documenta exemplos com `BR`.

**Isso precisa ser resolvido/confirmado ANTES de qualquer teste real em
sandbox**, porque sem saber o que a operadora aceita pra endereço fora do
Brasil, não dá pra saber se `POST /v1/logistics/delivery` vai ser aceito.

- [ ] Perguntar direto pra Entregas Expressas: eles atendem Paraguai? Se sim,
      qual formato esperam pra `postalCode`/`state`/`country` fora do Brasil?
- [ ] Se não atendem Paraguai — a integração inteira precisa ser repensada
      (nesse caso talvez o objetivo vire outro provedor, não este).
- [ ] Se atendem: decidir entre geocoding reverso (lat/long → endereço) ou
      captura estruturada no fluxo do bot (pedir rua/número/referência
      separados em vez de texto livre único).
- [ ] Mapear bairros de Ciudad del Este pra um valor de `district`/`state`
      consistente (mesmo sem CEP formal).

## Fluxo principal (como desenhado — não testado em sandbox ainda)
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

## Banco de dados (migration 017 — já escrita, não aplicada)
- `orgs`: `entregas_expressas_client_id/secret/merchant_id/webhook_secret/sandbox`
- `distribuidoras`: `endereco_bairro/rua/numero/cidade/estado/cep/pais` (estruturado)
- `entregas`: `provedor`, `provedor_delivery_id`, `provedor_order_id` (unique),
  `evento_externo` (novo enum `entrega_evento_externo`, 13 valores 1:1 com a
  operadora), `evento_externo_em`, `rejeicao_motivo`, `entregador_nome/telefone`,
  `tracking_url`, `preco_gs`
- `entregas_expressas_webhook_log`: dedupe por `(delivery_id, event_type, event_datetime)` UNIQUE + RLS por org
- [ ] Aplicar migration 017 via MCP Supabase (ainda não rodada)
- [ ] `npm run typecheck` — já limpo nesta sessão, reconfirmar após aplicar migration real

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
- [x] Migration 017 escrita (idempotente, `ADD COLUMN IF NOT EXISTS`)
- [x] Cliente HTTP com OAuth2 + cache de token
- [x] Webhook valida HMAC (timing-safe compare)
- [x] Webhook idempotente (dedupe por delivery_id+event_type+event_datetime)
- [x] `despacho.ts` migrado pra chamar a operadora em vez do grupo WhatsApp
- [x] Conversão GS→BRL usando taxa já configurável (`orgs.taxa_cambio_brl_gs`)
- [x] `npm run typecheck` e lint limpos
- [ ] **Endereço estruturado real (bloqueador acima) resolvido**
- [ ] Migration aplicada no Supabase de fato
- [ ] Teste end-to-end em sandbox (criar entrega + simular eventos no painel deles)
- [ ] Confirmar `country`/`state` aceitos pela operadora pra Paraguai
- [ ] UI de configuração de credenciais e endereço estruturado
- [ ] Textos de notificação ao cliente centralizados (hoje hardcoded em
      `entregas-expressas-eventos.ts`, inconsistente com `mensagens-motoboys.ts`)

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
