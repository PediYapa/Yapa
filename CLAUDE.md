# CLAUDE.md — Yapa

> Guia operacional do Claude Code neste repositório.
> Produção: `www.pediyapa.com` (Vercel). Supabase: `ahhrhyuduhwkuegocjbb`. Thales é o dono.

---

## 1. O que é o Yapa

Plataforma de delivery de bebidas em **Ciudad del Este (PY)**.

**Jornada completa V3.0 (validada em produção):**
Cliente manda "oi" → bot conversa:
1. **Geofencing antecipado** — solicita PIN de localização → fora do raio: aborta e reseta sessão completamente
2. **Endereço escrito** — captura texto livre do endereço
3. **Nome** — captura nome do cliente
4. **Menu → produto → formato/sabor → quantidade → mais itens?**
5. **Factura Legal** — botão Sim/Não (`precisa_fatura`)
6. **RUC/CI** — captura só se respondeu Sim (nó `f-ruc`)
7. **Checkout autônomo** — bot gera link dLocal e envia diretamente (sem handoff humano)
8. **Confirmação de pagamento** → notifica cliente por WhatsApp e move pedido para `em_separacao`

Gestão interna: pedidos, atendimento, distribuidoras, entregadores, catálogo, financeiro, faturas, fluxos do bot.

**Yapa Partners:** portal B2B em `/hub` para distribuidores parceiros gerenciarem estoque físico (quantidade de caixas). Sem acesso a dados financeiros.

---

## 2. Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 16 App Router, React 19, TypeScript estrito |
| Estilo | Tailwind v4 |
| Banco | Supabase Postgres + Auth + RLS, schema `yapa`, via `@supabase/ssr` |
| MCP Supabase | Acesso direto ao banco via MCP (aplicar migrations, SQL, advisors) |
| Deploy | Vercel (`www.pediyapa.com`) — auto-deploy via GitHub; fallback: `npx vercel --prod` |
| Gráficos | recharts |
| Ícones | lucide-react |
| Validação | zod + react-hook-form |
| Bot WhatsApp | Z-API (não-oficial) |
| Pagamentos | dLocal Go API (GS + PIX aberto — sem `country` no payload) |
| IA | OpenAI `gpt-4o-mini` — motor WIP de estoque + fallback de intenção do bot |
| Geo | PostGIS: extensões `cube` + `earthdistance`, RPC `yapa.match_distribuidora` |

---

## 3. Arquitetura

### Superfícies
- **UI interna** — Server Components + Server Actions (`src/app/actions/`), sessão Supabase + RLS.
- **Portal Hub** — `/hub/*`, role `hub`, isolamento financeiro total.
- **Webhooks** — `/api/webhooks/whatsapp` (Z-API inbound), `/api/webhooks/dlocal` (confirmação de pagamento GET-confirm).
- **API pública** — `/api/v1/*`, Bearer token (`requireToken`).
- **API Hub** — `/api/hub/wip` (produto único WIP), `/api/hub/import-csv` (importação em lote).

### Motor do bot (`src/lib/intel/`) — PURO, sem I/O, testável
| Arquivo | Responsabilidade |
|---------|-----------------|
| `fluxo-engine.ts` | Executa o grafo de nós; retorna envios, contexto_patch, adicionar_carrinho |
| `fluxo-entidades.ts` | Consulta banco e monta listas de produto/hub/entregador |
| `sessao-whatsapp.ts` | Persistência do carrinho em `sessoes_whatsapp` |
| `cambio.ts` | Conversão GS/BRL |

### Auth
Supabase Auth + `src/middleware.ts`. RBAC: `user_profiles.role` (`owner|gerente|operador|hub`) + `module_permissions` (jsonb).
- `can()` em `lib/auth/permissions.ts` — role `hub` retorna `false` para tudo (portal separado).
- `guardHub()` em `lib/auth/hub-guard.ts` — portão do `/hub`, resolve `distribuidora_id` ativa.

### RLS
Isolamento por `org_id` — `db/rls.sql`. Política macro `{tabela}_all_same_org`.
- `estoque_hub`: parceiros hub veem só a própria distribuidora; owners/gerentes veem todas (migration 012).
- Helpers: `current_org_id()`, `is_manager()`, `current_distribuidora_id()`.

### Isolamento financeiro no portal Hub
Dupla camada: RLS em `estoque_hub` + queries da UI **nunca selecionam** `preco_gs`. Só `id` e `nome` de produtos trafegam para o cliente hub.

---

## 4. Estrutura de pastas

