<!--
  ⚠️ ARQUIVO MORTO — NÃO É SPEC VIVA.
  Backup da edição local do SDD-MASTER.md (2026-07-14) que apostava no fornecedor
  "Pick n Go" para logística terceirizada. Descartado em 2026-07-17: o fornecedor
  confirmado é a Entregas Expressas (Open Delivery/ABRASEL). Mantido só por
  rastreabilidade histórica. NÃO referenciar em nenhum documento ativo.
-->

# SDD Master — Yapa Engine

> Documento vivo. Atualizar após cada ciclo de desenvolvimento.
> Última atualização: **2026-07-14** (auditoria completa do repositório) · **V3.0 + Yapa Partners + Dispatch de Motoboys (com código de confirmação de entrega) em produção.**
> Este arquivo é o ÍNDICE do estado do sistema; o detalhe de cada domínio vive nas specs abaixo.

**Resumo honesto do estado atual:** sistema em produção (`www.pediyapa.com`, Vercel + Supabase),
funcional de ponta a ponta no caminho "dinheiro na entrega": bot WhatsApp V3.0 → pedido → duplo
despacho → leilão de motoboys → entrega confirmada por código de 4 dígitos do cliente. **Pagamento
online está DESLIGADO** (nenhum gateway contratado ainda — Dinelco e dLocal em negociação paralela;
porta agnóstica pronta esperando contrato). **Dispatch de motoboys está em transição**: o módulo
manual atual (leilão via grupo de WhatsApp, P/E + código) será **substituído por completo** pelo
Pick n Go, sistema white-label de terceiro com geolocalização automatizada — ver §Pick n Go abaixo.
Build e typecheck passam limpos; **não existe nenhum teste automatizado** — a verificação é E2E
sintético em produção (skill `testar-bot`). Git limpo, sem segredo no histórico.

---

## ⚠️ Riscos críticos (auditoria 2026-07-14)

| # | Risco | Evidência | Ação |
|---|-------|-----------|------|
| 1 | **`next@16.2.4` com advisory HIGH** (bypass de middleware/proxy, cache poisoning, DoS — 13 advisories acumulados). O middleware é a única barreira de sessão do painel interno, então bypass de middleware é diretamente relevante. | `npm audit` (fix disponível: `next@16.2.10`, patch da mesma minor) | Onda 1 do backlog — upgrade + build + smoke. |
| 2 | **Zero testes automatizados.** Lógica de dinheiro (carrinho, frete, câmbio, confirmação idempotente de pagamento) só é verificada por E2E manual/sintético em produção. | nenhum arquivo de teste no repo; sem runner instalado | Onda 2 — vitest sobre `lib/intel/` e `lib/pagamentos/` (código puro, já testável por design). |
| 3 | **Paridade repo × banco NÃO verificada nesta auditoria** — o MCP do Supabase estava desconectado (advisors de security/performance também não rodaram). Última verificação conhecida: 2026-07-08 (migration 016 aplicada e confirmada). | seção "Não verificado" abaixo | Reautorizar o conector Supabase e rodar `get_advisors` + diff de schema. |
| 4 | **Webhook do WhatsApp aceita chamadas sem secret SE o secret não estiver configurado** (`if (secret && ...)` em `src/app/api/webhooks/whatsapp/route.ts:152-153`). Hoje há secret em produção, mas o fail-open é silencioso. | leitura de código | Onda 2 — falhar fechado (exigir secret configurado em produção). |
| 5 | **`db/rls.sql` desatualizado**: ainda habilita RLS na tabela `entregadores` (dropada na migration 014) e não contém as políticas de `motoboys`/`estoque_hub`/`contatos` (vivem nas migrations 004/011/012/013). Rodar `rls.sql` num banco novo quebraria. O risco é de **provisionamento/documentação**, não de produção. | `db/rls.sql:30,70` vs migrations | Onda 1 — regenerar `rls.sql` como consolidado. |

**Sem achado de segredo exposto:** nenhum `.env` real jamais commitado (histórico completo checado;
só `.env.example` com placeholders). Chaves só em env da Vercel. Service-role confinado a
`lib/supabase/admin.ts`.

---

## O que existe hoje (CONFIRMADO na auditoria)