```
db/
  schema.sql           ← fonte de verdade do banco
  rls.sql              ← Row Level Security
  seed.sql             ← dados de demo
  migrations/
    001–012_*.sql      ← todas aplicadas em produção

src/
  middleware.ts        ← roteamento por role (hub → /hub/dashboard, etc.)
  app/
    page.tsx           ← landing page pública (dark + hero amarelo)
    login/             ← login único (middleware redireciona por role)
    (app)/             ← dashboard interno (admin/gerente/operador)
      dashboard/       ← KPIs + card de acesso rápido ao hub
      pedidos/         ← inclui colunas RUC/CI e precisa_fatura
      faturas/         ← pedidos com fatura legal, export CSV
      clientes/        ← inclui coluna RUC/CI
      usuarios/        ← inclui papel 'hub (parceiro)'
      ...
    hub/               ← portal Yapa Partners
      layout.tsx       ← dark mode, Amarelo Yapa, mobile-first
      dashboard/       ← estoque por distribuidora, WIP motor, CSV import
    actions/
      hub.ts           ← atualizarQuantidadeEstoque, removerEstoque
    api/
      hub/
        wip/           ← POST — adicionar produto único via IA
        import-csv/    ← POST — importação em lote CSV + IA (maxDuration 60s)
      webhooks/
        whatsapp/      ← motor do bot V3.0
        dlocal/        ← GET-confirm pattern (segurança anti-falsificação)
  lib/
    supabase/{server,admin,client}.ts
    auth/{guard,permissions,session,hub-guard}.ts
    intel/             ← motor puro do bot
    hub/
      wip-matcher.ts   ← casamento determinístico + OpenAI em lote
    dlocal.ts          ← createPaymentLink (sem country), getPayment, AbortSignal.timeout
    despacho.ts        ← notifica cliente WhatsApp ao confirmar pagamento
    database.types.ts
    format.ts          ← gs(), brl(), dataBR(), telBR()
  components/{ui,layout}/

docs/specs/            ← specs SDD de cada funcionalidade (ver §10)
```

---

## 5. Convenções (seguir SEMPRE)

1. **Módulo isolado:** cada módulo = pasta `app/(app)/<modulo>/` + `app/actions/<modulo>.ts`.
2. **Server Actions:** `"use server"` → `guard(modulo, "write")` → `safeParse` zod → mutação → `revalidatePath`. **Nunca `parse`** — oculta o erro real.
3. **Leituras:** Server Components + `guard(modulo, "read")`, sempre `.is("deleted_at", null)` + `.limit(1)` em buscas por unicidade.
4. **org_id:** nunca do input — sempre `profile.org_id` (UI) ou token (API).
5. **Dinheiro:** tudo em **Guarani (GS)**; Pix converte via `cambio.ts`; formatar via `format.ts`. Hub nunca vê preço.
6. **Segredos:** service-role só em `lib/supabase/admin.ts`. `.env*` nunca commitado.
7. **Idioma:** pt-BR em toda a UI interna; es em landing page pública.
8. **Migrations:** usar `mcp__claude_ai_Supabase__apply_migration` (DDL) e `execute_sql` (DML/queries). Sempre testar antes de aplicar.
9. **Deploy:** GitHub push → Vercel auto-deploy. Se não disparar: `npx vercel --prod` na raiz do projeto.
10. **Fetch externo:** sempre `AbortSignal.timeout(ms)` — sem timeout o webhook Z-API cai (Status 0).
11. **OpenAI no hub:** fetch nativo (sem `@ai-sdk`), `response_format: json_object`, temperatura 0.

---

## 6. Identidade visual

- **Cor primária:** Amarelo Yapa `#FFCC00` → `oklch(0.88 0.19 97)` com foreground preto `oklch(0.13 0 0)`.
- **Dark mode base:** `neutral-950` / `neutral-900` / `neutral-800`.
- **Tipografia:** Inter (sans) + Fraunces (display/serif para headings especiais).
- **Landing page:** hero com fundo `#FFCC00`, texto preto bold; restante dark.
- **Login:** painel esquerdo amarelo + preto; formulário em `neutral-950`.
- **Portal Hub:** 100% dark (`bg-neutral-950`), acentos em `#FFCC00`.
- **Dashboard interno:** dark mode via cookie `yapa_theme=dark`.

---

## 7. Conhecimento crítico do Z-API

### Tipos de mensagem recebida (detectar pelo CAMPO, não pelo `type`)

| Mensagem | Campo no body | Chaves corretas |
|----------|--------------|----------------|
| Botão clicado | `body.buttonsResponseMessage` | `.buttonId` (ID) + `.message` (label) |
| Voto de enquete | `body.pollVote` | `.options[0].name` |
| Localização (PIN) | `body.location` | `.latitude`, `.longitude`, `.address` |
| Texto livre | `body.text` (objeto) | `.text.message` ou `body.message` |

O Z-API sempre envia `type: "ReceivedCallback"` — **nunca use o type como discriminador**.

### Envio de mensagens

| Endpoint | Payload |
|----------|---------|
| `send-text` | `{ phone, message }` |
| `send-button-list` | `{ phone, message, buttonList: { buttons: [{id, label}] } }` — máx. 3 botões |
| `send-poll` | `{ phone, message, poll: [{name}], pollMaxOptions: 1 }` — máx. 12 opções |
| `send-image` | `{ phone, image, caption? }` |

**Regra automática do webhook:** `botoes.length > 3` → envia como `send-poll` com fallback texto numerado se poll falhar.

**IDs de botão:** ≤ 20 chars (WhatsApp trunca). Usar `btn-${uuid.split('-')[0]}` (~12 chars).

---

## 8. Motor do bot — estado e fluxo de dados

### Fonte de verdade do estado
- **`conversas.fluxo_estado`** (JSONB) — posição no fluxo + contexto intermediário:
  ```json
  {
    "fluxo_id": "...",
    "no_atual": "f-menu",
    "atualizado_em": "...",
    "contexto": {
      "item_pendente": { "produto_id": "...", "nome": "Pod Black Sheep", "preco_gs": 90000 },
      "formato": "Caixa",
      "aguardando_sabor": true,
      "distribuidora_id": "...",
      "latitude": -25.52,
      "longitude": -54.61,
      "nome": "Thales",
      "precisa_fatura": "sim",
      "ruc": "9373240-6"
    }
  }
  ```
- **`sessoes_whatsapp.carrinho`** — array de `CarrinhoItem` acumulado.

### Palavras de reinício automático
"oi", "olá", "menu", "reiniciar", "comecar", "hey", "hi" — engine ignora `fluxo_estado` e começa do nó de início.

### Geofencing (V3.0)
Ocorre **antes** do menu. Fora do raio → reseta sessão **completamente** (`carrinho = []`, `contexto = {}`, `novoNoAtual = null`) e envia mensagem de área não coberta.

### Reset manual no banco
```sql
UPDATE yapa.conversas SET fluxo_estado = NULL WHERE telefone = '595...';
DELETE FROM yapa.sessoes_whatsapp WHERE telefone = '595...';
```

### Tipos de nó do builder (React Flow)

| Tipo | Comportamento |
|------|--------------|
| `inicio` | Entrada, não emite |
| `texto` | Emite e avança (V3.0: `f-checkout` é `texto`, não `humano`) |
| `imagem` | Emite e avança |
| `botoes` | Emite e **pausa**. Com `salvar_em_contexto`: salva label no contexto |
| `produto` | Entidade dinâmica: pausa, lista produtos por `categoria`. Com `pede_quantidade: true` |
| `captura` | Pausa e aguarda texto livre. `variavel="quantidade"` finaliza carrinho |
| `location_capture` | Pausa e aguarda PIN ou endereço digitado |
| `humano` | Aciona handoff — **NÃO usar em f-checkout** (V3.0 é autônomo) |

### Funil dinâmico de sabor (pods)
Quando produto tem `opcoes_variacao`, webhook injeta etapa virtual via `contexto.aguardando_sabor = true`.

### Matemática do carrinho
`calcularSubtotal(precoUnit, precoCaixa, formato, qtd)`:
- `formato === "Caixa"` e `precoCaixa > 0` → `precoCaixa × qtd`
- Caso contrário → `precoUnit × qtd`

---

## 9. Integração dLocal

- **Endpoint:** `https://api.dlocalgo.com` (validado por regex; env var inválida cai no default).
- **Payload `createPaymentLink`:** sem `country` → gera "link abierto" (PIX aparece para clientes BR).
- **Timeout:** `AbortSignal.timeout(12000)` para criar, `8000` para consultar.
- **Webhook de confirmação:** pattern GET-confirm (bot consulta a API dLocal via `getPayment` para validar, não confia no payload do webhook).
- **Campos no pedido:** `gateway_id` (string do link), `gateway_status` (string do status dLocal).
- **Ao confirmar pagamento (PAID):** `despacho.ts` move pedido para `em_separacao` + notifica cliente por WhatsApp.

---

## 10. Geo-routing

RPC `yapa.match_distribuidora(user_lat, user_lng)`:
- Usa `earthdistance` (extensões `cube` + `earthdistance` ativas no Supabase).
- Retorna `uuid` da distribuidora mais próxima cujo raio cobre o ponto, ou `null` se fora de cobertura.
- Migration: `db/migrations/008_geo_match_distribuidora.sql`.