### Git e qualidade
- Branch única `main`, sincronizada com `origin/main` (GitHub `PediYapa/yapa`), working tree limpo, sem stash, sem commit local não pushado, sem untracked relevante.
- `npm run build` ✅ (Next 16.2.4, App Router, 30+ rotas todas dinâmicas) · `tsc --noEmit` ✅ (exit 0, TS estrito).
- `npm audit`: 1 high (`next`, ver risco #1) + 1 moderate (`postcss` transitivo do next; resolve junto).

### Stack (confirmada no código, não de ouvido)
Next.js **16.2.4** App Router · React **19.2.4** · TypeScript 5 estrito · Tailwind v4 ·
Supabase (`@supabase/ssr`, schema `yapa`, RLS) · Z-API (WhatsApp não-oficial) · OpenAI `gpt-4o-mini`
(matcher WIP do hub) · Recharts · Zod v4 + react-hook-form.

### Autenticação e autorização (verificado camada por camada)
- **Cliente final: sem login** — pedido 100% via WhatsApp (`/api/webhooks/whatsapp` → engine puro `lib/intel/fluxo-engine.ts`). Confirmado: nenhuma rota de login/conta de cliente existe.
- **Painel interno: protegido de verdade**, não escondido — `src/middleware.ts` (sessão Supabase) + `guard(modulo, ação)` em toda Server Action (RBAC `owner|gerente|operador|hub` + `module_permissions` jsonb) + RLS por `org_id` no banco. Três camadas independentes.
- **API pública `/api/v1`**: Bearer token com hash (nunca texto puro no banco), escopos, expiração e revogação (`lib/auth/require-token.ts`).
- **Portal Hub `/hub`**: role `hub` isolada — `can()` nega tudo do painel interno; queries nunca selecionam preço (isolamento financeiro em dupla camada: RLS + código).

### Pagamento — ponto crítico (estado real)
- **NENHUM gateway ativo.** Nenhum contrato fechado ainda — **Dinelco e dLocal em negociação em paralelo** (dLocal havia bloqueado anteriormente por o cadastro estar como pessoa física; a formalização da Pedi Yapa E.A.S. remove esse bloqueio e reabre a via dLocal ao lado da Dinelco). Opt-in explícito via env `PAYMENT_GATEWAY` (ausente/`none` = desligado; sem auto-detecção por credencial — decisão deliberada, ver `lib/pagamentos/gateway.ts`). Bot opera 100% dinheiro na entrega.
- **Porta agnóstica pronta**: contrato `PaymentGateway` + `confirmacao.ts` compartilhada (idempotente: pedido `pago`/`em_separacao` não re-dispara despacho) + adapter dLocal na prateleira. Plugar Dinelco (ou confirmar dLocal) = 1 adapter + 1 rota fina (`docs/specs/gateway-pagamento.md`).
- **Webhook dLocal NÃO confia no payload** — padrão GET-confirm: consulta autoritativa `adapter.consultar(payment_id)` na API do gateway antes de marcar pago (`api/webhooks/dlocal/route.ts`). Webhook forjado não paga pedido.
- **Timeouts em toda chamada externa**: 12s/8s no adapter dLocal, `AbortSignal.timeout` na Z-API (convenção §5.10 do CLAUDE.md, nascida de bug real).
- Chaves: somente env (Vercel). `DLOCAL_WEBHOOK_SECRET` existe no `.env.example` mas **não é verificado na rota** — mitigado pelo GET-confirm; ao contratar o gateway definitivo, validar assinatura se o provedor oferecer.
- **Decisão pendente:** Dinelco vs. dLocal ainda não fechada; adapter dLocal já existe no repo, adapter Dinelco (se escolhida) precisa ser escrito do zero seguindo o mesmo contrato `PaymentGateway`.

### Dispatch de motoboys — EM TRANSIÇÃO para Pick n Go
- **Estado atual (produção, funcionando):** leilão manual via grupo de WhatsApp — corrida publicada, motoboy reivindica com `"P <n>"`, entrega confirmada com `"E <n> <código>"` (código de 4 dígitos informado pelo cliente na porta). Fallback manual em `/despacho` quando ninguém aceita no grupo. Documentado em `dispatch-motoboys.md`.
- **Decisão de produto (2026-07-14):** este módulo manual será **substituído por completo**, não estendido, pelo **Pick n Go** — sistema white-label de terceiro (ver proposta comercial anexa) com geolocalização automatizada dos motoboys, app próprio para entregadores, roteirização/GPS, despacho automático e por QR code, e mais de 25 integrações nativas (iFood, Rappi/dDelivery, Cardápio Web, Saipos, etc.).
- **Modelo comercial da proposta (Pick n Go / PicknGo):** licenciamento R$4.900 (até 6x) + White Label opcional +R$4.900 (até 6x), com 15% de desconto à vista. Cobrança recorrente por pedido, escalonada por volume: R$0,40/pedido até 5k/mês, caindo até R$0,25/pedido acima de 30k/mês. Prazos pós-contrato: treinamento em 1-7 dias, entrega do White Label Web em 1-2 dias, publicação do app White Label em 5-12 dias.
- **O que isso implica para o Yapa Engine:** as tabelas `rotas`/`gps_pings` hoje dormentes (Fase 2/3 do roadmap, item P5 do backlog) deixam de ser "roadmap distante" — a geolocalização real vem de fora, via integração com o Pick n Go, não de código próprio a construir. **Precisa de spec própria** (`docs/specs/picknGo-integracao.md`) definindo: como o pedido criado no Yapa Engine aciona o despacho no Pick n Go (webhook de saída), como o status de entrega/geolocalização volta pro CRM interno (webhook de entrada ou polling), e se o código de confirmação de 4 dígitos do fluxo atual é preservado ou substituído pelo mecanismo nativo do Pick n Go.
- **Não decidido ainda / a confirmar quando o contrato fechar:** qual API o Pick n Go expõe para integração (REST? webhook bidirecional?), se o white label do app de entregadores substitui o grupo de WhatsApp dos motoboys, e o cronograma de corte (big-bang ou paralelo por um período).

### Banco (repo)
`db/schema.sql` (base histórica) + `db/rls.sql` + **16 migrations versionadas** (001–016).
RLS habilitado em todas as tabelas ativas — incluindo `motoboys` (013) e `estoque_hub` (011/012),
verificado migration a migration. Migration 016 instituiu `ALTER DEFAULT PRIVILEGES` (grants
automáticos para objetos futuros — encerrou a classe de bug das migrations 015/016).
**Fonte da verdade do schema: `db/migrations/` em ordem** (schema.sql não reflete 010+).

### Jornada do cliente (V3.0 — autônoma, sem handoff)
```
"oi" → gate de idade → PIN de localização (geofence PRIMEIRO; fora do raio = reset)
→ frete por faixa de km → endereço escrito → nome → menu 5 categorias
→ produto (caixa/unidade, sabores) → quantidade → mais itens? → Factura Legal (RUC)
→ pagamento: Dinheiro na Entrega (ativo) | Online (porta de gateway — HOJE indisponível)
→ pedido criado (produtos + taxa_entrega_gs separados) → cliente recebe CÓDIGO de 4 dígitos
→ duplo despacho: comanda → distribuidora  E  corrida → grupo de motoboys ("P <n>" reivindica)
  [EM TRANSIÇÃO: corrida vai passar a ser despachada via Pick n Go, não mais grupo de WhatsApp]
→ "E <n> <código>" do motoboy (código informado pelo cliente na porta) = entregue + notificação
```

### Superfícies
- **Bot WhatsApp** (Z-API): engine puro em `lib/intel/`; webhook separa grupo × cliente.
- **CRM interno** `/dashboard`: pedidos, atendimento, distribuidoras, motoboys, catálogo, faturas (RUC/CSV), financeiro, fluxos (builder React Flow), usuários, tokens.
- **Yapa Partners** `/hub`: estoque físico por distribuidora, WIP com IA, importação CSV.
- **Fallback manual** `/despacho`: atribuir motoboy quando ninguém aceita no grupo. *(Candidato a desativação quando Pick n Go entrar — a confirmar.)*

## Specs por domínio (fonte de detalhe)

| Spec | Domínio |
|------|---------|
| `bot-v3-fluxo-inteligente.md` | Funil V3.0: geofence antecipado, Factura Legal/RUC, checkout autônomo |
| `gateway-pagamento.md` | **Porta agnóstica de pagamento** (nenhum gateway contratado; Dinelco e dLocal em negociação paralela) |
| `dlocal-integracao.md` | Conhecimento da API dLocal Go (adapter na prateleira) + bugs históricos |
| `yapa-partners-hub.md` | Portal B2B `/hub` de estoque dos distribuidores (motor WIP + CSV) |
| `dispatch-motoboys.md` | Leilão de corridas via WhatsApp (P/E + código de confirmação, claim atômico, frete) — **em descontinuação, ver Pick n Go** |
| `picknGo-integracao.md` | **NOVA — a escrever.** Integração com o white label Pick n Go para dispatch/geolocalização automatizada, substituindo `dispatch-motoboys.md` |
| `identidade-visual.md` | Marca PediYapa (#FFCC00 + preto) |

---

## O que NÃO existe / NÃO foi verificado

- **Testes automatizados**: não existem (nenhum runner instalado). Verificação atual = `testar-bot` (E2E sintético contra produção) + typecheck/build.
- **Paridade migrations × banco de produção**: não verificável nesta auditoria (MCP Supabase desconectado). Estado conhecido em 2026-07-08: 001–016 aplicadas e confirmadas.
- **Advisors Supabase (security/performance)**: não rodaram nesta auditoria — pendente de reconexão do MCP.
- **Gateway de pagamento ativo**: não existe (por decisão de negócio — contrato ainda não fechado, Dinelco/dLocal em negociação).
- **Integração Pick n Go**: não existe nenhum código ainda — é decisão de produto tomada em 2026-07-14, integração não iniciada.
- **Rastreamento GPS / despacho por proximidade próprios**: tabelas `rotas`/`gps_pings` existem dormentes (Fase 2/3), sem código ativo — **provavelmente descontinuadas em favor do Pick n Go**, a confirmar quando a integração for especificada.
- **CI/CD com gate de qualidade**: deploy é GitHub → Vercel direto, sem pipeline de teste (não há testes para rodar).

---

## Backlog em ondas (dos gaps reais da auditoria)

### Onda 1 — zero risco de produto, fazer já
1. **Upgrade `next` 16.2.4 → 16.2.10** (mata o audit high + moderate) + typecheck/build/smoke.
2. **Regenerar `db/rls.sql`** como consolidado real (remover `entregadores`, incorporar políticas de motoboys/estoque_hub/contatos das migrations).
3. Reautorizar MCP Supabase → rodar advisors + diff schema repo × produção.

### Onda 2 — qualidade e endurecimento (sem migration, sem dinheiro)
4. **Vitest em `lib/intel/` e `lib/pagamentos/`** (matemática do carrinho, frete, câmbio, idempotência de confirmação — tudo já é código puro).
5. **Fail-closed no secret do webhook WhatsApp** (secret ausente em produção = 500 explícito, não aceitação silenciosa).

### Onda 3 — envolve dinheiro/contrato (bloqueada por decisão de negócio)
6. **P1 — Gateway definitivo**: fechar entre Dinelco e dLocal (negociação em paralelo) e plugar pela porta (~1h de código; validar assinatura de webhook do provedor se houver).
7. **P2 — Onboarding da frota real**: `grupo_motoboys_id` dos 5 hubs + 30–40 pilotos (skill `onboarding-frota`) — **avaliar se ainda faz sentido dado o Pick n Go**, já que o app white label de entregadores pode substituir esse onboarding manual.

### Onda 4 — evolução do produto
8. **P3 — Integração Pick n Go** (nova prioridade, substitui os itens de GPS/dispatch abaixo): escrever spec `picknGo-integracao.md`, mapear API de integração, decidir corte big-bang vs. paralelo, migrar `dispatch-motoboys.md` para o novo fluxo.
9. **P4 — Quebra de pedido** (item em falta → substituição → reprecificar; status `quebra` já existe).
10. ~~**P5 — GPS/Fase 3**: despacho por proximidade (`lib/intel/roteamento.ts`, Haversine)~~ — **provavelmente superado pelo Pick n Go**; manter código dormente até a integração ser especificada, então decidir remover ou arquivar.

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
- Novas tabelas ou colunas? Migration necessária?
  (grants de objetos novos são automáticos desde a 016 — mas RLS + policy continuam manuais!)

## Dinheiro
- Toca em valor, frete, câmbio ou gateway? Se sim: qual coluna, quem vê, e o que
  acontece em falha/duplicidade (idempotência)?

## Fiscal (Factura Legal PY)
- Afeta RUC/CI, `precisa_fatura` ou export de faturas?

## Integrações
- Z-API (envio/recebimento novo)? Gateway (SEMPRE via porta `lib/pagamentos/`)? Pick n Go (dispatch/geo)? OpenAI?

## Critérios de aceite
- [ ] ...

## Fora do escopo
- ...
```