---

## 11. Yapa Partners (portal Hub)

### Conceito
15 distribuidores parceiros gerenciam **apenas quantidade física de caixas** no portal `/hub`. Zero dados financeiros.

### Acesso
- Role `hub` no `user_profiles.role`.
- `distribuidora_id` no `user_profiles.distribuidora_id` vincula o parceiro.
- Login único (`/login`) → middleware redireciona para `/hub/dashboard`.
- Admin pode supervisionar qualquer hub via `?hub=<distribuidora_id>`.

### Criar parceiro (manual)
1. Supabase Auth → criar usuário com e-mail/senha.
2. SQL:
```sql
UPDATE yapa.user_profiles
SET role = 'hub', distribuidora_id = '<uuid>'
WHERE id = '<auth_user_id>';
```

### Motor WIP
- `src/lib/hub/wip-matcher.ts` — casamento nome sujo → `produto_id` do catálogo.
- Estratégia: determinístico (token overlap ≥ 0.34) + OpenAI `gpt-4o-mini` como árbitro.
- `casarLoteWip()`: lote inteiro em **uma chamada** à IA (máx. 500 linhas, timeout 25s).
- `parseQuantidade()`: converte "50 caixas", "1.200", "12un" → inteiro.

### CSV Import
- Rota: `POST /api/hub/import-csv` (`maxDuration = 60`).
- Parser nativo (sem dependência): detecta delimitador (`;`,`,`,tab), header por keyword, quote-aware.
- UPSERT com sobrescrever: conflito `(distribuidora_id, produto_id)` → atualiza quantidade.

---

## 11B. Dispatch de Motoboys (grupos de WhatsApp)

### Conceito
Cada distribuidora tem um grupo de motoboys na Z-API (`distribuidoras.grupo_motoboys_id`). Na confirmação do pedido (pago online OU dinheiro), `lib/despacho.ts` dispara **em paralelo** (Promise.allSettled) a comanda para a distribuidora e o anúncio da corrida para o grupo. O 1º motoboy que responder `P <numero_corrida>` reivindica; `E <numero_corrida>` confirma a entrega.

### Regras críticas
- **Claim atômico:** um único UPDATE condicional (`motoboy_id IS NULL AND status_entrega='aguardando_motoboy'` + RETURNING) — nunca SELECT antes. Testado: 2 claims simultâneos → exatamente 1 vence.
- **Privacidade:** nome/telefone/PIN do cliente só no DM do vencedor — NUNCA no grupo.
- **Grupos nunca entram no engine do cliente:** branch no início do webhook (`isGroup`/`participantPhone`/sufixo `-group`/`@g.us`) → `grupo-motoboys.ts`. Mensagens que não são `P <n>`/`E <n>` são ignoradas em silêncio.
- **ID de grupo não sanitiza:** `notificarGrupoMotoboys` envia o ID cru (sufixos não-numéricos); `replace(/\D/g)` destruiria.
- **Frete separado:** `taxa_entrega_gs`/`distancia_km` fora de `valor_total_gs`. Faixas em `lib/frete.ts` (até 2 km 10k · 2–5 15k · 5–8 20k · >8 = fora de cobertura). Calculado logo após o PIN + match_distribuidora.
- **Textos:** todos em `src/lib/mensagens-motoboys.ts` (ajustar copy sem tocar em lógica).
- **status_entrega:** `aguardando_motoboy → atribuido → em_rota → entregue`; `NULL` = pedido fora do dispatch (histórico pré-feature).
- Motoboys não têm login — CRUD no painel `/motoboys` (módulo `motoboys`); telefone é UNIQUE no formato Z-API (só dígitos).

### Frota consolidada (migration 014)
A tabela legada `entregadores` (Fase 1) foi **removida** — `motoboys` é a única fonte da verdade da frota. `entregas`, `rotas` e `gps_pings` agora referenciam `motoboys` via `motoboy_id`. O painel `/despacho` continua existindo como **fallback manual** (atribuir motoboy + avançar status de `entregas`) para quando ninguém aceita a corrida no grupo; a via principal é o leilão via WhatsApp. Não recriar `entregadores`.

## 12. Categorias de produto

| Valor no banco | Label na UI | Campos extras |
|---------------|------------|--------------|
| `cerveja` | Cerveja | `preco_caixa`, `unidades_por_caixa` |
| `destilado` | Destilado | — |
| `pod` | Pod / Cigarro Eletrônico | `opcoes_variacao` (sabores) |
| `conveniencia` | Conveniência | — |
| `combo` | Combo Promocional | — |
| `vape` | **DESCONTINUADO** (dormente no enum) | — |

---

## 13. Fluxo SDD (antes de qualquer código novo)

**Toda funcionalidade começa por uma spec em `docs/specs/<slug>.md`.**

### Bússola de Intenção (como o Thales descreve)
Descreva o **o quê** e o **problema**, não o como. O Claude decide a implementação mais eficiente.

### Template mínimo
```markdown
# Spec: <nome>

## Objetivo (1 frase)

## Usuário alvo

## Fluxo principal (passo a passo)

## Banco de dados (novas colunas/tabelas?)

## Integrações (Z-API, dLocal, geo, OpenAI?)

## Critérios de aceite
- [ ] ...

## Fora do escopo
```

### Processo
1. Thales descreve em linguagem natural (bússola de intenção).
2. Claude escreve a spec + apresenta para revisão.
3. Thales aprova.
4. Claude implementa seguindo a spec.
5. Typecheck + build + teste antes de commitar.

---

## 14. Regras de segurança e deploy (BLOQUEIO ABSOLUTO)

- **Git/GitHub/Vercel:** SOMENTE o usuário `Pedi Yapa` (`admin@pediyapa.com`). Nunca 'Aurum Clinic'.
- **Commits:** sempre com `Co-Authored-By: Pedi Yapa <admin@pediyapa.com>`.
- **Push para `main`:** requer autorização explícita do Thales na conversa corrente.
- **DDL no banco (`schema.sql`, `rls.sql`):** pausar e apresentar diff para aprovação.
- **Migrations via MCP:** usar `apply_migration` para DDL, `execute_sql` para DML/queries.
- **dLocal:** nunca expor `DLOCAL_SECRET` em logs ou respostas de API.

---

## 15. Autonomia de execução

**Executar diretamente (sem confirmar):**
- Componentes React, ajustes de Tailwind, Server Actions CRUD, fixes de validação.
- Correções de bug pontuais identificadas nos logs.
- Aplicar o fluxo corretamente no banco via MCP quando o import do builder falha.
- Data de seed/teste no banco (DML).

**Pausar e pedir aprovação:**
- Mudanças em `db/schema.sql` ou `db/rls.sql`.
- Decisões arquiteturais com múltiplos caminhos.
- Push para produção.

---

## 16. Verificação antes de commitar

```bash
npm run typecheck   # zero erros
npm run build       # deve passar
```

Após DDL: `mcp__claude_ai_Supabase__get_advisors` (security + performance).

---

## 17. Migrations aplicadas em produção

| # | Arquivo | O que faz |
|---|---------|-----------|
| 001 | `001_add_zapi_config_and_rls_fix.sql` | Config Z-API nas orgs + fix RLS |
| 002 | `002_add_taxa_cambio_brl_gs.sql` | Taxa de câmbio BRL/GS |
| 003 | `003_add_gateway_fields_pedidos.sql` | Campos de gateway em pedidos |
| 004 | `004_create_contatos.sql` | Tabela de contatos |
| 005 | `005_create_sessoes_whatsapp.sql` | Sessões e carrinho do bot |
| 006 | `006_produtos_caixa_variacao.sql` | `preco_caixa`, `unidades_por_caixa`, `opcoes_variacao` em produtos |
| 007 | `007_rename_produto_categorias.sql` | `voucher→conveniencia`, `outro→combo` |
| 008 | `008_geo_match_distribuidora.sql` | Extensões geo + RPC `match_distribuidora` |
| 009 | `009_bot_v3_flow_reorder.sql` | Reordena fluxo V3.0 (geo primeiro, checkout autônomo) |
| 010 | `010_faturacao_e_gateway.sql` | `precisa_fatura`, `documento_ruc` em pedidos; `documento_ruc` em clientes; restaura `gateway_id`/`gateway_status` |
| 011 | `011_yapa_partners_estoque_hub.sql` | Tabela `estoque_hub`, role `hub`, `distribuidora_id` em user_profiles, `tipo` em distribuidoras, RLS hub |
| 012 | `012_rls_estoque_hub_admin_read.sql` | RLS estoque_hub: owners/gerentes leem qualquer hub da org |
| 013 | `013_dispatch_motoboys.sql` | Dispatch de motoboys: tabela `motoboys`, `grupo_motoboys_id` em distribuidoras, frete/corrida em pedidos |
| 014 | `014_consolidar_frota_motoboys.sql` | Aposenta `entregadores` (legado Fase 1); `entregas`/`rotas`/`gps_pings` repointam `entregador_id`→`motoboy_id`; contador migra p/ `motoboys` |
